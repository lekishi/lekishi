import { DRAFTS, CHAPTERS as MANIFESTS, type ChapterEntry } from "virtual:lekishi-chapters"
import type { ChapterCoverage } from "./projection"

/**
 * The chapters the site serves.
 *
 * The list is the chapter manifests in `historical/chapters/` whose approval
 * matches their content (RFD 2): an approved chapter is served, and a draft or
 * stale chapter is left out of a production build, this list included. A build
 * that serves drafts (development and pull-request previews, never production)
 * also serves every other chapter, and `release.ts` states on each of them that it
 * is a draft. The chapter
 * route enumerates this list to prerender, the root page's cards are keyed by
 * these ids, and search covers exactly these chapters, so the list is exactly
 * what a reader can open.
 *
 * The coverage window is content, not copy: it is the manifest's `window`, the
 * window the projection opens the chapter on, and each story's own window.
 */

/** The Tang chapter: the 750–754 embassy of 藤原朝臣清河, with coda nodes outside it. */
export const TANG_CHAPTER = "tang-mission-750-754"

/** The Qin chapter: the end of the state of Han, 233–226 BCE. */
export const QIN_CHAPTER = "qin-conquest-han-233-226"

/** Every chapter manifest the build serves: the approved ones, and on a draft build all of them. */
export const CHAPTER_MANIFESTS: readonly ChapterEntry[] = MANIFESTS

/** Whether this build serves the chapters without a matching approval, as drafts. */
export const DRAFTS_SERVED: boolean = DRAFTS

/** A chapter the site serves: its tree id and the coverage model it owns. */
export type ServedChapter = {
  readonly id: string
  readonly coverage: ChapterCoverage
}

export const SERVED_CHAPTERS: readonly ServedChapter[] = MANIFESTS.filter(
  (chapter) => chapter.served,
).map((chapter) => ({ id: chapter.id, coverage: coverageOf(chapter) }))

/** A chapter's coverage model: the window it opens on and its stories' own. */
export function coverageOf(chapter: ChapterEntry): ChapterCoverage {
  return {
    defaultWindow: chapter.window,
    stories: chapter.stories.map(({ key, title, window }) => ({ key, title, window })),
  }
}

/** The served entry for a chapter id, or undefined when the site does not serve it. */
export function servedChapter(id: string): ServedChapter | undefined {
  return SERVED_CHAPTERS.find((chapter) => chapter.id === id)
}

/**
 * What the served list must satisfy against the chapter manifests that exist:
 * every served chapter has a manifest, and no chapter is served twice. A
 * manifest that is not served is deliberately not a violation — that is a draft,
 * which has a manifest and no page.
 *
 * The predicate is exported so it can be exercised against a manifest list that
 * has an unserved chapter in it.
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
      violations.push(`${id} is served but has no chapter manifest`)
    }
  }

  return violations
}
