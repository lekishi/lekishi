import { describe, expect, it } from "vitest"
import { listChapters } from "../historical/chapter"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, SERVED_CHAPTERS, TANG_CHAPTER } from "./chapter-registry"
import { CHAPTERS, chapterHeading, chapterHref, chapterPresentation } from "./chapters"
import { chapterRelease, type ChapterRelease } from "./release"
import { yearLabel } from "./labels"

/**
 * The chapter cards' contract.
 *
 * The root page presents the chapters from `chapters.ts`, so these tests pin the
 * list against the content instead of against the copy: every served chapter has
 * exactly one card, each card shows the window the projection gives its chapter,
 * and each card opens where that chapter is served. They also keep the cards
 * user-facing — the name and summary must not read as production notes about
 * contract sets, review categories, or preparation state — and keep an approved
 * chapter's card free of its approval line, which lives in the chapter's own
 * page and About sheet (the owner's decision of 2026-10-20).
 */

/** A served chapter's recorded decision, which every served chapter has. */
function release(id: string): ChapterRelease {
  const recorded = chapterRelease(id)

  if (recorded === undefined) {
    throw new Error(`${id} is served without an approval`)
  }

  return recorded
}

describe("the chapter cards", () => {
  it("covers every served chapter exactly once, by id and by name", () => {
    const ids = CHAPTERS.map((chapter) => chapter.id)
    const names = CHAPTERS.map((chapter) => chapter.name)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
    // The cards and the served list are the same set: a served chapter that has
    // no card, or a card for a chapter the site does not serve, fails here. A
    // chapter tree that is prepared but not served has neither, which is what
    // lets a review chapter exist without shipping.
    expect([...ids].sort()).toEqual(SERVED_CHAPTERS.map((chapter) => chapter.id).sort())

    for (const chapter of CHAPTERS) {
      expect(listChapters(), `${chapter.id} has a card but no chapter tree`).toContain(chapter.id)
    }

    expect(ids).toContain(TANG_CHAPTER)
    expect(ids).toContain(QIN_CHAPTER)
  })

  it("shows each chapter the window the projection gives that chapter", async () => {
    const tang = await loadServedChapter(TANG_CHAPTER)
    const qin = await loadServedChapter(QIN_CHAPTER)

    // The window is content, not copy: it must be the window the atlas opens the
    // chapter on, or the card would advertise a span the chapter does not cover.
    expect(chapterPresentation(TANG_CHAPTER)?.window).toEqual(tang.defaultWindow)
    expect(chapterPresentation(QIN_CHAPTER)?.window).toEqual(qin.defaultWindow)
  })

  it("names each chapter and summarises its story for a visitor", () => {
    for (const chapter of CHAPTERS) {
      expect(chapter.name.trim(), chapter.id).not.toBe("")
      expect(chapter.summary.trim(), chapter.id).not.toBe("")
      // Orientation, not decoration: the summary names a year from the chapter's
      // own window, so a card cannot read as a story about another span.
      expect(chapter.summary, chapter.id).toContain(yearLabel(chapter.window.start))
    }
  })

  it("keeps the project's own categories off the cards", () => {
    // The page is a reader's entry point, not the project's notes. The list pins
    // the exact framings the owner rejected — a review category, the comparison
    // harness, the contract id — rather than ordinary words a historical summary
    // may legitimately need (a "comparison" between two readings, say). A
    // paraphrase is a copy-review question, not a substring rule.
    const internals = [
      "reviewed chapter",
      "comparison chapter",
      "comparison fixture",
      "comparison harness",
      "map treatments",
      "treatment comparison",
      "lekishi-historical-contract",
      "preparation snapshot",
      "self_review",
    ]

    for (const chapter of CHAPTERS) {
      const card = `${chapter.name}\n${chapter.summary}`.toLowerCase()

      for (const marker of internals) {
        expect(card, `${chapter.id} card names ${marker}`).not.toContain(marker)
      }
    }
  })

  it("states no approval on an approved chapter's card", () => {
    for (const id of [TANG_CHAPTER, QIN_CHAPTER]) {
      const card = chapterPresentation(id)

      // Every chapter production serves is approved, so the line would set no
      // card apart; the decision and its caveat stay on the chapter's page.
      expect(release(id).status, id).toContain("Owner-approved for release")
      expect(card?.status, id).toBe("")
      expect(card?.draft, id).toBe(false)
    }
  })

  it("opens each chapter where the product serves it", () => {
    expect(chapterPresentation(TANG_CHAPTER)?.href).toBe("/chapters/tang-mission-750-754")
    expect(chapterPresentation(QIN_CHAPTER)?.href).toBe("/chapters/qin-conquest-han-233-226")
    expect(chapterHref(TANG_CHAPTER)).toBe(chapterPresentation(TANG_CHAPTER)?.href)
    // An unknown id has no card, so callers fall back to the chapter's own
    // published title instead of rendering an invented one.
    expect(chapterPresentation("no-such-chapter")).toBeUndefined()
  })

  it("states a chapter's heading from its card, and falls back to the publication", async () => {
    const tang = await loadServedChapter(TANG_CHAPTER)
    const heading = chapterHeading(tang)

    expect(heading.name).toBe("The embassy to Tang China")
    expect(heading.decision).toBe(release(TANG_CHAPTER).decision)
    expect(heading.status).toBe(release(TANG_CHAPTER).status)

    // A chapter without a card still renders: the heading uses the chapter's own
    // published title and the review independence its publication records.
    const other = { ...tang, id: "no-card-chapter" }
    const fallback = chapterHeading(other)

    expect(fallback.name).toBe(tang.title)
    expect(fallback.decision).toBe("Self-review only")
    expect(fallback.status).toBe("Self-review only")
  })
})
