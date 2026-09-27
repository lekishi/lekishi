import type { ChapterCoverage } from "./projection"

/**
 * The bounded Qin comparison fixture, as the comparison review route names it.
 *
 * The fixture is prepared content the owner has not decided on. This module is
 * the route's single authority for which chapter it shows, the coverage model
 * that chapter owns, and the review state the page must state. The route exists
 * so the owner can inspect the corrected revisions the internal review prepared,
 * with the atlas's own BCE year labels and the published dispute shown; nothing
 * here grants the fixture release status. Its publication set is a preparation
 * snapshot, the ledger records no owner decision, and the page says so.
 */

/** The fixture's chapter directory, which is also the id the contract carries. */
export const COMPARISON_CHAPTER = "qin-conquest-han-233-226"

/**
 * The fixture's own coverage model: the end of the state of Han, 233–226 BCE, in
 * the astronomical ordinals the contract's normalized endpoints use (233 BCE is
 * -232). The fixture's README records the same window and the story record names
 * it; the projection takes it from its caller rather than from a chapter branch.
 */
export const COMPARISON_COVERAGE: ChapterCoverage = { defaultWindow: { start: -232, end: -225 } }

/**
 * The review state the page states. The wording lives here so the page, its
 * metadata, and its tests cannot describe the fixture differently. The label is
 * the ledger's own decision class, shortened: the set is a `preparation
 * snapshot` and no owner decision exists for it.
 */
export const COMPARISON_REVIEW = {
  label: "Unapproved preparation",
  note: "Draft chapter under review: no release decision exists for this content, and it is not a launch chapter.",
} as const
