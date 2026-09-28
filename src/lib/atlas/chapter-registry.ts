import type { ChapterCoverage } from "./projection"

/**
 * The chapters the site serves.
 *
 * One list, one entry per chapter tree the product renders, each with the
 * coverage model its own README and story window define. The chapter route
 * enumerates this list to prerender, the root page's cards are keyed by these
 * ids, and `scripts/check-chapter.mjs` reads it through the publication approval
 * gate: a chapter in this list must be one the owner approved, because the list
 * is exactly what a reader can open. A chapter that is prepared for review but
 * not yet decided stays out of the list — its set keeps its `preparation
 * snapshot` row and the site does not serve it.
 *
 * The coverage window is content, not copy: it is the window the projection
 * opens the chapter on, and the chapter's published story window is cross-checked
 * against it in the chapter's own tests.
 */

/** The Tang chapter: the 750–754 embassy of 藤原朝臣清河, with coda nodes outside it. */
export const TANG_CHAPTER = "tang-mission-750-754"

/** The Qin chapter: the end of the state of Han, 233–226 BCE. */
export const QIN_CHAPTER = "qin-conquest-han-233-226"

/**
 * The Tang chapter's coverage model: the 750–754 primary mission window its
 * README and contract test define. The projection takes the window from its
 * caller, so a chapter names its own without a chapter branch inside the
 * projection.
 */
export const TANG_COVERAGE: ChapterCoverage = { defaultWindow: { start: 750, end: 754 } }

/**
 * The Qin chapter's coverage model: the end of the state of Han, 233–226 BCE, in
 * the astronomical ordinals the contract's normalized endpoints use (233 BCE is
 * -232). The chapter's README records the same window and its story record names
 * it.
 */
export const QIN_COVERAGE: ChapterCoverage = { defaultWindow: { start: -232, end: -225 } }

/** A chapter the site serves: its tree id and the coverage model it owns. */
export type ServedChapter = {
  readonly id: string
  readonly coverage: ChapterCoverage
}

export const SERVED_CHAPTERS: readonly ServedChapter[] = [
  { id: TANG_CHAPTER, coverage: TANG_COVERAGE },
  { id: QIN_CHAPTER, coverage: QIN_COVERAGE },
]

/** The served entry for a chapter id, or undefined when the site does not serve it. */
export function servedChapter(id: string): ServedChapter | undefined {
  return SERVED_CHAPTERS.find((chapter) => chapter.id === id)
}

/**
 * What the served list must satisfy against the chapter trees that exist: every
 * served chapter has a tree, and no chapter is served twice. A tree that is not
 * served is deliberately not a violation — that is a chapter prepared for review,
 * which has a tree, no page, and its own `preparation snapshot` row.
 *
 * The predicate is exported so it can be exercised against a tree list that has
 * an unserved chapter in it; against today's two trees, an equality check between
 * the served list and the trees would pass too, which is exactly the assertion
 * this rule replaced.
 */
export function servedChapterViolations(
  served: readonly ServedChapter[],
  trees: readonly string[],
): string[] {
  const violations: string[] = []
  const ids = served.map((chapter) => chapter.id)
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)

  for (const id of new Set(duplicates)) {
    violations.push(`${id} is served more than once`)
  }

  for (const id of ids) {
    if (!trees.includes(id)) {
      violations.push(`${id} is served but has no chapter tree`)
    }
  }

  return violations
}
