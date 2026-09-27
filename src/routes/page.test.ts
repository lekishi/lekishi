// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { mount, unmount } from "svelte"
import { CHAPTERS, chapterPresentation } from "../lib/atlas/chapters"
import { COMPARISON_CHAPTER, COMPARISON_REVIEW } from "../lib/atlas/comparison"
import { windowLabel } from "../lib/atlas/labels"
import { RELEASE } from "../lib/atlas/release"
import Home from "./+page.svelte"

/**
 * The root page's copy contract.
 *
 * The page presents the chapters as peers: each card carries the chapter's name,
 * its window, a story summary, an entry, and — in small print — its editorial
 * state. These tests pin that shape, and they pin what must not come back:
 * review-category labels ("Reviewed chapter", "Comparison chapter"), the
 * contract and comparison-harness vocabulary the page's readers do not share,
 * and any wording that would make the unapproved Qin chapter read as released.
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

    // Peers, in a stable order: the launch chapter first, the prepared chapter
    // second, both with the same structure.
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
      "comparison harness",
      "map treatments",
      "lekishi-historical-contract",
    ]) {
      expect(text, `the page still says ${marker}`).not.toContain(marker)
    }
  })

  it("keeps each chapter's editorial state in its card's secondary metadata", () => {
    const host = render()
    const tang = cardFor(host, "tang-mission-750-754")
    const qin = cardFor(host, COMPARISON_CHAPTER)

    // Placement, not just presence: the rendered heading carries the name, the
    // rendered summary paragraph carries the summary, and the status is its own
    // paragraph after the entry — never inside the heading, the link, or the
    // summary. A reader meets the chapter first and its editorial state second.
    for (const [id, card] of [
      ["tang-mission-750-754", tang],
      [COMPARISON_CHAPTER, qin],
    ] as const) {
      const presentation = chapterPresentation(id)
      const paragraphs = [...card.querySelectorAll("p")]
      const renderedSummary = paragraphs.find(
        (paragraph) => paragraph.textContent === presentation?.summary,
      )
      const renderedStatus = paragraphs.find(
        (paragraph) => paragraph.textContent === presentation?.status,
      )
      const link = card.querySelector("a")

      expect(card.querySelector("h3")?.textContent).toBe(presentation?.name)
      expect(card.querySelector("h3")?.textContent).not.toContain(presentation?.status)
      expect(renderedSummary?.textContent).toBe(presentation?.summary)
      expect(renderedSummary?.textContent).not.toContain(presentation?.status)
      expect(renderedStatus?.textContent).toBe(presentation?.status)
      expect(link?.textContent).not.toContain(presentation?.status)
      // The status follows the entry in document order, so it reads as metadata
      // about the chapter rather than as part of the chapter's pitch.
      expect(
        link !== undefined &&
          link !== null &&
          renderedStatus !== undefined &&
          (link.compareDocumentPosition(renderedStatus) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        `${id}: status after the entry link`,
      ).toBe(true)
    }

    expect(tang.textContent).toContain(RELEASE.status)
    expect(tang.textContent).toContain(RELEASE.decidedOn)

    expect(qin.textContent).toContain(`${COMPARISON_REVIEW.label} · self-review only`)
    // No release decision exists for the Qin chapter: its card must not read as
    // approved, released, or reviewed by anyone but its preparing editor.
    expect(qin.textContent).not.toContain("Owner-approved")
    expect(qin.textContent).not.toContain("approved for release")
    expect(qin.textContent).not.toContain("specialist review recorded")
    // The Tang chapter's approval does not transfer to the Qin chapter.
    expect(cardFor(host, "tang-mission-750-754").textContent).not.toContain(COMPARISON_REVIEW.label)
  })

  it("leads with the atlas call to action, ahead of the chapter entries", () => {
    const host = render()
    const links = [...host.querySelectorAll("main a")]
    const first = links[0]

    expect(first?.getAttribute("href")).toBe("/atlas")
    expect(first?.textContent).toContain("Open the atlas")

    // The hero's call to action is the page's primary action; the chapter cards
    // follow it, and none of them is set apart as the "real" chapter.
    const text = host.querySelector("main")?.textContent ?? ""
    const atlas = text.indexOf("Open the atlas")
    const entries = links.filter((link) => link.textContent?.includes("Open the chapter"))

    expect(atlas).toBeGreaterThanOrEqual(0)
    expect(entries.length).toBe(CHAPTERS.length)
    expect(text.indexOf("Open the chapter")).toBeGreaterThan(atlas)
  })
})
