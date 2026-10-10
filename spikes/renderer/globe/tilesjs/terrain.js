// Terrain and imagery for the 3d-tiles-renderer globe spike: the shared quantized-mesh
// tileset with vertical exaggeration, and the shared imagery as one overlay per imagery
// group so no request ever leaves the rectangles the tileset actually contains.
import { BufferAttribute, DataTexture, RGBAFormat, Vector3 } from "three"
import { XYZTilesOverlay } from "3d-tiles-renderer/src/three/plugins/images/ImageOverlayPlugin.js"
import { QuantizedMeshPlugin } from "3d-tiles-renderer/src/three/plugins/QuantizedMeshPlugin.js"

// ---- terrain geometry: exaggeration ----
// The library has no vertical exaggeration, so every freshly parsed quantized-mesh tile is
// displaced in place, in the plugin's parse step, before the overlay plugin or the clipper sees
// it: each vertex moves along the ellipsoid normal by height × (k − 1), and each normal's
// tangential part is scaled by k (the exact normal of a heightfield stretched by k, so the
// seamless octvertexnormals stay seamless). Skirt vertices are scaled the same way, which only
// lengthens the skirts. Split children ("quantized_tile_split") are clipped from an already
// exaggerated parent and are left alone. The tile's bounding region and the heights the clipper
// copies to split children are scaled too, so culling and refinement see the drawn geometry.
const _p = new Vector3(), _n = new Vector3(), _cart = {}
function exaggerateMesh(mesh, ellipsoid, k) {
  const g = mesh.geometry, pa = g.attributes.position.array, na = g.attributes.normal?.array, c = mesh.position
  for (let i = 0, l = pa.length / 3; i < l; i++) {
    const i3 = i * 3
    _p.set(pa[i3] + c.x, pa[i3 + 1] + c.y, pa[i3 + 2] + c.z)
    ellipsoid.getPositionToCartographic(_p, _cart)
    ellipsoid.getCartographicToNormal(_cart.lat, _cart.lon, _n)
    const d = _cart.height * (k - 1)
    pa[i3] += _n.x * d; pa[i3 + 1] += _n.y * d; pa[i3 + 2] += _n.z * d
    if (na) {
      const nx = na[i3], ny = na[i3 + 1], nz = na[i3 + 2], up = nx * _n.x + ny * _n.y + nz * _n.z
      const x = (nx - _n.x * up) * k + _n.x * up, y = (ny - _n.y * up) * k + _n.y * up, z = (nz - _n.z * up) * k + _n.z * up
      const len = Math.hypot(x, y, z) || 1
      na[i3] = x / len; na[i3 + 1] = y / len; na[i3 + 2] = z / len
    }
  }
}

// One unreferenced vertex 100 m above the tile's highest vertex. The overlay plugin maps each
// mesh's height range to the w texture coordinate and fades layers outside w ∈ [0, 1] with a
// smoothstep whose edges are reversed; when many vertices sit at exactly w = 1 (every surface
// vertex of a flat sea tile) the interpolated w lands a hair above 1 and the imagery drops out
// in dotted white rows. The extra height keeps every drawn vertex strictly inside the range.
function padHeightRange(mesh, ellipsoid) {
  const g = mesh.geometry, c = mesh.position, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv
  let top = 0, topH = -Infinity
  for (let i = 0; i < P.count; i++) {
    _p.fromBufferAttribute(P, i).add(c); ellipsoid.getPositionToCartographic(_p, _cart)
    if (_cart.height > topH) { topH = _cart.height; top = i }
  }
  _p.fromBufferAttribute(P, top).add(c); ellipsoid.getPositionToCartographic(_p, _cart)
  ellipsoid.getCartographicToPosition(_cart.lat, _cart.lon, _cart.height + 100, _p).sub(c)
  const grow = (attr, extra) => { const a = new Float32Array(attr.array.length + extra.length); a.set(attr.array); a.set(extra, attr.array.length); return new BufferAttribute(a, attr.itemSize, attr.normalized) }
  g.setAttribute("position", grow(P, [_p.x, _p.y, _p.z]))
  if (N) g.setAttribute("normal", grow(N, [N.getX(top), N.getY(top), N.getZ(top)]))
  if (U) g.setAttribute("uv", grow(U, [U.getX(top), U.getY(top)]))
  // the index stays as it is (the new vertex is never drawn) but must be wide enough to address it
  if (g.index.array instanceof Uint16Array && P.count + 1 > 65535) g.setIndex(new BufferAttribute(new Uint32Array(g.index.array), 1))
  g.computeBoundingBox(); g.computeBoundingSphere()
}

export function exaggeratedQuantizedMeshPlugin(k) {
  const plugin = new QuantizedMeshPlugin({ useRecommendedSettings: true })
  const parse = plugin.parseToMesh.bind(plugin)
  plugin.parseToMesh = (buffer, tile, extension, url) => {
    const mesh = parse(buffer, tile, extension, url)
    if (!mesh || (extension !== "terrain" && extension !== "quantized_tile_split")) return mesh
    const ellipsoid = plugin.tiles.ellipsoid
    if (extension === "terrain" && k !== 1) {
      exaggerateMesh(mesh, ellipsoid, k)
      mesh.userData.minHeight *= k; mesh.userData.maxHeight *= k
      const r = tile.boundingVolume.region
      r[4] = mesh.userData.minHeight; r[5] = mesh.userData.maxHeight
      tile.engineData.boundingVolume.setRegionData(ellipsoid, ...r)
    }
    padHeightRange(mesh, ellipsoid)
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
