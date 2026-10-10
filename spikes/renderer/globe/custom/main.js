// Custom globe for the renderer spike: a purpose-built quadtree over the shared
// geographic tiling, written for this atlas rather than for general GIS.
//
// What it does, and why each choice:
// - Tiles are chosen by screen-space error (geometric error / distance), the same
//   rule Cesium and 3d-tiles-renderer use, so the comparison is like for like.
// - Heights come from the full 65x65 grids (tiles/height), imagery maps 1:1 onto
//   the same z/x/y, so a tile is one mesh and one texture.
// - A tile the tileset does not have is made from its parent's data (a quadrant
//   of the grid and of the texture), so coverage edges never leave holes.
// - Everything is in Earth-fixed metres; meshes are positioned at their tile
//   centre so the GPU only ever sees small numbers (no jitter at the diorama), and
//   a logarithmic depth buffer covers 16,000 km down to metres.
// - The diorama is placed per symbol in exact Earth coordinates, so trees sit on
//   the curved surface across the whole peninsula.
import * as THREE from "three"
import { Line2 } from "three/addons/lines/Line2.js"
import { LineMaterial } from "three/addons/lines/LineMaterial.js"
import { LineGeometry } from "three/addons/lines/LineGeometry.js"
import { cameraAt, eyeFor, toEcef, enu, sunDirection, tileTraffic } from "../shared/flight.js"

const T0 = performance.now()
let resolveReady; window.spike = { ready: new Promise(r => { resolveReady = r }), fly() {}, settled: async () => false, setQuality() {}, stats: () => ({ loading: true }) }

const [spec, dio, tileset] = await Promise.all(["../shared/scene.json", "../shared/diorama.json", "../tiles/tileset.json"].map(u => fetch(u).then(r => r.json())))
const TILES = new URL(spec.tiles, location.href).href
const K = spec.verticalExaggeration
document.getElementById("credit").textContent = tileset.attribution

// ---- renderer, camera, lights ----
const canvas = document.getElementById("c")
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setClearColor(new THREE.Color(spec.space))
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(spec.fovDeg, 1, 1, 1e8)
const SUN = new THREE.Vector3(...sunDirection(spec.sun)).normalize()
const sun = new THREE.DirectionalLight(new THREE.Color(spec.sun.color), 2.1)
const hemi = new THREE.HemisphereLight(new THREE.Color(spec.hemisphere.sky), new THREE.Color(spec.hemisphere.ground), 0.6)
scene.add(sun, sun.target, hemi)
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005
Object.assign(sun.shadow.camera, { left: -40000, right: 40000, top: 40000, bottom: -40000, near: 1000, far: 400000 })

// ---- geodesy for tiles ----
const LEVEL0_ERROR = 77067 // Cesium's level-0 geometric error for 65-sample tiles, metres
const avail = tileset.available
function isAvailable(z, x, y) {
  if (z >= avail.length) return false
  return avail[z].some(r => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY)
}
function bounds(z, x, y) { const s = 180 / (1 << z); return { w: -180 + x * s, s: -90 + y * s, e: -180 + (x + 1) * s, n: -90 + (y + 1) * s } }
const MAXH = 9000 * K

// ---- tile records ----
const tiles = new Map() // key -> tile
const key = (z, x, y) => `${z}/${x}/${y}`
function tile(z, x, y, parent) {
  const k = key(z, x, y); let t = tiles.get(k)
  if (t) return t
  const b = bounds(z, x, y)
  // Bounds from a 5x5 sample of the tile at sea level and at the highest
  // possible terrain: corners alone miss the bulge of large, curved tiles.
  const grid = []
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) grid.push([b.w + (b.e - b.w) * i / 4, Math.max(-89.9, Math.min(89.9, b.s + (b.n - b.s) * j / 4))])
  const pts = grid.map(([lo, la]) => new THREE.Vector3(...toEcef(lo, la, MAXH)))
  const low = grid.map(([lo, la]) => new THREE.Vector3(...toEcef(lo, la, 0)))
  const sphere = new THREE.Sphere().setFromPoints([...pts, ...low])
  t = { z, x, y, b, key: k, parent, sphere, horizonPts: pts, available: isAvailable(z, x, y), state: "new", mesh: null, heights: null, texture: null, lastUsed: 0 }
  tiles.set(k, t); return t
}

// ---- loading ----
const queue = []; let inflight = 0; const MAX_INFLIGHT = 10
async function decodeHeights(url) {
  const blob = await (await fetch(url)).blob()
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" })
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d", { willReadFrequently: true })
  g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height).data
  const h = new Float32Array(bmp.width * bmp.height)
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768
  return h
}
async function loadTexture(url) {
  const blob = await (await fetch(url)).blob()
  const bmp = await createImageBitmap(blob)
  const tex = new THREE.Texture(bmp); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true
  return tex
}
function request(t, priority) {
  if (t.state !== "new") return
  if (!t.available) { buildVirtual(t); return }
  t.state = "queued"; t.priority = priority; queue.push(t)
}
function pump() {
  queue.sort((a, b) => b.priority - a.priority)
  while (inflight < MAX_INFLIGHT && queue.length) {
    const t = queue.shift(); t.state = "loading"; inflight++
    Promise.all([decodeHeights(`${TILES}height/${t.key}.png`), loadTexture(`${TILES}imagery/${t.key}.jpg`)])
      .then(([h, tex]) => { t.heights = h; t.texture = tex; t.uv = [0, 0, 1, 1]; buildMesh(t); t.state = "ready" })
      .catch(e => { console.error("tile failed", t.key, e.message); t.state = "failed" })
      .finally(() => { inflight--; needsRender = true })
  }
}
// A tile the tileset does not have: a quadrant of its parent's grid and texture.
function buildVirtual(t) {
  const p = t.parent
  if (!p || p.state !== "ready") return
  const qx = t.x - p.x * 2, qy = t.y - p.y * 2     // 0/1; qy counts from the south
  const G = 65, H = 33, h = new Float32Array(G * G)
  // parent rows run north to south; child is the half selected by qy
  const r0 = qy === 1 ? 0 : 32, c0 = qx * 32
  for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
    const pr = r0 + r / 2, pc = c0 + c / 2, ir = Math.floor(pr), ic = Math.floor(pc), fr = pr - ir, fc = pc - ic
    const at = (rr, cc) => p.heights[Math.min(64, rr) * G + Math.min(64, cc)]
    h[r * G + c] = (at(ir, ic) * (1 - fc) + at(ir, ic + 1) * fc) * (1 - fr) + (at(ir + 1, ic) * (1 - fc) + at(ir + 1, ic + 1) * fc) * fr
  }
  const [u0, v0, u1, v1] = p.uv, du = (u1 - u0) / 2, dv = (v1 - v0) / 2
  t.heights = h; t.texture = p.texture; t.uv = [u0 + qx * du, v0 + (1 - qy) * dv, u0 + (qx + 1) * du, v0 + (2 - qy) * dv]
  t.virtual = true; buildMesh(t); t.state = "ready"
}

// ---- meshes: grid + skirts, positioned at the tile centre ----
const material = new Map()
function buildMesh(t) {
  const G = 65, { b } = t, h = t.heights
  const center = new THREE.Vector3(...toEcef((b.w + b.e) / 2, (b.s + b.n) / 2, 0))
  const skirt = Math.max(50, LEVEL0_ERROR / (1 << t.z) * 2)
  const n = G * G, ring = 4 * (G - 1)
  const pos = new Float32Array((n + ring) * 3), uv = new Float32Array((n + ring) * 2), nor = new Float32Array((n + ring) * 3)
  const P = new Array(n)
  const [u0, v0, u1, v1] = t.uv
  for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
    const lon = b.w + (b.e - b.w) * c / (G - 1), lat = Math.max(-89.99, Math.min(89.99, b.n - (b.n - b.s) * r / (G - 1)))
    const i = r * G + c, p = toEcef(lon, lat, Math.max(0, h[i]) * K)
    P[i] = p; pos.set([p[0] - center.x, p[1] - center.y, p[2] - center.z], i * 3)
    uv.set([u0 + (u1 - u0) * c / (G - 1), v0 + (v1 - v0) * r / (G - 1)], i * 2)
  }
  // normals from the exaggerated grid (central differences, one-sided at edges)
  for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
    const a = P[r * G + Math.max(0, c - 1)], bb = P[r * G + Math.min(G - 1, c + 1)], cc = P[Math.max(0, r - 1) * G + c], d = P[Math.min(G - 1, r + 1) * G + c]
    const ex = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], ny = [cc[0] - d[0], cc[1] - d[1], cc[2] - d[2]]
    const nx = ex[1] * ny[2] - ex[2] * ny[1], nyy = ex[2] * ny[0] - ex[0] * ny[2], nz = ex[0] * ny[1] - ex[1] * ny[0], l = Math.hypot(nx, nyy, nz) || 1
    nor.set([nx / l, nyy / l, nz / l], (r * G + c) * 3)
  }
  // skirt ring: edge vertices pulled straight down, hiding cracks to coarser neighbours
  const edge = []
  for (let c = 0; c < G - 1; c++) edge.push(c)                       // north row
  for (let r = 0; r < G - 1; r++) edge.push(r * G + G - 1)           // east column
  for (let c = G - 1; c > 0; c--) edge.push((G - 1) * G + c)         // south row
  for (let r = G - 1; r > 0; r--) edge.push(r * G)                   // west column
  const up = new THREE.Vector3()
  edge.forEach((i, k) => {
    const j = n + k, p = P[i]; up.set(p[0], p[1], p[2]).normalize()
    pos.set([p[0] - up.x * skirt - center.x, p[1] - up.y * skirt - center.y, p[2] - up.z * skirt - center.z], j * 3)
    uv.set([uv[i * 2], uv[i * 2 + 1]], j * 2); nor.set([nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]], j * 3)
  })
  const idx = []
  for (let r = 0; r < G - 1; r++) for (let c = 0; c < G - 1; c++) { const a = r * G + c, bq = a + G; idx.push(a, bq, a + 1, a + 1, bq, bq + 1) }
  for (let k = 0; k < ring; k++) { const a = edge[k], b2 = edge[(k + 1) % ring], sa = n + k, sb = n + (k + 1) % ring; idx.push(a, sa, b2, b2, sa, sb) }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3))
  geo.setIndex(idx); geo.computeBoundingSphere()
  let mat = material.get(t.texture)
  if (!mat) { mat = new THREE.MeshStandardMaterial({ map: t.texture, roughness: 0.95, metalness: 0 }); material.set(t.texture, mat) }
  t.mesh = new THREE.Mesh(geo, mat); t.mesh.position.copy(center); t.mesh.matrixAutoUpdate = false; t.mesh.updateMatrix()
  t.mesh.receiveShadow = true; t.mesh.frustumCulled = false
}

// ---- selection by screen-space error ----
const globe = new THREE.Group(); scene.add(globe)
const roots = [tile(0, 0, 0, null), tile(0, 1, 0, null)]
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4()
let MAX_SSE = 2, frameId = 0, selected = [], pendingRefine = 0
function horizonVisible(t, eye) {
  const R2 = 6356752 * 6356752 * 0.999
  return t.horizonPts.some(p => p.dot(eye) > R2) || t.z < 2
}
function sse(t, eye, pxPerRad) {
  const d = Math.max(1, t.sphere.distanceToPoint(eye))
  return (LEVEL0_ERROR / (1 << t.z)) * pxPerRad / d
}
function select() {
  frameId++; selected = []; pendingRefine = 0
  camera.updateMatrixWorld(); projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projView)
  const eye = camera.position, pxPerRad = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
  const visit = t => {
    t.lastUsed = frameId
    if (t.z > 1 && (!frustum.intersectsSphere(t.sphere) || !horizonVisible(t, eye))) return
    if (t.state !== "ready") { request(t, 100 - t.z); pendingRefine++; return }
    const err = sse(t, eye, pxPerRad)
    const deeper = t.z < tileset.maxLevel && (t.available || t.virtual) && avail.length > t.z + 1 && hasDeeper(t)
    if (err > MAX_SSE && deeper) {
      const kids = [0, 1].flatMap(dx => [0, 1].map(dy => tile(t.z + 1, t.x * 2 + dx, t.y * 2 + dy, t)))
      kids.forEach(k => { k.lastUsed = frameId; if (k.state === "new") request(k, err) })
      if (kids.every(k => k.state === "ready" || k.state === "failed")) { kids.forEach(k => k.state === "ready" ? visit(k) : null); return }
      pendingRefine++
    }
    selected.push(t)
  }
  roots.forEach(visit)
  pump()
}
// Refining makes sense only if some descendant has real data (coverage is nested).
function hasDeeper(t) { return isAvailable(t.z + 1, t.x * 2, t.y * 2) || isAvailable(t.z + 1, t.x * 2 + 1, t.y * 2) || isAvailable(t.z + 1, t.x * 2, t.y * 2 + 1) || isAvailable(t.z + 1, t.x * 2 + 1, t.y * 2 + 1) }
function evict() {
  if (tiles.size < 900) return
  const old = [...tiles.values()].filter(t => t.z > 0 && frameId - t.lastUsed > 120 && t.state === "ready").sort((a, b) => a.lastUsed - b.lastUsed).slice(0, tiles.size - 700)
  for (const t of old) {
    t.mesh?.geometry.dispose()
    if (!t.virtual && t.texture) { material.get(t.texture)?.dispose(); material.delete(t.texture); t.texture.dispose() }
    tiles.delete(t.key)
  }
  // tiles made from an evicted parent share its (now disposed) texture: drop them too
  for (const t of [...tiles.values()]) if (t.virtual && !tiles.has(t.parent.key)) { t.mesh?.geometry.dispose(); tiles.delete(t.key) }
}

// ---- atmosphere rim ----
{
  const g = new THREE.SphereGeometry(6378137 * 1.025, 96, 48)
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(spec.atmosphere) } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: "uniform vec3 color; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(color*f*1.4, f); }" })
  const atm = new THREE.Mesh(g, m); atm.renderOrder = -1; scene.add(atm)
}

// ---- route: a dashed line that keeps its pixel width from the globe to the diorama ----
const routeMat = new LineMaterial({ color: new THREE.Color(spec.route.color), linewidth: 3, dashed: true, dashSize: 1, gapSize: 1, worldUnits: false })
const routeLine = (() => {
  const pts = spec.route.points, flat = []
  for (let i = 0; i < pts.length - 1; i++) for (let s = 0; s < 24; s++) {
    const u = s / 24, lon = pts[i].lon + (pts[i + 1].lon - pts[i].lon) * u, lat = pts[i].lat + (pts[i + 1].lat - pts[i].lat) * u
    flat.push(...toEcef(lon, lat, 120))
  }
  flat.push(...toEcef(pts.at(-1).lon, pts.at(-1).lat, 120))
  const o = flat.slice(0, 3), rel = flat.map((v, i) => v - o[i % 3])
  const g = new LineGeometry(); g.setPositions(rel)
  const l = new Line2(g, routeMat); l.position.set(...o); l.computeLineDistances(); l.frustumCulled = false; scene.add(l); return l
})()

// ---- diorama: symbols in exact Earth coordinates, in a frame at the peninsula ----
const P = spec.ships && dio.palette, UM = dio.unitMetres
const C = spec.diorama.center, origin = new THREE.Vector3(...toEcef(C.lon, C.lat, 0)), F = enu(C.lon, C.lat)
const frame = new THREE.Group()
frame.matrix.makeBasis(new THREE.Vector3(...F.e), new THREE.Vector3(...F.u), new THREE.Vector3(...F.n).negate()).setPosition(origin)
frame.matrixAutoUpdate = false; scene.add(frame)
const basisInv = new THREE.Matrix4().copy(frame.matrix).invert()
const local = (lon, lat, h) => new THREE.Vector3(...toEcef(lon, lat, h)).applyMatrix4(basisInv)  // x east, y up, z south
const coneG = new THREE.ConeGeometry(0.95 * UM, 3.4 * UM, 6); coneG.translate(0, 1.9 * UM, 0)
const ballG = new THREE.SphereGeometry(1.25 * UM, 6, 5); ballG.translate(0, 2.0 * UM, 0)
const trunkG = new THREE.CylinderGeometry(0.18 * UM, 0.26 * UM, 1.6 * UM, 5); trunkG.translate(0, 0.8 * UM, 0)
const veg = new THREE.Group(); frame.add(veg)
let treeCount = 0
function inst(g, color, list, sFn) {
  const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.9 }), list.length)
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0)
  list.forEach((t, i) => { const s = sFn(t); Q.setFromAxisAngle(Y, t[5]); M.compose(local(t[0], t[1], t[2] * K - 10), Q, S.set(s, s, s)); m.setMatrixAt(i, M) })
  m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; veg.add(m)
}
function buildVegetation(fraction) {
  veg.children.forEach(c => c.material.dispose()); veg.clear()
  const list = fraction < 1 ? dio.trees.items.filter((_, i) => i % 2 === 0) : dio.trees.items
  inst(coneG, P.conifer, list.filter(t => t[3] === 0), t => t[4]); inst(ballG, P.broadleaf, list.filter(t => t[3] === 1), t => t[4]); inst(trunkG, P.trunk, list, t => 0.8 + (t[4] % 0.1) * 4)
  treeCount = list.length
}
buildVegetation(1)
{ // houses
  const boxG = new THREE.BoxGeometry(1.4 * UM, 0.9 * UM, 1.1 * UM); boxG.translate(0, 0.45 * UM, 0)
  const roofG = new THREE.ConeGeometry(1.05 * UM, 0.8 * UM, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 1.3 * UM, 0); roofG.scale(1, 1, 0.8)
  const wall = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.wall), roughness: 0.9 }), roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.roof), roughness: 0.9 }), thatch = new THREE.MeshStandardMaterial({ color: new THREE.Color(P.thatch), roughness: 1 })
  for (const h of dio.houses.items) {
    const g = new THREE.Group(); g.position.copy(local(h[0], h[1], h[2] * K - 5)); g.rotation.y = h[3]; g.scale.setScalar(h[4])
    const a = new THREE.Mesh(boxG, wall), b = new THREE.Mesh(roofG, h[5] ? thatch : roof); a.castShadow = b.castShadow = true; g.add(a, b); frame.add(g)
  }
}
const ships = spec.ships.map(s => { // the region spike's schematic 遣唐使船
  const g = new THREE.Group(); g.position.copy(local(s.lon, s.lat, 35)); g.rotation.y = s.headingRad; g.scale.setScalar(s.scale * UM)
  const add = (geo, color, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; g.add(m); return m }
  add(new THREE.BoxGeometry(7, 1.3, 2.4), P.hull, 0, 0.4, 0); add(new THREE.BoxGeometry(5.6, 0.5, 2.0), P.deck, 0, 1.25, 0); add(new THREE.BoxGeometry(2.2, 1.2, 1.6), P.wall, -1.2, 2.05, 0)
  const cr = add(new THREE.ConeGeometry(1.5, 0.7, 4), P.roof, -1.2, 3.0, 0, Math.PI / 4); cr.scale.set(1, 1, 0.75)
  for (const mx of [1.9, -0.2]) { add(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), "#3a2616", mx, 4.5, 0); add(new THREE.PlaneGeometry(3.2, 3.6), P.sail, mx + 0.3, 5.0, 0, Math.PI / 2) }
  add(new THREE.PlaneGeometry(1.4, 0.8), P.flag, 2.0, 8.4, 0, Math.PI / 2)
  frame.add(g); return g
})

// ---- labels ----
const lblBox = document.getElementById("labels")
const labels = spec.places.map(p => {
  const e = document.createElement("div"); e.className = ["lbl", p.kind === "sea" && "sea", p.kind === "realm" && "realm", p.selected && "sel"].filter(Boolean).join(" ")
  e.innerHTML = `<b>${p.name}</b>${p.rom ? `<i>${p.rom}</i>` : ""}`; lblBox.appendChild(e)
  return { p, e, w: new THREE.Vector3(...toEcef(p.lon, p.lat, p.kind === "realm" || p.kind === "sea" ? 0 : 400 * K)) }
})
const v3 = new THREE.Vector3()
function placeLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight, eye = camera.position, R2 = 6356752 ** 2
  for (const { p, e, w: pos } of labels) {
    const inRange = pose.rangeM >= p.minRangeM && pose.rangeM <= p.maxRangeM
    v3.copy(pos).project(camera)
    const vis = inRange && pos.dot(eye) > R2 && v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2
    e.style.display = vis ? "" : "none"
    if (vis) { e.style.left = ((v3.x + 1) / 2 * w) + "px"; e.style.top = ((1 - v3.y) / 2 * h) + "px" }
  }
}

// ---- camera and frame loop ----
let pose = cameraAt(spec.flight, 0), quality = "full", needsRender = true
function applyPose() {
  const { eye, up, target } = eyeFor(pose)
  camera.position.set(...eye); camera.up.set(...up); camera.lookAt(...target)
  const alt = camera.position.length() - 6371000
  camera.near = Math.max(1, alt * 0.02); camera.far = 4e7; camera.updateProjectionMatrix()
  const near = pose.rangeM < spec.diorama.showBelowRangeM
  frame.visible = near
  const t = new THREE.Vector3(...target), upL = new THREE.Vector3(...enu(pose.lon, pose.lat).u)
  hemi.position.copy(upL)                               // the sky is "up" where the camera looks
  sun.castShadow = near && quality === "full"
  sun.target.position.copy(near ? origin : t); sun.position.copy(sun.target.position).addScaledVector(SUN, 200000)
  sun.target.updateMatrixWorld()
  routeMat.dashSize = routeMat.gapSize = Math.max(6, pose.rangeM / 90)   // dash length follows zoom, in metres
  needsRender = true
}
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); routeMat.resolution.set(w, h); needsRender = true
}
addEventListener("resize", resize); resize()

let frames = 0, fps = 0, acc = 0, last = performance.now(), frameMs = 0, loadMs = 0, rendered = 0
function render() {
  const t = performance.now()
  select(); evict()
  globe.clear(); for (const s of selected) globe.add(s.mesh)
  renderer.render(scene, camera); placeLabels(); rendered++
  frameMs = frameMs * 0.9 + (performance.now() - t) * 0.1
}
function loop() {
  const now = performance.now(); frames++; acc += now - last; last = now
  if (acc >= 1000) { fps = frames * 1000 / acc; frames = 0; acc = 0; overlay() }
  render(); requestAnimationFrame(loop)
}
const isSettled = () => inflight === 0 && queue.length === 0 && pendingRefine === 0
const bundleKB = Math.round(((await fetch("/node_modules/three/build/three.module.js", { method: "HEAD" })).headers.get("content-length") || 0) / 1024 + 30)
function stats() {
  const i = renderer.info.render
  return { fps: +fps.toFixed(1), frameMs: +frameMs.toFixed(2), drawCalls: i.calls, triangles: i.triangles, memoryMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    loadMs, bundleKB, tilesLoaded: [...tiles.values()].filter(t => t.state === "ready" && !t.virtual).length, tilesDrawn: selected.length, trees: treeCount, traffic: tileTraffic(), engine: "custom globe on three " + THREE.REVISION }
}
function overlay() {
  const s = stats()
  document.getElementById("stats").textContent = `custom globe · three r${THREE.REVISION}\nfps ${s.fps}  frame ${s.frameMs} ms\ndraw calls ${s.drawCalls}  tris ${s.triangles}\nmem ${s.memoryMB ?? "n/a"} MB  load ${s.loadMs} ms\ntiles drawn ${s.tilesDrawn}  loaded ${s.tilesLoaded}\nterrain ${s.traffic.height.kb} KB  imagery ${s.traffic.imagery.kb} KB`
}

async function settled(ms = 10000) {
  const t0 = performance.now(); let streak = 0
  while (performance.now() - t0 < ms) {
    await new Promise(r => requestAnimationFrame(r))
    streak = isSettled() ? streak + 1 : 0
    if (streak >= 3) return true
  }
  return false
}
applyPose(); loop()
await settled(60000); loadMs = Math.round(performance.now() - T0); overlay()
Object.assign(window.spike, {
  fly(t) { pose = cameraAt(spec.flight, t); applyPose() },
  settled,
  setQuality(level) { quality = level; buildVegetation(level === "phone" ? 0.5 : 1); renderer.shadowMap.enabled = level !== "phone"; applyPose() },
  stats,
})
resolveReady()
