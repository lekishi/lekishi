import { describe, expect, it } from "vitest"
import { toEcef } from "./geo"
import {
  BORDERED,
  buildTileGeometry,
  decodeTerrarium,
  EDGE,
  GRID,
  subdivideHeights,
  TILE_INDEX,
  tileBounds,
} from "./tile-mesh"

describe("tile geometry", () => {
  it("tiles the Earth geographically, two roots wide, y from the south", () => {
    expect(tileBounds(0, 0, 0)).toMatchObject({ w: -180, s: -90, e: 0, n: 90 })
    expect(tileBounds(0, 1, 0)).toMatchObject({ w: 0, e: 180 })
    expect(tileBounds(7, 227, 92)).toMatchObject({
      w: 139.21875,
      s: 39.375,
      e: 140.625,
      n: 40.78125,
    })
  })

  it("decodes Terrarium heights", () => {
    // 128*256 + 0 + 0/256 - 32768 = 0; 129*256 + 10 + 128/256 - 32768 = 266.5
    expect([...decodeTerrarium(new Uint8Array([128, 0, 0, 255, 129, 10, 128, 255]))]).toEqual([
      0, 266.5,
    ])
  })

  it("subdivides a parent's heights into each quadrant", () => {
    // A parent sloping west to east: each child keeps the slope over its half.
    const parent = new Float32Array(BORDERED * BORDERED)
    for (let r = 0; r < BORDERED; r++)
      for (let c = 0; c < BORDERED; c++) parent[r * BORDERED + c] = c * 10
    const west = subdivideHeights(parent, 0, 0)
    const east = subdivideHeights(parent, 1, 0)

    expect(west[BORDERED + 1]).toBeCloseTo(10)
    expect(west[BORDERED + GRID]).toBeCloseTo(330)
    expect(east[BORDERED + 1]).toBeCloseTo(330)
    expect(east[BORDERED + GRID]).toBeCloseTo(650)
  })

  it("builds a grid with a skirt, positioned about the tile's centre", () => {
    const heights = new Float32Array(BORDERED * BORDERED)
    const bounds = tileBounds(5, 52, 22)
    const geometry = buildTileGeometry(heights, bounds, 2.2)
    const vertices = GRID * GRID + EDGE.length

    expect(geometry.positions.length).toBe(vertices * 3)
    expect(geometry.normals.length).toBe(vertices * 3)
    expect(geometry.uvs.length).toBe(vertices * 2)
    expect(Math.max(...TILE_INDEX)).toBe(vertices - 1)

    // The north-west corner sits on the ellipsoid where the bounds say.
    const corner = toEcef(bounds.w, bounds.n, 0)
    expect(geometry.positions[0] + geometry.center[0]).toBeCloseTo(corner[0], 0)
    expect(geometry.positions[2] + geometry.center[2]).toBeCloseTo(corner[2], 0)

    // Flat ground: every normal points away from the Earth's centre.
    const i = (32 * GRID + 32) * 3
    const outward = [
      geometry.positions[i] + geometry.center[0],
      geometry.positions[i + 1] + geometry.center[1],
      geometry.positions[i + 2] + geometry.center[2],
    ]
    const dot = outward.reduce((sum, v, k) => sum + v * geometry.normals[i + k], 0)
    expect(dot).toBeGreaterThan(0)
  })

  it("clamps the sea to sea level and exaggerates the land", () => {
    const heights = new Float32Array(BORDERED * BORDERED).fill(-4000)
    heights[(1 + 10) * BORDERED + 1 + 10] = 1000
    const geometry = buildTileGeometry(heights, tileBounds(6, 210, 85), 2.2)

    expect(geometry.minHeight).toBe(0)
    expect(geometry.maxHeight).toBeCloseTo(2200)
  })
})
