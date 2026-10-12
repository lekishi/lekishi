import { toEcef } from "./geo"

/**
 * A tile's geometry, built off the main thread (by the tile worker) and handed
 * to the GPU as is. Pure functions over typed arrays; no Three.js and no DOM, so
 * the worker stays small and the geometry is testable in Node.
 *
 * The tiling is geographic (EPSG:4326, TMS): two level-0 tiles, each level
 * splitting a tile into four, `y` counting from the south.
 */

/** Height samples per tile edge. */
export const GRID = 65
/** The bordered grid: the tile's samples plus a one-sample border from its neighbours. */
export const BORDERED = GRID + 2
/** Level 0's geometric error for 65-sample tiles, in metres (Cesium's figure for the same grid). */
export const LEVEL0_ERROR_M = 77067

export type TileBounds = {
  readonly w: number
  readonly s: number
  readonly e: number
  readonly n: number
  readonly z: number
}

export function tileBounds(z: number, x: number, y: number): TileBounds {
  const size = 180 / (1 << z)
  return {
    w: -180 + x * size,
    s: -90 + y * size,
    e: -180 + (x + 1) * size,
    n: -90 + (y + 1) * size,
    z,
  }
}

export type TileGeometry = {
  /** The tile's centre on the ellipsoid, ECEF metres; positions are relative to it. */
  readonly center: [number, number, number]
  readonly positions: Float32Array
  readonly normals: Int8Array
  readonly uvs: Float32Array
  /** Bounding boxes of the grid in 8x8 blocks, tile-local, for cheap raycasts. */
  readonly blocks: Float32Array
  /** Lowest and highest rendered height over the tile, exaggerated metres. */
  readonly minHeight: number
  readonly maxHeight: number
}

/** Decodes Terrarium RGBA pixels (R*256 + G + B/256 - 32768) to metres. */
export function decodeTerrarium(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const heights = new Float32Array(rgba.length / 4)

  for (let i = 0; i < heights.length; i++) {
    heights[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768
  }

  return heights
}

/**
 * A child quadrant's bordered grid, bilinear from the parent's bordered grid.
 * Used below the built levels: the child's sample (r, c), border included, sits
 * at parent sample (r0 + r/2, c0 + c/2) in inner coordinates, which the parent's
 * border covers. `qy` 1 is the northern half (TMS rows count from the south).
 */
export function subdivideHeights(parent: Float32Array, qx: number, qy: number): Float32Array {
  const heights = new Float32Array(BORDERED * BORDERED)
  const r0 = qy === 1 ? 0 : (GRID - 1) / 2
  const c0 = qx * ((GRID - 1) / 2)
  const at = (r: number, c: number) =>
    parent[
      Math.min(BORDERED - 1, Math.max(0, r)) * BORDERED + Math.min(BORDERED - 1, Math.max(0, c))
    ]

  for (let r = -1; r <= GRID; r++) {
    for (let c = -1; c <= GRID; c++) {
      const pr = r0 + r / 2 + 1
      const pc = c0 + c / 2 + 1
      const ir = Math.floor(pr)
      const ic = Math.floor(pc)
      const fr = pr - ir
      const fc = pc - ic
      heights[(r + 1) * BORDERED + c + 1] =
        (at(ir, ic) * (1 - fc) + at(ir, ic + 1) * fc) * (1 - fr) +
        (at(ir + 1, ic) * (1 - fc) + at(ir + 1, ic + 1) * fc) * fr
    }
  }

  return heights
}

/** Edge vertices in ring order: top row east, right column south, bottom row west, left column north. */
export const EDGE: readonly number[] = (() => {
  const edge: number[] = []
  for (let c = 0; c < GRID - 1; c++) edge.push(c)
  for (let r = 0; r < GRID - 1; r++) edge.push(r * GRID + GRID - 1)
  for (let c = GRID - 1; c > 0; c--) edge.push((GRID - 1) * GRID + c)
  for (let r = GRID - 1; r > 0; r--) edge.push(r * GRID)
  return edge
})()

/**
 * One index buffer serves every tile: the grid, then the skirt ring. The ring
 * runs clockwise seen from above, so the skirt triangles face out of the tile:
 * a crack at a level boundary is seen from the neighbouring tile, and an
 * inward-facing skirt would be culled from there, showing the background.
 */
export const TILE_INDEX: Uint16Array = (() => {
  const n = GRID * GRID
  const ring = EDGE.length
  const index: number[] = []

  for (let r = 0; r < GRID - 1; r++) {
    for (let c = 0; c < GRID - 1; c++) {
      const a = r * GRID + c
      const b = a + GRID
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }

  for (let k = 0; k < ring; k++) {
    const a = EDGE[k]
    const b = EDGE[(k + 1) % ring]
    const sa = n + k
    const sb = n + ((k + 1) % ring)
    index.push(a, b, sa, b, sb, sa)
  }

  return new Uint16Array(index)
})()

/**
 * The tile's mesh, positioned relative to its centre (float32 keeps centimetres
 * there; the centre goes into the mesh's float64 matrix): the 65x65 grid, a
 * skirt hanging from its edge to hide cracks between levels, and imagery UVs
 * (`uv` is the part of the texture the tile spans: all of it for a built tile,
 * a quadrant of an ancestor's for a subdivided one).
 *
 * Normals are central differences over the bordered grid, so a tile's edge is
 * lit exactly as its inside and neighbouring tiles light seamlessly.
 */
export function buildTileGeometry(
  heights: Float32Array,
  bounds: TileBounds,
  exaggeration: number,
  uv: readonly [number, number, number, number] = [0, 0, 1, 1],
): TileGeometry {
  const [u0, v0, u1, v1] = uv
  const n = GRID * GRID
  const ring = EDGE.length
  // The skirt must reach below the edge of a coarser neighbour, which can sit a
  // level's geometric error away, exaggerated, and two levels coarser where the
  // haze relaxes detail; shorter skirts let the background show through.
  const skirt = Math.max(100, (LEVEL0_ERROR_M / 2 ** bounds.z) * exaggeration * 4)
  const center = toEcef((bounds.w + bounds.e) / 2, (bounds.s + bounds.n) / 2, 0)
  const world = new Float64Array(BORDERED * BORDERED * 3)
  let minHeight = Infinity
  let maxHeight = -Infinity

  for (let r = 0; r < BORDERED; r++) {
    for (let c = 0; c < BORDERED; c++) {
      const lon = bounds.w + ((bounds.e - bounds.w) * (c - 1)) / (GRID - 1)
      const lat = Math.max(
        -89.99,
        Math.min(89.99, bounds.n - ((bounds.n - bounds.s) * (r - 1)) / (GRID - 1)),
      )
      // The sea is clamped to sea level: bathymetry colours the imagery only.
      const h = Math.max(0, heights[r * BORDERED + c]) * exaggeration
      const p = toEcef(lon, lat, h)
      const i = (r * BORDERED + c) * 3
      world[i] = p[0]
      world[i + 1] = p[1]
      world[i + 2] = p[2]

      if (r > 0 && r <= GRID && c > 0 && c <= GRID) {
        minHeight = Math.min(minHeight, h)
        maxHeight = Math.max(maxHeight, h)
      }
    }
  }

  const positions = new Float32Array((n + ring) * 3)
  const normals = new Int8Array((n + ring) * 3)
  const uvs = new Float32Array((n + ring) * 2)

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const i = r * GRID + c
      const j = ((r + 1) * BORDERED + c + 1) * 3
      positions[i * 3] = world[j] - center[0]
      positions[i * 3 + 1] = world[j + 1] - center[1]
      positions[i * 3 + 2] = world[j + 2] - center[2]
      // East minus west, north minus south, crossed.
      const east = j + 3
      const west = j - 3
      const north = j - BORDERED * 3
      const south = j + BORDERED * 3
      const ex = world[east] - world[west]
      const ey = world[east + 1] - world[west + 1]
      const ez = world[east + 2] - world[west + 2]
      const nx = world[north] - world[south]
      const ny = world[north + 1] - world[south + 1]
      const nz = world[north + 2] - world[south + 2]
      const qx = ey * nz - ez * ny
      const qy = ez * nx - ex * nz
      const qz = ex * ny - ey * nx
      const length = Math.hypot(qx, qy, qz) || 1
      normals[i * 3] = Math.round((qx / length) * 127)
      normals[i * 3 + 1] = Math.round((qy / length) * 127)
      normals[i * 3 + 2] = Math.round((qz / length) * 127)
      uvs[i * 2] = u0 + ((u1 - u0) * c) / (GRID - 1)
      uvs[i * 2 + 1] = v0 + ((v1 - v0) * r) / (GRID - 1)
    }
  }

  EDGE.forEach((i, k) => {
    const j = n + k
    const px = positions[i * 3] + center[0]
    const py = positions[i * 3 + 1] + center[1]
    const pz = positions[i * 3 + 2] + center[2]
    const length = Math.hypot(px, py, pz)
    positions[j * 3] = positions[i * 3] - (px / length) * skirt
    positions[j * 3 + 1] = positions[i * 3 + 1] - (py / length) * skirt
    positions[j * 3 + 2] = positions[i * 3 + 2] - (pz / length) * skirt
    normals.copyWithin(j * 3, i * 3, i * 3 + 3)
    uvs.copyWithin(j * 2, i * 2, i * 2 + 2)
  })

  return {
    center: [center[0], center[1], center[2]],
    positions,
    normals,
    uvs,
    blocks: blockBoxes(positions),
    minHeight,
    maxHeight,
  }
}

/**
 * Bounding boxes of the grid in 8x8 blocks of 8x8 cells (tile-local), so a ray
 * tests only the triangles of the blocks it crosses: the camera controls cast
 * rays at the terrain every frame while the reader drags or zooms.
 */
function blockBoxes(positions: Float32Array): Float32Array {
  const out = new Float32Array(64 * 6)

  for (let k = 0; k < 64; k++) {
    const r0 = (k >> 3) * 8
    const c0 = (k & 7) * 8
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]

    for (let r = r0; r <= r0 + 8; r++) {
      for (let c = c0; c <= c0 + 8; c++) {
        const i = (r * GRID + c) * 3

        for (let a = 0; a < 3; a++) {
          box[a] = Math.min(box[a], positions[i + a])
          box[a + 3] = Math.max(box[a + 3], positions[i + a])
        }
      }
    }

    out.set(box, k * 6)
  }

  return out
}
