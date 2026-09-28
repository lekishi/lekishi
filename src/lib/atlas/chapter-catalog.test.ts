import { describe, expect, it } from "vitest"
import { listChapters, loadChapter } from "../historical/chapter"
import { loadChapterContent, loadServedChapter, projectChapterContent } from "./chapter-catalog"
import {
  QIN_CHAPTER,
  QIN_COVERAGE,
  SERVED_CHAPTERS,
  TANG_CHAPTER,
  TANG_COVERAGE,
  servedChapter,
  servedChapterViolations,
} from "./chapter-registry"
import { projectChapter } from "./projection"

/**
 * The served-chapter catalog.
 *
 * Every chapter the site serves loads through this one browser-safe path, and the
 * route that renders a chapter passes the coverage model the registry gives it.
 * This suite runs through Vite's module graph (the lazy `import.meta.glob` maps),
 * so it proves each chapter loads in a browser build; it pins that the served list
 * covers exactly the chapter trees the site carries, that a chapter's loaded
 * window is its own, and that an unknown chapter fails instead of rendering
 * nothing.
 */

describe("the served chapter catalog", () => {
  it("loads the Tang chapter through the same path every chapter uses", async () => {
    const chapter = await loadServedChapter(TANG_CHAPTER)
    const tree = loadChapter(TANG_CHAPTER)
    const projected = projectChapter(TANG_CHAPTER, tree.documents, tree.sets, TANG_COVERAGE)

    if (!projected.ok) {
      throw new Error(projected.errors.join("\n"))
    }

    expect(chapter).toEqual(projected.chapter)
    expect(chapter.id).toBe(TANG_CHAPTER)
    expect(chapter.defaultWindow).toEqual(TANG_COVERAGE.defaultWindow)
    expect(chapter.events).toHaveLength(29)
    expect(chapter.places).toHaveLength(15)
    expect(chapter.publication.independence).toBe("self_review")
  })

  it("loads the Qin chapter through the same path every chapter uses", async () => {
    const chapter = await loadServedChapter(QIN_CHAPTER)
    const tree = loadChapter(QIN_CHAPTER)
    const projected = projectChapter(QIN_CHAPTER, tree.documents, tree.sets, QIN_COVERAGE)

    if (!projected.ok) {
      throw new Error(projected.errors.join("\n"))
    }

    expect(chapter).toEqual(projected.chapter)
    expect(chapter.id).toBe(QIN_CHAPTER)
    expect(chapter.defaultWindow).toEqual(QIN_COVERAGE.defaultWindow)
    expect(chapter.events).toHaveLength(5)
    expect(chapter.places).toHaveLength(4)
  })

  it("gives each chapter its own window rather than one shared default", async () => {
    const tang = await loadServedChapter(TANG_CHAPTER)
    const qin = await loadServedChapter(QIN_CHAPTER)

    expect(tang.defaultWindow).toEqual({ start: 750, end: 754 })
    expect(qin.defaultWindow).toEqual({ start: -232, end: -225 })
    expect(tang.defaultWindow).not.toEqual(qin.defaultWindow)
  })

  it("serves chapter trees that exist, each exactly once", () => {
    // A served entry for a tree that does not exist would fail to load, and a
    // duplicate entry would prerender the same chapter twice. The served list is
    // deliberately a subset of the trees, not an equality: a chapter that is
    // prepared for review but not served has a tree, no served entry, and no page
    // (the publication approval gate covers it as a `preparation snapshot`).
    expect(servedChapterViolations(SERVED_CHAPTERS, listChapters())).toEqual([])

    expect(SERVED_CHAPTERS.map((chapter) => chapter.id)).toContain(TANG_CHAPTER)
    expect(SERVED_CHAPTERS.map((chapter) => chapter.id)).toContain(QIN_CHAPTER)
    expect(servedChapter(TANG_CHAPTER)?.coverage).toEqual(TANG_COVERAGE)
    expect(servedChapter(QIN_CHAPTER)?.coverage).toEqual(QIN_COVERAGE)
    expect(servedChapter("invented-chapter")).toBeUndefined()
  })

  it("allows a chapter tree that is prepared but not served", () => {
    // The rule the served list replaced: an equality check between the served
    // list and the chapter trees would fail on a chapter that is prepared for
    // review and deliberately not served. This case is what keeps the rule from
    // being tightened back to that.
    const trees = [...listChapters(), "prepared-but-unserved"]

    expect(servedChapterViolations(SERVED_CHAPTERS, trees)).toEqual([])
    // A served chapter with no tree, or one served twice, is still refused.
    expect(
      servedChapterViolations([{ id: "prepared-but-unserved", coverage: TANG_COVERAGE }], trees),
    ).toEqual([])
    expect(
      servedChapterViolations(
        [...SERVED_CHAPTERS, { id: "no-tree", coverage: TANG_COVERAGE }],
        trees,
      ),
    ).toContain("no-tree is served but has no chapter tree")
    expect(servedChapterViolations([...SERVED_CHAPTERS, SERVED_CHAPTERS[0]!], trees)).toContain(
      `${TANG_CHAPTER} is served more than once`,
    )
  })

  it("fails on a chapter the content tree does not carry", async () => {
    await expect(loadServedChapter("invented-chapter")).rejects.toThrow(/not a served chapter/)
    await expect(loadChapterContent("invented-chapter", TANG_COVERAGE)).rejects.toThrow(
      /cannot be projected/,
    )
  })

  it("reports every representability error instead of returning a partial chapter", () => {
    expect(() => projectChapterContent("empty-chapter", [], [], TANG_COVERAGE)).toThrow(
      /the chapter empty-chapter cannot be projected/,
    )
  })
})
