/**
 * The editorial state the chapter cards state for the Tang chapter.
 *
 * The Tang v1 set document is frozen on purpose: the owner's editorial approval
 * under RFD 2 was recorded against its canonical digest, and editing the set
 * would change that digest and invalidate the decision. Its review block records
 * only the preparing editor's `self_review`, and its preparation-time notes still
 * describe the approval as pending, so the atlas states the decision the ledger
 * records rather than the set's own earlier wording. The line is secondary
 * metadata on the chapter card — the chapter's identity and value are its story —
 * and the wording lives here so the card and its tests state the decision the
 * same way; `release.test.ts` reads the RFD 2 ledger and checks the date stated
 * here is the date the Tang row records.
 */
export const RELEASE = {
  /** The date the ledger's Tang row records for the owner's editorial approval. */
  decidedOn: "2026-09-25",
  /** The chapter card's restrained, secondary status line. */
  status:
    "Owner-approved for release, 2026-09-25. Not independent or specialist review; those remain unperformed.",
} as const
