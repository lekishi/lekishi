// Follow-up spike on the custom globe: can it do what the atlas needs?
// - free exploration: 3d-tiles-renderer's GlobeControls drive the camera over
//   the custom tile meshes (drag, zoom to cursor, tilt, inertia, touch);
// - picking: places, ships, houses, the voyage, the arc, the draped polygon,
//   and the ground itself report what they are in a card;
// - a draped control polygon and a relationship arc;
// - a tunable level-of-detail budget (?sse=), measured against Cesium's;
// - ?bench: a real-time flight that reports frame times on the device it runs on.
// The window.spike API is the globe phase's, so the same harness captures it.
import * as THREE from "three"
import { Line2 } from "three/addons/lines/Line2.js"
import { LineMaterial } from "three/addons/lines/LineMaterial.js"
import { LineGeometry } from "three/addons/lines/LineGeometry.js"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import { GlobeControls } from "3d-tiles-renderer/src/three/renderer/controls/GlobeControls.js"
import { WGS84_ELLIPSOID } from "3d-tiles-renderer/src/three/renderer/math/GeoConstants.js"
import { cameraAt, eyeFor, toEcef, enu, sunDirection, tileTraffic } from "../shared/flight.js"
import { Globe } from "./globe.js"
import { DrapedOverlay } from "./overlay.js"

const T0 = performance.now()
const qs = new URLSearchParams(location.search)
let resolveReady; window.spike = { ready: new Promise(r => { resolveReady = r }), fly() {}, settled: async () => false, setQuality() {}, stats: () => ({ loading: true }) }

const [spec, dio, tileset, extra] = await Promise.all(["../shared/scene.json", "../shared/diorama.json", "../tiles/tileset.json", "./followup.json"].map(u => fetch(u).then(r => r.json())))
const K = spec.verticalExaggeration
document.getElementById("credit").textContent = tileset.attribution
const V = a => new THREE.Vector3(a[0], a[1], a[2])

// ---- renderer, camera, lights ----
const canvas = document.getElementById("c")
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setClearColor(new THREE.Color(spec.space))
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(spec.fovDeg, 1, 1, 4e7)
const SUN = V(sunDirection(spec.sun)).normalize()
const sun = new THREE.DirectionalLight(new THREE.Color(spec.sun.color), 2.1)
const hemi = new THREE.HemisphereLight(new THREE.Color(spec.hemisphere.sky), new THREE.Color(spec.hemisphere.ground), 0.6)
scene.add(sun, sun.target, hemi)
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005
Object.assign(sun.shadow.camera, { left: -40000, right: 40000, top: 40000, bottom: -40000, near: 1000, far: 400000 })

// ---- the globe, with the draped polygon as an overlay ----
// Fills are draped into the tiles; outlines are screen-space lines (below), so
// their width does not step where tiles of different levels meet.
const overlay = new DrapedOverlay(extra.polygons.map(p => ({ id: p.id, rings: p.rings, fill: p.fill })))
// GPU memory for tiles (?mem= overrides, in MB). At 256 MB the shared flight
// never re-fetches a tile (396 distinct, 396 requests); phones and tablets get
// half, and a tile they evict and need again comes from the HTTP cache.
const coarse = matchMedia("(pointer: coarse)").matches
const globe = new Globe({ tilesUrl: new URL(spec.tiles, location.href).href, tileset, exaggeration: K, maxSSE: +(qs.get("sse") ?? 4.5), overlay, memoryBudgetMB: +(qs.get("mem") ?? (coarse ? 128 : 256)) })
scene.add(globe.group)

// ---- atmosphere rim (never picked) ----
{
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(spec.atmosphere) } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: "uniform vec3 color; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(color*f*1.4, f); }" })
  const atm = new THREE.Mesh(new THREE.SphereGeometry(6378137 * 1.025, 96, 48), m); atm.raycast = () => {}; scene.add(atm)
}

// ---- sky and haze ----
// Low over the Earth the reader faces a horizon, not space: a sky gradient
// fills the view above it and a distance haze softens the terrain toward it.
// Both fade out with altitude, so the globe seen from space stays crisp. The
// haze also tells the globe where it can ask for less detail (fogDensity).
const HAZE = new THREE.Color("#b6ccd9"), ZENITH = new THREE.Color("#5a86ab")
scene.fog = new THREE.FogExp2(HAZE, 0)
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, transparent: true,
  uniforms: { horizon: { value: HAZE }, zenith: { value: ZENITH }, up: { value: new THREE.Vector3(0, 0, 1) }, sinDip: { value: 0 }, strength: { value: 0 } },
  vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
  // elevation 0 is the true horizon, which lies below the local horizontal by
  // the dip angle at the camera's altitude; below it is the Earth
  fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; uniform vec3 up; uniform float sinDip; uniform float strength; varying vec3 vDir;
    void main(){ float h = dot(normalize(vDir), up) + sinDip;
      vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.5, h));
      gl_FragColor = vec4(c, strength * smoothstep(-0.01, 0.015, h));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` }))
sky.renderOrder = -1; sky.frustumCulled = false; sky.raycast = () => {}; scene.add(sky)
function updateAtmosphere() {
  const R = 6371000, alt = Math.max(1, camera.position.length() - R)
  const horizonDist = Math.sqrt(2 * R * alt + alt * alt)
  const fade = 1 - THREE.MathUtils.smoothstep(alt, 150e3, 900e3)
  // about 80% haze at the horizon, a few percent at the diorama's 30 km
  scene.fog.density = 1.3 / horizonDist * fade
  globe.fogDensity = scene.fog.density
  const m = sky.material.uniforms
  m.up.value.copy(camera.position).normalize(); m.sinDip.value = Math.sqrt(1 - (R / (R + alt)) ** 2)
  m.strength.value = 1 - THREE.MathUtils.smoothstep(alt, 60e3, 400e3)
  sky.visible = m.strength.value > 0
  sky.position.copy(camera.position); sky.scale.setScalar(camera.near * 20); sky.updateMatrixWorld()
}

// ---- lines: the voyage (dashed) and the relationship arc, constant pixel width ----
const lineMats = []
function polyline(points, { color, colors, dashed = false, width = 3 }) {
  const o = points[0], rel = points.flatMap(p => [p[0] - o[0], p[1] - o[1], p[2] - o[2]])
  const g = new LineGeometry(); g.setPositions(rel)
  if (colors) g.setColors(colors)
  const m = new LineMaterial({ color: colors ? 0xffffff : new THREE.Color(color), vertexColors: !!colors, linewidth: width, dashed, dashSize: 1, gapSize: 1, worldUnits: false })
  lineMats.push(m)
  const l = new Line2(g, m); l.position.set(...o); l.computeLineDistances(); l.frustumCulled = false; l.raycast = () => {}; scene.add(l)
  return { line: l, mat: m, points: points.map(V) }
}
const voyage = (() => {
  const pts = spec.route.points, out = []
  for (let i = 0; i < pts.length - 1; i++) for (let s = 0; s < 24; s++) { const u = s / 24; out.push(toEcef(pts[i].lon + (pts[i + 1].lon - pts[i].lon) * u, pts[i].lat + (pts[i + 1].lat - pts[i].lat) * u, 120)) }
  out.push(toEcef(pts.at(-1).lon, pts.at(-1).lat, 120))
  return polyline(out, { color: spec.route.color, dashed: true })
})()
// A great-circle arc lifted in proportion to its length, so it reads as a
// relationship across the sea rather than a path on it.
const arcs = extra.arcs.map(a => {
  const A = V(toEcef(a.from.lon, a.from.lat, 0)).normalize(), B = V(toEcef(a.to.lon, a.to.lat, 0)).normalize()
  const ang = A.angleTo(B), H = 6371000 * ang * a.heightRatio, pts = [], cols = []
  const c0 = new THREE.Color(a.colorFrom), c1 = new THREE.Color(a.colorTo)
  for (let i = 0; i <= 96; i++) {
    const u = i / 96, p = new THREE.Vector3().copy(A).multiplyScalar(Math.sin((1 - u) * ang)).addScaledVector(B, Math.sin(u * ang)).divideScalar(Math.sin(ang))
    pts.push(p.multiplyScalar(6371000 + H * Math.sin(Math.PI * u)).toArray())
    const c = c0.clone().lerp(c1, u); cols.push(c.r, c.g, c.b)
  }
  const p = polyline(pts, { colors: cols, width: 2.5 })
  return { ...p, spec: a, mid: V(pts[48]) }
})

// Province outlines: a constant-width line laid on the terrain. Its points
// are densified to about a kilometre, take their heights from the finest
// loaded tiles, and are lifted a little in proportion to the viewing range so
// a coarser tile drawn under them never swallows the line. They are refreshed
// when new tiles load or the range changes by a third.
const outlines = extra.polygons.map(pg => {
  const ring = []
  pg.rings[0].forEach((a, i, r) => {
    if (i === r.length - 1) return
    const b = r[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.01))
    for (let k = 0; k < n; k++) ring.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n])
  })
  ring.push(ring[0])
  const o = toEcef(ring[0][0], ring[0][1], 0)
  const m = new LineMaterial({ color: new THREE.Color(pg.stroke), linewidth: pg.widthPx ?? 2.5, worldUnits: false })
  lineMats.push(m)
  const g = new LineGeometry(); g.setPositions(new Array(ring.length * 3).fill(0))
  const l = new Line2(g, m); l.position.set(...o); l.updateMatrixWorld(); l.frustumCulled = false; l.raycast = () => {}; scene.add(l)
  return { ring, origin: o, line: l, version: -1, lift: 0 }
})
function updateOutlines() {
  const lift = Math.max(20, range * 0.003)
  for (const ol of outlines) {
    const liftOk = Math.abs(lift / ol.lift - 1) < 0.33
    // while tiles stream, at most every fifth frame; once settled, at once
    if (liftOk && (ol.version === globe.version || (frameNo - (ol.at ?? -9) < 5 && !globe.settled))) continue
    ol.at = frameNo
    const pos = []
    for (const [lon, lat] of ol.ring) {
      const p = toEcef(lon, lat, (globe.heightAt(lon, lat) ?? 0) + lift)
      pos.push(p[0] - ol.origin[0], p[1] - ol.origin[1], p[2] - ol.origin[2])
    }
    ol.line.geometry.dispose(); ol.line.geometry = new LineGeometry(); ol.line.geometry.setPositions(pos)
    ol.version = globe.version; ol.lift = lift
  }
}

// ---- the diorama, in exact Earth coordinates, every symbol pickable ----
const P = dio.palette, UM = dio.unitMetres, C = spec.diorama.center
const origin = V(toEcef(C.lon, C.lat, 0)), F = enu(C.lon, C.lat)
const frame = new THREE.Group()
frame.matrix.makeBasis(V(F.e), V(F.u), V(F.n).negate()).setPosition(origin); frame.matrixAutoUpdate = false; scene.add(frame)
const basisInv = new THREE.Matrix4().copy(frame.matrix).invert()
const local = (lon, lat, h) => V(toEcef(lon, lat, h)).applyMatrix4(basisInv)
const coneG = new THREE.ConeGeometry(0.95 * UM, 3.4 * UM, 6); coneG.translate(0, 1.9 * UM, 0)
const ballG = new THREE.SphereGeometry(1.25 * UM, 6, 5); ballG.translate(0, 2.0 * UM, 0)
const trunkG = new THREE.CylinderGeometry(0.18 * UM, 0.26 * UM, 1.6 * UM, 5); trunkG.translate(0, 0.8 * UM, 0)
const veg = new THREE.Group(); frame.add(veg)
let treeCount = 0
function inst(g, color, list, sFn, pick) {
  const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.9 }), list.length)
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0)
  list.forEach((t, i) => { const s = sFn(t); Q.setFromAxisAngle(Y, t[5]); M.compose(local(t[0], t[1], t[2] * K - 10), Q, S.set(s, s, s)); m.setMatrixAt(i, M) })
  m.computeBoundingSphere(); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.userData.pick = pick; veg.add(m)
}
function buildVegetation(fraction) {
  veg.children.forEach(c => c.material.dispose()); veg.clear()
  const list = fraction < 1 ? dio.trees.items.filter((_, i) => i % 2 === 0) : dio.trees.items
  const forest = { name: "森", rom: "FOREST · SYMBOLIC", kind: "landscape symbol", caveat: "Placed by a rule on elevation and slope; a symbol of cover, not a record of trees." }
  inst(coneG, P.conifer, list.filter(t => t[3] === 0), t => t[4], { ...forest, rom: "CONIFER FOREST · SYMBOLIC" })
  inst(ballG, P.broadleaf, list.filter(t => t[3] === 1), t => t[4], { ...forest, rom: "BROADLEAF FOREST · SYMBOLIC" })
  inst(trunkG, P.trunk, list, t => 0.8 + (t[4] % 0.1) * 4, forest)
  treeCount = list.length
}
buildVegetation(1)
// Houses are two instanced meshes (walls, and roofs coloured per house as tile
// or thatch) and each ship is one vertex-coloured mesh: a draw call per kind of
// thing rather than per part, which more than halves the diorama's draw calls.
{
  const boxG = new THREE.BoxGeometry(1.4 * UM, 0.9 * UM, 1.1 * UM); boxG.translate(0, 0.45 * UM, 0)
  const roofG = new THREE.ConeGeometry(1.05 * UM, 0.8 * UM, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 1.3 * UM, 0); roofG.scale(1, 1, 0.8)
  const village = { name: "集落", rom: "SETTLEMENT · SYMBOLIC", kind: "settlement symbol", caveat: "Houses placed by seed around the named places; symbolic, not excavated sites." }
  const items = dio.houses.items, n = items.length
  const walls = new THREE.InstancedMesh(boxG, new THREE.MeshStandardMaterial({ color: new THREE.Color(P.wall), roughness: 0.9 }), n)
  const roofs = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), n)
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0)
  const tile = new THREE.Color(P.roof), thatch = new THREE.Color(P.thatch)
  items.forEach((h, i) => {
    M.compose(local(h[0], h[1], h[2] * K - 5), Q.setFromAxisAngle(Y, h[3]), S.setScalar(h[4]))
    walls.setMatrixAt(i, M); roofs.setMatrixAt(i, M); roofs.setColorAt(i, h[5] ? thatch : tile)
  })
  for (const m of [walls, roofs]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.computeBoundingSphere(); m.userData.pick = village; frame.add(m) }
}
spec.ships.forEach(s => {
  const parts = []
  const add = (geo, color, x, y, z, ry = 0, sz = 1) => {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, sz)))
    const c = new THREE.Color(color), n = geo.attributes.position.count, col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3)); parts.push(geo)
  }
  add(new THREE.BoxGeometry(7, 1.3, 2.4), P.hull, 0, 0.4, 0); add(new THREE.BoxGeometry(5.6, 0.5, 2.0), P.deck, 0, 1.25, 0); add(new THREE.BoxGeometry(2.2, 1.2, 1.6), P.wall, -1.2, 2.05, 0)
  add(new THREE.ConeGeometry(1.5, 0.7, 4), P.roof, -1.2, 3.0, 0, Math.PI / 4, 0.75)
  for (const mx of [1.9, -0.2]) { add(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), "#3a2616", mx, 4.5, 0); add(new THREE.PlaneGeometry(3.2, 3.6), P.sail, mx + 0.3, 5.0, 0, Math.PI / 2) }
  add(new THREE.PlaneGeometry(1.4, 0.8), P.flag, 2.0, 8.4, 0, Math.PI / 2)
  const ship = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }))
  parts.forEach(g => g.dispose())
  ship.position.copy(local(s.lon, s.lat, 35)); ship.rotation.y = s.headingRad; ship.scale.setScalar(s.scale * UM); ship.castShadow = true
  ship.userData.pick = { name: s.label ? s.label.split(" · ")[0] : "遣唐使船", rom: s.label ? `SHIP 2 · ${s.label.split(" · ")[1] ?? ""}`.trim() : "SHIP 4", kind: "vessel (schematic)", caveat: "A schematic 遣唐使船 at its recorded position; hull and rig are not reconstructed." }
  frame.add(ship)
})

// ---- labels (HTML, clickable) ----
const lblBox = document.getElementById("labels")
const labels = spec.places.map(p => ({ p, w: V(toEcef(p.lon, p.lat, p.kind === "realm" || p.kind === "sea" ? 0 : 400 * K)), cls: [p.kind === "sea" && "sea", p.kind === "realm" && "realm", p.selected && "sel"] }))
arcs.forEach(a => labels.push({ p: { name: a.spec.name, rom: a.spec.rom, kind: a.spec.kind, minRangeM: 400000, maxRangeM: 40000000, caveat: a.spec.caveat }, w: a.mid, cls: ["arc"] }))
extra.polygons.forEach(pg => { const r = pg.rings[0], lon = r.reduce((s, q) => s + q[0], 0) / r.length, lat = r.reduce((s, q) => s + q[1], 0) / r.length; labels.push({ p: { name: pg.name, rom: pg.rom, kind: pg.kind, minRangeM: 120000, maxRangeM: 900000, caveat: pg.caveat, lon, lat }, w: V(toEcef(lon, lat, 600 * K)), cls: [] }) })
for (const L of labels) {
  const e = document.createElement("div"); e.className = ["lbl", ...L.cls].filter(Boolean).join(" ")
  e.innerHTML = `<b>${L.p.name}</b>${L.p.rom ? `<i>${L.p.rom}</i>` : ""}`; e.tabIndex = 0
  L.card = () => ({ name: L.p.name, rom: L.p.rom, kind: L.p.kind, lon: L.p.lon, lat: L.p.lat, caveat: L.p.caveat })
  e.addEventListener("keydown", ev => { if (ev.key === "Enter") showCard(L.card()) })
  lblBox.appendChild(e); L.e = e
}
// The label whose text is under a point, if any (labels are laid out by
// placeLabels; hidden ones have display none and an empty rectangle).
function labelAt(x, y) {
  for (const L of labels) {
    if (L.e.style.display === "none") continue
    for (const el of L.e.children) { const r = el.getBoundingClientRect(); if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) return L }
  }
  return null
}
const v3 = new THREE.Vector3()
function placeLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight, eye = camera.position, R2 = 6356752 ** 2
  for (const { p, e, w: pos } of labels) {
    const inRange = range >= p.minRangeM && range <= p.maxRangeM
    v3.copy(pos).project(camera)
    const vis = inRange && pos.dot(eye) > R2 && v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1
    e.style.display = vis ? "" : "none"
    if (vis) { e.style.left = ((v3.x + 1) / 2 * w) + "px"; e.style.top = ((1 - v3.y) / 2 * h) + "px" }
  }
}

// ---- the card ----
const card = document.getElementById("card")
function showCard(c) {
  const rows = [["kind", c.kind], c.lat != null && ["at", `${c.lat.toFixed(3)}° N, ${c.lon.toFixed(3)}° E`], c.elev != null && ["ground", `${Math.round(c.elev)} m`]].filter(Boolean)
  card.innerHTML = `<h2>${c.name}</h2>${c.rom ? `<div class="rom">${c.rom}</div>` : ""}<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>${c.caveat ? `<div class="caveat">${c.caveat}</div>` : ""}<button type="button" id="cardClose">Close</button>`
  card.hidden = false; card.querySelector("#cardClose").onclick = () => { card.hidden = true }
  lastPick = c
}
let lastPick = null

// ---- camera: flight, controls, and the range that drives what is shown ----
const controls = new GlobeControls(globe.group, camera, canvas)
controls.setEllipsoid(WGS84_ELLIPSOID, globe.group); controls.enableDamping = true
let driving = false
controls.addEventListener("start", () => { driving = true; flightPose = null })
// any input on the globe hands the camera to the controls (a wheel turn alone
// does not fire their start event, so the first scroll after a flight was lost)
for (const ev of ["pointerdown", "wheel", "touchstart"]) canvas.addEventListener(ev, () => { driving = true; flightPose = null }, { passive: true, capture: true })
let flightPose = cameraAt(spec.flight, 0), range = flightPose.rangeM, quality = "full"
const ray = new THREE.Ray()
// Range as the reader experiences it: the distance from the camera to the
// ground at the centre of the view (or the altitude, looking past the globe).
function measureRange() {
  if (flightPose) { range = flightPose.rangeM; return }
  ray.origin.copy(camera.position); camera.getWorldDirection(ray.direction)
  const hit = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 6371000), v3)
  range = hit ? camera.position.distanceTo(hit) : camera.position.length() - 6371000
}
function applyPose(pose) {
  const { eye, up, target } = eyeFor(pose)
  camera.position.set(...eye); camera.up.set(...up); camera.lookAt(...target)
}
function afterCamera() {
  measureRange()
  const alt = camera.position.length() - 6371000
  if (!driving) { camera.near = Math.max(1, alt * 0.02); camera.far = 4e7; camera.updateProjectionMatrix() }
  const near = range < spec.diorama.showBelowRangeM
  frame.visible = near
  // the sky is "up" where the camera looks; the sun's shadow box follows the diorama
  ray.origin.copy(camera.position); camera.getWorldDirection(ray.direction)
  const look = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 6371000), new THREE.Vector3()) ?? camera.position.clone().setLength(6371000)
  hemi.position.copy(look).normalize()
  sun.castShadow = near && quality === "full"
  sun.target.position.copy(near ? origin : look); sun.position.copy(sun.target.position).addScaledVector(SUN, 200000); sun.target.updateMatrixWorld()
  voyage.mat.dashSize = voyage.mat.gapSize = Math.max(6, range / 90)
  updateAtmosphere()
  updateOutlines()
}
function resize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); lineMats.forEach(m => m.resolution.set(w, h))
}
addEventListener("resize", resize); resize()

// ---- picking: a click (not a drag) asks the scene what is under the pointer ----
const raycaster = new THREE.Raycaster(); let downAt = null
canvas.addEventListener("pointerdown", e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() } })
canvas.addEventListener("pointerup", e => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5 || performance.now() - downAt.t > 500) return
  const hit = pick(e.clientX, e.clientY); if (hit) showCard(hit)
})
canvas.addEventListener("pointermove", e => { if (e.pointerType === "mouse" && !e.buttons) canvas.style.cursor = labelAt(e.clientX, e.clientY) ? "pointer" : "" })
function pick(x, y) {
  const L = labelAt(x, y); if (L) return L.card()
  const r = canvas.getBoundingClientRect(), ndc = new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  if (frame.visible) {
    const hits = raycaster.intersectObject(frame, true)
    for (const h of hits) { let o = h.object; while (o && !o.userData.pick) o = o.parent; if (o) return { ...o.userData.pick, ...geo(h.point) } }
  }
  // lines: nearest projected vertex within 10 px
  const near = (pts) => pts.reduce((best, p) => { v3.copy(p).project(camera); const d = Math.hypot((v3.x - ndc.x) * r.width / 2, (v3.y - ndc.y) * r.height / 2); return v3.z < 1 && d < best ? d : best }, Infinity)
  for (const a of arcs) if (near(a.points) < 10) return { name: a.spec.name, rom: a.spec.rom, kind: a.spec.kind, caveat: a.spec.caveat }
  if (near(voyage.points) < 10) return { name: "第二舟の航路", rom: "VOYAGE OF SHIP 2 · 753", kind: "journey (schematic line)", caveat: spec.route.note }
  const g = raycaster.intersectObject(globe.group, true)[0]
  if (!g) return null
  const where = geo(g.point), poly = overlay.hit(where.lon, where.lat)
  if (poly) { const p = extra.polygons.find(q => q.id === poly.id); return { name: p.name, rom: p.rom, kind: p.kind, caveat: p.caveat, ...where } }
  return where.elev < 1 ? { name: "海", rom: "SEA", kind: "sea", ...where } : { name: "地点", rom: "GROUND", kind: "terrain", ...where }
}
// Earth-fixed metres to geodetic (Bowring's method; centimetre-accurate at the surface).
function geo(p) {
  const a = 6378137, b = 6356752.314245179, e2 = 0.00669437999014133, ep2 = (a * a - b * b) / (b * b)
  const r = Math.hypot(p.x, p.y), th = Math.atan2(p.z * a, r * b)
  const lat = Math.atan2(p.z + ep2 * b * Math.sin(th) ** 3, r - e2 * a * Math.cos(th) ** 3), lon = Math.atan2(p.y, p.x)
  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2), h = r / Math.cos(lat) - N
  return { lon: lon * 180 / Math.PI, lat: lat * 180 / Math.PI, elev: h / K }
}

// ---- frame loop, settling, stats ----
let frames = 0, fps = 0, acc = 0, last = performance.now(), frameMs = 0, loadMs = 0, readyMs = 0, frameNo = 0, warming = false
const waiters = new Set()
function render() {
  if (warming) return
  const t = performance.now()
  if (driving) controls.update()
  afterCamera()
  globe.update(camera, canvas.clientHeight || innerHeight)
  renderer.render(scene, camera); placeLabels(); frameNo++
  frameMs = frameMs * 0.9 + (performance.now() - t) * 0.1
  const idle = globe.settled
  for (const w of waiters) { if (frameNo < w.after) continue; w.idle = idle ? w.idle + 1 : 0; if (w.idle >= 3) { waiters.delete(w); w.resolve(true) } }
  bench?.tick(t)
}
function loop() {
  const now = performance.now(); frames++; acc += now - last; last = now
  if (acc >= 1000) { fps = frames * 1000 / acc; frames = 0; acc = 0; statsOverlay() }
  render(); requestAnimationFrame(loop)
}
function settled(ms = 10000) {
  return new Promise(resolve => {
    const w = { after: frameNo + 2, idle: 0, resolve }; waiters.add(w)
    setTimeout(() => { if (waiters.delete(w)) resolve(false) }, ms)
  })
}
const bundleKB = Math.round(performance.getEntriesByType("resource").filter(e => /\.js($|\?)/.test(e.name)).reduce((s, e) => s + (e.encodedBodySize || e.transferSize || 0), 0) / 1024)
function stats() {
  const i = renderer.info.render
  return { fps: +fps.toFixed(1), frameMs: +frameMs.toFixed(2), drawCalls: i.calls, triangles: i.triangles, memoryMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    loadMs, readyMs, bundleKB, tilesLoaded: globe.loadedCount, tilesDrawn: globe.selected.length, maxSSE: globe.maxSSE, trees: treeCount, rangeM: Math.round(range), traffic: traffic(), memoryBudgetMB: Math.round(globe.budget / 1048576), tileMemoryMB: Math.round(globe.memoryBytes / 1048576), cancelled: globe.cancelled, lastPick: lastPick && lastPick.name, engine: "custom globe follow-up on three " + THREE.REVISION }
}
// Tiles load in workers, whose requests the page's resource timing does not
// see; the globe counts them itself.
function traffic() { return { terrain: { n: 0, kb: 0 }, ...globe.trafficKB(), other: tileTraffic().other } }
function statsOverlay() {
  const s = stats()
  document.getElementById("stats").textContent = `custom globe follow-up · sse ${s.maxSSE}\nfps ${s.fps}  frame ${s.frameMs} ms\ndraw calls ${s.drawCalls}  tris ${s.triangles}\ntiles drawn ${s.tilesDrawn}  loaded ${s.tilesLoaded}\nterrain ${s.traffic.height.kb} KB  imagery ${s.traffic.imagery.kb} KB\ntile memory ${s.tileMemoryMB} / ${s.memoryBudgetMB} MB\nrange ${(s.rangeM / 1000).toFixed(1)} km`
}

// ---- bench: the flight in real time, frame times as the device delivers them ----
// Beside the frame times it reports what could explain a long frame, so a
// device run can be diagnosed from the pasted report alone: whether the page
// was hidden (browsers stop drawing a hidden tab, which the frame clock would
// otherwise count as a stall), whether the WebGL context was lost, how many
// shader programs were compiled during the flight (the warm-up should leave
// none), the longest main-thread task where the browser reports them, and
// where in the flight the worst frames fell.
let bench = null
function startBench(seconds = 24) {
  const box = document.getElementById("bench"), frames = []; let t0 = null, lastT = null
  box.hidden = false; box.innerHTML = `<b>Measuring…</b> the flight plays for ${seconds} s in real time.`
  driving = false
  const seen = { hidden: 0, hiddenMs: 0, hiddenAt: null, lost: 0, tasks: [] }
  let spanned = false   // the next frame spans a hidden period: not a frame the reader saw
  const onVisibility = () => {
    spanned = true
    if (document.hidden) { seen.hidden++; seen.hiddenAt = performance.now() }
    else if (seen.hiddenAt !== null) { seen.hiddenMs += performance.now() - seen.hiddenAt; seen.hiddenAt = null }
  }
  const onLost = () => { seen.lost++ }
  document.addEventListener("visibilitychange", onVisibility); canvas.addEventListener("webglcontextlost", onLost)
  let tasks = null
  if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    tasks = new PerformanceObserver(list => { for (const e of list.getEntries()) seen.tasks.push(e.duration) }); tasks.observe({ type: "longtask" })
  }
  const programs0 = renderer.info.programs?.length ?? 0
  bench = {
    tick(now) {
      if (t0 === null) { t0 = now; lastT = now }
      const t = (now - t0) / 1000 / seconds
      frames.push({ ms: now - lastT, t: Math.min(1, t), hidden: spanned }); lastT = now; spanned = false
      if (t >= 1) {
        bench = null
        document.removeEventListener("visibilitychange", onVisibility); canvas.removeEventListener("webglcontextlost", onLost); tasks?.disconnect()
        const all = frames.slice(5), d = all.filter(f => !f.hidden).map(f => f.ms).sort((a, b) => a - b), q = f => d[Math.min(d.length - 1, Math.floor(d.length * f))]
        const worst = [...all].sort((a, b) => b.ms - a.ms).slice(0, 3).map(f => `${f.ms.toFixed(0)} ms at ${Math.round(f.t * 100)}%${f.hidden ? " (page hidden)" : ""}`).join(", ")
        const compiled = (renderer.info.programs?.length ?? 0) - programs0, longest = seen.tasks.length ? Math.max(...seen.tasks) : null
        const report = [`device: ${navigator.userAgent}`, `viewport: ${innerWidth}×${innerHeight} @${devicePixelRatio}x · sse ${globe.maxSSE}`, `frames: ${d.length} in ${seconds} s (${(d.length / seconds).toFixed(1)} fps mean)`,
          `frame time p50 ${q(0.5).toFixed(1)} ms · p95 ${q(0.95).toFixed(1)} ms · max ${d.at(-1).toFixed(0)} ms`, `frames over 33 ms: ${(100 * d.filter(x => x > 33.4).length / d.length).toFixed(1)}%`, `tiles: ${traffic().height.n} heights, ${traffic().imagery.n} imagery (${traffic().height.unique} distinct) · tile memory peak ${Math.round(globe.memoryPeak / 1048576)} of ${Math.round(globe.budget / 1048576)} MB`,
          `worst frames: ${worst} of the flight`,
          `page hidden: ${seen.hidden ? `${seen.hidden}× for ${Math.round(seen.hiddenMs)} ms (frames spanning it left out of the figures above)` : "no"} · context lost: ${seen.lost ? seen.lost + "×" : "no"} · shaders compiled during the flight: ${compiled}`,
          `longest main-thread task: ${longest === null ? "not reported by this browser" : `${Math.round(longest)} ms (${seen.tasks.filter(x => x > 100).length} over 100 ms)`}`].join("\n")
        box.innerHTML = `<b>Frame times on this device</b><pre>${report}</pre><button type="button" id="copyBench">Copy</button> <button type="button" id="closeBench">Close</button>`
        box.querySelector("#closeBench").onclick = () => { box.hidden = true }
        box.querySelector("#copyBench").onclick = () => navigator.clipboard.writeText(report).catch(() => {})
        window.spike.benchReport = report
        return
      }
      flightPose = cameraAt(spec.flight, t); applyPose(flightPose)
    },
  }
}

// Every shader program the flight will need is compiled before the first frame
// is shown. Compiling them as they first came into view (the province fill,
// the sky, the diorama's materials and the shadow pass, eleven programs in one
// frame) stalled an iPhone for 808 ms.
const warmTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); warmTexture.colorSpace = THREE.SRGBColorSpace; warmTexture.needsUpdate = true
const warmOverlay = extra.polygons.length ? overlay.textureFor(Globe.bounds(8, 441, 172), 8) : null
async function warmUp() {
  const g = new THREE.PlaneGeometry(1, 1); g.setAttribute("ouv", g.attributes.uv.clone())
  // tile materials, plain and with a draped overlay, receiving shadows as tiles
  // do; their programs are shared with every real tile, so the materials are
  // kept (disposing them would release the programs)
  const probes = [null, warmOverlay].map(ov => { const m = new THREE.Mesh(g, globe.material(warmTexture, ov)); m.frustumCulled = false; m.receiveShadow = true; m.position.copy(origin); scene.add(m); return m })
  warming = true   // the frame loop pauses: it would reset what is shown below between awaits
  const was = { frame: frame.visible, shadow: sun.castShadow, sky: sky.visible, target: sun.target.position.clone(), pos: sun.position.clone() }
  // the diorama with its sun and shadow box where they will be when it is in view
  const show = () => {
    frame.visible = true; sky.visible = true; sun.castShadow = renderer.shadowMap.enabled
    sun.target.position.copy(origin); sun.position.copy(origin).addScaledVector(SUN, 200000); sun.target.updateMatrixWorld(); sun.updateMatrixWorld()
  }
  show()
  // the controls' pivot marker, shown from the first drag on
  const pivot = controls.pivotMesh, pivotWas = { parent: pivot.parent, visible: pivot.visible }
  scene.add(pivot); pivot.visible = true
  await renderer.compileAsync(scene, camera)
  if (pivotWas.parent) pivotWas.parent.add(pivot); else scene.remove(pivot)
  pivot.visible = pivotWas.visible
  show()
  // The shadow pass compiles its depth programs on first use, from the diorama's
  // own viewpoint, and keys them by the light state of the frame before (three
  // sets up lights after the shadow pass): the first shadowed frame after an
  // unshadowed one needs different programs from the frames that follow it, so
  // the transition is rendered as it happens in flight.
  const pose = { pos: camera.position.clone(), q: camera.quaternion.clone(), up: camera.up.clone(), near: camera.near, far: camera.far }
  applyPose(cameraAt(spec.flight, 0.7)); camera.near = 10; camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  const shadow = sun.castShadow
  sun.castShadow = false; renderer.render(scene, camera)
  sun.castShadow = shadow; renderer.render(scene, camera); renderer.render(scene, camera)
  camera.position.copy(pose.pos); camera.quaternion.copy(pose.q); camera.up.copy(pose.up); camera.near = pose.near; camera.far = pose.far; camera.updateProjectionMatrix(); camera.updateMatrixWorld()
  probes.forEach(m => scene.remove(m)); g.dispose()
  frame.visible = was.frame; sun.castShadow = was.shadow; sky.visible = was.sky
  sun.target.position.copy(was.target); sun.position.copy(was.pos); sun.target.updateMatrixWorld(); sun.updateMatrixWorld()
  // redraw the real view in the same task, so no warm-up frame reaches the screen
  warming = false; render()
}
// The globe is shown first; the warm-up runs while it is on screen, long
// before the reader can fly down to the diorama, and the flight and the bench
// wait for it (window.spike.ready).
applyPose(flightPose); afterCamera(); loop()
await settled(60000); loadMs = Math.round(performance.now() - T0)
await warmUp(); readyMs = Math.round(performance.now() - T0); statsOverlay()
Object.assign(window.spike, {
  fly(t) { driving = false; flightPose = cameraAt(spec.flight, t); applyPose(flightPose) },
  settled,
  async setQuality(level) { quality = level; buildVegetation(level === "phone" ? 0.5 : 1); renderer.shadowMap.enabled = level !== "phone"; await warmUp() },
  stats,
  pick, startBench,
  arcScreen(i = 0) { const r = canvas.getBoundingClientRect(); v3.copy(arcs[i].mid).project(camera); return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height } },
  // screen position of a geodetic point, for scripted picking tests
  screenOf(lon, lat, h = 0) { const r = canvas.getBoundingClientRect(); v3.set(...toEcef(lon, lat, h)).project(camera); return { x: r.left + (v3.x + 1) / 2 * r.width, y: r.top + (1 - v3.y) / 2 * r.height, front: v3.z < 1 } },
  explore() { flightPose = null; driving = true },   // hand the camera to the controls without a pointer event
  // shader programs compiled so far: a program compiled mid-flight is a stall on mobile GPUs
  programs: () => renderer.info.programs.length,
  programKeys: () => renderer.info.programs.map(p => p.name + "|" + p.cacheKey),
  // milliseconds per raycast against the drawn tiles, with the tiles' block
  // raycast and with three's default one, and the largest disagreement in metres
  raycastCost(n = 30) {
    const rays = Array.from({ length: n }, (_, i) => new THREE.Vector2((i % 5) / 5 - 0.4, Math.floor(i / 5) / 6 - 0.4))
    const run = fast => {
      for (const m of globe.group.children) if (m.userData.tile) m.raycast = fast ? m.userData.fastRaycast ??= m.raycast : THREE.Mesh.prototype.raycast
      const t0 = performance.now(), d = rays.map(v => { raycaster.setFromCamera(v, camera); return raycaster.intersectObject(globe.group, true)[0]?.distance ?? null })
      return { ms: (performance.now() - t0) / n, d }
    }
    const fast = run(true), slow = run(false); run(true)
    const diff = Math.max(0, ...fast.d.map((x, i) => x === null || slow.d[i] === null ? (x === slow.d[i] ? 0 : Infinity) : Math.abs(x - slow.d[i])))
    return { fastMs: +fast.ms.toFixed(3), defaultMs: +slow.ms.toFixed(3), maxDiffM: +diff.toFixed(3), hits: fast.d.filter(x => x !== null).length, tiles: globe.selected.length }
  },
  // tile bookkeeping by state and level, for tests of eviction and cancellation
  tileCensus() {
    const out = {}
    for (const t of globe.tiles.values()) { const k = `${t.state}${t.virtual ? "*" : ""}`; out[k] ??= {}; out[k][t.z] = (out[k][t.z] ?? 0) + 1; out[k].recent = (out[k].recent ?? 0) + (globe.frameId - t.lastUsed <= 60 ? 1 : 0) }
    return { frame: globe.frameId, memoryMB: Math.round(globe.memoryBytes / 1048576), selected: globe.selected.length, byState: out }
  },
})
resolveReady()
if (qs.has("bench")) startBench(+(qs.get("bench") || 24))
