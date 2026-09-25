// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CHAPTER } from "./chapter-content"
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
    const handle = mountAtlas(root, CHAPTER)
    await flush()

    expect(root.childElementCount).toBe(1)
    expect(root.querySelectorAll('[data-testid="atlas-workspace"]')).toHaveLength(1)
    // The workspace renders the reviewed chapter: its 24 in-window events, not a
    // synthetic fixture.
    expect(root.querySelectorAll('[data-testid="atlas-event-item"]')).toHaveLength(24)
    expect(root.querySelector("#atlas-notice")?.textContent).toContain("Reviewed chapter")
    expect(renderer.sync).toHaveBeenCalled()

    handle.dispose()
  })

  it("tears the workspace down and disposes the renderer, idempotently", async () => {
    const handle = mountAtlas(root, CHAPTER)
    await flush()
    handle.dispose()

    expect(root.childElementCount).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)

    handle.dispose()
    expect(root.childElementCount).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })
})

describe("mountAtlas and the comparison review surface", () => {
  const dispute = {
    status: "disputed" as const,
    summary: "The accounts differ about this event.",
    accounts: [{ statement: "One account records it one way.", locators: ["卷六（entry）"] }],
  }
  // The reviewed Tang chapter has disputes of its own; this test isolates the
  // one it injects so the count is the presentation's, not the content's.
  const disputed = {
    ...CHAPTER,
    events: CHAPTER.events.map((event) =>
      event.id === "lks:event:appointment-750"
        ? { ...event, dispute }
        : { ...event, dispute: null },
    ),
  }

  it("marks the disputed event and shows its accounts only on the review surface", async () => {
    const handle = mountAtlas(root, disputed, "comparison-review")
    await flush()

    expect(root.querySelectorAll('[data-testid="atlas-dispute-badge"]')).toHaveLength(1)
    expect(root.querySelector("#atlas-notice")?.textContent).toContain("Unapproved preparation")

    const item = root.querySelector('[data-testid="atlas-event-item"]')
    ;(item as HTMLElement).click()
    await flush()

    const panel = root.querySelector('[data-testid="atlas-dispute"]')

    expect(panel?.textContent).toContain("The accounts differ about this event.")
    expect(panel?.textContent).toContain("One account records it one way.")
    expect(panel?.textContent).toContain("卷六（entry）")

    handle.dispose()
  })

  it("keeps the production surface unchanged", async () => {
    const handle = mountAtlas(root, disputed)
    await flush()

    expect(root.querySelectorAll('[data-testid="atlas-dispute-badge"]')).toHaveLength(0)
    expect(root.querySelector("#atlas-notice")?.textContent).toContain("Reviewed chapter")

    handle.dispose()
  })
})
