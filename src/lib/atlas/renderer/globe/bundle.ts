/**
 * The globe's tile bundles, as `scripts/globe/build-tiles.py` writes them.
 *
 * One bundle holds the children (level z+1) of one tile, `b/{z}/{x}/{y}.bin`,
 * or the two level-0 tiles, `b/root.bin`. The globe refines a tile into all
 * four children at once and draws none of them until all four have arrived, so
 * a bundle is exactly one refinement's worth of tiles: packing them changes the
 * number of files and requests, never which tiles are fetched. Children outside
 * the built coverage are not in the bundle; the globe subdivides their parent.
 *
 * Layout, little-endian:
 *
 *     "LKGB"  u16 version (1)  u16 tile count n
 *     n entries of 20 bytes: u8 z, 3 zero bytes, u32 x, u32 y,
 *                            u32 height bytes, u32 imagery bytes
 *     each tile's height PNG, then its imagery JPEG, in entry order
 *
 * The heights are a 67x67 Terrarium PNG (R*256 + G + B/256 - 32768 metres, row 0
 * north: the tile's 65x65 grid plus a one-sample border) and the imagery a
 * 256x256 JPEG. This module only splits the bytes; decoding happens in the tile
 * worker. It runs in a worker and in Node (the build check), so it touches no
 * DOM API.
 */

export const BUNDLE_MAGIC = "LKGB"
export const BUNDLE_VERSION = 1

const HEADER_BYTES = 8
const ENTRY_BYTES = 20

export type BundledTile = {
  readonly z: number
  readonly x: number
  readonly y: number
  /** The tile's bordered heights, PNG-encoded. */
  readonly height: Uint8Array
  /** The tile's imagery, JPEG-encoded. */
  readonly imagery: Uint8Array
}

/** The bundle path, relative to the tileset, holding the children of z/x/y. */
export function childrenBundlePath(z: number, x: number, y: number): string {
  return `b/${z}/${x}/${y}.bin`
}

/** The bundle path, relative to the tileset, holding the two level-0 tiles. */
export const ROOT_BUNDLE_PATH = "b/root.bin"

/** Splits a bundle into its tiles. Throws on anything but a well-formed bundle. */
export function readBundle(buffer: ArrayBuffer): BundledTile[] {
  const view = new DataView(buffer)

  if (buffer.byteLength < HEADER_BYTES) {
    throw new Error("globe bundle: truncated header")
  }

  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  )

  if (magic !== BUNDLE_MAGIC) {
    throw new Error("globe bundle: not a Lekishi globe bundle")
  }

  const version = view.getUint16(4, true)

  if (version !== BUNDLE_VERSION) {
    throw new Error(`globe bundle: version ${version}, expected ${BUNDLE_VERSION}`)
  }

  const count = view.getUint16(6, true)
  let offset = HEADER_BYTES + count * ENTRY_BYTES

  if (buffer.byteLength < offset) {
    throw new Error("globe bundle: truncated entries")
  }

  const tiles: BundledTile[] = []

  for (let index = 0; index < count; index++) {
    const entry = HEADER_BYTES + index * ENTRY_BYTES
    const heightBytes = view.getUint32(entry + 12, true)
    const imageryBytes = view.getUint32(entry + 16, true)

    if (offset + heightBytes + imageryBytes > buffer.byteLength) {
      throw new Error("globe bundle: truncated tile data")
    }

    tiles.push({
      z: view.getUint8(entry),
      x: view.getUint32(entry + 4, true),
      y: view.getUint32(entry + 8, true),
      height: new Uint8Array(buffer, offset, heightBytes),
      imagery: new Uint8Array(buffer, offset + heightBytes, imageryBytes),
    })
    offset += heightBytes + imageryBytes
  }

  if (offset !== buffer.byteLength) {
    throw new Error("globe bundle: trailing bytes")
  }

  return tiles
}

/** Writes a bundle in the builder's layout. Used by the tests; the build writes real ones. */
export function writeBundle(tiles: readonly BundledTile[]): ArrayBuffer {
  const dataBytes = tiles.reduce((sum, tile) => sum + tile.height.length + tile.imagery.length, 0)
  const buffer = new ArrayBuffer(HEADER_BYTES + tiles.length * ENTRY_BYTES + dataBytes)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  for (let index = 0; index < 4; index++) {
    view.setUint8(index, BUNDLE_MAGIC.charCodeAt(index))
  }

  view.setUint16(4, BUNDLE_VERSION, true)
  view.setUint16(6, tiles.length, true)
  let offset = HEADER_BYTES + tiles.length * ENTRY_BYTES

  tiles.forEach((tile, index) => {
    const entry = HEADER_BYTES + index * ENTRY_BYTES
    view.setUint8(entry, tile.z)
    view.setUint32(entry + 4, tile.x, true)
    view.setUint32(entry + 8, tile.y, true)
    view.setUint32(entry + 12, tile.height.length, true)
    view.setUint32(entry + 16, tile.imagery.length, true)
    bytes.set(tile.height, offset)
    bytes.set(tile.imagery, offset + tile.height.length)
    offset += tile.height.length + tile.imagery.length
  })

  return buffer
}
