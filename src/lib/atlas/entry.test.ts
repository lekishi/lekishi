// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The chapter page bootstrap owns the single workspace: it mounts one workspace
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

import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import { chapterHeading } from "./chapters"
import { mountWorkspace, releaseWorkspace, startAtlasPage } from "./entry"

const TANG = await loadServedChapter(TANG_CHAPTER)
const QIN = await loadServedChapter(QIN_CHAPTER)
const TANG_HEADING = chapterHeading(TANG)
const QIN_HEADING = chapterHeading(QIN)

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

  // The module has no import-time side effects (the chapter shell is prerendered
  // on the server), so the page's own start call wires the lifecycle here.
  startAtlasPage(TANG, TANG_HEADING)
})

// The bootstrap keeps one workspace for the lifetime of a page, so each test
// ends through the page's own teardown boundary instead of resetting module state.
afterEach(() => {
  releaseWorkspace()
})

describe("the chapter page bootstrap", () => {
  it("mounts exactly one workspace into the page's mount point", () => {
    const root = addMountPoint()

    mountWorkspace()
    mountWorkspace()

    expect(mountAtlas).toHaveBeenCalledTimes(1)
    expect(mountAtlas).toHaveBeenCalledWith(root, TANG, TANG_HEADING, {})
    expect(window.__lekishiAtlas).toBe(handle)
  })

  it("mounts nothing on a page without an atlas mount point", () => {
    mountWorkspace()

    expect(mountAtlas).not.toHaveBeenCalled()
    expect(window.__lekishiAtlas).toBeUndefined()
  })

  it("keeps one workspace when the page start call repeats", () => {
    addMountPoint()

    startAtlasPage(TANG, TANG_HEADING)
    startAtlasPage(TANG, TANG_HEADING)

    expect(mountAtlas).toHaveBeenCalledTimes(1)
    expect(window.__lekishiAtlas).toBe(handle)
  })

  it("mounts the chapter and heading the page asks for", () => {
    const root = addMountPoint()

    startAtlasPage(TANG, { name: "The embassy to Tang China", decision: "Owner-approved" })

    expect(mountAtlas).toHaveBeenCalledWith(
      root,
      TANG,
      {
        name: "The embassy to Tang China",
        decision: "Owner-approved",
      },
      {},
    )
  })

  it("keeps the heading when a page is restored from the back/forward cache", () => {
    addMountPoint()

    startAtlasPage(TANG, TANG_HEADING)
    mountWorkspace()

    transition("pagehide")
    transition("pageshow")

    expect(mountAtlas).toHaveBeenLastCalledWith(expect.anything(), TANG, TANG_HEADING, {})
  })

  it("restores the chapter and heading a later page started", () => {
    const root = addMountPoint()

    startAtlasPage(TANG, TANG_HEADING)
    mountWorkspace()
    releaseWorkspace()

    // A navigation starts a different chapter with its own display name and
    // decision line.
    startAtlasPage(QIN, QIN_HEADING)
    mountWorkspace()

    expect(mountAtlas).toHaveBeenLastCalledWith(root, QIN, QIN_HEADING, {})

    // The restored page comes back as that chapter, not the first one: clear the
    // spy so the assertion cannot pass on the mount above.
    transition("pagehide")
    mountAtlas.mockClear()
    transition("pageshow")

    expect(mountAtlas).toHaveBeenCalledWith(root, QIN, QIN_HEADING, {})
  })

  it("keeps the comparison page's local-detail treatment when a page is restored", () => {
    const root = addMountPoint()
    const options = { localDetail: "illustrated-local" } as const

    startAtlasPage(TANG, TANG_HEADING, options)
    mountWorkspace()

    expect(mountAtlas).toHaveBeenLastCalledWith(root, TANG, TANG_HEADING, options)

    // A restored comparison page comes back as the treatment it was showing, not
    // as the reader surface's default.
    transition("pagehide")
    mountAtlas.mockClear()
    transition("pageshow")

    expect(mountAtlas).toHaveBeenCalledWith(root, TANG, TANG_HEADING, options)
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
