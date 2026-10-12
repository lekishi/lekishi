import { describe, expect, it } from "vitest"
import { childrenBundlePath, readBundle, ROOT_BUNDLE_PATH, writeBundle } from "./bundle"

/**
 * The bundle layout is shared with `scripts/globe/build-tiles.py`, which writes
 * it, and `scripts/check-static-build.mjs`, which reads a built one back. These
 * cases pin the reader's side; the build check pins the writer's.
 */
const tile = (z: number, x: number, y: number, h: number[], i: number[]) => ({
  z,
  x,
  y,
  height: new Uint8Array(h),
  imagery: new Uint8Array(i),
})

describe("globe bundles", () => {
  it("round-trips the four children of a tile", () => {
    const tiles = [
      tile(6, 200, 80, [1, 2, 3], [4, 5]),
      tile(6, 201, 80, [6], [7, 8, 9, 10]),
      tile(6, 200, 81, [], [11]),
      tile(6, 201, 81, [12, 13], []),
    ]
    const read = readBundle(writeBundle(tiles))

    expect(read.map(({ z, x, y }) => [z, x, y])).toEqual(tiles.map(({ z, x, y }) => [z, x, y]))
    expect(read.map((t) => [...t.height])).toEqual(tiles.map((t) => [...t.height]))
    expect(read.map((t) => [...t.imagery])).toEqual(tiles.map((t) => [...t.imagery]))
  })

  it("keeps large tile coordinates and lengths exact", () => {
    const height = new Uint8Array(70_000).fill(7)
    const [read] = readBundle(
      writeBundle([{ z: 7, x: 227, y: 92, height, imagery: new Uint8Array(3) }]),
    )

    expect(read).toMatchObject({ z: 7, x: 227, y: 92 })
    expect(read.height.length).toBe(70_000)
  })

  it("refuses anything but a well-formed bundle", () => {
    const good = writeBundle([tile(1, 0, 0, [1], [2])])

    expect(() => readBundle(new ArrayBuffer(4))).toThrow(/truncated header/)
    expect(() =>
      readBundle(new TextEncoder().encode("NOPE\u0001\u0000\u0000\u0000").buffer),
    ).toThrow(/not a Lekishi globe bundle/)

    const future = good.slice(0)
    new DataView(future).setUint16(4, 2, true)
    expect(() => readBundle(future)).toThrow(/version 2/)

    expect(() => readBundle(good.slice(0, good.byteLength - 1))).toThrow(/truncated tile data/)

    const longer = new Uint8Array(good.byteLength + 1)
    longer.set(new Uint8Array(good))
    expect(() => readBundle(longer.buffer)).toThrow(/trailing bytes/)
  })

  it("names bundles by the tile whose children they hold", () => {
    expect(childrenBundlePath(5, 52, 20)).toBe("b/5/52/20.bin")
    expect(ROOT_BUNDLE_PATH).toBe("b/root.bin")
  })
})
