import { CHAPTER_MANIFESTS, servedChapter } from "./chapter-registry"
import { chapterRelease } from "./release"
import type { Chapter, TimeWindow } from "./domain"
import { reviewSummaryLabel } from "./labels"

/**
 * The chapters a reader can open, as the root page presents them.
 *
 * The name and the summary are the chapter manifest's `title` and `summary`:
 * presentation text written for a visitor, not contract records, but part of what
 * the owner's approval covers, so a card cannot change without a new approval.
 * The published story summary is written for the record's own readers, so it
 * describes the chapter's construction rather than the story. `chapters.test.ts`
 * pins every card against the served chapters — one card per served chapter, and
 * each card's window is the window the projection gives that chapter.
 *
 * The status line is restrained secondary metadata: it states each chapter's
 * approval and the specialist caveat, and it is deliberately not what the card
 * leads with or what a chapter is for; `release.test.ts` cross-checks each stated
 * date against the chapter's approval.
 *
 * A chapter's window is shown in the atlas's own year text (`750–754`,
 * `233 BCE–226 BCE`), never in the astronomical ordinals the domain computes
 * with.
 */
export type ChapterCard = {
  /** The chapter tree's id, which is also the id the contract carries. */
  readonly id: string
  /** The chapter's display name, as a reader sees it on the card and on its page. */
  readonly name: string
  /** The story summary: what a visitor follows when they open the chapter. */
  readonly summary: string
  /** The chapter's own coverage window, in the atlas's year text. */
  readonly window: TimeWindow
  /** Where the chapter opens. */
  readonly href: string
  /** The chapter's editorial decision, stated as secondary metadata. */
  readonly status: string
}

/**
 * Where a chapter's page lives. One route serves every chapter, keyed by the
 * chapter tree's id, so a card's target and the page's own route cannot drift
 * apart.
 */
export function chapterHref(id: string): string {
  return `/chapters/${id}`
}

export const CHAPTERS: readonly ChapterCard[] = CHAPTER_MANIFESTS.filter(
  (manifest) => servedChapter(manifest.id) !== undefined,
).map((manifest) => ({
  id: manifest.id,
  name: manifest.title,
  summary: manifest.summary,
  window: manifest.window,
  href: chapterHref(manifest.id),
  status: chapterRelease(manifest.id)?.status ?? "",
}))

/**
 * The card for a chapter id, or undefined when the chapter has no card. Callers
 * fall back to the chapter's own published title, so a chapter that is not in
 * this list still renders; every served chapter has a card, so the fallback is a
 * safety net rather than a path the product ships on.
 */
export function chapterPresentation(id: string): ChapterCard | undefined {
  return CHAPTERS.find((chapter) => chapter.id === id)
}

/**
 * What a chapter's page states beside its name: the display name a reader meets
 * on the card, and the recorded decision (or, for a chapter without a card, the
 * review independence its own publication records). The page and the card cannot
 * describe the same chapter differently.
 */
export type ChapterHeading = {
  readonly name: string
  readonly decision: string
  readonly status: string
}

export function chapterHeading(chapter: Chapter): ChapterHeading {
  const card = chapterPresentation(chapter.id)

  if (card === undefined) {
    const fallback = reviewSummaryLabel(chapter.publication.independence)

    return { name: chapter.title, decision: fallback, status: fallback }
  }

  return {
    name: card.name,
    decision:
      chapterRelease(card.id)?.decision ?? reviewSummaryLabel(chapter.publication.independence),
    status: card.status,
  }
}
