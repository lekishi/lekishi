// Globe spike: Three.js + 3d-tiles-renderer on the shared tileset. World space is ECEF
// (Cesium axes: z north, x at lon 0); tiles keep their RTC centres and the diorama and route
// live in local frames placed by matrices, so nothing is stored in float32 at 6.4e6 m.
import * as THREE from "three"
import { TilesRenderer, GlobeControls } from "3d-tiles-renderer/three"
import { ImageOverlayPlugin } from "3d-tiles-renderer/src/three/plugins/images/ImageOverlayPlugin.js"
import { Line2 } from "three/addons/lines/Line2.js"
import { LineGeometry } from "three/addons/lines/LineGeometry.js"
import { LineMaterial } from "three/addons/lines/LineMaterial.js"
import { cameraAt, eyeFor, toEcef, enu, sunDirection, tileTraffic, WGS84 } from "../shared/flight.js"
import { exaggeratedQuantizedMeshPlugin, imageryOverlays } from "./terrain.js"

const T0 = performance.now()
const [spec, dio, tileset] = await Promise.all(["../shared/scene.json", "../shared/diorama.json", "../tiles/tileset.json"].map(u => fetch(u).then(r => r.json())))
const K = spec.verticalExaggeration, UM = dio.unitMetres, P = dio.palette
const V = a => new THREE.Vector3(a[0], a[1], a[2])

// ---- renderer, camera, lights (the region spike's look) ----
const canvas = document.getElementById("c")
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(new THREE.Color(spec.space), 1)
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(spec.fovDeg, 1, 1000, 1e8)
function resize() { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); for (const m of lineMats) m.resolution.set(w, h) }

// The sun is fixed in Earth-fixed space; the hemisphere fill has one "up", so it follows the
// local vertical under the view target, which is the part of the globe being looked at.
const SUN = V(sunDirection(spec.sun))
const C = V(toEcef(spec.diorama.center.lon, spec.diorama.center.lat, 0)), F = enu(spec.diorama.center.lon, spec.diorama.center.lat)
const hemi = new THREE.HemisphereLight(new THREE.Color(spec.hemisphere.sky), new THREE.Color(spec.hemisphere.ground), 0.6)
const sun = new THREE.DirectionalLight(new THREE.Color(spec.sun.color), 2.1)
sun.position.copy(C).addScaledVector(SUN, 150000); sun.target.position.copy(C)
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -26000, right: 26000, top: 26000, bottom: -26000, near: 50000, far: 260000 })
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 30
scene.add(hemi, sun, sun.target)

// ---- atmosphere: an analytic limb glow drawn first behind everything ----
// A full-screen pass computes, per pixel, how close the view ray passes to the planet and
// glows with that clearance, dimmed on the night side. It is additive over the space colour
// and does not depth-test, so the globe simply paints over its disk; from low altitude the same
// formula becomes the horizon haze.
const atmo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { projInv: { value: new THREE.Matrix4() }, centerView: { value: new THREE.Vector3() }, sunView: { value: new THREE.Vector3() }, upView: { value: new THREE.Vector3() }, alt: { value: 0 }, color: { value: new THREE.Color(spec.atmosphere) }, R: { value: 6371000 }, H: { value: 60000 } },
  vertexShader: `varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `precision highp float; varying vec2 vNdc; uniform mat4 projInv; uniform vec3 centerView, sunView, upView, color; uniform float alt, R, H;
    void main(){
      vec4 v = projInv * vec4(vNdc, 1.0, 1.0); vec3 dir = normalize(v.xyz / v.w);
      float tc = dot(centerView, dir); vec3 rel = dir * max(tc, 0.0) - centerView; float d = length(rel); float a = d - R;
      float glow = a >= 0.0 ? exp(-a / H) : exp(a / 8000.0);
      float inside = 1.0 - smoothstep(60000.0, 160000.0, alt);
      glow *= mix(1.0, mix(1.0, 0.35, smoothstep(0.0, 0.7, dot(dir, upView))), inside);
      float day = smoothstep(-0.3, 0.45, dot(normalize(rel), sunView));
      gl_FragColor = vec4(color * glow * mix(0.07, 0.95, day), 1.0);
      #include <colorspace_fragment>
    }`,
  depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
}))
atmo.frustumCulled = false; atmo.renderOrder = -1000; scene.add(atmo)

// ---- terrain + imagery ----
const tiles = new TilesRenderer("../tiles/terrain/")
tiles.registerPlugin(exaggeratedQuantizedMeshPlugin(K))
const overlays = imageryOverlays(tileset, new URL("../tiles/imagery/", location.href).href + "{z}/{x}/{reverseY}.jpg")
const overlayPlugin = new ImageOverlayPlugin({ overlays, resolution: 256, enableTileSplitting: false })
tiles.registerPlugin(overlayPlugin)
tiles.setCamera(camera)
let tilesLoaded = 0
tiles.addEventListener("load-model", ({ scene: s }) => {
  tilesLoaded++
  s.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.material.roughness = 0.95; o.material.metalness = 0 } })
})
scene.add(tiles.group)

// ---- controls: interactive only; fly() places the camera itself ----
const controls = new GlobeControls(tiles.group, camera, canvas)
controls.setEllipsoid(tiles.ellipsoid, tiles.group); controls.enableDamping = true
let driving = false
controls.addEventListener("start", () => { driving = true })

// ---- route: a dashed constant-pixel line, in a local frame at its first point ----
const lineMats = []
const routeGroup = new THREE.Group(); scene.add(routeGroup)
{
  const pts = spec.route.points, origin = V(toEcef(pts[0].lon, pts[0].lat, 0)), flat = []
  routeGroup.position.copy(origin)
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(2, Math.ceil(Math.hypot(b.lon - a.lon, b.lat - a.lat) / 0.02))
    for (let j = i === 0 ? 0 : 1; j <= n; j++) { const u = j / n, p = toEcef(a.lon + (b.lon - a.lon) * u, a.lat + (b.lat - a.lat) * u, 40); flat.push(p[0] - origin.x, p[1] - origin.y, p[2] - origin.z) }
  }
  const geo = new LineGeometry(); geo.setPositions(flat)
  const under = new LineMaterial({ color: 0x0b1114, linewidth: 5.5, transparent: true, opacity: 0.45, worldUnits: false, depthWrite: false })
  const dash = new LineMaterial({ color: new THREE.Color(spec.route.color), linewidth: 3, dashed: true, dashSize: 1, gapSize: 0.7, worldUnits: false, transparent: true })
  lineMats.push(under, dash)
  const l0 = new Line2(geo, under), l1 = new Line2(geo, dash); l1.computeLineDistances(); l1.renderOrder = 2; l0.renderOrder = 1
  routeGroup.add(l0, l1)
  var routeDash = dash
}

// ---- diorama: an ENU frame at its centre, region-spike axes inside (x east, y up, z south) ----
// Symbol sizes are the region spike's units × unitMetres; ground heights × the exaggeration.
const dioramaFrame = new THREE.Group(); dioramaFrame.matrixAutoUpdate = false
dioramaFrame.matrix.makeBasis(V(F.e), V(F.n), V(F.u)).setPosition(C).multiply(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1))
scene.add(dioramaFrame)
const _rel = new THREE.Vector3()
function local(lon, lat, h) { _rel.copy(V(toEcef(lon, lat, h))).sub(C); return new THREE.Vector3(_rel.dot(V(F.e)), _rel.dot(V(F.u)), -_rel.dot(V(F.n))) }
const mat = c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.9 })
const coneG = new THREE.ConeGeometry(0.95, 3.4, 6); coneG.translate(0, 1.9, 0)
const ballG = new THREE.SphereGeometry(1.25, 6, 5); ballG.translate(0, 2.0, 0)
const trunkG = new THREE.CylinderGeometry(0.18, 0.26, 1.6, 5); trunkG.translate(0, 0.8, 0)
const treeItems = dio.trees.items.map(([lon, lat, g, kind, s, rot]) => ({ p: local(lon, lat, g * K), kind, s, rot }))
const vegetation = new THREE.Group(); dioramaFrame.add(vegetation)
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _T = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0)
function instanced(g, material, list, place) {
  const m = new THREE.InstancedMesh(g, material, list.length)
  list.forEach((it, i) => { place(it); _M.compose(_T, _Q, _S); m.setMatrixAt(i, _M) })
  m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); return m
}
let treeCount = 0
function buildVegetation(fraction) {
  vegetation.children.forEach(c => c.dispose()); vegetation.clear()
  const list = fraction < 1 ? treeItems.filter((_, i) => i % 2 === 0) : treeItems
  const place = it => { _T.copy(it.p); _T.y -= 10; _Q.setFromAxisAngle(_Y, it.rot); _S.setScalar(it.s * UM) }
  vegetation.add(instanced(coneG, mat(P.conifer), list.filter(t => t.kind === 0), place), instanced(ballG, mat(P.broadleaf), list.filter(t => t.kind === 1), place), instanced(trunkG, mat(P.trunk), list, place))
  return list.length
}
treeCount = buildVegetation(1)
{
  const boxG = new THREE.BoxGeometry(1.4, 0.9, 1.1); boxG.translate(0, 0.45, 0)
  const roofG = new THREE.ConeGeometry(1.05, 0.8, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 1.3, 0); roofG.scale(1, 1, 0.8)
  const houses = dio.houses.items.map(([lon, lat, g, rot, s, thatch]) => ({ p: local(lon, lat, g * K), rot, s, thatch }))
  const place = it => { _T.copy(it.p); _Q.setFromAxisAngle(_Y, it.rot); _S.setScalar(it.s * UM) }
  dioramaFrame.add(instanced(boxG, mat(P.wall), houses, place), instanced(roofG, mat(P.roof), houses.filter(h => !h.thatch), place), instanced(roofG, new THREE.MeshStandardMaterial({ color: new THREE.Color(P.thatch), roughness: 1 }), houses.filter(h => h.thatch), place))
  var houseCount = houses.length
}
function ship(s) {
  const g = new THREE.Group(); g.position.copy(local(s.lon, s.lat, 0)); g.position.y += 0.35 * UM; g.rotation.y = s.headingRad; g.scale.setScalar(s.scale * UM)
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o }
  add(new THREE.BoxGeometry(7, 1.3, 2.4), mat(P.hull), 0, 0.4, 0)
  add(new THREE.BoxGeometry(5.6, 0.5, 2.0), mat(P.deck), 0, 1.25, 0)
  add(new THREE.BoxGeometry(2.2, 1.2, 1.6), mat(P.wall), -1.2, 2.05, 0)
  const cr = add(new THREE.ConeGeometry(1.5, 0.7, 4), mat(P.roof), -1.2, 3.0, 0); cr.rotation.y = Math.PI / 4; cr.scale.set(1, 1, 0.75)
  for (const mx of [1.9, -0.2]) {
    add(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), new THREE.MeshStandardMaterial({ color: 0x3a2616 }), mx, 4.5, 0)
    const sail = add(new THREE.PlaneGeometry(3.2, 3.6), new THREE.MeshStandardMaterial({ color: new THREE.Color(P.sail), side: THREE.DoubleSide, roughness: 1 }), mx + 0.3, 5.0, 0); sail.rotation.y = Math.PI / 2 - 0.25
  }
  const flag = add(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshStandardMaterial({ color: new THREE.Color(P.flag), side: THREE.DoubleSide }), 2.0, 8.4, 0); flag.rotation.y = Math.PI / 2
  dioramaFrame.add(g); return g
}
spec.ships.forEach(ship)

// ---- labels: HTML, projected per frame, by camera range, hidden behind the globe ----
const PLACE_GROUND = { kaimon: 924 } // metres; the rest sit at the coast or sea level
const box = document.getElementById("labels")
const labels = spec.places.map(p => {
  const e = document.createElement("div"); e.className = "lbl " + p.kind + (p.selected ? " sel" : "")
  e.innerHTML = `<b>${p.name}</b>${p.rom ? `<i>${p.rom}</i>` : ""}`; box.appendChild(e)
  return { p, e, w: V(toEcef(p.lon, p.lat, (PLACE_GROUND[p.id] ?? 0) * K)) }
})
// Occlusion by the ellipsoid (shrunk slightly so sea-level anchors never hide themselves).
function behindGlobe(w) {
  const a = WGS84.a - 3000, b = WGS84.b - 3000, c = camera.position
  const ox = c.x / a, oy = c.y / a, oz = c.z / b, dx = w.x / a - ox, dy = w.y / a - oy, dz = w.z / b - oz
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (ox * dx + oy * dy + oz * dz), Cc = ox * ox + oy * oy + oz * oz - 1, disc = B * B - 4 * A * Cc
  if (disc <= 0) return false
  const t = (-B - Math.sqrt(disc)) / (2 * A); return t > 0 && t < 1
}
const _v = new THREE.Vector3()
function placeLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight
  for (const L of labels) {
    const { p, e } = L
    let show = range >= p.minRangeM && range <= p.maxRangeM && !behindGlobe(L.w)
    if (show) { _v.copy(L.w).project(camera); show = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 }
    if (show) { e.style.left = ((_v.x + 1) / 2 * w).toFixed(1) + "px"; e.style.top = ((1 - _v.y) / 2 * h).toFixed(1) + "px" }
    e.style.display = show ? "" : "none"
  }
}

// ---- per-pose state ----
let range = spec.flight.keys[0].rangeM, viewTarget = V(toEcef(spec.flight.keys[0].lon, spec.flight.keys[0].lat, 0)), quality = "full"
function fly(t) {
  const pose = cameraAt(spec.flight, t), { eye, target, up } = eyeFor(pose)
  driving = false; controls.resetState?.()
  camera.position.set(...eye); camera.up.set(...up); camera.lookAt(...target); camera.updateMatrixWorld()
  range = pose.rangeM; viewTarget.set(...target)
}
// While the reader drives, "range" is the distance to the ground along the view axis.
function measureRange() {
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld), c = camera.position, R = 6371000
  const b = c.dot(dir), cc = c.lengthSq() - R * R, disc = b * b - cc
  if (disc > 0 && -b - Math.sqrt(disc) > 0) { const t = -b - Math.sqrt(disc); range = t; viewTarget.copy(c).addScaledVector(dir, t) }
  else { range = c.length() - R; viewTarget.copy(c).setLength(R) }
}
function applyRange() {
  const showDiorama = range < spec.diorama.showBelowRangeM
  dioramaFrame.visible = showDiorama
  const shadows = showDiorama && quality === "full"
  if (sun.castShadow !== shadows) sun.castShadow = shadows
  hemi.position.copy(viewTarget).normalize()
  routeDash.dashScale = 1 / (range * 0.012)
  // clip planes from the altitude: the nearest geometry is the exaggerated relief below
  const d = camera.position.length(), alt = d - 6371000
  camera.near = Math.max(5, (alt - 9000) * 0.5)
  camera.far = Math.sqrt(Math.max(d * d - (WGS84.b - 1000) ** 2, 1)) + 400000
  camera.updateProjectionMatrix()
}
function updateAtmosphere() {
  const u = atmo.material.uniforms, vm = camera.matrixWorldInverse
  u.projInv.value.copy(camera.projectionMatrixInverse)
  u.centerView.value.set(0, 0, 0).applyMatrix4(vm)
  u.sunView.value.copy(SUN).transformDirection(vm)
  u.upView.value.copy(camera.position).normalize().transformDirection(vm)
  u.alt.value = camera.position.length() - 6371000
}

// ---- frame loop, settling, stats ----
let frameMs = 0, fps = 0, frames = 0, tAcc = 0, last = performance.now(), drawCalls = 0, triangles = 0, frameNo = 0, loadMs = 0, bundleKB = 0
const waiters = new Set()
function busy() {
  const s = tiles.stats
  return s.queued + s.downloading + s.parsing > 0 || tiles.isLoading || tiles.downloadQueue.running || tiles.parseQueue.running || tiles.processNodeQueue.running ||
    overlayPlugin.pendingTiles.size > 0 || overlayPlugin.processQueue.running || overlays.some(o => !o.isReady || o.pending > 0) || overlayPlugin.needsUpdate
}
function frame() {
  if (driving) { controls.update(); measureRange() }
  applyRange()
  camera.updateMatrixWorld()
  tiles.setResolutionFromRenderer(camera, renderer)
  tiles.update()
  updateAtmosphere()
  const t = performance.now(); renderer.render(scene, camera); const dt = performance.now() - t
  frameMs = frameMs * 0.9 + dt * 0.1; drawCalls = renderer.info.render.calls; triangles = renderer.info.render.triangles
  placeLabels(); frameNo++
  const idle = !busy()
  for (const w of waiters) { if (frameNo < w.after) continue; w.idle = idle ? w.idle + 1 : 0; if (w.idle >= 2) { waiters.delete(w); w.resolve(true) } }
}
function loop() { const now = performance.now(); frames++; tAcc += now - last; last = now; if (tAcc >= 1000) { fps = frames * 1000 / tAcc; frames = 0; tAcc = 0; overlay() } frame(); requestAnimationFrame(loop) }
// Resolves once the tiles renderer and every overlay have nothing queued, downloading,
// parsing or compositing for two consecutive rendered frames, counted from the frame after
// the call so the current pose's requests are already issued.
function settled(ms = 10000) {
  return new Promise(resolve => {
    const w = { after: frameNo + 2, idle: 0, resolve }
    waiters.add(w)
    setTimeout(() => { if (waiters.delete(w)) resolve(false) }, ms)
  })
}
function stats() {
  return { fps: +fps.toFixed(1), frameMs: +frameMs.toFixed(2), drawCalls, triangles, memoryMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, loadMs, bundleKB, tilesLoaded, traffic: tileTraffic(),
    tilesResident: tiles.stats.loaded, trees: treeCount, houses: houseCount, engine: `three r${THREE.REVISION} + 3d-tiles-renderer 0.5.3`, range: Math.round(range) }
}
function overlay() { const s = stats(); document.getElementById("stats").textContent = `three r${THREE.REVISION} + 3d-tiles-renderer\nfps ${s.fps}  frame ${s.frameMs} ms\ndraw calls ${s.drawCalls}  tris ${s.triangles}\nmem ${s.memoryMB ?? "n/a"} MB  load ${s.loadMs} ms\nbundle ${s.bundleKB} KB  tiles ${s.tilesLoaded}\nterrain ${s.traffic.terrain.n} / ${s.traffic.terrain.kb} KB  imagery ${s.traffic.imagery.n} / ${s.traffic.imagery.kb} KB\nrange ${(s.range / 1000).toFixed(1)} km  trees ${dioramaFrame.visible ? s.trees : 0}` }

resize(); addEventListener("resize", resize)
fly(0)
requestAnimationFrame(loop)
window.spike = {
  ready: settled(120000).then(() => {
    loadMs = Math.round(performance.now() - T0)
    bundleKB = Math.round(performance.getEntriesByType("resource").filter(e => /\.m?js(\?|$)/.test(e.name)).reduce((a, e) => a + (e.encodedBodySize || e.transferSize || 0), 0) / 1024)
    overlay()
  }),
  fly(t) { fly(t) },
  settled,
  setQuality(level) {
    quality = level === "phone" ? "phone" : "full"
    renderer.shadowMap.enabled = quality === "full"; treeCount = buildVegetation(quality === "phone" ? 0.5 : 1)
    applyRange(); scene.traverse(o => { if (o.material) o.material.needsUpdate = true })
  },
  stats,
}
