import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadChapter } from "../historical/chapter"
import { objectOf } from "../historical/contract/types"
import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import { QIN_RELEASE, TANG_RELEASE } from "./release"

/**
 * The chapter cards' release statements against the ledger that decides them.
 *
 * Each card states a date and a decision in its secondary metadata. The RFD 2
 * ledger is the authority for that decision and the chapter set is the authority
 * for what was reviewed, so this test reads both: a card cannot state an approval
 * date its chapter's row does not record, and it cannot describe the approved set
 * as reviewed beyond the self-review the set actually carries.
 */

const LEDGER = new URL("../../../rfd/0002/PUBLICATION_APPROVAL.adoc", import.meta.url)

const CHAPTERS = [
  { id: TANG_CHAPTER, setId: "lks:set:tang-mission-750-754-v1", release: TANG_RELEASE },
  { id: QIN_CHAPTER, setId: "lks:set:qin-conquest-han-233-226-v1", release: QIN_RELEASE },
] as const

/** The ledger row for a set, up to the next row, cells and notes included. */
function ledgerRow(setId: string): string {
  const lines = readFileSync(LEDGER, "utf8").split("\n")
  const start = lines.findIndex((line) => line.startsWith(`|\`${setId}\``))

  if (start === -1) {
    throw new Error(`the ledger has no row for ${setId}`)
  }

  const end = lines.findIndex((line, index) => index > start && line.startsWith("|`lks:set:"))

  return lines.slice(start, end === -1 ? undefined : end).join("\n")
}

describe("the chapter cards' release statements", () => {
  it("states the decision and date each chapter's ledger row records", () => {
    for (const chapter of CHAPTERS) {
      const row = ledgerRow(chapter.setId)

      expect(row, chapter.id).toContain("owner approved")
      expect(row, chapter.id).toContain(chapter.release.decidedOn)
      // The card's own line carries the date, so the two cannot drift apart.
      expect(chapter.release.status, chapter.id).toContain(chapter.release.decidedOn)
      expect(chapter.release.decision, chapter.id).toContain(chapter.release.decidedOn)
      expect(chapter.release.status, chapter.id).toContain("Owner-approved for release")
      // The short decision line is the start of the card's full status line, so a
      // page cannot state one decision and a card another.
      expect(chapter.release.status, chapter.id).toContain(chapter.release.decision)
    }
  })

  it("describes each approved set as it is: self-review, not independent or specialist review", () => {
    for (const chapter of CHAPTERS) {
      const set = loadChapter(chapter.id).sets.find(
        (candidate) => String(candidate["set_id"]) === chapter.setId,
      )

      expect(set, chapter.id).toBeDefined()
      expect(String(objectOf(objectOf(set)["review"])["independence"]), chapter.id).toBe(
        "self_review",
      )

      // The approval is a ledger decision, not a review of the content: the line
      // must keep saying so, and must keep the specialist reviews open.
      expect(chapter.release.status, chapter.id).toContain("Not independent or specialist review")
      expect(chapter.release.status, chapter.id).toContain("remain unperformed")
      expect(chapter.release.status, chapter.id).not.toContain("Independent review recorded")
      expect(chapter.release.status, chapter.id).not.toContain("Specialist review recorded")
    }
  })

  it("keeps the two chapters' decisions distinct", () => {
    expect(TANG_RELEASE.decidedOn).not.toBe(QIN_RELEASE.decidedOn)
    expect(TANG_RELEASE.status).not.toBe(QIN_RELEASE.status)
  })
})
