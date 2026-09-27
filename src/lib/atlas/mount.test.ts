// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import { mountAtlas } from "./mount"

/**
 * The workspace mount boundary: what a mount point contains while the workspace
 * is live, and what it contains after teardown. The Cesium renderer is replaced
 * because this test owns DOM ownership, not WebGL; `cesium-renderer.test.ts`
 * covers the renderer lifecycle itself.
 *
 * Every chapter mounts through this one function, so the cases here run a chapter
 * the site serves and check that the workspace it renders carries the chapter's
 * own name, decision, events, story, and sources.
 */
const renderer = vi.hoisted(() => ({ sync: vi.fn(), dispose: vi.fn() }))

vi.mock("./renderer/cesium-renderer", () => ({
  createCesiumAtlasRenderer: () => renderer,
}))

const TANG = await loadServedChapter(TANG_CHAPTER)
const QIN = await loadServedChapter(QIN_CHAPTER)

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
    const handle = mountAtlas(root, TANG)
    await flush()

    expect(root.childElementCount).toBe(1)
    expect(root.querySelectorAll('[data-testid="atlas-workspace"]')).toHaveLength(1)
    // The workspace renders the chapter it was mounted with: its 24 in-window
    // events, not a synthetic fixture.
    expect(root.querySelectorAll('[data-testid="atlas-event-item"]')).toHaveLength(24)
    expect(root.querySelector("#atlas-notice")?.textContent).toContain(TANG.title)
    expect(renderer.sync).toHaveBeenCalled()

    handle.dispose()
  })

  it("uses the heading its caller supplies for the chapter", async () => {
    const handle = mountAtlas(root, TANG, {
      name: "The embassy to Tang China",
      decision: "Owner-approved for release, 2026-09-25",
    })
    await flush()

    const notice = root.querySelector("#atlas-notice")?.textContent ?? ""

    expect(notice).toContain("The embassy to Tang China")
    expect(notice).toContain("Owner-approved for release, 2026-09-25")
    expect(notice).not.toContain(TANG.title)

    handle.dispose()
  })

  it("renders a second chapter through the same mount path with its own content", async () => {
    const handle = mountAtlas(root, QIN, {
      name: "The end of the state of Han",
      decision: "Owner-approved for release, 2026-09-27",
    })
    await flush()

    const notice = root.querySelector("#atlas-notice")?.textContent ?? ""

    expect(notice).toContain("The end of the state of Han")
    expect(notice).toContain("Owner-approved for release, 2026-09-27")
    // The chapter's own window and events: five BCE events, and the BCE year text
    // the atlas computes for them.
    expect(root.querySelectorAll('[data-testid="atlas-event-item"]')).toHaveLength(5)
    expect(root.querySelector('[data-testid="atlas-event-list"]')?.textContent).toContain("233 BCE")
    expect(root.querySelector('[data-testid="atlas-event-list"]')?.textContent).not.toContain("750")

    handle.dispose()
  })

  it("offers the same exploration surfaces for both chapters", async () => {
    // The story, the sources, and the dispute cue are the shared loop: a chapter
    // does not get a different surface because of which chapter it is. Each
    // chapter mounts in its own host, so one teardown cannot be read as the
    // next chapter's rendering.
    let disputedInWindow = 0

    for (const chapter of [TANG, QIN]) {
      const host = document.createElement("div")
      document.body.append(host)
      const handle = mountAtlas(host, chapter)
      await flush()

      const tabs = [...host.querySelectorAll('[data-testid="atlas-tab"]')].map(
        (tab) => tab.textContent?.trim() ?? "",
      )
      const expected = chapter.events.filter((event) => !event.coda && event.dispute !== null)
      const inWindow = chapter.events.filter((event) => !event.coda)

      // The panel's three surfaces, with the counts in their labels so no surface
      // repeats a heading of its own.
      expect(tabs).toEqual([
        `Events (${inWindow.length})`,
        `Story (${chapter.story.length})`,
        `Sources (${chapter.sources.length})`,
      ])
      expect(host.querySelectorAll('[data-testid="atlas-event-item"]').length).toBe(
        chapter.events.filter((event) => !event.coda).length,
      )
      // The dispute cue follows the in-window disputed records, which is what the
      // list renders: a disputed coda node is outside the default window.
      expect(host.querySelectorAll('[data-testid="atlas-dispute-badge"]')).toHaveLength(
        expected.length,
      )
      disputedInWindow += expected.length

      handle.dispose()
      host.remove()
    }

    // At least one served chapter shows the cue, so this test cannot pass by
    // finding nothing to look for.
    expect(disputedInWindow).toBeGreaterThan(0)
  })

  it("shows a disputed event's own accounts in the details panel", async () => {
    // The dispute cue is not a badge alone: selecting the event shows the record's
    // published summary and the accounts that challenge it, with their locators,
    // for whichever chapter the reader is in.
    for (const [chapter, eventId] of [
      [TANG, "lks:event:yaku-arrival-753"],
      [QIN, "lks:event:hanfei-death-233"],
    ] as const) {
      const host = document.createElement("div")
      document.body.append(host)
      const handle = mountAtlas(host, chapter)
      await flush()

      const row = host.querySelector<HTMLElement>(
        `[data-testid="atlas-event-item"][data-event-id="${eventId}"]`,
      )

      expect(row, `${chapter.id} renders ${eventId}`).not.toBeNull()
      row?.click()
      await flush()

      const dispute = host.querySelector('[data-testid="atlas-dispute"]')
      const event = chapter.events.find((candidate) => candidate.id === eventId)
      const summary = event?.dispute?.summary ?? ""

      expect(summary, eventId).not.toBe("")
      expect(dispute?.textContent ?? "", eventId).toContain(summary.slice(0, 40))
      // The citations are the record's own: the panel lists them with a locator,
      // so a missing or empty list fails here rather than passing on `undefined`.
      const citations = host.querySelector('[data-testid="atlas-citations"]')

      expect(citations, `${eventId} shows its citations`).not.toBeNull()
      expect(citations?.textContent, eventId).toContain(event?.citations[0]?.locator ?? "")

      handle.dispose()
      host.remove()
    }
  })

  it("tears the workspace down and disposes the renderer, idempotently", async () => {
    const handle = mountAtlas(root, TANG)
    await flush()
    handle.dispose()

    expect(root.childElementCount).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)

    handle.dispose()
    expect(root.childElementCount).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })
})
