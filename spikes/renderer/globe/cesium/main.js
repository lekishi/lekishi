// Globe spike, CesiumJS. Draws shared/scene.json on the shared quantized-mesh
// terrain and painted imagery, flies shared/flight.js, and exposes window.spike
// for ../capture.mjs (see ../README.md). Nothing here ships.
import { cameraAt, sunDirection, tileTraffic } from "../shared/flight.js"

const T0 = performance.now()
const C = window.Cesium
// Same stance as src/lib/atlas/renderer/cesium-renderer.ts: no ion token, no ion
// credit, no provider account. Every tile comes from ../tiles/.
C.Ion.defaultAccessToken = undefined
C.CreditDisplay.cesiumCredit = undefined

const [spec, dio, tileset] = await Promise.all(["../shared/scene.json", "../shared/diorama.json", "../tiles/tileset.json"].map(async u => (await fetch(u)).json()))
// Debug knobs (defaults are the measured configuration):
// ?shadows=0 ?lighting=0 ?fog=0 ?ga=0 (ground atmosphere) ?fogScale=0.05 ?maxEdge=0.25 (0 resamples every tile)
const qs = new URLSearchParams(location.search)
const KNOB = { shadows: qs.get("shadows") !== "0", maxEdge: +(qs.get("maxEdge") ?? 0.25), lighting: qs.get("lighting") !== "0", fog: qs.get("fog") !== "0", ga: qs.get("ga") !== "0" }
const EX = spec.verticalExaggeration
const U = dio.unitMetres // metres per region-spike scene unit (100): symbolic sizes, not to scale
const rad = d => d * Math.PI / 180
const col = hex => C.Color.fromCssColorString(hex)

// ---- terrain: the shared quantized mesh with its octvertexnormals ----
// layer.json carries per-level availability, so Cesium never asks for a tile
// that was not built and upsamples its parent instead.
const terrainProvider = await C.CesiumTerrainProvider.fromUrl("../tiles/terrain/", { requestVertexNormals: true })
const tiling = new C.GeographicTilingScheme()

// ---- workarounds: three defects in the shared terrain tiles ----
// The tiles are fixed up as they arrive (requestTileGeometry is wrapped below);
// the shared files are not touched. Reads QuantizedMeshTerrainData's private
// buffers (_quantizedVertices, _indices, _encodedNormals, _minimumHeight,
// _maximumHeight, skirt heights).
//
// 1. Curvature. build-tiles.py simplifies each tile's 65×65 grid with Delatin
//    on *height* error alone, so flat or coarse tiles collapse to two triangles
//    whatever their size. Vertices are lon/lat/height and Cesium joins them with
//    straight chords in ECEF: a level-0 tile (180°) becomes two triangles between
//    the poles, a level-6 sea tile (2.8°) sags 2–4 km below the ellipsoid
//    mid-tile. Real terrain services keep enough vertices for curvature. Any tile
//    with a triangle edge longer than MAX_EDGE_DEG is resampled on its own 65×65
//    source grid (or a coarser stride of it when every Delatin vertex lies on
//    that stride, which loses nothing), heights and normals interpolated
//    barycentrically from the original triangles. Every original vertex is a
//    grid point (Delatin ran on the grid), so the height field is unchanged; only
//    the tessellation is denser. Normals are interpolated in each vertex's local
//    east/north/up frame and rebuilt in the grid point's frame: across a 90°
//    source triangle a plain ECEF blend tilts the sea's normal by tens of degrees.
//    Level 10/11 land tiles around the diorama pass through untouched.
// 2. Normals (repairNormals). 3. Winding (in curvedTerrain).
const MAX_EDGE_DEG = KNOB.maxEdge // a 0.25° chord sags ~15 m: invisible from where such tiles are drawn
const occluder = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84)
let tilesResampled = 0, normalsRepaired = 0, trianglesFlipped = 0
// 2. Normals: quantized_mesh_encoder's oct_encode maps
// [-1, 1] with floor((v * 0.5 + 0.5) * 256) into a uint8, so a component of
// exactly +1 becomes 256 and wraps to 0, i.e. -1. That hits every vertex whose
// normal is on an axis of the octahedron: the equator at 0°/90°E/180°/90°W and,
// south of the equator, the whole of those four meridians. Those normals point
// into the ground (the dark wedge south of the equator at 90°E). Terrain
// normals never face down, so a 0 byte on a normal facing away from the
// ellipsoid normal is read back as 255.
function repairNormals(qv, nrm, n, rect) {
  const w = new C.Cartesian3(), up = new C.Cartesian3(), best = new C.Cartesian3()
  for (let i = 0; i < n; i++) {
    const ex = nrm[2 * i], ey = nrm[2 * i + 1]
    if (ex !== 0 && ey !== 0) continue
    const lon = rect.west + rect.width * qv[i] / 32767, lat = rect.south + rect.height * qv[n + i] / 32767
    up.x = Math.cos(lat) * Math.cos(lon); up.y = Math.cos(lat) * Math.sin(lon); up.z = Math.sin(lat)
    let bx = ex, by = ey, bestDot = C.Cartesian3.dot(C.AttributeCompression.octDecode(ex, ey, best), up)
    for (const [cx, cy] of [[ex || 255, ey], [ex, ey || 255], [ex || 255, ey || 255]]) {
      const dot = C.Cartesian3.dot(C.AttributeCompression.octDecode(cx, cy, w), up)
      if (dot > bestDot + 1e-6) { bestDot = dot; bx = cx; by = cy }
    }
    if (bx !== ex || by !== ey) { nrm[2 * i] = bx; nrm[2 * i + 1] = by; normalsRepaired++ }
  }
}
function curvedTerrain(d, x, y, level) {
  const qv = d._quantizedVertices, idx = d._indices, nrm = d._encodedNormals
  if (!qv || !idx) return d
  const n = qv.length / 3, Q = 32767
  const rect = tiling.tileXYToRectangle(x, y, level)
  if (nrm) repairNormals(qv, nrm, n, rect)
  // 3. Winding: Delatin triangulates in image space (row 0 north), so every
  // source triangle is clockwise in (east, north). The quantized-mesh spec and
  // Cesium's globe back-face culling expect counter-clockwise: as served, every
  // interior triangle is culled and only Cesium's own skirts draw (the sky
  // atmosphere shows through as white). Flip each clockwise triangle in place.
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2]
    if ((qv[b] - qv[a]) * (qv[n + c] - qv[n + a]) - (qv[c] - qv[a]) * (qv[n + b] - qv[n + a]) < 0) { idx[t + 1] = c; idx[t + 2] = b; trianglesFlipped++ }
  }
  const spanX = C.Math.toDegrees(rect.width), spanY = C.Math.toDegrees(rect.height)
  let maxEdge = 0
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = idx[t + k], b = idx[t + (k + 1) % 3]
    maxEdge = Math.max(maxEdge, Math.hypot((qv[a] - qv[b]) / Q * spanX, (qv[n + a] - qv[n + b]) / Q * spanY))
  }
  if (maxEdge <= MAX_EDGE_DEG) return d
  // Coarsest stride of the 64-cell source grid that still holds every vertex…
  let sL = 64
  for (let i = 0; i < n && sL > 1; i++) {
    const gc = qv[i] * 64 / Q, gr = qv[n + i] * 64 / Q, rc = Math.round(gc), rr = Math.round(gr)
    if (Math.abs(gc - rc) > 0.02 || Math.abs(gr - rr) > 0.02) { sL = 1; break }
    while (sL > 1 && (rc % sL || rr % sL)) sL /= 2
  }
  // …and fine enough that no cell is longer than MAX_EDGE_DEG.
  let sC = 64
  while (sC > 1 && Math.max(spanX, spanY) * sC / 64 > MAX_EDGE_DEG) sC /= 2
  const s = Math.min(sL, sC), G = 64 / s + 1, cells = G - 1
  const minH = d._minimumHeight, maxH = d._maximumHeight, dh = maxH - minH
  const hOf = i => minH + qv[2 * n + i] / Q * dh
  const nv = []
  // ENU basis at a geodetic point (radians), as flight.js enu().
  const frame = (lon, lat) => { const so = Math.sin(lon), co = Math.cos(lon), sa = Math.sin(lat), ca = Math.cos(lat); return [[-so, co, 0], [-sa * co, -sa * so, ca], [ca * co, ca * so, sa]] }
  const lonOf = u => rect.west + rect.width * u / Q, latOf = v => rect.south + rect.height * v / Q
  if (nrm) for (let i = 0; i < n; i++) {
    const w = C.AttributeCompression.octDecode(nrm[2 * i], nrm[2 * i + 1], new C.Cartesian3()), f = frame(lonOf(qv[i]), latOf(qv[n + i]))
    nv.push(f.map(b => b[0] * w.x + b[1] * w.y + b[2] * w.z)) // local (e, n, u) components
  }
  const H = new Float64Array(G * G).fill(NaN), N = new Float32Array(G * G * 3)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2]
    const ax = qv[a] / Q * cells, ay = qv[n + a] / Q * cells, bx = qv[b] / Q * cells, by = qv[n + b] / Q * cells, cx = qv[c] / Q * cells, cy = qv[n + c] / Q * cells
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if (Math.abs(den) < 1e-12) continue
    const i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 1e-6)), i1 = Math.min(cells, Math.floor(Math.max(ax, bx, cx) + 1e-6))
    const j0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 1e-6)), j1 = Math.min(cells, Math.floor(Math.max(ay, by, cy) + 1e-6))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const g = j * G + i; if (!Number.isNaN(H[g])) continue
      const wa = ((by - cy) * (i - cx) + (cx - bx) * (j - cy)) / den, wb = ((cy - ay) * (i - cx) + (ax - cx) * (j - cy)) / den, wc = 1 - wa - wb
      if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue
      H[g] = wa * hOf(a) + wb * hOf(b) + wc * hOf(c)
      if (nrm) for (let k = 0; k < 3; k++) N[g * 3 + k] = wa * nv[a][k] + wb * nv[b][k] + wc * nv[c][k]
    }
  }
  const out = new Uint16Array(G * G * 3), enc = nrm ? new Uint8Array(G * G * 2) : undefined
  const points = [], west = [], south = [], east = [], north = [], v3 = new C.Cartesian3(), e2 = new C.Cartesian2()
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const g = j * G + i, h = Number.isNaN(H[g]) ? minH : H[g]
    out[g] = Math.round(i / cells * Q); out[G * G + g] = Math.round(j / cells * Q); out[2 * G * G + g] = dh > 0 ? Math.round((h - minH) / dh * Q) : 0
    points.push(C.Cartesian3.fromRadians(rect.west + rect.width * i / cells, rect.south + rect.height * j / cells, h))
    if (enc) {
      const f = frame(rect.west + rect.width * i / cells, rect.south + rect.height * j / cells), le = N[g * 3], ln = N[g * 3 + 1], lu = N[g * 3 + 2]
      v3.x = f[0][0] * le + f[1][0] * ln + f[2][0] * lu; v3.y = f[0][1] * le + f[1][1] * ln + f[2][1] * lu; v3.z = f[0][2] * le + f[1][2] * ln + f[2][2] * lu
      if (C.Cartesian3.magnitudeSquared(v3) < 1e-12) C.Cartesian3.normalize(points[g], v3); else C.Cartesian3.normalize(v3, v3)
      C.AttributeCompression.octEncode(v3, e2); enc[2 * g] = e2.x; enc[2 * g + 1] = e2.y
    }
    if (i === 0) west.push(g); if (i === cells) east.push(g); if (j === 0) south.push(g); if (j === cells) north.push(g)
  }
  // Counter-clockwise in (east, north), i.e. front-facing from above, like the source meshes.
  const ind = new Uint16Array(cells * cells * 6); let p = 0
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const g = j * G + i
    ind[p++] = g; ind[p++] = g + 1; ind[p++] = g + G
    ind[p++] = g + 1; ind[p++] = g + G + 1; ind[p++] = g + G
  }
  const boundingSphere = C.BoundingSphere.fromPoints(points)
  tilesResampled++
  return new C.QuantizedMeshTerrainData({
    quantizedVertices: out, indices: ind, encodedNormals: enc, minimumHeight: minH, maximumHeight: maxH,
    boundingSphere, orientedBoundingBox: C.OrientedBoundingBox.fromRectangle(rect, minH, maxH),
    horizonOcclusionPoint: occluder.computeHorizonCullingPointPossiblyUnderEllipsoid(boundingSphere.center, points, minH),
    westIndices: west, southIndices: south, eastIndices: east, northIndices: north,
    westSkirtHeight: d._westSkirtHeight, southSkirtHeight: d._southSkirtHeight, eastSkirtHeight: d._eastSkirtHeight, northSkirtHeight: d._northSkirtHeight,
    childTileMask: d.childTileMask, waterMask: d.waterMask, credits: d._credits,
  })
}
{
  const request = terrainProvider.requestTileGeometry.bind(terrainProvider)
  terrainProvider.requestTileGeometry = (x, y, level, req) => request(x, y, level, req)?.then(d => curvedTerrain(d, x, y, level))
}

// ---- viewer ----
const viewer = new C.Viewer("cesiumContainer", {
  animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
  // skyBox: false also stops the Viewer from creating its Sun and Moon.
  skyBox: false, skyAtmosphere: new C.SkyAtmosphere(),
  scene3DOnly: true, shadows: true, terrainShadows: C.ShadowMode.ENABLED, requestRenderMode: false,
  // Three renders at min(devicePixelRatio, 2); Cesium's default renders at CSS pixels.
  useBrowserRecommendedResolution: false, msaaSamples: 1,
  contextOptions: { webgl: { antialias: true, powerPreference: "high-performance" } },
  baseLayer: false, terrainProvider,
})
const scene = viewer.scene, globe = scene.globe, camera = viewer.camera
if (scene.sun) scene.sun.show = false
if (scene.moon) scene.moon.show = false
if (devicePixelRatio > 2) viewer.resolutionScale = 2 / devicePixelRatio
scene.postProcessStages.fxaa.enabled = true
scene.verticalExaggeration = EX
scene.backgroundColor = col(spec.space)
scene.skyAtmosphere.show = true
globe.baseColor = col("#1d3a4c") // never seen once the level-0 imagery is in
globe.enableLighting = KNOB.lighting
// Atmosphere (sky rim and ground haze) follows scene.light, not the real sun:
// enableLighting + dynamicAtmosphereLighting + !FromSun selects SCENE_LIGHT.
globe.dynamicAtmosphereLighting = true
globe.dynamicAtmosphereLightingFromSun = false
globe.depthTestAgainstTerrain = true
// Cesium's fog takes its colour from the ground atmosphere; at the default
// visual density it washes the whole diorama teal from a 17 km camera. A third
// of the default keeps the horizon haze (and fog's tile culling) and leaves the
// near ground in its own colours.
scene.fog.enabled = KNOB.fog
scene.fog.visualDensityScalar = +(qs.get("fogScale") ?? 0.05)
globe.showGroundAtmosphere = KNOB.ga
// Keep the tiles the flight passed through, so the return to the globe at the
// end does not refetch them (default is 100 tiles).
globe.tileCacheSize = 1000
// The camera is placed only by fly(); no user input fights the harness.
scene.screenSpaceCameraController.enableInputs = false

// Sun: shared/flight.js gives the direction *to* the sun in ECEF; Cesium's
// DirectionalLight.direction is the way light travels, so negate it.
const sunTo = sunDirection(spec.sun)
// Cesium's phong has no tone mapping: a brighter light clips primitives to white.
scene.light = new C.DirectionalLight({ direction: new C.Cartesian3(-sunTo[0], -sunTo[1], -sunTo[2]), color: col(spec.sun.color), intensity: 1.15 })

// Cesium's default directional shadow map is 4 cascades of 2048² with a 5 km
// maximum distance: from a 30 km camera nothing would be shadowed. One cascade
// over 80 km is the same budget as the region spike. Replacing scene.shadowMap
// needs the scene's private light camera (Scene.updateFrameState writes
// scene.light.direction into it every frame). It is enabled only while the
// diorama is drawn: from the globe and the region nothing is within 80 km.
scene.shadowMap = new C.ShadowMap({
  context: scene.context, lightCamera: scene._shadowMapCamera, enabled: false, cascadesEnabled: true, numberOfCascades: 1,
  maximumDistance: 80000, size: 2048, softShadows: true, darkness: 0.45, normalOffset: true, fadingEnabled: false,
})

// ---- imagery: one layer per tileset.json group, coarse to fine ----
// Tiles exist only for the group's levels and for tiles intersecting its
// rectangle. Two things would otherwise ask for tiles that do not exist or are
// not needed:
//  - a rectangle edge that falls exactly on a tile boundary (45°N at levels 6–8)
//    can round outward in Rectangle.fromDegrees and pull in the next row: the
//    rectangle is shrunk by a hair, which can only drop tiles, never add one;
//  - Cesium clamps the imagery level *up* to the provider's minimumLevel on
//    coarse terrain tiles (ImageryLayer._createTileImagerySkeletons), so a
//    level-11 layer on a level-3 terrain tile would fetch hundreds of level-11
//    tiles: minimumTerrainLevel keeps each layer off terrain coarser than it.
const EPS = 1e-7 // degrees, ~1 cm
for (const g of tileset.imageryGroups) {
  const rectangle = g.rect ? C.Rectangle.fromDegrees(g.rect[0] + EPS, g.rect[1] + EPS, g.rect[2] - EPS, g.rect[3] - EPS) : undefined
  const provider = new C.UrlTemplateImageryProvider({
    url: "../tiles/imagery/{z}/{x}/{reverseY}.jpg", // TMS: y counts from the south
    tilingScheme: tiling, tileWidth: tileset.imagerySize, tileHeight: tileset.imagerySize,
    minimumLevel: g.minLevel, maximumLevel: g.maxLevel, rectangle,
    credit: g.minLevel === 0 ? tileset.attribution : undefined,
  })
  viewer.imageryLayers.add(new C.ImageryLayer(provider, { rectangle, minimumTerrainLevel: g.minLevel > 0 ? g.minLevel : undefined }))
}

// ---- camera: the shared flight pose → lookAt(target, heading/pitch/range) ----
let pose = cameraAt(spec.flight, 0)
function updateFov() {
  // scene.json's fov is vertical (Three's convention); Cesium's is horizontal when the view is landscape.
  const w = scene.canvas.clientWidth || innerWidth, h = scene.canvas.clientHeight || innerHeight, v = rad(spec.fovDeg)
  camera.frustum.fov = w > h ? 2 * Math.atan(Math.tan(v / 2) * w / h) : v
}
function placeCamera() {
  updateFov()
  // The target sits on the ellipsoid (height 0), exactly as eyeFor() in flight.js.
  const target = C.Cartesian3.fromDegrees(pose.lon, pose.lat, 0)
  camera.lookAt(target, new C.HeadingPitchRange(rad(pose.headingDeg), rad(pose.pitchDeg), pose.rangeM))
  // Leave the camera in world coordinates so nothing orbits a stale target frame.
  camera.lookAtTransform(C.Matrix4.IDENTITY)
}

// ---- geometry batching helpers (the region spike's) ----
const VF = C.PerInstanceColorAppearance.VERTEX_FORMAT
const attr = color => ({ color: C.ColorGeometryInstanceAttribute.fromColor(color) })
const tris = g => (g.indices ? g.indices.length / 3 : 0)
const I4 = C.Matrix4.IDENTITY
const rotZ = a => C.Matrix4.fromRotationTranslation(C.Matrix3.fromRotationZ(a))
const trans = (x, y, z) => C.Matrix4.fromTranslation(new C.Cartesian3(x, y, z))
const scale3 = (x, y, z) => C.Matrix4.fromScale(new C.Cartesian3(x, y, z))
const mul = (...ms) => ms.reduce((acc, m) => C.Matrix4.multiply(acc, m, new C.Matrix4()), I4)
const primitives = { vegetation: [], houses: null, ships: [] }
let symbolTriangles = 0, vegetationTriangles = 0
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

// ---- diorama: trees from diorama.json ----
// Ground heights are true metres; the globe draws terrain × EX, so symbols
// stand at groundM × EX. Symbol dimensions are not exaggerated (symbolic).
// Symbols are sunk 20–30 m: the drawn triangle surface and the bilinear
// groundM differ by a few metres, times the exaggeration.
const P = dio.palette
const coneG = new C.CylinderGeometry({ length: 3.4 * U, topRadius: 0, bottomRadius: 0.95 * U, slices: 6, vertexFormat: VF })
const ballG = new C.SphereGeometry({ radius: 1.25 * U, stackPartitions: 5, slicePartitions: 6, vertexFormat: VF })
const trunkG = new C.CylinderGeometry({ length: 1.6 * U, topRadius: 0.18 * U, bottomRadius: 0.26 * U, slices: 5, vertexFormat: VF })
const coneT = tris(C.CylinderGeometry.createGeometry(coneG)), ballT = tris(C.SphereGeometry.createGeometry(ballG)), trunkT = tris(C.CylinderGeometry.createGeometry(trunkG))
let treeCount = 0, dioramaShown = false
function buildVegetation(fraction) {
  for (const p of primitives.vegetation) scene.primitives.remove(p)
  primitives.vegetation = []; symbolTriangles -= vegetationTriangles; vegetationTriangles = 0
  const list = fraction < 1 ? dio.trees.items.filter((_, i) => i % 2 === 0) : dio.trees.items
  const cones = [], balls = [], trunks = []
  const conifer = col(P.conifer), broadleaf = col(P.broadleaf), trunk = col(P.trunk)
  for (const [lon, lat, groundM, kind, s, rot] of list) {
    const h = groundM * EX
    if (kind === 0) cones.push(placed(coneG, lon, lat, h, { scale: s, rot, zOff: 1.7 * U - 20, color: conifer }))
    else balls.push(placed(ballG, lon, lat, h, { scale: s, rot, zOff: 2.0 * U, color: broadleaf }))
    trunks.push(placed(trunkG, lon, lat, h, { scale: s, rot, zOff: 0.8 * U - 30, color: trunk }))
  }
  for (const set of [cones, balls, trunks]) if (set.length) { const p = makePrimitive(set); p.show = dioramaShown; primitives.vegetation.push(p) }
  vegetationTriangles = cones.length * coneT + balls.length * ballT + trunks.length * trunkT
  symbolTriangles += vegetationTriangles; treeCount = list.length
}
buildVegetation(1)

// ---- houses: box + pyramid roof, from diorama.json ----
const boxG = C.BoxGeometry.fromDimensions({ dimensions: new C.Cartesian3(1.4 * U, 1.1 * U, 0.9 * U), vertexFormat: VF })
const roofG = new C.CylinderGeometry({ length: 0.8 * U, topRadius: 0, bottomRadius: 1.05 * U, slices: 4, vertexFormat: VF })
const boxT = tris(C.BoxGeometry.createGeometry(boxG)), roofT = tris(C.CylinderGeometry.createGeometry(roofG))
let houseCount = 0
{
  const inst = [], wall = col(P.wall), roof = col(P.roof), thatch = col(P.thatch)
  const roofX = mul(scale3(1, 0.8, 1), trans(0, 0, 1.3 * U), rotZ(Math.PI / 4))
  for (const [lon, lat, groundM, rot, sc, kind] of dio.houses.items) {
    const h = groundM * EX
    inst.push(placed(boxG, lon, lat, h, { scale: sc, rot, zOff: 0.45 * U - 10, color: wall }))
    inst.push(placed(roofG, lon, lat, h, { scale: sc, rot, extra: roofX, color: kind ? thatch : roof }))
    houseCount++; symbolTriangles += boxT + roofT
  }
  primitives.houses = makePrimitive(inst)
}

// ---- ships: schematic 遣唐使船 from boxes and cylinders, in a ship-local frame ----
// Parts are baked in ship-local metres (x forward, y port, z up); the Primitive's
// modelMatrix carries position and heading. The sea is clamped to 0 m.
const SHIP_FLOAT = 0.35 * U
function shipMatrix(lon, lat, heading) { return C.Matrix4.multiply(C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(lon, lat, SHIP_FLOAT)), rotZ(heading), new C.Matrix4()) }
function buildShip(s) {
  const k = s.scale * U, inst = []
  const box = (x, y, z) => C.BoxGeometry.fromDimensions({ dimensions: new C.Cartesian3(x * k, y * k, z * k), vertexFormat: VF })
  const part = (geometry, color, x, y, z, extra) => {
    const m = trans(x * k, y * k, z * k); if (extra) C.Matrix4.multiply(m, extra, m)
    symbolTriangles += tris(geometry.constructor.createGeometry(geometry))
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

// ---- route: Catmull-Rom through the scene points in lon/lat, dashed ----
// Schematic (scene.json says so). Draped on the terrain (a ground polyline):
// a line at any fixed height loses its lower half to the depth test wherever
// the camera looks obliquely at the sea, and disappears behind the exaggerated
// hills at the landfall. The dash length is in pixels, so it reads at every range.
const routePts = spec.route.points.map(p => [p.lon, p.lat])
function catmull(pts, i, u) {
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[Math.min(pts.length - 1, i + 1)], p3 = pts[Math.min(pts.length - 1, i + 2)]
  const u2 = u * u, u3 = u2 * u
  return [0, 1].map(d => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u3))
}
const curve = []; { const N = 32; for (let i = 0; i < routePts.length - 1; i++) for (let j = 0; j < N; j++) curve.push(catmull(routePts, i, j / N)); curve.push(routePts[routePts.length - 1]) }
viewer.entities.add({
  id: "route",
  polyline: {
    positions: curve.map(([lon, lat]) => C.Cartesian3.fromDegrees(lon, lat)),
    width: 4, clampToGround: true, arcType: C.ArcType.GEODESIC,
    material: new C.PolylineDashMaterialProperty({ color: col(spec.route.color), gapColor: C.Color.TRANSPARENT, dashLength: 24 }),
  },
})

// ---- labels: chapter script with a romanized line beneath, leader to the ground ----
// Each place is shown only while the flight pose's rangeM is inside its
// [minRangeM, maxRangeM]. Ground heights for the places that can be seen up
// close come from the terrain itself (most detailed level), times EX.
const JP_FONT = '"Noto Serif JP","Hiragino Mincho ProN","IPAGothic","WenQuanYi Zen Hei",serif'
const ROM_FONT = '"Cinzel","Cinzel Decorative",Georgia,serif'
await Promise.race([Promise.all([document.fonts.load(`500 15px ${JP_FONT}`), document.fonts.load(`600 9px ${ROM_FONT}`)]), new Promise(r => setTimeout(r, 2500))])
const closePlaces = spec.places.filter(pl => pl.kind !== "sea" && pl.minRangeM < spec.diorama.showBelowRangeM)
const sampled = await C.sampleTerrainMostDetailed(terrainProvider, closePlaces.map(pl => C.Cartographic.fromDegrees(pl.lon, pl.lat)))
const groundOf = new Map(closePlaces.map((pl, i) => [pl.id, Math.max(0, sampled[i].height || 0) * EX]))
const labels = scene.primitives.add(new C.LabelCollection({ scene }))
const leaders = scene.primitives.add(new C.PolylineCollection())
const ink = col("#f3ead7"), inkDim = col("#b9af9c"), gold = col("#f1cf7a"), seaInk = col("#eaf4f7"), outline = col("#0b1114")
const placeViews = []
for (const pl of spec.places) {
  const sea = pl.kind === "sea", realm = pl.kind === "realm", sel = !!pl.selected
  const ground = groundOf.get(pl.id) ?? 0
  const hasLeader = groundOf.has(pl.id)
  const lift = hasLeader ? (sel ? 6 : 3) * U : 0
  const top = C.Cartesian3.fromDegrees(pl.lon, pl.lat, ground + lift)
  const items = []
  if (hasLeader) items.push(leaders.add({ positions: [C.Cartesian3.fromDegrees(pl.lon, pl.lat, ground), top], width: sel ? 1.5 : 1, material: C.Material.fromType("Color", { color: (sel ? gold : ink).withAlpha(0.75) }) }))
  const common = { position: top, style: C.LabelStyle.FILL_AND_OUTLINE, outlineColor: outline, outlineWidth: 3, horizontalOrigin: C.HorizontalOrigin.CENTER, verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY }
  const nameSize = realm ? 22 : sel ? 18 : sea ? 14 : 15, romSize = realm ? 11 : 10
  const romGap = romSize + 5
  items.push(labels.add({ ...common, text: pl.name, font: `${realm || sel ? 700 : 500} ${nameSize}px ${JP_FONT}`, fillColor: sel ? gold : sea ? seaInk.withAlpha(0.9) : ink, pixelOffset: new C.Cartesian2(0, -romGap) }))
  items.push(labels.add({ ...common, text: pl.rom, font: `600 ${romSize}px ${ROM_FONT}`, fillColor: sel ? gold.withAlpha(0.85) : sea ? seaInk.withAlpha(0.7) : inkDim, outlineWidth: 2, pixelOffset: new C.Cartesian2(0, -2) }))
  placeViews.push({ pl, items })
}

// ---- visibility by pose range ----
function updateVisibility() {
  const r = pose.rangeM
  for (const { pl, items } of placeViews) { const on = r >= pl.minRangeM && r <= pl.maxRangeM; for (const it of items) it.show = on }
  dioramaShown = r < spec.diorama.showBelowRangeM
  for (const p of [...primitives.vegetation, primitives.houses, ...primitives.ships]) p.show = dioramaShown
  scene.shadowMap.enabled = KNOB.shadows && dioramaShown && quality === "full"
}
let quality = "full"
function fly(t) { pose = cameraAt(spec.flight, t); placeCamera(); updateVisibility(); flyEpoch++ }
let flyEpoch = 0
fly(0); addEventListener("resize", placeCamera)

// ---- stats ----
let frameMs = 0, fps = 0, frames = 0, tAcc = 0, last = performance.now(), drawCalls = 0, loadMs = 0, frameStart = 0
let terrainTiles = 0, terrainTriangles = 0
scene.preUpdate.addEventListener(() => { frameStart = performance.now() })
scene.postRender.addEventListener(() => {
  const now = performance.now()
  frameMs = frameMs * 0.9 + (now - frameStart) * 0.1
  drawCalls = scene.frameState.commandList.length
  // Private: the quadtree's render list and each tile's mesh. Cesium has no
  // public triangle count; this counts the terrain actually drawn this frame.
  const list = globe._surface?._tilesToRender ?? []
  terrainTiles = list.length; terrainTriangles = 0
  for (const t of list) terrainTriangles += (t.data?.renderedMesh?.indices?.length ?? 0) / 3
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
  return {
    fps: +fps.toFixed(1), frameMs: +frameMs.toFixed(2), drawCalls,
    triangles: Math.round(terrainTriangles + (dioramaShown ? symbolTriangles : 0)),
    memoryMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, loadMs, bundleKB,
    tilesLoaded: globe.tilesLoaded, traffic: tileTraffic(),
    // extras for the report
    terrainTilesRendered: terrainTiles, tilesResampled, normalsRepaired, trianglesFlipped, terrainTriangles: Math.round(terrainTriangles), symbolTriangles, dioramaShown,
    trees: treeCount, houses: houseCount, quality, rangeM: Math.round(pose.rangeM),
    loadMsFromPageStart: loadMs ? Math.round(loadMs + (T0 - window.__spikePageT0)) : 0, engine: "cesium " + C.VERSION,
  }
}
function overlay() {
  const s = stats(), tr = s.traffic
  document.getElementById("stats").textContent = `cesium ${C.VERSION} · globe\nfps ${s.fps}  frame ${s.frameMs} ms\ndraw calls ${s.drawCalls}  tris ${s.triangles}\nmem ${s.memoryMB ?? "n/a"} MB  load ${s.loadMs} ms\nbundle ${s.bundleKB} KB  range ${(s.rangeM / 1000).toFixed(0)} km\nterrain ${tr.terrain.n} (${tr.terrain.kb} KB)  imagery ${tr.imagery.n} (${tr.imagery.kb} KB)`
}

// ---- settled: tiles loaded, nothing in flight, held for a few frames ----
// globe.tilesLoaded is true when the quadtree's three load queues are empty; a
// tile stays queued until its terrain *and* every imagery layer are done. The
// queues are rebuilt during each render, so the first frame after fly() is not
// counted; then SETTLE_FRAMES consecutive rendered frames must see empty queues
// and no active requests in Cesium's RequestScheduler.
const SETTLE_FRAMES = 3
function settled(ms = 12000) {
  return new Promise(resolve => {
    const epoch = flyEpoch; let seen = 0, quiet = 0, done = false
    const finish = ok => { if (done) return; done = true; off(); clearTimeout(timer); resolve(ok) }
    const off = scene.postRender.addEventListener(() => {
      if (flyEpoch !== epoch) { seen = 0; quiet = 0; return }
      seen++
      const idle = globe.tilesLoaded && C.RequestScheduler.statistics.numberOfActiveRequests === 0
      quiet = idle && seen > 1 ? quiet + 1 : 0
      if (quiet >= SETTLE_FRAMES) finish(true)
    })
    const timer = setTimeout(() => finish(false), ms)
  })
}

// ready: the first globe view rendered with its tiles. The cap is generous: on
// the container's software GPU each frame takes seconds and Cesium loads tiles
// per rendered frame.
const ready = settled(180000).then(async () => { loadMs = Math.round(performance.now() - T0); await measureBundle(); overlay() })

window.__cesiumViewer = viewer // for the eyeFor check in the verification script
window.spike._install({
  ready,
  fly,
  settled,
  setQuality(level) {
    quality = level === "phone" ? "phone" : "full"
    viewer.terrainShadows = quality === "phone" ? C.ShadowMode.DISABLED : C.ShadowMode.ENABLED
    buildVegetation(quality === "phone" ? 0.5 : 1)
    updateVisibility()
  },
  stats,
})
