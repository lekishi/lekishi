// Terrain and imagery for the 3d-tiles-renderer globe spike: the shared quantized-mesh
// tileset with vertical exaggeration, and the shared imagery as one overlay per imagery
// group so no request ever leaves the rectangles the tileset actually contains.
import { BufferAttribute, DataTexture, RGBAFormat, Vector3 } from "three"
import { XYZTilesOverlay } from "3d-tiles-renderer/src/three/plugins/images/ImageOverlayPlugin.js"
import { QuantizedMeshPlugin } from "3d-tiles-renderer/src/three/plugins/QuantizedMeshPlugin.js"

// ---- terrain geometry: winding, curvature, exaggeration ----
// Every freshly parsed quantized-mesh tile is rebuilt once, in the plugin's parse step, before
// the overlay plugin or the clipper sees it:
// - Winding: the shared tiles wind their surface triangles clockwise seen from above (the TIN
//   is built with rows counted from the north while quantized-mesh v counts from the south), so
//   three's back-face culling would drop every surface and leave only the skirts. Triangles are
//   re-emitted counter-clockwise.
// - Curvature: the TIN is simplified on the flat lon/lat grid, so a flat sea tile collapses to
//   two triangles; at levels 0–5 those chords sag hundreds of kilometres under the ellipsoid and
//   the globe reads as a polyhedron. Long edges are subdivided until no chord sags more than half
//   the tile's geometric error. Each edge gets a power-of-two segment count of its own; where a
//   finer neighbour triangle needs extra points on a coarser edge they are put on that edge's
//   chord, so shared edges stay watertight.
// - Exaggeration: the library has none. Heights are multiplied by k (vertices move along the
//   ellipsoid normal), and each normal's tangential part is scaled by k, which is the exact
//   normal of a heightfield stretched by k and keeps the seamless octvertexnormals seamless.
// Skirts are rebuilt from the new boundary edges. Split children ("quantized_tile_split") are
// clipped from an already rebuilt parent, so they are only re-subdivided (k = 1). The tile's
// bounding region and the heights the clipper copies to split children are scaled with k so
// culling and refinement see the drawn geometry.
const _p = new Vector3(), _n = new Vector3(), _q = new Vector3(), _r = new Vector3(), _cart = {}
const WIN_EPS = 1e-6

function rebuildTile(mesh, tile, ellipsoid, k, skirtLength) {
  const g = mesh.geometry, idx = g.index.array, pa = g.attributes.position.array, na = g.attributes.normal?.array, ua = g.attributes.uv.array
  const grp = g.groups[0] ?? { start: 0, count: idx.length }
  const [west, south, east, north] = tile.boundingVolume.region
  const c = mesh.position
  // source vertices used by the surface: lon/lat from uv (exact on the tile grid), height from the position
  const src = new Map(), sv = [] // old index -> new source record
  const vert = i => {
    let r = src.get(i); if (r !== undefined) return r
    _p.set(pa[i * 3] + c.x, pa[i * 3 + 1] + c.y, pa[i * 3 + 2] + c.z)
    ellipsoid.getPositionToCartographic(_p, _cart)
    const u = ua[i * 2], v = ua[i * 2 + 1], lon = west + (east - west) * u, lat = south + (north - south) * v
    ellipsoid.getCartographicToNormal(lat, lon, _n)
    let nx = _n.x, ny = _n.y, nz = _n.z
    if (na) {
      let ox = na[i * 3], oy = na[i * 3 + 1], oz = na[i * 3 + 2], up = ox * _n.x + oy * _n.y + oz * _n.z
      // The shared tiles' oct-encoded normals are corrupt where a component is exactly zero in
      // the octahedron's wrapped half (vertices on the equator and on meridians 0/±90/180 in the
      // south decode pointing sideways or down). No real slope here faces that far from up, so
      // such a normal is replaced by the ellipsoid normal.
      if (up < 0.1) { ox = _n.x; oy = _n.y; oz = _n.z; up = 1 }
      nx = (ox - _n.x * up) * k + _n.x * up; ny = (oy - _n.y * up) * k + _n.y * up; nz = (oz - _n.z * up) * k + _n.z * up
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
    }
    r = sv.length; sv.push({ lon, lat, h: _cart.height * k, u, v, nx, ny, nz, ux: _n.x, uy: _n.y, uz: _n.z }); src.set(i, r); return r
  }
  const tris = []
  for (let t = grp.start; t < grp.start + grp.count; t += 3) {
    const a = vert(idx[t]), b = vert(idx[t + 1]), d = vert(idx[t + 2])
    const A = sv[a], B = sv[b], D = sv[d]
    // orientation in lon/lat: counter-clockwise seen from above means a positive signed area
    const area = (B.lon - A.lon) * (D.lat - A.lat) - (D.lon - A.lon) * (B.lat - A.lat)
    if (Math.abs(area) < 1e-18) continue
    tris.push(area > 0 ? [a, b, d] : [a, d, b])
  }
  // max chord angle so that sag R(1 - cos(θ/2)) stays under half the geometric error
  const theta = 2 * Math.acos(Math.max(-1, 1 - 0.5 * tile.geometricError / 6371000))
  const segCount = (A, B) => {
    const ang = Math.acos(Math.min(1, A.ux * B.ux + A.uy * B.uy + A.uz * B.uz))
    return ang <= theta ? 1 : Math.min(64, 2 ** Math.ceil(Math.log2(ang / theta)))
  }

  // output
  const pos = [], nor = [], uv = [], geo = [], out = new Map()
  const emit = (key, lon, lat, h, u, v, nx, ny, nz, ecef = null) => {
    let i = out.get(key); if (i !== undefined) return i
    if (ecef) _q.copy(ecef); else ellipsoid.getCartographicToPosition(lat, lon, h, _q)
    i = pos.length / 3; pos.push(_q.x - c.x, _q.y - c.y, _q.z - c.z)
    const l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l); uv.push(u, v); geo.push(lon, lat, h)
    out.set(key, i); return i
  }
  const lerpRec = (A, B, s) => ({ lon: A.lon + (B.lon - A.lon) * s, lat: A.lat + (B.lat - A.lat) * s, h: A.h + (B.h - A.h) * s, u: A.u + (B.u - A.u) * s, v: A.v + (B.v - A.v) * s, nx: A.nx + (B.nx - A.nx) * s, ny: A.ny + (B.ny - A.ny) * s, nz: A.nz + (B.nz - A.nz) * s })
  const corner = i => { const A = sv[i]; return emit("v" + i, A.lon, A.lat, A.h, A.u, A.v, A.nx, A.ny, A.nz) }
  // a point at fraction s (0..1, measured from the lower source index) along edge (i0 < i1)
  const edgePoint = (i0, i1, s, n) => {
    if (s <= 0) return corner(i0); if (s >= 1) return corner(i1)
    const key = `e${i0}_${i1}_${s.toFixed(12)}`, f = s * n
    if (out.has(key)) return out.get(key)
    const A = sv[i0], B = sv[i1], R = lerpRec(A, B, s)
    if (Math.abs(f - Math.round(f)) < 1e-9) return emit(key, R.lon, R.lat, R.h, R.u, R.v, R.nx, R.ny, R.nz)
    // between two of this edge's own points: on their chord, where the coarser neighbour's edge is
    const s0 = Math.floor(f) / n, s1 = Math.ceil(f) / n, P0 = lerpRec(A, B, s0), P1 = lerpRec(A, B, s1)
    ellipsoid.getCartographicToPosition(P0.lat, P0.lon, P0.h, _q); ellipsoid.getCartographicToPosition(P1.lat, P1.lon, P1.h, _r)
    _q.lerp(_r, (s - s0) / (s1 - s0))
    return emit(key, R.lon, R.lat, R.h, R.u, R.v, R.nx, R.ny, R.nz, _q)
  }
  const surface = []
  tris.forEach(([a, b, d], ti) => {
    const nab = segCount(sv[a], sv[b]), nbd = segCount(sv[b], sv[d]), nda = segCount(sv[d], sv[a]), m = Math.max(nab, nbd, nda)
    if (m === 1) { surface.push(corner(a), corner(b), corner(d)); return }
    // barycentric grid: point (i, j) = a + (b - a) i/m + (d - a) j/m
    const P = (i, j) => {
      const wb = i / m, wd = j / m, wa = 1 - wb - wd
      if (j === 0) return a < b ? edgePoint(a, b, wb, nab) : edgePoint(b, a, 1 - wb, nab)
      if (i === 0) return a < d ? edgePoint(a, d, wd, nda) : edgePoint(d, a, 1 - wd, nda)
      if (i + j === m) return b < d ? edgePoint(b, d, wd, nbd) : edgePoint(d, b, wb, nbd)
      const A = sv[a], B = sv[b], D = sv[d]
      return emit(`t${ti}_${i}_${j}`, A.lon * wa + B.lon * wb + D.lon * wd, A.lat * wa + B.lat * wb + D.lat * wd, A.h * wa + B.h * wb + D.h * wd, A.u * wa + B.u * wb + D.u * wd, A.v * wa + B.v * wb + D.v * wd, A.nx * wa + B.nx * wb + D.nx * wd, A.ny * wa + B.ny * wb + D.ny * wd, A.nz * wa + B.nz * wb + D.nz * wd)
    }
    for (let j = 0; j < m; j++) for (let i = 0; i < m - j; i++) {
      surface.push(P(i, j), P(i + 1, j), P(i, j + 1))
      if (i + j + 1 < m) surface.push(P(i + 1, j), P(i + 1, j + 1), P(i, j + 1))
    }
  })
  // skirts from the boundary edges (edges used by a single surface triangle), facing outward
  const edgeUse = new Map()
  for (let t = 0; t < surface.length; t += 3) for (let e = 0; e < 3; e++) {
    const x = surface[t + e], y = surface[t + (e + 1) % 3], key = x < y ? x * 1e7 + y : y * 1e7 + x
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1)
  }
  const skirt = [], bottom = new Map()
  const low = i => {
    let j = bottom.get(i); if (j !== undefined) return j
    ellipsoid.getCartographicToPosition(geo[i * 3 + 1], geo[i * 3], geo[i * 3 + 2] - skirtLength, _q)
    j = pos.length / 3; pos.push(_q.x - c.x, _q.y - c.y, _q.z - c.z); nor.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]); uv.push(uv[i * 2], uv[i * 2 + 1]); geo.push(0, 0, 0)
    bottom.set(i, j); return j
  }
  if (skirtLength > 0) for (let t = 0; t < surface.length; t += 3) for (let e = 0; e < 3; e++) {
    const x = surface[t + e], y = surface[t + (e + 1) % 3], key = x < y ? x * 1e7 + y : y * 1e7 + x
    if (edgeUse.get(key) !== 1) continue
    const xl = low(x), yl = low(y)
    skirt.push(x, xl, y, y, xl, yl)
  }
  const count = pos.length / 3, index = count > 65535 ? new Uint32Array(surface.length + skirt.length) : new Uint16Array(surface.length + skirt.length)
  index.set(surface, 0); index.set(skirt, surface.length)
  g.setIndex(new BufferAttribute(index, 1))
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2))
  g.clearGroups(); g.addGroup(0, surface.length, 0); if (skirt.length) g.addGroup(surface.length, skirt.length, 1)
  g.computeBoundingBox(); g.computeBoundingSphere()
}

export function exaggeratedQuantizedMeshPlugin(k) {
  const plugin = new QuantizedMeshPlugin({ useRecommendedSettings: true })
  const parse = plugin.parseToMesh.bind(plugin)
  plugin.parseToMesh = (buffer, tile, extension, url) => {
    const mesh = parse(buffer, tile, extension, url)
    if (!mesh || (extension !== "terrain" && extension !== "quantized_tile_split")) return mesh
    const ellipsoid = plugin.tiles.ellipsoid, first = extension === "terrain"
    // Skirts must reach below a neighbour up to three levels coarser, whose chords may sag half
    // its own geometric error, plus the exaggerated height differences between levels.
    rebuildTile(mesh, tile, ellipsoid, first ? k : 1, Math.max(4 * tile.geometricError, 300))
    if (first && k !== 1) {
      mesh.userData.minHeight *= k; mesh.userData.maxHeight *= k
      const r = tile.boundingVolume.region
      r[4] = mesh.userData.minHeight; r[5] = mesh.userData.maxHeight
      tile.engineData.boundingVolume.setRegionData(ellipsoid, ...r)
    }
    return mesh
  }
  return plugin
}

// ---- imagery groups ----
// The imagery exists for levels 0–5 everywhere and for nested rectangles beyond. An
// XYZTilesOverlay has one content rectangle for all of its levels, so each imagery group gets
// its own overlay: null levels below the group, the group's exact tile rectangle (inset by a
// hair, so a range touching the rectangle's edge cannot round onto the next tile row) as the
// content bounds, stacked coarse to fine. Each overlay decides per terrain tile whether it
// draws: never below its first level (otherwise a globe-sized tile would pull hundreds of
// deep tiles), and not when a finer group already covers the whole tile. A group that does
// not draw hands back one shared transparent texture, because the overlay shader samples every
// layer slot and an empty slot would read as opaque black over the layers beneath it.
const TRANSPARENT = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat); TRANSPARENT.needsUpdate = true
const EPS = 1e-9

function groupsFromTileset(ts) {
  return ts.imageryGroups.map(g => {
    // exact normalized bounds of the available tiles (EPSG:4326, 2×1 roots, y from the south)
    const a = ts.available[g.minLevel][0], nx = 2 * 2 ** g.minLevel, ny = 2 ** g.minLevel
    const norm = [a.startX / nx, a.startY / ny, (a.endX + 1) / nx, (a.endY + 1) / ny]
    return { minLevel: g.minLevel, maxLevel: g.maxLevel, norm }
  })
}

class ImageryGroupOverlay extends XYZTilesOverlay {
  constructor(groups, index, url) {
    const g = groups[index], levels = []
    for (let l = 0; l <= g.maxLevel; l++) levels.push(l < g.minLevel ? null : { tileCountX: 2 * 2 ** l, tileCountY: 2 ** l })
    super({ url, projection: "EPSG:4326", levels, tileDimension: 256 })
    this.groups = groups; this.index = index; this.group = g
    this.served = new Map() // range key -> level, so lock and release always agree
  }
  _initImageSource() {
    return Promise.resolve(super._initImageSource()).then(() => {
      const [x0, y0, x1, y1] = this.group.norm
      const r = this.tiling.fromNormalizedToCartographicRange([x0, y0, x1, y1])
      this.tiling.setContentBounds(r[0] + EPS, r[1] + EPS, r[2] - EPS, r[3] - EPS)
    })
  }
  // The level the shared tiling would pick for this range at the plugin's resolution: imagery
  // and terrain share the TMS tiling, so a terrain tile of level L asks for imagery level L.
  naturalLevel([x0, y0, x1, y1]) {
    const res = this.regionImageSource ? this.regionImageSource.resolution : 256
    const lw = Math.log2(res / (256 * 2 * Math.max(x1 - x0, 1e-12))), lh = Math.log2(res / (256 * Math.max(y1 - y0, 1e-12)))
    return Math.max(0, Math.min(Math.ceil(lw - 1e-6), Math.ceil(lh - 1e-6)))
  }
  levelFor(range) {
    const key = range.join("_")
    if (this.served.has(key)) return this.served.get(key)
    const n = this.naturalLevel(range), g = this.group
    let level = -1
    const inside = (b, r) => r[0] >= b[0] - EPS && r[1] >= b[1] - EPS && r[2] <= b[2] + EPS && r[3] <= b[3] + EPS
    const touches = (b, r) => !(r[0] >= b[2] || r[2] <= b[0] || r[1] >= b[3] || r[3] <= b[1])
    if (n >= g.minLevel && touches(g.norm, range)) {
      const covered = this.groups.some((h, j) => j > this.index && n >= h.minLevel && inside(h.norm, range))
      if (!covered) level = Math.min(n, g.maxLevel)
    }
    this.served.set(key, level)
    return level
  }
  hasContent(range) { return true }
  getTexture(range) { const l = this.levelFor(range); return l < 0 ? Promise.resolve(TRANSPARENT) : this.regionImageSource.get(...range, l) }
  lockTexture(range) { const l = this.levelFor(range); return l < 0 ? TRANSPARENT : this.regionImageSource.lock(...range, l) }
  releaseTexture(range) { const l = this.levelFor(range); if (l >= 0) this.regionImageSource.release(...range, l) }
  shouldSplit() { return false }
  get pending() { return (this.regionImageSource?.active ?? 0) + (this.imageSource?.active ?? 0) }
}

export function imageryOverlays(tileset, url) {
  const groups = groupsFromTileset(tileset)
  return groups.map((_, i) => new ImageryGroupOverlay(groups, i, url))
}
