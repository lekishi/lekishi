// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The atlas page bootstrap owns the single workspace: it mounts one workspace
 * into the page's mount point, releases it at the page-teardown boundary, and
 * restores exactly one workspace when a page comes back from the back/forward
 * cache. `mountAtlas` is mocked because this test covers the page lifecycle, not
 * the workspace itself (`mount.test.ts` covers the mount boundary).
 */
const handle = vi.hoisted(() => {
  const handle = {
    disposed: false,
    dispose: vi.fn(() => {
      handle.disposed = true
    }),
  }

  return handle
})
const mountAtlas = vi.hoisted(() => vi.fn(() => handle))

vi.mock("./mount", () => ({ mountAtlas }))

import { mountWorkspace, releaseWorkspace, startAtlasPage } from "./entry"

function addMountPoint(): HTMLElement {
  const root = document.createElement("div")
  root.id = "atlas-workspace"
  document.body.append(root)

  return root
}

function transition(type: "pagehide" | "pageshow"): void {
  window.dispatchEvent(new Event(type))
}

beforeEach(() => {
  document.body.replaceChildren()
  handle.disposed = false
  handle.dispose.mockClear()
  mountAtlas.mockClear()
  mountAtlas.mockImplementation(() => handle)
  delete window.__lekishiAtlas

  // The module has no import-time side effects (the atlas shell is prerendered
  // on the server), so the page's own start call wires the lifecycle here.
  startAtlasPage()
})

// The bootstrap keeps one workspace for the lifetime of a page, so each test
// ends through the page's own teardown boundary instead of resetting module state.
afterEach(() => {
  releaseWorkspace()
})

describe("the atlas page bootstrap", () => {
  it("mounts exactly one workspace into the page's mount point", () => {
    const root = addMountPoint()

    mountWorkspace()
    mountWorkspace()

    expect(mountAtlas).toHaveBeenCalledTimes(1)
    expect(mountAtlas).toHaveBeenCalledWith(root)
    expect(window.__lekishiAtlas).toBe(handle)
  })

  it("mounts nothing on a page without an atlas mount point", () => {
    mountWorkspace()

    expect(mountAtlas).not.toHaveBeenCalled()
    expect(window.__lekishiAtlas).toBeUndefined()
  })

  it("keeps one workspace when the page start call repeats", () => {
    addMountPoint()

    startAtlasPage()
    startAtlasPage()

    expect(mountAtlas).toHaveBeenCalledTimes(1)
    expect(window.__lekishiAtlas).toBe(handle)
  })

  it("releases the workspace on teardown and restores one workspace on pageshow", () => {
    addMountPoint()
    mountWorkspace()

    transition("pagehide")

    expect(handle.dispose).toHaveBeenCalledTimes(1)
    expect(window.__lekishiAtlas).toBeUndefined()

    transition("pageshow")

    expect(mountAtlas).toHaveBeenCalledTimes(2)
    expect(window.__lekishiAtlas).toBe(handle)
  })

  it("keeps one workspace when the page is shown again without a teardown", () => {
    addMountPoint()
    mountWorkspace()

    transition("pageshow")
    transition("pageshow")

    expect(mountAtlas).toHaveBeenCalledTimes(1)
  })

  it("replaces a workspace that was disposed through the diagnostic handle", () => {
    addMountPoint()
    mountWorkspace()

    window.__lekishiAtlas?.dispose()
    mountWorkspace()

    expect(mountAtlas).toHaveBeenCalledTimes(2)
  })

  it("reports a failed mount in the mount point and retries cleanly", () => {
    const root = addMountPoint()
    mountAtlas.mockImplementationOnce(() => {
      throw new Error("no WebGL context")
    })

    mountWorkspace()

    expect(root.textContent).toContain("no WebGL context")
    expect(window.__lekishiAtlas).toBeUndefined()

    mountWorkspace()

    expect(root.textContent).toBe("")
    expect(window.__lekishiAtlas).toBe(handle)
  })
})
