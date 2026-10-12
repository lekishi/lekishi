import * as THREE from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toEcef } from "./geo"
import { BORDERED, buildTileGeometry, tileBounds } from "./tile-mesh"
import type { WorkerRequest, WorkerResponse } from "./tile-worker"
import { GlobeTiles } from "./tiles"

class TileWorker {
  static requests: { worker: TileWorker; request: Extract<WorkerRequest, { type: "load" }> }[] = []
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null
  postMessage(request: WorkerRequest): void {
    if (request.type === "load") TileWorker.requests.push({ worker: this, request })
  }
  terminate(): void {}
}

function reply(ok: boolean, omitLast = false): void {
  const { worker, request } = TileWorker.requests.shift()!
  worker.onmessage?.({
    data: ok
      ? {
          type: "done",
          id: request.id,
          bytes: 100,
          tiles: request.tiles.slice(0, omitLast ? -1 : undefined).map((key) => {
            const heights = new Float32Array(BORDERED * BORDERED)
            return {
              ...key,
              heights,
              imagery: { close() {} } as ImageBitmap,
              geometry: buildTileGeometry(heights, tileBounds(key.z, key.x, key.y), 1),
            }
          }),
        }
      : { type: "error", id: request.id, message: "503" },
  })
}

describe("globe tile loading", () => {
  let tiles: GlobeTiles
  let camera: THREE.PerspectiveCamera
  const update = () => tiles.update(camera, 900)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("Worker", TileWorker)
    vi.stubGlobal("navigator", { hardwareConcurrency: 2 })
    vi.spyOn(console, "error").mockImplementation(() => {})
    TileWorker.requests = []
    tiles = new GlobeTiles({
      baseUrl: "https://atlas.example/globe/",
      tileset: {
        format: "lekishi-globe-bundles",
        version: 1,
        maxLevel: 1,
        available: [
          [{ startX: 0, startY: 0, endX: 1, endY: 0 }],
          [{ startX: 0, startY: 0, endX: 3, endY: 1 }],
        ],
        attribution: "test",
        attributionFile: "ATTRIBUTION.txt",
      },
      exaggeration: 1,
      memoryBudgetMB: 256,
      onChange() {},
    })
    camera = new THREE.PerspectiveCamera(40, 1.6, 1, 4e7)
    camera.position.set(...toEcef(130, 30, 1e6))
    camera.up.set(0, 0, 1)
    camera.lookAt(new THREE.Vector3(...toEcef(130, 30)))
  })

  afterEach(() => {
    tiles.dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("recovers a transient root failure", () => {
    update()
    reply(false)
    update()
    expect(tiles.settled).toBe(true)
    vi.advanceTimersByTime(1000)
    update()
    reply(true)
    expect(tiles.rootsReady).toBe(true)
  })

  it("settles after three failed root attempts without spinning or retrying forever", () => {
    for (const delay of [0, 1000, 2000]) {
      vi.advanceTimersByTime(delay)
      update()
      reply(false)
      update()
      expect(tiles.settled).toBe(true)
    }
    vi.advanceTimersByTime(60_000)
    update()
    expect(tiles.stats().requests).toBe(3)
    expect(tiles.rootsReady).toBe(false)
    expect(tiles.settled).toBe(true)
  })

  it.each([false, true])(
    "keeps parent coverage until every child is drawable (partial=%s)",
    (partial) => {
      update()
      reply(true)
      update()
      const parents = tiles.group.children.map((mesh) => mesh.userData.tile)
      expect(parents).toContain("0/1/0")
      while (TileWorker.requests.length) reply(partial, partial)
      update()
      expect(tiles.group.children.map((mesh) => mesh.userData.tile)).toEqual(parents)
      expect(tiles.settled).toBe(true)
      vi.advanceTimersByTime(1000)
      update()
      while (TileWorker.requests.length) reply(true)
      update()
      expect(tiles.group.children.map((mesh) => mesh.userData.tile)).not.toContain("0/1/0")
      expect(tiles.stats().drawn).toBeGreaterThan(0)
      expect(tiles.settled).toBe(true)
    },
  )
})
