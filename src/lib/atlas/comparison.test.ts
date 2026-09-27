import { describe, expect, it } from "vitest"
import { loadChapter } from "../historical/chapter"
import { isObject, listOf, objectOf, type JsonObject } from "../historical/contract/types"
import { CHAPTER as PRODUCTION_CHAPTER } from "./chapter-content"
import { loadChapterContent } from "./chapter-catalog"
import {
  COMPARISON_CHAPTER,
  COMPARISON_COVERAGE,
  COMPARISON_REVIEW,
  COMPARISON_TITLE,
} from "./comparison"
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
  // astronomical ordinals, where 233 BCE is -232. Assert the era rather than
  // assuming it, so a CE year cannot be converted as if it were BCE.
  expect(start["era"], "window start era").toBe("bce")
  expect(end["era"], "window end era").toBe("bce")

  return { start: 1 - Number(start["year"]), end: 1 - Number(end["year"]) }
}

describe("the comparison review fixture", () => {
  it("loads the Qin fixture through the comparison catalog", async () => {
    const chapter = await loadChapterContent(COMPARISON_CHAPTER, COMPARISON_COVERAGE)

    expect(chapter.id).toBe("qin-conquest-han-233-226")
    expect(chapter.events).toHaveLength(5)
    expect(chapter.places).toHaveLength(4)
    expect(chapter.publication.independence).toBe("self_review")

    // The catalog passes the caller's coverage through to the projection: the
    // loaded chapter opens in the fixture's own window, not a default.
    expect(chapter.defaultWindow).toEqual(storyWindow())
    expect(chapter.defaultWindow).toEqual(COMPARISON_COVERAGE.defaultWindow)
  })

  it("passes the window the fixture's own story publishes, in BCE years", () => {
    expect(COMPARISON_COVERAGE.defaultWindow).toEqual(storyWindow())
    expect(windowLabel(COMPARISON_COVERAGE.defaultWindow)).toBe("233 BCE–226 BCE")
  })

  it("is a comparison chapter, not the production chapter", () => {
    // The production atlas still binds the reviewed Tang chapter; the fixture is
    // reachable only through this route's catalog.
    expect(COMPARISON_CHAPTER).not.toBe(PRODUCTION_CHAPTER.id)
    expect(PRODUCTION_CHAPTER.id).toBe("tang-mission-750-754")
  })

  it("states that the fixture is unapproved preparation, not a launch chapter", () => {
    expect(COMPARISON_REVIEW.label).toBe("Unapproved preparation")
    expect(COMPARISON_REVIEW.note).toContain("no release decision exists")
    expect(COMPARISON_REVIEW.note).toContain("not a launch chapter")
    expect(JSON.stringify(COMPARISON_REVIEW)).not.toContain("owner approved")
  })

  it("names the fixture the entry point and the route both show", async () => {
    // The root page's review card names the fixture; the route shows the loaded
    // chapter. Both take the title from this module, so a renamed story fails
    // here instead of leaving the entry point describing another chapter.
    const chapter = await loadChapterContent(COMPARISON_CHAPTER, COMPARISON_COVERAGE)

    expect(COMPARISON_TITLE).toBe(chapter.title)
  })

  it("shows the corrected dispute and leaves the corrected records' readings visible", async () => {
    const chapter = await loadChapterContent(COMPARISON_CHAPTER, COMPARISON_COVERAGE)
    const death = chapter.events.find((event) => event.id === "lks:event:hanfei-death-233")

    expect(death?.dispute?.status).toBe("disputed")
    expect(death?.dispute?.accounts).toHaveLength(2)

    // Four events are shown, each at a label anchor: the fixture asserts no
    // historical coordinate anywhere. The 231 BCE cession is the exception —
    // its place has no sourced identification, so the atlas claims no position
    // for it and the details surface says so in words.
    expect(chapter.events.filter((event) => event.placement.kind === "point")).toHaveLength(4)

    for (const event of chapter.events.filter(
      (candidate) => candidate.placement.kind === "point",
    )) {
      expect(event.placement, event.id).toMatchObject({ basis: "display-anchor" })
    }

    expect(
      chapter.events.find((event) => event.id === "lks:event:han-nanyang-cession-231")?.placement,
    ).toMatchObject({ kind: "none", reason: "no-position", label: "南陽" })

    expect(chapter.places.filter((place) => place.placement === "display-anchor")).toHaveLength(3)
    expect(chapter.places.filter((place) => place.placement === "unknown")).toHaveLength(1)
  })
})
