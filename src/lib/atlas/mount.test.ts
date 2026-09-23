// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountAtlas } from "./mount"

/**
 * The workspace mount boundary: what a mount point contains while the workspace
 * is live, and what it contains after teardown. The Cesium renderer is replaced
 * because this test owns DOM ownership, not WebGL; `cesium-renderer.test.ts`
 * covers the renderer lifecycle itself.
 */
const renderer = vi.hoisted(() => ({ sync: vi.fn(), dispose: vi.fn() }))

vi.mock("./renderer/cesium-renderer", () => ({
  createCesiumAtlasRenderer: () => renderer,
}))

let root: HTMLElement

// Svelte 5 flushes effects (including `onMount`, which creates the renderer) in a
// microtask, so a mount is not fully applied until the queue drains.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  root = document.createElement("div")
  root.id = "atlas-workspace"
  document.body.append(root)
  renderer.sync.mockClear()
  renderer.dispose.mockClear()
})

afterEach(() => {
  root.remove()
})

describe("mountAtlas", () => {
  it("renders one workspace into the mount point and drives the renderer", async () => {
    const handle = mountAtlas(root)
    await flush()

    expect(root.childElementCount).toBe(1)
    expect(root.querySelectorAll('[data-testid="atlas-workspace"]')).toHaveLength(1)
    expect(root.querySelectorAll('[data-testid="atlas-event-item"]')).toHaveLength(5)
    expect(renderer.sync).toHaveBeenCalled()

    handle.dispose()
  })

  it("tears the workspace down and disposes the renderer, idempotently", async () => {
    const handle = mountAtlas(root)
    await flush()
    handle.dispose()

    expect(root.childElementCount).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)

    handle.dispose()
    expect(root.childElementCount).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })
})
