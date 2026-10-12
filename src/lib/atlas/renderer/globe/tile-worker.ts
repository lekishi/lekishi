/// <reference lib="webworker" />
import { readBundle } from "./bundle"
import {
  buildTileGeometry,
  decodeTerrarium,
  subdivideHeights,
  tileBounds,
  type TileGeometry,
} from "./tile-mesh"

/**
 * The globe's tile worker: everything a tile costs before it reaches the GPU
 * happens here, off the page's main thread, so streaming tiles does not stall
 * frames (the spike's first device runs showed 74–99 ms frames while tiles
 * were decoded on the main thread).
 *
 * - `load`: fetch one bundle (cancellable), decode the tiles the globe asked
 *   for, and build their meshes;
 * - `virtual`: build a tile below the built levels from its parent's heights;
 * - `cancel`: abort a load the camera no longer needs.
 */

export type TileKey = { readonly z: number; readonly x: number; readonly y: number }

export type WorkerRequest =
  | {
      readonly type: "load"
      readonly id: number
      readonly url: string
      /** The tiles of the bundle the globe wants; a bundle can hold more. */
      readonly tiles: readonly TileKey[]
      readonly exaggeration: number
    }
  | {
      readonly type: "virtual"
      readonly id: number
      readonly tile: TileKey
      readonly parentHeights: Float32Array
      readonly qx: number
      readonly qy: number
      readonly uv: readonly [number, number, number, number]
      readonly exaggeration: number
    }
  | { readonly type: "cancel"; readonly id: number }

export type BuiltTile = TileKey & {
  readonly heights: Float32Array
  /** Null for a subdivided tile, which borrows its ancestor's imagery. */
  readonly imagery: ImageBitmap | null
  readonly geometry: TileGeometry
}

export type WorkerResponse =
  | {
      readonly type: "done"
      readonly id: number
      readonly tiles: readonly BuiltTile[]
      readonly bytes: number
    }
  | { readonly type: "aborted"; readonly id: number }
  | { readonly type: "error"; readonly id: number; readonly message: string }

const scope = self as unknown as DedicatedWorkerGlobalScope
const loads = new Map<number, AbortController>()

function transfers(tiles: readonly BuiltTile[]): Transferable[] {
  return tiles.flatMap((tile) => [
    tile.heights.buffer as ArrayBuffer,
    tile.geometry.positions.buffer as ArrayBuffer,
    tile.geometry.normals.buffer as ArrayBuffer,
    tile.geometry.uvs.buffer as ArrayBuffer,
    tile.geometry.blocks.buffer as ArrayBuffer,
    ...(tile.imagery ? [tile.imagery] : []),
  ])
}

async function decodeHeights(png: Uint8Array): Promise<Float32Array> {
  const bitmap = await createImageBitmap(new Blob([png as BlobPart], { type: "image/png" }), {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  })
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext("2d", { willReadFrequently: true })

  if (context === null) {
    bitmap.close()
    throw new Error("no 2D context in the tile worker")
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return decodeTerrarium(context.getImageData(0, 0, canvas.width, canvas.height).data)
}

async function load(request: Extract<WorkerRequest, { type: "load" }>): Promise<void> {
  const controller = new AbortController()
  loads.set(request.id, controller)
  const built: BuiltTile[] = []

  try {
    const response = await fetch(request.url, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`${response.status} ${request.url}`)
    }

    const buffer = await response.arrayBuffer()
    const wanted = new Set(request.tiles.map((t) => `${t.z}/${t.x}/${t.y}`))

    for (const tile of readBundle(buffer)) {
      if (!wanted.has(`${tile.z}/${tile.x}/${tile.y}`)) {
        continue
      }

      const [heights, imagery] = await Promise.all([
        decodeHeights(tile.height),
        createImageBitmap(new Blob([tile.imagery as BlobPart], { type: "image/jpeg" })),
      ])
      built.push({
        z: tile.z,
        x: tile.x,
        y: tile.y,
        heights,
        imagery,
        geometry: buildTileGeometry(
          heights,
          tileBounds(tile.z, tile.x, tile.y),
          request.exaggeration,
        ),
      })

      if (controller.signal.aborted) {
        throw new DOMException("cancelled", "AbortError")
      }
    }

    const message: WorkerResponse = {
      type: "done",
      id: request.id,
      tiles: built,
      bytes: buffer.byteLength,
    }
    scope.postMessage(message, transfers(built))
  } catch (error) {
    built.forEach((tile) => tile.imagery?.close())
    const aborted = error instanceof DOMException && error.name === "AbortError"
    const message: WorkerResponse = aborted
      ? { type: "aborted", id: request.id }
      : {
          type: "error",
          id: request.id,
          message: error instanceof Error ? error.message : String(error),
        }
    scope.postMessage(message)
  } finally {
    loads.delete(request.id)
  }
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  if (request.type === "cancel") {
    loads.get(request.id)?.abort()
    return
  }

  if (request.type === "virtual") {
    const { tile } = request
    const heights = subdivideHeights(request.parentHeights, request.qx, request.qy)
    const built: BuiltTile[] = [
      {
        ...tile,
        heights,
        imagery: null,
        geometry: buildTileGeometry(
          heights,
          tileBounds(tile.z, tile.x, tile.y),
          request.exaggeration,
          request.uv,
        ),
      },
    ]
    const message: WorkerResponse = { type: "done", id: request.id, tiles: built, bytes: 0 }
    scope.postMessage(message, transfers(built))
    return
  }

  void load(request)
}
