/**
 * The release state the root page states for the published chapter.
 *
 * The Tang v1 set document is frozen on purpose: the owner's editorial approval
 * under RFD 2 was recorded against its canonical digest, and editing the set
 * would change that digest and invalidate the decision. Its review notes were
 * therefore written before the decision and still describe the approval as
 * pending, so the root page states the ledger's decision and keeps those notes
 * beside it as preparation-time history instead of letting the stale wording
 * stand as the current state. The wording lives here so the page and its tests
 * state the decision the same way; `release.test.ts` reads the RFD 2 ledger and
 * checks the date stated here is the date the Tang row records.
 */
export const RELEASE = {
  /** The date the ledger's Tang row records for the owner's editorial approval. */
  decidedOn: "2026-09-25",
  /** The current decision, stated before the set's preparation-time notes. */
  decision:
    "The set's review block records only the preparing editor's self-review; separately, the owner's editorial approval under RFD 2 was recorded on 2026-09-25 against this set's canonical digest, so the chapter is published. The set document is unchanged since before the decision — changing it would change the digest and invalidate the approval.",
  /** What the approval does not cover, so the page cannot read as more than it is. */
  caveats:
    "The approval is the owner's editorial decision, not independent or specialist review; the optional specialist reviews the feasibility report identifies remain unperformed, so the chapter is not a claim of complete coverage or of independent review.",
  /** The framing that marks the set's own notes as written before the decision. */
  notesLead:
    "The set's own review notes, written before that decision and kept as preparation-time history, still describe the approval as pending:",
} as const
