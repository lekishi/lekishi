import { describe, expect, it } from "vitest"
import { loadChapter } from "../historical/chapter"
import { isObject, listOf, objectOf, type JsonObject } from "../historical/contract/types"
import { loadChapterContent } from "./chapter-catalog"
import { COMPARISON_CHAPTER, COMPARISON_COVERAGE, COMPARISON_REVIEW } from "./comparison"
import { windowLabel } from "./labels"

/**
 * The comparison review route's own contract.
 *
 * The route renders the bounded Qin fixture so the owner can inspect the
 * corrected revisions the internal review prepared. These tests pin the three
 * things the route must not get wrong: which chapter it loads, the coverage
 * window it passes (cross-checked against the fixture's published story window,
 * not restated), and the unapproved status it states. The fixture's content is
 * pinned by `src/lib/historical/contract/qin-chapter.test.ts`.
 */

const STORY = "lks:story:qin-conquest-han-233-226"

/** The fixture's published story window, as the contract carries it. */
function storyWindow(): { start: number; end: number } {
  const tree = loadChapter(COMPARISON_CHAPTER)
  const story = tree.documents.find(
    (document): document is JsonObject => isObject(document) && document["record_id"] === STORY,
  )

  if (story === undefined) {
    throw new Error(`${STORY} is not in the fixture tree`)
  }

  const mirror = objectOf(story["publication"])
  const revision = listOf(story["revisions"])
    .map(objectOf)
    .find((candidate) => candidate["revision_id"] === mirror["published_revision_id"])

  if (revision === undefined) {
    throw new Error(`${STORY} has no published revision`)
  }

  const window = objectOf(objectOf(revision["content"])["window"])
  const start = objectOf(window["start"])
  const end = objectOf(window["end"])

  // The contract's endpoints are BCE years; the atlas computes in the
  // astronomical ordinals, where 233 BCE is -232.
  return { start: 1 - Number(start["year"]), end: 1 - Number(end["year"]) }
}

describe("the comparison review fixture", () => {
  it("loads the Qin fixture through the comparison catalog", async () => {
    const chapter = await loadChapterContent(COMPARISON_CHAPTER, COMPARISON_COVERAGE)

    expect(chapter.id).toBe("qin-conquest-han-233-226")
    expect(chapter.events).toHaveLength(5)
    expect(chapter.places).toHaveLength(4)
    expect(chapter.publication.independence).toBe("self_review")
  })

  it("passes the window the fixture's own story publishes, in BCE years", () => {
    expect(COMPARISON_COVERAGE.defaultWindow).toEqual(storyWindow())
    expect(windowLabel(COMPARISON_COVERAGE.defaultWindow)).toBe("233 BCE–226 BCE")
  })

  it("states that the fixture is unapproved preparation, not a launch chapter", () => {
    expect(COMPARISON_REVIEW.label).toBe("Unapproved preparation")
    expect(COMPARISON_REVIEW.note).toContain("no release decision exists")
    expect(COMPARISON_REVIEW.note).toContain("not a launch chapter")
    expect(JSON.stringify(COMPARISON_REVIEW)).not.toContain("owner approved")
  })

  it("shows the corrected dispute and leaves the corrected records' readings visible", async () => {
    const chapter = await loadChapterContent(COMPARISON_CHAPTER, COMPARISON_COVERAGE)
    const death = chapter.events.find((event) => event.id === "lks:event:hanfei-death-233")

    expect(death?.dispute?.status).toBe("disputed")
    expect(death?.dispute?.accounts).toHaveLength(2)
    // The death is the fixture's only placed-by-nothing event with a dispute; the
    // revolt is the one event the map can show.
    expect(chapter.events.filter((event) => event.placement.kind === "point")).toHaveLength(1)
  })
})
