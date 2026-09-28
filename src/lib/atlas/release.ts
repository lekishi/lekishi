import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"

/**
 * The editorial state the chapter cards and pages state, one entry per served
 * chapter.
 *
 * A chapter's set document is frozen on purpose: the owner's editorial approval
 * under RFD 2 was recorded against its canonical digest, and editing the set
 * would change that digest and invalidate the decision. Every set's `review`
 * block records only the preparing editor's `self_review`, so the atlas states
 * the decision the RFD 2 ledger records rather than the set's own earlier
 * wording. The wording lives here so the cards, the chapter pages, and their
 * tests state the decision the same way; `release.test.ts` reads the ledger and
 * the sets: a stated date must be the date the chapter's row records, and no line
 * may describe the content as reviewed beyond the `self_review` it carries.
 */

/** One chapter's recorded decision: the short line and the card's full status. */
export type ChapterRelease = {
  /** The date the chapter's ledger row records for the owner's editorial approval. */
  readonly decidedOn: string
  /** The short decision line a page states beside the chapter's name. */
  readonly decision: string
  /** The chapter card's restrained, secondary status line. */
  readonly status: string
}

/**
 * The owner's editorial approval under RFD 2, as a chapter states it. The
 * approval is a ledger decision, not a review of the content, so every line keeps
 * the specialist caveat: the approval must never read as independent or
 * specialist sign-off.
 */
function approval(decidedOn: string): ChapterRelease {
  const decision = `Owner-approved for release, ${decidedOn}`

  return {
    decidedOn,
    decision,
    status: `${decision}. Not independent or specialist review; those remain unperformed.`,
  }
}

/** The Tang chapter's recorded decision. Its set's preparation-time notes still describe the approval as pending; the page states the decision instead of quoting them. */
export const TANG_RELEASE = approval("2026-09-25")

/** The Qin chapter's recorded decision, taken on 2026-09-27 against the corrected preparation. */
export const QIN_RELEASE = approval("2026-09-27")

/** The recorded decision for a served chapter id, or undefined for another chapter. */
export function chapterRelease(id: string): ChapterRelease | undefined {
  if (id === TANG_CHAPTER) {
    return TANG_RELEASE
  }

  return id === QIN_CHAPTER ? QIN_RELEASE : undefined
}
