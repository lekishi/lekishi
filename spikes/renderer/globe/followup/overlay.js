// Draped overlays for the custom globe: polygons (and their outlines) are
// rasterised per tile, in that tile's own lon/lat frame, into a small canvas
// the tile samples over its imagery. Because each tile draws only its own
// patch at its own level, the shape is as sharp at the diorama as on the globe,
// follows the terrain exactly, and costs nothing for tiles it does not touch.
import * as THREE from "three"

const SIZE = 256

export class DrapedOverlay {
  /** features: [{ id, rings: [[[lon, lat], ...]], fill: "rgba(...)", stroke: "#hex", widthPx }] */
  constructor(features = []) { this.features = features; this.version = 0 }
  set(features) { this.features = features; this.version++ }

  textureFor(b, z) {
    for (const f of this.features) f.bbox ??= bbox(f.rings)
    const hits = this.features.filter(f => !(f.bbox[2] < b.w || f.bbox[0] > b.e || f.bbox[3] < b.s || f.bbox[1] > b.n))
    if (!hits.length) return null
    const c = new OffscreenCanvas(SIZE, SIZE), g = c.getContext("2d")
    const px = lon => (lon - b.w) / (b.e - b.w) * SIZE, py = lat => (b.n - lat) / (b.n - b.s) * SIZE   // row 0 is north, as the tile UVs
    for (const f of hits) {
      g.beginPath()
      for (const ring of f.rings) ring.forEach(([lo, la], i) => i ? g.lineTo(px(lo), py(la)) : g.moveTo(px(lo), py(la)))
      g.closePath()
      if (f.fill) { g.fillStyle = f.fill; g.fill("evenodd") }
      if (f.stroke) {
        // outline width in screen terms: tiles are drawn at roughly constant
        // screen size, so a fixed canvas width reads alike at every level
        g.strokeStyle = f.stroke; g.lineWidth = f.widthPx ?? 2.5; g.lineJoin = "round"; g.setLineDash(f.dash ?? []); g.stroke()
      }
    }
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4
    return tex
  }

  // Point-in-polygon (even-odd) for picking.
  hit(lon, lat) {
    return this.features.find(f => {
      let inside = false
      for (const ring of f.rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }) ?? null
  }
}

function bbox(rings) {
  let w = 180, s = 90, e = -180, n = -90
  for (const r of rings) for (const [lo, la] of r) { w = Math.min(w, lo); e = Math.max(e, lo); s = Math.min(s, la); n = Math.max(n, la) }
  return [w, s, e, n]
}
