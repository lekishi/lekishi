import { describe, expect, it } from "vitest"
import { listChapters } from "../historical/chapter"
import { CHAPTER as PRODUCTION_CHAPTER } from "./chapter-content"
import { loadChapterContent } from "./chapter-catalog"
import { CHAPTERS, chapterPresentation } from "./chapters"
import { COMPARISON_CHAPTER, COMPARISON_COVERAGE, COMPARISON_REVIEW } from "./comparison"
import { yearLabel } from "./labels"
import { RELEASE } from "./release"

/**
 * The chapter cards' contract.
 *
 * The root page presents the chapters from `chapters.ts`, so these tests pin the
 * list against the content instead of against the copy: every chapter tree has
 * exactly one card, each card shows the window the projection gives its chapter,
 * and each card opens where that chapter is served. They also keep the cards
 * user-facing — the name and summary must not read as production notes about
 * contract sets, comparison harnesses, or preparation state — and keep each
 * chapter's editorial state in the status line, where it is secondary metadata
 * rather than the chapter's identity.
 */

const TANG = PRODUCTION_CHAPTER.id

describe("the chapter cards", () => {
  it("covers every chapter tree exactly once, by id and by name", () => {
    const ids = CHAPTERS.map((chapter) => chapter.id)
    const names = CHAPTERS.map((chapter) => chapter.name)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
    // A chapter directory that has no card, or a card for a chapter that does
    // not exist, fails here: the page cannot describe a chapter the atlas does
    // not carry.
    expect([...ids].sort()).toEqual(listChapters())
    expect(ids).toContain(TANG)
    expect(ids).toContain(COMPARISON_CHAPTER)
  })

  it("shows each chapter the window the projection gives that chapter", async () => {
    const qin = await loadChapterContent(COMPARISON_CHAPTER, COMPARISON_COVERAGE)

    // The window is content, not copy: it must be the window the atlas opens the
    // chapter on, or the card would advertise a span the chapter does not cover.
    expect(chapterPresentation(TANG)?.window).toEqual(PRODUCTION_CHAPTER.defaultWindow)
    expect(chapterPresentation(qin.id)?.window).toEqual(qin.defaultWindow)
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
    // may legitimately need ("publication", "revision", "contract" as a treaty,
    // or "treatment" in prose). A paraphrase is a copy-review question, not a
    // substring rule.
    const internals = [
      "reviewed chapter",
      "comparison chapter",
      "comparison harness",
      "map treatments",
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

  it("states each chapter's editorial state as secondary metadata", () => {
    const tang = chapterPresentation(TANG)
    const qin = chapterPresentation(COMPARISON_CHAPTER)

    expect(tang?.status).toBe(RELEASE.status)
    expect(tang?.status).toContain("Owner-approved for release")
    expect(tang?.status).toContain(RELEASE.decidedOn)
    // The owner's editorial approval is not review, and the line must keep
    // saying so rather than reading as independent or specialist sign-off.
    expect(tang?.status).toContain("Not independent or specialist review")

    expect(qin?.status).toBe(`${COMPARISON_REVIEW.label} · self-review only`)
    expect(qin?.status).toContain("Unapproved preparation")
    // Discoverability must not read as release, and neither card may claim an
    // approval the ledger does not record for its chapter.
    expect(qin?.status).not.toContain("Owner-approved")
    expect(qin?.status).not.toContain("approved for release")
  })

  it("opens each chapter where the product serves it", () => {
    expect(chapterPresentation(TANG)?.href).toBe("/atlas")
    expect(chapterPresentation(COMPARISON_CHAPTER)?.href).toBe("/compare/qin")
    // An unknown id has no card, so callers fall back to the chapter's own
    // published title instead of rendering an invented one.
    expect(chapterPresentation("no-such-chapter")).toBeUndefined()
  })
})
