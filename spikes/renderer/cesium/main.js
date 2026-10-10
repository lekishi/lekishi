// Renderer spike, CesiumJS half. Draws shared/scene.json on CesiumJS 1.145 and
// exposes window.spike for spikes/renderer/capture.mjs. Nothing here ships.
const T0 = performance.now()
const C = window.Cesium
// Same stance as src/lib/atlas/renderer/cesium-renderer.ts: no ion token, no ion
// credit, Natural Earth II from the package, ellipsoid-based terrain.
C.Ion.defaultAccessToken = undefined
C.CreditDisplay.cesiumCredit = undefined

// Experiment knobs for the report (defaults are the measured configuration):
// ?msaa=1|4  ?shadows=0  ?cascades=1|4  ?shadowSize=2048
// MSAA 4 costs ~15% more frame time on the software GPU for no visible gain at this
// camera, so the measured configuration is MSAA off with Cesium's FXAA stage.
const q = new URLSearchParams(location.search)
const KNOB = { msaa: +(q.get("msaa") ?? 1), shadows: q.get("shadows") !== "0", cascades: +(q.get("cascades") ?? 1), shadowSize: +(q.get("shadowSize") ?? 2048) }
const spec = await (await fetch("../shared/scene.json")).json()
const HM = await (await fetch("../shared/height.json")).json()

// ---- shared helpers (identical in both spikes) ----
const mx = lon => (lon + 180) / 360
const my = lat => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 }
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
const vn = (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return (hash(x0, y0) * (1 - sx) + hash(x0 + 1, y0) * sx) * (1 - sy) + (hash(x0, y0 + 1) * (1 - sx) + hash(x0 + 1, y0 + 1) * sx) * sy }
const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.3 + vn(x * 4.3, y * 4.3) * 0.2
const rad = d => d * Math.PI / 180

// ---- heightmap: RGB png, metres = R*256 + G - 1000, rows Web-Mercator spaced ----
const img = new Image(); img.src = "../shared/height.png"; await img.decode()
const hc = document.createElement("canvas"); hc.width = img.width; hc.height = img.height
const hx = hc.getContext("2d"); hx.drawImage(img, 0, 0)
const hd = hx.getImageData(0, 0, img.width, img.height).data
const cols = img.width, rows = img.height, E = new Float32Array(cols * rows)
for (let i = 0; i < cols * rows; i++) E[i] = hd[i * 4] * 256 + hd[i * 4 + 1] - 1000
const EX = spec.verticalExaggeration
const U = 1 / spec.unitsPerMeter // metres per spec unit (100)
// Three's world unit is U metres and its cell is HM.mpp metres, so both spikes
// convert spec units to heightmap cells the same way for houses and jitter.
const unitsToCells = u => u * U / HM.mpp
const Uu = HM.mpp * spec.unitsPerMeter, Wu = cols * Uu, Hu = rows * Uu // Three's units per cell / extent, for the shared size hashes
const hAt = (c, r) => E[Math.min(rows - 1, Math.max(0, r | 0)) * cols + Math.min(cols - 1, Math.max(0, c | 0))]
// Bilinear sample at fractional (column, row); pixel index c sits at position c,
// matching the Three spike's hLerp so trees land on the same relief.
const hLerp = (c, r) => { const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0; return (hAt(c0, r0) * (1 - fc) + hAt(c0 + 1, r0) * fc) * (1 - fr) + (hAt(c0, r0 + 1) * (1 - fc) + hAt(c0 + 1, r0 + 1) * fc) * fr }
const slopeAt = (c, r) => Math.hypot(hAt(c + 1, r) - hAt(c - 1, r), hAt(c, r + 1) - hAt(c, r - 1)) / (2 * HM.mpp)
const lonToCol = lon => (mx(lon) - HM.MX0) / (HM.MX1 - HM.MX0) * cols
const latToRow = lat => (my(lat) - HM.MY0) / (HM.MY1 - HM.MY0) * rows
const colToLon = c => (HM.MX0 + c / cols * (HM.MX1 - HM.MX0)) * 360 - 180
const rowToLat = r => { const m = HM.MY0 + r / rows * (HM.MY1 - HM.MY0); return Math.atan(Math.sinh(Math.PI * (1 - 2 * m))) * 180 / Math.PI }
const surfaceH = (c, r) => hLerp(c, r) * EX // exaggerated metres, what the globe draws

// ---- sun vector in the target's ENU frame (shared azimuth/elevation convention) ----
const az = rad(spec.sun.azimuthDeg), el = rad(spec.sun.elevationDeg)
// Three: position = (sin az cos el, sin el, cos az cos el) in (east, up, south).
const sunENU = new C.Cartesian3(Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el))

// ---- imagery: the shared texture with the sun's relief shading baked in ----
// CustomHeightmapTerrainProvider has no vertex normals (hasVertexNormals is always
// false), so globe.enableLighting can only do day/night shading from the ellipsoid
// normal: the relief would read flat apart from cast shadows. Baking a Lambert term
// from the heightmap into the imagery is the standard Cesium workaround; the sun
// direction and hemisphere fill come from the spec so it matches Three's lighting.
async function shadedTextureUrl() {
  const tex = new Image(); tex.src = "../shared/terrain-color.jpg"; await tex.decode()
  const cv = document.createElement("canvas"); cv.width = tex.width; cv.height = tex.height
  const g = cv.getContext("2d"); g.drawImage(tex, 0, 0)
  const id = g.getImageData(0, 0, cv.width, cv.height), px = id.data
  const sx = cols / cv.width, sy = rows / cv.height
  const L = sunENU, flat = Math.max(0.2, L.z)
  for (let j = 0; j < cv.height; j++) {
    const r = (j + 0.5) * sy
    for (let i = 0; i < cv.width; i++) {
      const c = (i + 0.5) * sx
      const dEdx = (hLerp(c + 1, r) - hLerp(c - 1, r)) * EX / (2 * HM.mpp)
      const dEdy = (hLerp(c, r - 1) - hLerp(c, r + 1)) * EX / (2 * HM.mpp) // rows run north→south
      const inv = 1 / Math.hypot(dEdx, dEdy, 1)
      const ndl = Math.max(0, (-dEdx * L.x - dEdy * L.y + L.z) * inv)
      let shade = 0.42 + 0.58 * ndl / flat // flat land keeps the painted colour
      if (hLerp(c, r) <= 1) shade = 1 + (shade - 1) * 0.35 // keep the sea quiet
      const k = (j * cv.width + i) * 4
      px[k] = Math.min(255, px[k] * shade); px[k + 1] = Math.min(255, px[k + 1] * shade); px[k + 2] = Math.min(255, px[k + 2] * shade)
    }
  }
  g.putImageData(id, 0, 0)
  const blob = await new Promise(res => cv.toBlob(res, "image/jpeg", 0.92))
  return URL.createObjectURL(blob)
}

// ---- terrain: the heightmap served to Cesium per tile, sampled by Mercator y ----
let terrainTilesSampled = 0
const TW = 64 // samples per tile edge; 64 keeps refinement at geographic level 13 for this camera
const tiling = new C.GeographicTilingScheme()
const terrainProvider = new C.CustomHeightmapTerrainProvider({
  width: TW, height: TW, tilingScheme: tiling,
  callback(x, y, level) {
    const rect = tiling.tileXYToRectangle(x, y, level)
    // Always a fresh buffer: Cesium transfers it to the mesh worker and a shared one would be detached.
    const out = new Float32Array(TW * TW)
    const w = C.Math.toDegrees(rect.west), e = C.Math.toDegrees(rect.east), n = C.Math.toDegrees(rect.north), s = C.Math.toDegrees(rect.south)
    if (e < HM.lon[0] || w > HM.lon[1] || n < HM.lat[0] || s > HM.lat[1]) return out
    terrainTilesSampled++
    for (let j = 0; j < TW; j++) {
      const row = latToRow(n + (s - n) * j / (TW - 1)); if (row < 0 || row >= rows) continue
      for (let i = 0; i < TW; i++) {
        const col = lonToCol(w + (e - w) * i / (TW - 1)); if (col < 0 || col >= cols) continue
        out[j * TW + i] = hLerp(col, row)
      }
    }
    return out
  },
})

// ---- viewer ----
const extent = C.Rectangle.fromDegrees(HM.lon[0], HM.lat[0], HM.lon[1], HM.lat[1])
const baseLayer = C.ImageryLayer.fromProviderAsync(C.TileMapServiceImageryProvider.fromUrl(C.buildModuleUrl("Assets/Textures/NaturalEarthII")))
const viewer = new C.Viewer("cesiumContainer", {
  animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, skyBox: false,
  scene3DOnly: true, shadows: KNOB.shadows, terrainShadows: KNOB.shadows ? C.ShadowMode.ENABLED : C.ShadowMode.DISABLED, requestRenderMode: false,
  // Three renders at min(devicePixelRatio, 2); Cesium's default renders at CSS pixels.
  useBrowserRecommendedResolution: false, msaaSamples: KNOB.msaa,
  contextOptions: { webgl: { antialias: true, powerPreference: "high-performance" } },
  baseLayer, terrainProvider,
})
const scene = viewer.scene, globe = scene.globe, camera = viewer.camera
// The painted (and sun-shaded) texture as one imagery tile over the heightmap extent.
viewer.imageryLayers.add(new C.ImageryLayer(await C.SingleTileImageryProvider.fromUrl(await shadedTextureUrl(), { rectangle: extent })))
if (devicePixelRatio > 2) viewer.resolutionScale = 2 / devicePixelRatio
scene.postProcessStages.fxaa.enabled = KNOB.msaa <= 1
scene.verticalExaggeration = EX
globe.enableLighting = true
globe.dynamicAtmosphereLightingFromSun = false // atmosphere follows scene.light, not the real sun
globe.depthTestAgainstTerrain = true
globe.baseColor = C.Color.fromCssColorString(spec.water.deep)
scene.backgroundColor = C.Color.fromCssColorString(spec.fog.color)
scene.skyAtmosphere.show = true
// Cesium's fog is a density model on the globe only, not a near/far range on
// everything as in Three. Default density is invisible from a 17 km camera; this
// makes the far shore haze over roughly where the spec's fog starts (33 km).
scene.fog.enabled = true
scene.fog.density = 0.0025
scene.fog.visualDensityScalar = 0.5

// Sun: Cesium wants the direction light travels, in ECEF.
const target = C.Cartesian3.fromDegrees(spec.camera.target.lon, spec.camera.target.lat, 0)
const enu = C.Transforms.eastNorthUpToFixedFrame(target)
const sunWC = C.Matrix4.multiplyByPointAsVector(enu, sunENU, new C.Cartesian3())
// Cesium's phong has no tone mapping: the spec's 2.1 intensity clips every
// primitive to white, so the primitives get a sane intensity here; the globe's
// day/night term ignores intensity anyway.
scene.light = new C.DirectionalLight({ direction: C.Cartesian3.negate(sunWC, new C.Cartesian3()), color: C.Color.fromCssColorString(spec.sun.color), intensity: 1.15 })
// Cesium's default directional shadow map is 4 cascades of 2048², i.e. four
// depth passes per frame where Three has one. One cascade over the scene's
// 80 km is the same budget as Three's single 2048² orthographic shadow camera.
// Replacing scene.shadowMap needs the scene's private light camera: the Scene
// writes scene.light.direction into it every frame (see Scene.updateFrameState).
// Default maximumDistance is 5 km: from a 30 km camera no shadows would render at all.
scene.shadowMap = new C.ShadowMap({
  context: scene.context, lightCamera: scene._shadowMapCamera, enabled: KNOB.shadows, cascadesEnabled: true, numberOfCascades: KNOB.cascades,
  maximumDistance: 80000, size: KNOB.shadowSize, softShadows: true, darkness: 0.45, normalOffset: true, fadingEnabled: false,
})

// ---- camera: spec offset (100 m units, x east, y up, z south) → heading/pitch/range ----
const off = spec.camera.offsetUnits
let orbitT = 0
function cameraHPR(t) {
  const a = t * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a)
  const east = (off.x * ca - off.z * sa) * U, north = -(off.x * sa + off.z * ca) * U, up = off.y * U
  const horiz = Math.hypot(east, north)
  return new C.HeadingPitchRange(Math.atan2(-east, -north), -Math.atan2(up, horiz), Math.hypot(horiz, up))
}
function updateFov() {
  // Three's fov is vertical; Cesium's is horizontal when the view is landscape.
  const w = scene.canvas.clientWidth || innerWidth, h = scene.canvas.clientHeight || innerHeight, v = rad(spec.camera.fovDeg)
  camera.frustum.fov = w > h ? 2 * Math.atan(Math.tan(v / 2) * w / h) : v
}
function placeCamera() { updateFov(); camera.lookAt(target, cameraHPR(orbitT)) }
placeCamera(); addEventListener("resize", placeCamera)

// ---- geometry batching helpers ----
const VF = C.PerInstanceColorAppearance.VERTEX_FORMAT
const col = hex => C.Color.fromCssColorString(hex)
const attr = color => ({ color: C.ColorGeometryInstanceAttribute.fromColor(color) })
const tris = g => (g.indices ? g.indices.length / 3 : 0)
const I4 = C.Matrix4.IDENTITY
const rotZ = a => C.Matrix4.fromRotationTranslation(C.Matrix3.fromRotationZ(a))
const trans = (x, y, z) => C.Matrix4.fromTranslation(new C.Cartesian3(x, y, z))
const scale3 = (x, y, z) => C.Matrix4.fromScale(new C.Cartesian3(x, y, z))
const mul = (...ms) => ms.reduce((acc, m) => C.Matrix4.multiply(acc, m, new C.Matrix4()), I4)
let triangles = 0
const primitives = { vegetation: [], houses: null, ships: [] }
function makePrimitive(instances, shadows = C.ShadowMode.ENABLED) {
  // Synchronous combine: no worker round trip, so `ready` and loadMs are deterministic.
  return scene.primitives.add(new C.Primitive({
    geometryInstances: instances, appearance: new C.PerInstanceColorAppearance({ translucent: false, closed: true }),
    asynchronous: false, allowPicking: false, vertexCacheOptimize: false, compressVertices: false, releaseGeometryInstances: true, shadows,
  }))
}
// A geometry placed on the globe: ENU frame at (lon, lat, h) × rotation × uniform scale × local offset.
function placed(geometry, lon, lat, h, { scale = 1, rot = 0, zOff = 0, extra = null, color }) {
  const m = C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(lon, lat, h))
  if (rot) C.Matrix4.multiply(m, rotZ(rot), m)
  if (scale !== 1) C.Matrix4.multiplyByUniformScale(m, scale, m)
  if (zOff) C.Matrix4.multiplyByTranslation(m, new C.Cartesian3(0, 0, zOff), m)
  if (extra) C.Matrix4.multiply(m, extra, m)
  return new C.GeometryInstance({ geometry, modelMatrix: m, attributes: attr(color) })
}

// ---- vegetation (shared placement rule; sizes mirror the Three spike in metres) ----
const P = spec.palette, TR = spec.trees
const pts = []
for (let r = 2; r < rows - 2; r += TR.sampleEvery) for (let c = 2; c < cols - 2; c += TR.sampleEvery) {
  const e = hAt(c, r); if (e < TR.minElev || e > TR.maxElev) continue; const sl = slopeAt(c, r); if (sl > TR.maxSlope) continue
  if (fbm(c * 0.03 + 5, r * 0.03 + 7) < TR.noiseThreshold) continue; if (hash(c, r) > TR.dropFraction) continue
  const cj = c + hash(r, c) * 1.6 - 0.8, rj = r + hash(c * 3, r) * 1.6 - 0.8
  // Three hashes tree size on its world x/z; reproduce those numbers so sizes match too.
  pts.push({ c: cj, r: rj, e, sl, x: cj * Uu - Wu / 2, z: rj * Uu - Hu / 2 })
}
const coneG = new C.CylinderGeometry({ length: 3.4 * U, topRadius: 0, bottomRadius: 0.95 * U, slices: 6, vertexFormat: VF })
const ballG = new C.SphereGeometry({ radius: 1.25 * U, stackPartitions: 5, slicePartitions: 6, vertexFormat: VF })
const trunkG = new C.CylinderGeometry({ length: 1.6 * U, topRadius: 0.18 * U, bottomRadius: 0.26 * U, slices: 5, vertexFormat: VF })
const coneT = tris(C.CylinderGeometry.createGeometry(coneG)), ballT = tris(C.SphereGeometry.createGeometry(ballG)), trunkT = tris(C.CylinderGeometry.createGeometry(trunkG))
let treeCount = 0, vegetationTriangles = 0
function buildVegetation(fraction) {
  for (const p of primitives.vegetation) scene.primitives.remove(p)
  primitives.vegetation = []; triangles -= vegetationTriangles; vegetationTriangles = 0
  const list = fraction < 1 ? pts.filter((_, i) => i % 2 === 0) : pts
  const isConifer = p => p.e > TR.coniferAbove || p.sl > TR.coniferSlope
  const cones = [], balls = [], trunks = []
  const conifer = col(P.conifer), broadleaf = col(P.broadleaf), trunk = col(P.trunk)
  for (const p of list) {
    const lon = colToLon(p.c), lat = rowToLat(p.r), h = surfaceH(p.c, p.r)
    // Symbols are sunk 20–30 m: Cesium tessellates its own resampled grid, so the
    // bilinear height here and the drawn surface differ by up to a few metres.
    if (isConifer(p)) { const s = 0.75 + hash(p.x, p.z) * 0.5; cones.push(placed(coneG, lon, lat, h, { scale: s, zOff: 1.7 * U - 20, color: conifer })) }
    else { const s = 0.7 + hash(p.z, p.x) * 0.5; balls.push(placed(ballG, lon, lat, h, { scale: s, zOff: 2.0 * U, color: broadleaf })) }
    const ts = 0.8 + hash(p.x * 2, p.z) * 0.4; trunks.push(placed(trunkG, lon, lat, h, { scale: ts, zOff: 0.8 * U - 30, color: trunk }))
  }
  if (cones.length) primitives.vegetation.push(makePrimitive(cones))
  if (balls.length) primitives.vegetation.push(makePrimitive(balls))
  if (trunks.length) primitives.vegetation.push(makePrimitive(trunks))
  vegetationTriangles = cones.length * coneT + balls.length * ballT + trunks.length * trunkT
  triangles += vegetationTriangles; treeCount = list.length
  return list.length
}
buildVegetation(1)

// ---- houses: box + pyramid roof near each village, on land below 90 m ----
const boxG = C.BoxGeometry.fromDimensions({ dimensions: new C.Cartesian3(1.4 * U, 1.1 * U, 0.9 * U), vertexFormat: VF })
const roofG = new C.CylinderGeometry({ length: 0.8 * U, topRadius: 0, bottomRadius: 1.05 * U, slices: 4, vertexFormat: VF })
const boxT = tris(C.BoxGeometry.createGeometry(boxG)), roofT = tris(C.CylinderGeometry.createGeometry(roofG))
let houseCount = 0
{
  const inst = [], wall = col(P.wall), roof = col(P.roof), thatch = col(P.thatch)
  const roofX = mul(scale3(1, 0.8, 1), trans(0, 0, 1.3 * U), rotZ(Math.PI / 4))
  for (const pl of spec.places) {
    if (!pl.village) continue
    const cx = lonToCol(pl.lon), cz = latToRow(pl.lat); let placedN = 0, k = 0
    while (placedN < pl.village && k < 200) {
      k++
      const a = hash(pl.seed + k, 3) * 6.28, rr = 1.5 + hash(k, pl.seed) * 7
      const c = cx + unitsToCells(Math.cos(a) * rr), r = cz + unitsToCells(Math.sin(a) * rr * 0.8)
      const e = hLerp(c, r); if (e < 4 || e > 90) continue
      const lon = colToLon(c), lat = rowToLat(r), h = e * EX, rot = hash(k, 9) * 6.28, sc = 1.5 + hash(k, 2) * 0.7
      inst.push(placed(boxG, lon, lat, h, { scale: sc, rot, zOff: 0.45 * U - 10, color: wall }))
      inst.push(placed(roofG, lon, lat, h, { scale: sc, rot, extra: roofX, color: hash(k, 5) > 0.5 ? roof : thatch }))
      placedN++; houseCount++; triangles += boxT + roofT
    }
  }
  primitives.houses = makePrimitive(inst)
}

// ---- ships: schematic 遣唐使船 from boxes and cylinders, in a ship-local frame ----
// Parts are baked in ship-local metres (x forward, y port, z up); the Primitive's
// modelMatrix carries position and heading, so ship 2 moves by replacing it.
const SHIP_FLOAT = 0.35 * U
function shipMatrix(lon, lat, heading) { return C.Matrix4.multiply(C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(lon, lat, SHIP_FLOAT)), rotZ(heading), new C.Matrix4()) }
function buildShip(s) {
  const k = s.scale * U, inst = []
  const box = (x, y, z) => C.BoxGeometry.fromDimensions({ dimensions: new C.Cartesian3(x * k, y * k, z * k), vertexFormat: VF })
  const part = (geometry, color, x, y, z, extra) => {
    const m = trans(x * k, y * k, z * k); if (extra) C.Matrix4.multiply(m, extra, m)
    triangles += tris(geometry.constructor.createGeometry(geometry))
    inst.push(new C.GeometryInstance({ geometry, modelMatrix: m, attributes: attr(color) }))
  }
  part(box(7, 2.4, 1.3), col(P.hull), 0, 0, 0.4)
  part(box(5.6, 2.0, 0.5), col(P.deck), 0, 0, 1.25)
  part(box(2.2, 1.6, 1.2), col(P.wall), -1.2, 0, 2.05)
  part(new C.CylinderGeometry({ length: 0.7 * k, topRadius: 0, bottomRadius: 1.5 * k, slices: 4, vertexFormat: VF }), col(P.roof), -1.2, 0, 3.0, mul(scale3(1, 0.75, 1), rotZ(Math.PI / 4)))
  for (const mxp of [1.9, -0.2]) {
    part(new C.CylinderGeometry({ length: 7 * k, topRadius: 0.1 * k, bottomRadius: 0.14 * k, slices: 6, vertexFormat: VF }), col("#3a2616"), mxp, 0, 4.5)
    part(box(0.08, 3.2, 3.6), col(P.sail), mxp + 0.3, 0, 5.0, rotZ(0.25))
  }
  part(box(0.04, 1.4, 0.8), col(P.flag), 2.0, 0, 8.4)
  const prim = makePrimitive(inst)
  prim.modelMatrix = shipMatrix(s.lon, s.lat, s.headingRad)
  return prim
}
primitives.ships = spec.ships.map(buildShip)

// ---- route: Catmull-Rom through the spec points, arc-length parametrised ----
const routeCR = spec.route.map(p => [lonToCol(p.lon), latToRow(p.lat)])
function catmull(pts, i, u) {
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(pts.length - 1, i + 1)], p3 = pts[Math.min(pts.length - 1, i + 2)]
  const u2 = u * u, u3 = u2 * u
  return [0, 1].map(d => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u3))
}
const curve = []; { const N = 48; for (let i = 0; i < routeCR.length - 1; i++) for (let j = 0; j < N; j++) curve.push(catmull(routeCR, i, j / N)); curve.push(routeCR[routeCR.length - 1]) }
const cum = [0]; for (let i = 1; i < curve.length; i++) cum.push(cum[i - 1] + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]))
const total = cum[cum.length - 1]
function routeAt(t) {
  const d = Math.min(1, Math.max(0, t)) * total; let i = 1; while (i < cum.length - 1 && cum[i] < d) i++
  const f = (d - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), a = curve[i - 1], b = curve[i]
  return { c: a[0] + (b[0] - a[0]) * f, r: a[1] + (b[1] - a[1]) * f, dc: b[0] - a[0], dr: b[1] - a[1] }
}
const ROUTE_H = 0.5 * U
viewer.entities.add({
  id: "route",
  polyline: {
    positions: curve.map(([c, r]) => C.Cartesian3.fromDegrees(colToLon(c), rowToLat(r), ROUTE_H)),
    width: 4, material: new C.PolylineDashMaterialProperty({ color: col(P.route), gapColor: C.Color.TRANSPARENT, dashLength: 24 }),
  },
})

// ---- water: translucent sheet just above sea level so the painted shelf shows through ----
// Three's water plane sits at 0.06 units (6 m) and extends 160 km past the extent;
// same here, which also keeps it from z-fighting the zero-height globe outside.
{
  const pad = 6 // degrees: past the fog, so the sheet's edge never shows
  viewer.entities.add({
    id: "water",
    rectangle: {
      coordinates: C.Rectangle.fromDegrees(HM.lon[0] - pad, HM.lat[0] - pad, HM.lon[1] + pad, HM.lat[1] + pad),
      height: 0.06 * U, material: col(spec.water.color).withAlpha(spec.water.opacity), shadows: C.ShadowMode.RECEIVE_ONLY,
    },
  })
}

// ---- labels: chapter script with a romanized line beneath, leader to the ground ----
const JP_FONT = '"Noto Serif JP","Hiragino Mincho ProN","IPAGothic","WenQuanYi Zen Hei",serif'
const ROM_FONT = '"Cinzel","Cinzel Decorative",Georgia,serif'
await Promise.race([Promise.all([document.fonts.load(`500 15px ${JP_FONT}`), document.fonts.load(`600 9px ${ROM_FONT}`)]), new Promise(r => setTimeout(r, 2500))])
const labels = scene.primitives.add(new C.LabelCollection({ scene }))
const leaders = scene.primitives.add(new C.PolylineCollection())
const ink = C.Color.fromCssColorString("#f3ead7"), inkDim = C.Color.fromCssColorString("#b9af9c"), outline = C.Color.fromCssColorString("#0b1114")
for (const pl of spec.places) {
  if (!pl.name) continue
  const c = lonToCol(pl.lon), r = latToRow(pl.lat), sea = pl.kind === "sea"
  const ground = sea ? 0 : surfaceH(c, r), lift = sea ? 0 : (pl.selected ? 6 : 3) * U
  const top = C.Cartesian3.fromDegrees(pl.lon, pl.lat, ground + lift)
  if (!sea) leaders.add({ positions: [C.Cartesian3.fromDegrees(pl.lon, pl.lat, ground), top], width: 1, material: C.Material.fromType("Color", { color: ink.withAlpha(0.7) }) })
  const common = { position: top, style: C.LabelStyle.FILL_AND_OUTLINE, outlineColor: outline, outlineWidth: 3, horizontalOrigin: C.HorizontalOrigin.CENTER, verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY }
  if (sea) { labels.add({ ...common, text: pl.name, font: `600 12px ${ROM_FONT}`, fillColor: C.Color.fromCssColorString("#eaf4f7").withAlpha(0.85) }); continue }
  labels.add({ ...common, text: pl.name, font: `500 15px ${JP_FONT}`, fillColor: ink, pixelOffset: new C.Cartesian2(0, pl.rom ? -14 : -2) })
  if (pl.rom) labels.add({ ...common, text: pl.rom, font: `600 9px ${ROM_FONT}`, fillColor: inkDim, outlineWidth: 2, pixelOffset: new C.Cartesian2(0, -2) })
}

// ---- stats, ready, API ----
let frameMs = 0, fps = 0, frames = 0, tAcc = 0, last = performance.now(), drawCalls = 0, loadMs = 0, terrainTiles = 0, frameStart = 0, frameCount = 0
scene.preUpdate.addEventListener(() => { frameStart = performance.now() })
scene.postRender.addEventListener(() => {
  const now = performance.now(); frameCount++
  frameMs = frameMs * 0.9 + (now - frameStart) * 0.1
  drawCalls = scene.frameState.commandList.length
  terrainTiles = globe._surface?._tilesToRender?.length ?? 0
  frames++; tAcc += now - last; last = now
  if (tAcc >= 1000) { fps = frames * 1000 / tAcc; frames = 0; tAcc = 0; overlay() }
})
// Bundle: every script/style Cesium pulled from node_modules, workers included,
// as the browser saw them (encodedBodySize = bytes on the wire, uncompressed here).
let bundleKB = 0
async function measureBundle() {
  const seen = new Set(), own = performance.getEntriesByType("resource").filter(e => /\/node_modules\/cesium\/.*\.(js|css|wasm)(\?|$)/.test(e.name))
  let bytes = 0; for (const e of own) if (!seen.has(e.name)) { seen.add(e.name); bytes += e.encodedBodySize || e.transferSize || 0 }
  if (!own.some(e => e.name.endsWith("Cesium.js"))) bytes += +((await fetch("/node_modules/cesium/Build/Cesium/Cesium.js", { method: "HEAD" })).headers.get("content-length") || 0)
  bundleKB = Math.round(bytes / 1024)
}
function stats() {
  const terrainTris = terrainTiles * ((TW - 1) * (TW - 1) * 2 + 4 * (TW - 1) * 2)
  return {
    fps: +fps.toFixed(1), frameMs: +frameMs.toFixed(2), drawCalls, triangles: triangles + terrainTris,
    memoryMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, loadMs, bundleKB,
    trees: treeCount, houses: houseCount, terrainTiles, sceneTriangles: triangles, terrainTrianglesEstimate: terrainTris,
    terrainTilesSampled, loadMsFromPageStart: loadMs ? Math.round(loadMs + (T0 - window.__spikePageT0)) : 0, engine: "cesium " + C.VERSION,
  }
}
function overlay() {
  const s = stats()
  document.getElementById("stats").textContent = `cesium ${C.VERSION}\nfps ${s.fps}  frame ${s.frameMs} ms\ndraw calls ${s.drawCalls}  tris ${s.triangles}\nmem ${s.memoryMB ?? "n/a"} MB  load ${s.loadMs} ms\nbundle ${s.bundleKB} KB  trees ${s.trees}  houses ${s.houses}\nterrain tiles ${s.terrainTiles}`
}
const ready = new Promise(resolve => {
  // The texture layer and the Natural Earth base were awaited above, so both
  // providers exist before the first frame. Terrain and imagery tiles then report
  // through the globe's tile queue: wait for tileLoadProgressEvent to have been
  // busy and reach 0 (or, as a guard, for globe.tilesLoaded after 30 frames),
  // then for the postRender of the frame drawn after that. loadMs therefore
  // includes every terrain tile the camera needs, which at the software GPU's
  // ~0.3 fps is tens of seconds because Cesium loads tiles per rendered frame.
  let sawLoading = false, tilesDone = false, done = false
  globe.tileLoadProgressEvent.addEventListener(n => { if (n > 0) sawLoading = true; else if (sawLoading) tilesDone = true })
  scene.postRender.addEventListener(async () => {
    if (done || !(tilesDone || (frameCount > 30 && globe.tilesLoaded))) return
    done = true; loadMs = Math.round(performance.now() - T0)
    await measureBundle(); overlay(); resolve()
  })
})

window.spike._install({
  ready,
  orbit(t) { orbitT = t; placeCamera() },
  playhead(t) {
    const p = routeAt(t)
    primitives.ships[0].modelMatrix = shipMatrix(colToLon(p.c), rowToLat(p.r), Math.atan2(-p.dr, p.dc))
  },
  setQuality(level) {
    const phone = level === "phone"
    viewer.shadows = !phone; viewer.terrainShadows = phone ? C.ShadowMode.DISABLED : C.ShadowMode.ENABLED
    buildVegetation(phone ? 0.5 : 1)
  },
  stats,
})
