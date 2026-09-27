import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadChapter } from "../historical/chapter"
import { objectOf } from "../historical/contract/types"
import { RELEASE } from "./release"

/**
 * The root page's release statement against the ledger that decides it.
 *
 * The page states a date and a decision for the published chapter. The RFD 2
 * ledger is the authority for that decision and the chapter set is the authority
 * for what was reviewed, so this test reads both: the page cannot state an
 * approval date the Tang row does not record, and it cannot describe the
 * approved set as reviewed beyond the self-review the set actually carries.
 */

const TANG_SET = "lks:set:tang-mission-750-754-v1"
const LEDGER = new URL("../../../rfd/0002/PUBLICATION_APPROVAL.adoc", import.meta.url)

/** The Tang row of the ledger table, up to the next row, cells and notes included. */
function tangRow(): string {
  const lines = readFileSync(LEDGER, "utf8").split("\n")
  const start = lines.findIndex((line) => line.startsWith(`|\`${TANG_SET}\``))

  if (start === -1) {
    throw new Error(`the ledger has no row for ${TANG_SET}`)
  }

  const end = lines.findIndex((line, index) => index > start && line.startsWith("|`lks:set:"))

  return lines.slice(start, end === -1 ? undefined : end).join("\n")
}

describe("the root page's release statement", () => {
  it("states the decision and date the Tang ledger row records", () => {
    const row = tangRow()

    expect(row).toContain("owner approved")
    expect(row).toContain(RELEASE.decidedOn)
    // The page's own sentence carries the date, so the two cannot drift apart.
    expect(RELEASE.decision).toContain(RELEASE.decidedOn)
    expect(RELEASE.decision).toContain("owner's editorial approval")
  })

  it("describes the approved set as it is: self-review, not independent or specialist review", () => {
    const set = loadChapter("tang-mission-750-754").sets.find(
      (candidate) => String(candidate["set_id"]) === TANG_SET,
    )

    expect(set).toBeDefined()
    expect(String(objectOf(objectOf(set)["review"])["independence"])).toBe("self_review")

    // The approval is a ledger decision, not a review of the content: the page
    // must keep saying so, and must keep the specialist reviews open.
    expect(RELEASE.caveats).toContain("not independent or specialist review")
    expect(RELEASE.caveats).toContain("remain unperformed")
  })
})
