import type { ChapterEntry } from "virtual:lekishi-chapters"
import { CHAPTER_MANIFESTS } from "./chapter-registry"

/**
 * The editorial state the chapter pages state, one entry per served chapter.
 * The home page's cards state only a draft's line: the owner decided on
 * 2026-10-20 that an approved chapter's card carries no approval line, since
 * every chapter production serves is approved.
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

/**
 * What a draft chapter states in place of a decision. Only a build that serves
 * drafts has one (development and pull-request previews, by the owner's
 * decision of 2026-10-18); production never serves a chapter without a
 * matching approval. A draft must never read as approved: every surface that
 * shows one says it is a draft, and a stale chapter also says that its content
 * changed since the approval it still carries.
 */
export type ChapterDraft = {
  /** The short line a page states beside the chapter's name. */
  readonly decision: string
  /** The full line: the decision and `DRAFT_SCOPE`, as the chapter card states it. */
  readonly status: string
}

/** What a draft's full line adds to its decision: that only previews serve it. */
export const DRAFT_SCOPE =
  "This build is a preview; the published site serves approved chapters only."

/**
 * What a chapter without a matching approval states when a build serves it.
 * Exported so the wording can be pinned without a build that serves drafts.
 */
export function draftStatement(manifest: ChapterEntry): ChapterDraft {
  const decision =
    manifest.state === "stale" && manifest.approval !== null
      ? `Draft: changed since the owner's approval of ${manifest.approval.on}, not approved for release`
      : "Draft, not approved for release"

  return { decision, status: `${decision}. ${DRAFT_SCOPE}` }
}

/** The draft statement for a chapter id, or undefined for an approved or unserved chapter. */
export function chapterDraft(id: string): ChapterDraft | undefined {
  const manifest = CHAPTER_MANIFESTS.find((chapter) => chapter.id === id)

  return manifest === undefined || manifest.state === "approved" || !manifest.served
    ? undefined
    : draftStatement(manifest)
}
