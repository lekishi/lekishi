import { CHAPTER_MANIFESTS } from "./chapter-registry"

/**
 * The editorial state the chapter cards and pages state, one entry per served
 * chapter.
 *
 * A served chapter is one whose manifest carries the owner's approval of its
 * exact content (RFD 2's digest approval), so the atlas states that approval and
 * its date. The compiled set's `review` records only the contributors'
 * `self_review`, because the approval is an editorial decision rather than a
 * review by anyone independent of the preparation. The wording lives here so the
 * cards, the chapter pages, and their tests state the decision the same way;
 * `release.test.ts` reads the manifests and the sets: a stated date must be the
 * date the chapter's approval records, and no line may describe the content as
 * reviewed beyond the `self_review` it carries.
 */

/** One chapter's recorded decision: the short line and the card's full status. */
export type ChapterRelease = {
  /** The date the chapter's manifest records for the owner's approval. */
  readonly decidedOn: string
  /** The short decision line a page states beside the chapter's name. */
  readonly decision: string
  /** The chapter card's restrained, secondary status line. */
  readonly status: string
}

/**
 * The owner's approval under RFD 2, as a chapter states it. The approval is an
 * editorial decision, not a review of the content, so every line keeps the
 * specialist caveat: the approval must never read as independent or specialist
 * sign-off.
 */
function approval(decidedOn: string): ChapterRelease {
  const decision = `Owner-approved for release, ${decidedOn}`

  return {
    decidedOn,
    decision,
    status: `${decision}. Not independent or specialist review; those remain unperformed.`,
  }
}

/** The recorded decision for a chapter id, or undefined for a chapter without an approval. */
export function chapterRelease(id: string): ChapterRelease | undefined {
  const manifest = CHAPTER_MANIFESTS.find((chapter) => chapter.id === id)

  return manifest?.state === "approved" && manifest.approval !== null
    ? approval(manifest.approval.on)
    : undefined
}
