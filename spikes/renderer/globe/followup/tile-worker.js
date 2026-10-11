// Tile worker for the custom globe: everything a tile costs before it reaches
// the GPU happens here, off the page's main thread, so streaming tiles does not
// stall frames (the first device runs showed 74-99 ms frames while tiles arrived).
//
// - "load": fetch a tile's bordered heights and imagery (cancellable), decode
//   both, and build its mesh;
// - "virtual": build a tile below the tileset's deepest level from its parent's
//   heights, which the main thread sends back;
// - "cancel": abort a load the camera no longer needs.
//
// Heights arrive as 67x67 grids: the tile's 65x65 samples plus a one-sample
// border from its neighbours, so normals on a tile's edge are computed exactly
// as they are inside it and neighbouring tiles light seamlessly.
import { toEcef } from "../shared/flight.js"

const G = 65, B = G + 2

const loads = new Map()   // request id -> AbortController
self.onmessage = async ({ data: m }) => {
  if (m.type === "cancel") { loads.get(m.id)?.abort(); return }
  if (m.type === "virtual") {
    const heights = subdivide(m.parentHeights, m.qx, m.qy)
    const mesh = buildMesh(heights, m)
    self.postMessage({ type: "done", id: m.id, heights, ...mesh }, [heights.buffer, ...transfers(mesh)])
    return
  }
  if (m.type !== "load") return
  const ac = new AbortController(); loads.set(m.id, ac)
  try {
    const [hb, ib] = await Promise.all([blob(m.heightUrl, ac.signal), blob(m.imageryUrl, ac.signal)])
    const [heights, imagery] = await Promise.all([decodeHeights(hb), createImageBitmap(ib)])
    if (ac.signal.aborted) { imagery.close(); throw new DOMException("cancelled", "AbortError") }
    const mesh = buildMesh(heights, m)
    self.postMessage({ type: "done", id: m.id, heights, imagery, bytes: { height: hb.size, imagery: ib.size }, ...mesh }, [heights.buffer, imagery, ...transfers(mesh)])
  } catch (e) {
    self.postMessage(e.name === "AbortError" ? { type: "aborted", id: m.id } : { type: "error", id: m.id, message: String(e.message || e) })
  } finally { loads.delete(m.id) }
}

async function blob(url, signal) {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.blob()
}

// Terrarium: metres = R*256 + G + B/256 - 32768.
async function decodeHeights(b) {
  const bmp = await createImageBitmap(b, { premultiplyAlpha: "none", colorSpaceConversion: "none" })
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d", { willReadFrequently: true })
  g.drawImage(bmp, 0, 0); bmp.close()
  const d = g.getImageData(0, 0, c.width, c.height).data, h = new Float32Array(c.width * c.height)
  for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768
  return h
}

// A child quadrant's bordered grid, bilinear from the parent's bordered grid:
// the child's sample (r, c), border included, sits at parent sample
// (r0 + r/2, c0 + c/2) in inner coordinates, which the parent's border covers.
function subdivide(p, qx, qy) {
  const h = new Float32Array(B * B), r0 = qy === 1 ? 0 : 32, c0 = qx * 32
  const at = (r, c) => p[Math.min(B - 1, Math.max(0, r)) * B + Math.min(B - 1, Math.max(0, c))]
  for (let r = -1; r <= G; r++) for (let c = -1; c <= G; c++) {
    const pr = r0 + r / 2 + 1, pc = c0 + c / 2 + 1, ir = Math.floor(pr), ic = Math.floor(pc), fr = pr - ir, fc = pc - ic
    h[(r + 1) * B + c + 1] = (at(ir, ic) * (1 - fc) + at(ir, ic + 1) * fc) * (1 - fr) + (at(ir + 1, ic) * (1 - fc) + at(ir + 1, ic + 1) * fc) * fr
  }
  return h
}

// The tile's mesh, positioned relative to its centre (float32 keeps centimetres
// there; the centre itself goes into the mesh's float64 matrix): the 65x65 grid,
// a skirt hanging from its edge to hide cracks between levels, imagery UVs (a
// quadrant of the parent's texture for virtual tiles), and a second UV set
// spanning the tile for draped overlays.
function buildMesh(h, { b, K, uv: [u0, v0, u1, v1] }) {
  const n = G * G, ring = 4 * (G - 1), skirt = Math.max(50, 77067 / 2 ** b.z * 2)
  const cx = toEcef((b.w + b.e) / 2, (b.s + b.n) / 2, 0)
  const P = new Float64Array(B * B * 3)
  let lo = Infinity, hi = -Infinity
  for (let r = 0; r < B; r++) for (let c = 0; c < B; c++) {
    const lon = b.w + (b.e - b.w) * (c - 1) / (G - 1), lat = Math.max(-89.99, Math.min(89.99, b.n - (b.n - b.s) * (r - 1) / (G - 1)))
    const v = Math.max(0, h[r * B + c]) * K, p = toEcef(lon, lat, v), i = (r * B + c) * 3
    P[i] = p[0]; P[i + 1] = p[1]; P[i + 2] = p[2]
    if (r > 0 && r <= G && c > 0 && c <= G) { if (v < lo) lo = v; if (v > hi) hi = v }
  }
  const pos = new Float32Array((n + ring) * 3), nor = new Int8Array((n + ring) * 3)
  const uv = new Float32Array((n + ring) * 2), ouv = new Float32Array((n + ring) * 2)
  for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
    const i = r * G + c, j = ((r + 1) * B + c + 1) * 3
    pos[i * 3] = P[j] - cx[0]; pos[i * 3 + 1] = P[j + 1] - cx[1]; pos[i * 3 + 2] = P[j + 2] - cx[2]
    // central differences over the bordered grid: east minus west, north minus south
    const e = j + 3, w = j - 3, no = j - B * 3, so = j + B * 3
    const ex = P[e] - P[w], ey = P[e + 1] - P[w + 1], ez = P[e + 2] - P[w + 2]
    const nx = P[no] - P[so], ny = P[no + 1] - P[so + 1], nz = P[no + 2] - P[so + 2]
    let qx = ey * nz - ez * ny, qy = ez * nx - ex * nz, qz = ex * ny - ey * nx
    const l = Math.hypot(qx, qy, qz) || 1
    nor[i * 3] = Math.round(qx / l * 127); nor[i * 3 + 1] = Math.round(qy / l * 127); nor[i * 3 + 2] = Math.round(qz / l * 127)
    uv[i * 2] = u0 + (u1 - u0) * c / (G - 1); uv[i * 2 + 1] = v0 + (v1 - v0) * r / (G - 1)
    ouv[i * 2] = c / (G - 1); ouv[i * 2 + 1] = r / (G - 1)
  }
  edge().forEach((i, k) => {
    const j = n + k, px = pos[i * 3] + cx[0], py = pos[i * 3 + 1] + cx[1], pz = pos[i * 3 + 2] + cx[2], l = Math.hypot(px, py, pz)
    pos[j * 3] = pos[i * 3] - px / l * skirt; pos[j * 3 + 1] = pos[i * 3 + 1] - py / l * skirt; pos[j * 3 + 2] = pos[i * 3 + 2] - pz / l * skirt
    nor.copyWithin(j * 3, i * 3, i * 3 + 3); uv.copyWithin(j * 2, i * 2, i * 2 + 2); ouv.copyWithin(j * 2, i * 2, i * 2 + 2)
  })
  return { center: cx, pos, nor, uv, ouv, blocks: blockBoxes(pos), minH: lo, maxH: hi }
}
const transfers = m => [m.pos.buffer, m.nor.buffer, m.uv.buffer, m.ouv.buffer, m.blocks.buffer]

// Bounding boxes of the grid in 8x8 blocks of 8x8 cells (tile-local), so a ray
// tests only the triangles of the blocks it crosses: the camera controls cast
// rays at the terrain every frame while the reader drags or zooms.
function blockBoxes(pos) {
  const out = new Float32Array(64 * 6)
  for (let k = 0; k < 64; k++) {
    const r0 = (k >> 3) * 8, c0 = (k & 7) * 8, box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    for (let r = r0; r <= r0 + 8; r++) for (let c = c0; c <= c0 + 8; c++) {
      const i = (r * G + c) * 3
      for (let a = 0; a < 3; a++) { box[a] = Math.min(box[a], pos[i + a]); box[a + 3] = Math.max(box[a + 3], pos[i + a]) }
    }
    out.set(box, k * 6)
  }
  return out
}

// Edge vertices in ring order (top row east, right column south, bottom row west, left column north).
let EDGE = null
function edge() {
  if (EDGE) return EDGE
  EDGE = []
  for (let c = 0; c < G - 1; c++) EDGE.push(c)
  for (let r = 0; r < G - 1; r++) EDGE.push(r * G + G - 1)
  for (let c = G - 1; c > 0; c--) EDGE.push((G - 1) * G + c)
  for (let r = G - 1; r > 0; r--) EDGE.push(r * G)
  return EDGE
}
