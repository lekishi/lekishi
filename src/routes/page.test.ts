// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { mount, unmount } from "svelte"
import { CHAPTERS, chapterPresentation } from "../lib/atlas/chapters"
import { QIN_CHAPTER, TANG_CHAPTER } from "../lib/atlas/chapter-registry"
import { windowLabel } from "../lib/atlas/labels"
import { chapterRelease } from "../lib/atlas/release"
import Home from "./+page.svelte"

/**
 * The root page's copy contract.
 *
 * The page presents the chapters as peers: each card carries the chapter's name,
 * its window, a story summary, an entry, and — in small print — its recorded
 * editorial decision. These tests pin that shape, and they pin what must not come
 * back: review-category labels, the contract and comparison-harness vocabulary
 * the page's readers do not share, and any wording that would make a chapter read
 * as released when its ledger row does not record an approval.
 * The cards are checked against the real chapter list, not a hand-written fixture.
 */

const mounted: Array<{ destroy: () => Promise<void> }> = []

function render(): HTMLElement {
  const host = document.createElement("div")
  document.body.append(host)

  const component = mount(Home, { target: host })
  mounted.push({
    destroy: async () => {
      await unmount(component)
      host.remove()
    },
  })

  return host
}

function cardFor(host: HTMLElement, id: string): HTMLElement {
  const card = host.querySelector<HTMLElement>(`[data-chapter-id="${id}"]`)

  if (card === null) {
    throw new Error(`the root page has no card for ${id}`)
  }

  return card
}

afterEach(async () => {
  for (const handle of mounted.splice(0, mounted.length)) {
    await handle.destroy()
  }
})

describe("the root page", () => {
  it("presents every chapter as a peer card with a name, a window, a story, and an entry", () => {
    const host = render()
    const cards = [...host.querySelectorAll("[data-chapter-id]")]

    expect(cards).toHaveLength(CHAPTERS.length)

    for (const chapter of CHAPTERS) {
      const card = cardFor(host, chapter.id)
      const link = card.querySelector("a")

      expect(card.querySelector("h3")?.textContent).toBe(chapter.name)
      expect(card.textContent).toContain(windowLabel(chapter.window))
      expect(card.textContent).toContain(chapter.summary)
      // The link is an ordinary chapter entry; its accessible name says which
      // chapter it opens, so two "Open the chapter" links stay distinguishable.
      expect(link?.getAttribute("href")).toBe(chapter.href)
      expect(link?.textContent).toContain("Open the chapter")
      expect(link?.textContent).toContain(chapter.name)
    }

    // Peers, in a stable order: the launch chapter first, the second chapter
    // next, both with the same structure.
    expect(cards.map((card) => card.getAttribute("data-chapter-id"))).toEqual(
      CHAPTERS.map((chapter) => chapter.id),
    )
  })

  it("keeps review categories and the project's own framing off the page", () => {
    const host = render()
    const text = host.textContent ?? ""

    // The exact framings the owner rejected. Ordinary words a historical summary
    // might need are deliberately not banned here: the page's prose is a copy
    // question, and `chapters.test.ts` pins the cards' own vocabulary.
    for (const marker of [
      "Reviewed chapter",
      "Comparison chapter",
      "comparison fixture",
      "comparison harness",
      "map treatments",
      "treatment comparison",
      "lekishi-historical-contract",
    ]) {
      expect(text, `the page still says ${marker}`).not.toContain(marker)
    }
  })

  it("keeps the approval line off an approved chapter's card", () => {
    const host = render()

    // The owner's decision of 2026-10-20: every served chapter is approved, so
    // the card states no decision; the chapter's page and About sheet do.
    for (const id of [TANG_CHAPTER, QIN_CHAPTER]) {
      const card = cardFor(host, id)

      expect(card.textContent, id).not.toContain(String(chapterRelease(id)?.decision))
      expect(card.textContent, id).not.toContain("Not independent or specialist review")
      expect(card.querySelector("[data-chapter-draft]"), id).toBeNull()
    }
  })

  it("leads with search, ahead of the chapter entries", () => {
    const host = render()
    const main = host.querySelector("main")
    const search = host.querySelector('[data-testid="home-search"]')
    const entries = [...(main?.querySelectorAll("a") ?? [])].filter((link) =>
      link.textContent?.includes("Open the chapter"),
    )

    // Search is the page's first action (RFD 5, "Home"); the chapter entries
    // follow it as peers, none of them set apart as the "real" chapter.
    expect(search?.textContent).toContain("Search")
    expect(entries).toHaveLength(CHAPTERS.length)
    for (const entry of entries) {
      expect(
        search !== null &&
          (search.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ).toBe(true)
    }
  })

  it("offers to continue where the reader left off, from this device only", async () => {
    localStorage.setItem(
      "lekishi:positions:v1",
      JSON.stringify({
        last: QIN_CHAPTER,
        chapters: {
          [QIN_CHAPTER]: {
            chapterId: QIN_CHAPTER,
            search: "?event=hanfei-death-233",
            label: "韓非 dies in Qin",
            at: 1,
          },
        },
      }),
    )
    const host = render()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const resume = host.querySelector('[data-testid="home-continue"]')

    expect(resume?.getAttribute("href")).toBe(`/chapters/${QIN_CHAPTER}?event=hanfei-death-233`)
    expect(resume?.textContent).toContain("韓非 dies in Qin")
    localStorage.clear()
  })
})
