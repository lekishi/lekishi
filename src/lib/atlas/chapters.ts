import { CHAPTER_MANIFESTS, servedChapter } from "./chapter-registry"
import { chapterDraft, chapterRelease } from "./release"
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
 * An approved chapter's card carries no status line. Every chapter production
 * serves is approved, so the line told a reader nothing that set one chapter
 * apart, and the owner decided on 2026-10-20 to drop it: the decision and the
 * specialist-review caveat stay in the chapter's About sheet and in its
 * prerendered page. Only a draft, which only development and pull-request
 * previews serve, keeps a status line, so it can never read as approved.
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
  /** The card's status line: a draft's statement, or empty for an approved chapter. */
  readonly status: string
  /**
   * Whether the chapter is a draft this build serves without the owner's
   * approval. Only development and pull-request previews have one, and the
   * card says so before anything else.
   */
  readonly draft: boolean
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
  status: chapterDraft(manifest.id)?.status ?? "",
  draft: chapterDraft(manifest.id) !== undefined,
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
  /** Whether the page keeps a draft banner on screen: a draft this build serves. */
  readonly draft: boolean
}

export function chapterHeading(chapter: Chapter): ChapterHeading {
  const card = chapterPresentation(chapter.id)

  if (card === undefined) {
    const fallback = reviewSummaryLabel(chapter.publication.independence)

    return { name: chapter.title, decision: fallback, status: fallback, draft: false }
  }

  const draft = chapterDraft(card.id)

  return {
    name: card.name,
    decision:
      chapterRelease(card.id)?.decision ??
      draft?.decision ??
      reviewSummaryLabel(chapter.publication.independence),
    status: chapterRelease(card.id)?.status ?? draft?.status ?? card.status,
    draft: draft !== undefined,
  }
}
