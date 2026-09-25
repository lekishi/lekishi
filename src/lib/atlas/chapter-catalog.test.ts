import { describe, expect, it } from "vitest"
import { loadChapter } from "../historical/chapter"
import { loadChapterContent } from "./chapter-catalog"
import { CHAPTER, PRODUCTION_COVERAGE } from "./chapter-content"
import { projectChapter } from "./projection"

/**
 * The comparison catalog.
 *
 * The Qin fixture loads through the same browser-safe projection as the
 * production chapter, and the comparison review route is what loads it. This
 * suite runs through Vite's module graph (the lazy `import.meta.glob` maps), so
 * it proves the fixture loads in a browser build, and it pins that the
 * production chapter is untouched and that an unknown chapter fails instead of
 * rendering nothing.
 */

const QIN = "qin-conquest-han-233-226"

/** The Qin fixture's own coverage model, as its README records it (233–226 BCE). */
const QIN_COVERAGE = { defaultWindow: { start: -232, end: -225 } }

describe("the comparison catalog", () => {
  it("loads the Qin fixture through the same browser-safe path as the production chapter", async () => {
    const chapter = await loadChapterContent(QIN, QIN_COVERAGE)
    const tree = loadChapter(QIN)
    const projected = projectChapter(QIN, tree.documents, tree.sets, QIN_COVERAGE)

    if (!projected.ok) {
      throw new Error(projected.errors.join("\n"))
    }

    expect(chapter).toEqual(projected.chapter)
    expect(chapter.id).toBe(QIN)
    expect(chapter.events).toHaveLength(5)
    expect(chapter.places).toHaveLength(4)
    expect(chapter.defaultWindow).toEqual(QIN_COVERAGE.defaultWindow)
    expect(chapter.publication.independence).toBe("self_review")
  })

  it("keeps the production chapter separate from the comparison fixture", () => {
    expect(CHAPTER.id).toBe("tang-mission-750-754")
    expect(CHAPTER.defaultWindow).toEqual(PRODUCTION_COVERAGE.defaultWindow)
    expect(JSON.stringify(CHAPTER)).not.toContain(QIN)
  })

  it("loads the fixture with the corrected revisions the review route shows", async () => {
    const chapter = await loadChapterContent(QIN, QIN_COVERAGE)
    const death = chapter.events.find((event) => event.id === "lks:event:hanfei-death-233")

    // The dispute the internal review corrected is what the review route renders:
    // each account's own dating, and no claim that they agree.
    expect(death?.dispute?.status).toBe("disputed")
    expect(death?.dispute?.summary).toContain("王安五年")
    expect(death?.dispute?.summary).not.toContain("agree")
    expect(death?.dispute?.accounts).toHaveLength(2)
    expect(chapter.events.every((event) => event.dispute === null || event.id === death?.id)).toBe(
      true,
    )
  })

  it("fails on a chapter the content tree does not carry", async () => {
    await expect(loadChapterContent("invented-chapter", QIN_COVERAGE)).rejects.toThrow(
      /cannot be projected/,
    )
  })
})
