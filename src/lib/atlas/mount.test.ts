// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import type { Chapter } from "./domain"
import { mountAtlas } from "./mount"

/**
 * The workspace mount boundary: what a mount point contains while the workspace
 * is live, and what it contains after teardown. The globe renderer is replaced
 * because this test owns DOM ownership, not WebGL; `globe-renderer.test.ts`
 * covers the renderer lifecycle itself.
 *
 * Every chapter mounts through this one function, so the cases here run a chapter
 * the site serves and check that the workspace it renders carries the chapter's
 * own name, decision, events, story, and sources.
 */
const renderer = vi.hoisted(() => ({ sync: vi.fn(), dispose: vi.fn() }))

vi.mock("./renderer/globe-renderer", () => ({
  createGlobeAtlasRenderer: () => renderer,
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

/** Opens a tab of the explore list. */
async function openTab(host: HTMLElement, tab: "story" | "events" | "sources") {
  host.querySelector<HTMLElement>(`#atlas-explore-tab-${tab}`)?.click()
  await flush()
}

describe("mountAtlas", () => {
  it("renders one workspace into the mount point and drives the renderer", async () => {
    const handle = mountAtlas(root, TANG)
    await flush()

    expect(root.childElementCount).toBe(1)
    expect(root.querySelectorAll('[data-testid="atlas-workspace"]')).toHaveLength(1)
    // The frame opens on the story; the workspace renders the chapter it was
    // mounted with: its story steps, then its 24 in-window events.
    expect(root.querySelectorAll('[data-testid="atlas-story-step"]')).toHaveLength(
      TANG.story.length,
    )
    await openTab(root, "events")
    expect(root.querySelectorAll('[data-testid="atlas-event-item"]')).toHaveLength(24)
    expect(root.querySelector("#atlas-chapter-switcher")?.textContent).toContain(TANG.title)
    expect(renderer.sync).toHaveBeenCalled()

    handle.dispose()
  })

  it("uses the heading its caller supplies for the chapter", async () => {
    const handle = mountAtlas(root, TANG, {
      name: "The embassy to Tang China",
      decision: "Owner-approved for release, 2026-09-25",
    })
    await flush()

    // The name is the switcher in the date bar; the decision is stated once,
    // in the About sheet, rather than beside every event.
    expect(root.querySelector("#atlas-chapter-switcher")?.textContent).toContain(
      "The embassy to Tang China",
    )
    expect(root.querySelector("#atlas-chapter-switcher")?.textContent).not.toContain(TANG.title)
    expect(root.querySelector("#atlas-about-decision")?.textContent).toContain(
      "Owner-approved for release, 2026-09-25",
    )
    expect(root.querySelector("#atlas-about")?.textContent).toContain(TANG.publication.coverageNote)

    handle.dispose()
  })

  it("renders a second chapter through the same mount path with its own content", async () => {
    const handle = mountAtlas(root, QIN, {
      name: "The end of the state of Han",
      decision: "Owner-approved for release, 2026-09-27",
    })
    await flush()

    expect(root.querySelector("#atlas-chapter-switcher")?.textContent).toContain(
      "The end of the state of Han",
    )
    expect(root.querySelector("#atlas-about-decision")?.textContent).toContain(
      "Owner-approved for release, 2026-09-27",
    )
    // The chapter's own window and events: five BCE events, and the BCE year text
    // the atlas computes for them.
    await openTab(root, "events")
    expect(root.querySelectorAll('[data-testid="atlas-event-item"]')).toHaveLength(5)
    expect(root.querySelector('[data-testid="atlas-event-list"]')?.textContent).toContain("233 BCE")
    expect(root.querySelector('[data-testid="atlas-event-list"]')?.textContent).not.toContain("750")
    expect(root.querySelector('[data-testid="atlas-playhead-year"]')?.textContent).toBe("233 BCE")

    handle.dispose()
  })

  it("offers the same exploration surfaces for both chapters", async () => {
    // The story, the events, the sources, and the dispute cue are the shared
    // loop: a chapter does not get a different surface because of which chapter
    // it is. Each chapter mounts in its own host, so one teardown cannot be read
    // as the next chapter's rendering.
    let disputedInWindow = 0

    for (const chapter of [TANG, QIN]) {
      const host = document.createElement("div")
      document.body.append(host)
      const handle = mountAtlas(host, chapter)
      await flush()

      const tabs = [...host.querySelectorAll('[role="tab"]')].map((tab) =>
        (tab.textContent ?? "").replace(/\s+/g, " ").trim(),
      )
      const expected = chapter.events.filter((event) => !event.coda && event.dispute !== null)
      const inWindow = chapter.events.filter((event) => !event.coda)

      expect(tabs).toEqual([
        `Story ${chapter.story.length}`,
        `Events ${inWindow.length}`,
        `Sources ${chapter.sources.length}`,
      ])
      await openTab(host, "events")
      expect(host.querySelectorAll('[data-testid="atlas-event-item"]').length).toBe(inWindow.length)
      // The dispute cue follows the in-window disputed records, which is what the
      // list renders: a disputed coda node is outside the default window.
      expect(host.querySelectorAll('[data-testid="atlas-dispute-badge"]')).toHaveLength(
        expected.length,
      )
      disputedInWindow += expected.length

      await openTab(host, "sources")
      expect(host.querySelectorAll('[data-testid="atlas-source"]')).toHaveLength(
        chapter.sources.length,
      )

      handle.dispose()
      host.remove()
    }

    // At least one served chapter shows the cue, so this test cannot pass by
    // finding nothing to look for.
    expect(disputedInWindow).toBeGreaterThan(0)
  })

  it("shows a disputed event's own accounts in the selection card", async () => {
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
      await openTab(host, "events")

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
      // The citations are the record's own: the card lists them with a locator,
      // so a missing or empty list fails here rather than passing on `undefined`.
      const citations = host.querySelector('[data-testid="atlas-citations"]')

      expect(citations, `${eventId} shows its citations`).not.toBeNull()
      expect(citations?.textContent, eventId).toContain(event?.citations[0]?.locator ?? "")

      handle.dispose()
      host.remove()
    }
  })

  it("says in the list and the card that an event is told as tradition", async () => {
    // No served chapter is tradition yet, so the Qin chapter is retold: one
    // event's main claims become tradition, and only that row and card say so.
    const eventId = "lks:event:hanfei-death-233"
    const retold: Chapter = {
      ...QIN,
      events: QIN.events.map((event) =>
        event.id === eventId ? { ...event, tradition: true } : event,
      ),
    }
    const host = document.createElement("div")
    document.body.append(host)
    const handle = mountAtlas(host, retold)
    await flush()
    await openTab(host, "events")

    const badges = host.querySelectorAll('[data-testid="atlas-tradition-badge"]')

    expect(badges).toHaveLength(1)
    expect(
      badges[0]?.closest('[data-testid="atlas-event-item"]')?.getAttribute("data-event-id"),
    ).toBe(eventId)

    host
      .querySelector<HTMLElement>(`[data-testid="atlas-event-item"][data-event-id="${eventId}"]`)
      ?.click()
    await flush()

    expect(host.querySelector('[data-testid="atlas-tradition"]')?.textContent).toContain(
      "Told as tradition",
    )

    handle.dispose()
    host.remove()
  })

  it("opens at the address it is mounted with and says what it opened", async () => {
    const handle = mountAtlas(root, TANG, undefined, {
      search: "?event=akimeya-landfall-753",
      history: null,
    })
    await flush()

    const event = TANG.events.find((candidate) => candidate.id === "lks:event:akimeya-landfall-753")

    expect(root.querySelector("#atlas-selection h2")?.textContent).toContain(event?.title)
    expect(root.querySelector('[data-testid="atlas-arrival"]')?.textContent).toContain(event?.title)

    // "Play from here" plays from the linked event's time, and the plate
    // retires once the reader has acted.
    const play = [
      ...root.querySelectorAll<HTMLButtonElement>('[data-testid="atlas-arrival"] button'),
    ].find((button) => button.textContent?.includes("Play from here"))

    play?.click()
    await flush()
    expect(play).toBeDefined()
    expect(root.querySelector("#atlas-play-toggle")?.getAttribute("aria-pressed")).toBe("true")
    expect(root.querySelector('[data-testid="atlas-arrival"]')).toBeNull()

    handle.dispose()
  })

  it("says so when a link names something the chapter does not have", async () => {
    const handle = mountAtlas(root, QIN, undefined, {
      search: "?event=not-a-record",
      history: null,
    })
    await flush()

    expect(root.querySelector("#atlas-selection")).toBeNull()
    expect(root.querySelector('[data-testid="atlas-arrival"]')?.textContent).toContain(
      "not-a-record",
    )

    handle.dispose()
  })

  describe("a chapter with several stories", () => {
    // A second view made from the Tang chapter's own, holding three of its
    // events: a fixture for the story list, not a story the chapter has.
    const options = [
      { key: TANG_CHAPTER, title: "The embassy", window: { start: 750, end: 754 } },
      { key: "example-second", title: "A second story", window: { start: 753, end: 754 } },
    ]
    const kept = new Set([
      "lks:event:akimeya-landfall-753",
      "lks:event:dazaifu-entry-753",
      "lks:event:naniwa-754",
    ])
    const first: Chapter = { ...TANG, stories: options }
    const second: Chapter = {
      ...TANG,
      storyKey: "example-second",
      stories: options,
      defaultWindow: { start: 753, end: 754 },
      events: TANG.events.filter((event) => kept.has(event.id)),
      story: TANG.story.filter((step) => kept.has(step.recordId)),
    }
    const steps = () => root.querySelectorAll('[data-testid="atlas-story-step"]')
    const option = (key: string) =>
      root.querySelector<HTMLButtonElement>(
        `[data-testid="atlas-story-option"][data-story="${key}"]`,
      )

    it("lists no stories for a chapter with one", async () => {
      const handle = mountAtlas(root, QIN)
      await flush()

      expect(root.querySelector('[data-testid="atlas-stories"]')).toBeNull()

      handle.dispose()
    })

    it("lists the stories above the journal and opens one at its start", async () => {
      const history = { push: vi.fn(), replace: vi.fn() }
      const handle = mountAtlas(root, first, undefined, { search: "", history }, [first, second])
      await flush()

      expect(root.querySelectorAll('[data-testid="atlas-story-option"]')).toHaveLength(2)
      expect(option(TANG_CHAPTER)?.getAttribute("aria-current")).toBe("true")
      expect(option("example-second")?.textContent).toContain("753–754")
      expect(steps()).toHaveLength(TANG.story.length)

      option("example-second")?.click()
      await flush()

      expect(option("example-second")?.getAttribute("aria-current")).toBe("true")
      expect(steps()).toHaveLength(3)
      expect(history.push).toHaveBeenLastCalledWith("?story=example-second")

      // Back to an address without a story is the story the chapter opens on.
      handle.navigate("")
      await flush()
      expect(option(TANG_CHAPTER)?.getAttribute("aria-current")).toBe("true")
      expect(steps()).toHaveLength(TANG.story.length)

      handle.dispose()
    })

    it("opens the story an address names, with the step counted in that story", async () => {
      const handle = mountAtlas(
        root,
        first,
        undefined,
        { search: "?story=example-second&step=2", history: null },
        [first, second],
      )
      await flush()

      expect(option("example-second")?.getAttribute("aria-current")).toBe("true")
      expect(root.querySelector('[data-testid="atlas-arrival"]')?.textContent).toContain(
        "Story 2 of 3",
      )

      handle.dispose()
    })

    it("says so when an address names a story the chapter does not have", async () => {
      const handle = mountAtlas(
        root,
        first,
        undefined,
        { search: "?story=not-a-story", history: null },
        [first, second],
      )
      await flush()

      expect(option(TANG_CHAPTER)?.getAttribute("aria-current")).toBe("true")
      expect(root.querySelector('[data-testid="atlas-arrival"]')?.textContent).toContain(
        "no story “not-a-story”",
      )

      handle.dispose()
    })
  })

  it("writes the reader's moves to the address: a jump pushes, a selection replaces", async () => {
    const history = { push: vi.fn(), replace: vi.fn() }
    const handle = mountAtlas(root, TANG, undefined, { search: "", history })
    await flush()

    // Nothing is written for the address the workspace opened at.
    expect(history.push).not.toHaveBeenCalled()
    expect(history.replace).not.toHaveBeenCalled()

    root.querySelectorAll<HTMLElement>('[data-testid="atlas-story-step"]')[2]?.click()
    await flush()
    expect(history.push).toHaveBeenLastCalledWith(expect.stringMatching(/^\?event=/))

    await openTab(root, "events")
    root.querySelector<HTMLElement>('[data-testid="atlas-event-item"]')?.click()
    await flush()
    expect(history.replace).toHaveBeenCalledTimes(1)

    // Back: the workspace moves to the address without writing it again.
    handle.navigate("")
    await flush()
    expect(root.querySelector("#atlas-selection")).toBeNull()
    expect(history.push).toHaveBeenCalledTimes(1)
    expect(history.replace).toHaveBeenCalledTimes(1)

    handle.dispose()
  })

  it("keeps a long press on the globe and its controls from selecting the page", async () => {
    // iOS Safari starts a text selection from a long press on a non-text
    // surface, and it spreads over every panel. The surfaces a reader handles
    // opt out; the lists and the card stay selectable for copying citations.
    const handle = mountAtlas(root, TANG)
    await flush()

    for (const selector of [
      '[data-testid="atlas-globe"]',
      '[data-testid="atlas-dial"]',
      '[data-testid="atlas-minimap"]',
    ]) {
      const element = root.querySelector(selector)

      expect(element, selector).not.toBeNull()
      expect(element?.classList.contains("select-none"), selector).toBe(true)
      expect(element?.classList.contains("[-webkit-touch-callout:none]"), selector).toBe(true)
    }
    expect(
      root
        .querySelector('[data-testid="atlas-explore"], [role="tabpanel"]')
        ?.closest(".select-none"),
    ).toBeNull()

    handle.dispose()
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
