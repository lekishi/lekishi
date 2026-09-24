import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadChapter } from "../chapter"
import { objectOf, type JsonObject } from "./types"

/**
 * The publication approval gate.
 *
 * The contract has one shape for a content change — a new revision named by a
 * publication set — and the atlas reads the newest set-named revision. Nothing
 * in the schema requires that a person decided a new version of the content may
 * exist, so this suite adds that decision point: `rfd/0002/PUBLICATION_APPROVAL.adoc`
 * records one row per set, and a set the record does not cover fails here, which
 * fails `pnpm build` through `scripts/check-chapter.mjs`.
 *
 * The rule is a predicate over (sets, ledger rows) so it can be exercised
 * against deliberately wrong readings — a set without a row, a row without a
 * set, a preparation snapshot labelled as approved — and not only against the
 * tree as it happens to be today.
 */

const CHAPTER = "tang-mission-750-754"

/** The record that holds the owner's publication decisions, relative to the repo root. */
const LEDGER_URL = new URL("../../../../rfd/0002/PUBLICATION_APPROVAL.adoc", import.meta.url)

/** The only decisions the ledger may record. */
const DECISIONS = ["preparation snapshot", "owner decided", "owner approved"] as const

type Decision = (typeof DECISIONS)[number]

type LedgerRow = {
  setId: string
  decision: string
  decidedBy: string
}

/**
 * Reads the ledger table out of the AsciiDoc record. Cells continue until the
 * next line that starts a cell, so the notes may wrap.
 */
function parseLedger(text: string, columns = 4): LedgerRow[] {
  const rows: string[][] = []
  const cells: string[] = []
  let inTable = false

  const flush = () => {
    if (cells.length > 0) {
      rows.push(cells.splice(0, cells.length))
    }
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd()

    if (line.startsWith("|===")) {
      if (inTable) {
        flush()
      }
      inTable = !inTable
      continue
    }

    if (!inTable) {
      continue
    }

    if (line.startsWith("|")) {
      if (cells.length === columns) {
        flush()
      }

      for (const cell of line.split("|").slice(1)) {
        if (cells.length === columns) {
          flush()
        }
        cells.push(cell.trim())
      }

      continue
    }

    if (cells.length > 0 && line.trim() !== "") {
      cells[cells.length - 1] = `${cells[cells.length - 1]} ${line.trim()}`
    }
  }

  return rows
    .filter((row) => row[0] !== "Set")
    .map((row) => ({
      setId: (row[0] ?? "").replaceAll("`", "").trim(),
      decision: (row[1] ?? "").trim(),
      decidedBy: (row[2] ?? "").trim(),
    }))
}

function ledgerRows(): LedgerRow[] {
  return parseLedger(readFileSync(LEDGER_URL, "utf8"))
}

/**
 * What the gate refuses. Every message names the set and the disagreement, so a
 * failing build says which decision is missing rather than only that one is.
 */
function approvalViolations(sets: JsonObject[], ledger: LedgerRow[]): string[] {
  const violations: string[] = []
  const setIds = sets.map((set) => String(set["set_id"]))
  const rows = new Map<string, LedgerRow>()

  for (const row of ledger) {
    if (rows.has(row.setId)) {
      violations.push(`${row.setId} has more than one decision row`)
    }

    rows.set(row.setId, row)
  }

  for (const set of sets) {
    const setId = String(set["set_id"])
    const row = rows.get(setId)

    if (row === undefined) {
      violations.push(`${setId} is published without a recorded owner decision`)
      continue
    }

    if (!(DECISIONS as readonly string[]).includes(row.decision)) {
      violations.push(`${setId} records the unknown decision "${row.decision}"`)
      continue
    }

    const independence = String(objectOf(set["review"])["independence"])
    const decision = row.decision as Decision
    const snapshot = decision === "preparation snapshot"

    // A snapshot exists because preparation was instructed, not because the
    // owner decided on this content, so it cannot claim a review beyond the
    // preparing editor's own.
    if (snapshot && independence !== "self_review") {
      violations.push(
        `${setId} is a preparation snapshot but claims review independence "${independence}"`,
      )
    }

    // An owner decision must name the owner as the decider, so the ledger says
    // whose decision it is rather than only that one was taken.
    if (!snapshot && !row.decidedBy.toLowerCase().startsWith("owner")) {
      violations.push(
        `${setId} records the decision "${decision}" without naming the owner as the decider`,
      )
    }
  }

  for (const row of ledger) {
    if (!setIds.includes(row.setId)) {
      violations.push(`the ledger records ${row.setId}, which is not in the chapter tree`)
    }
  }

  return violations
}

function chapterSets(): JsonObject[] {
  return loadChapter(CHAPTER).sets
}

describe("publication approval gate", () => {
  it("records a decision for every set in the chapter tree", () => {
    const ledger = ledgerRows()

    // The parse must not quietly produce nothing: the single flattened set and
    // the owner's decision to publish it are the state the gate covers.
    expect(ledger.map((row) => row.setId).sort()).toEqual(["lks:set:tang-mission-750-754-v1"])
    expect(approvalViolations(chapterSets(), ledger)).toEqual([])
  })

  it("records no approved release yet", () => {
    // Nothing is officially published: the single set carries the preparing
    // editor's self-review and the owner's decision to publish, not the owner's
    // editorial approval, so RFD 4's AC2 stays unsatisfied.
    expect(ledgerRows().filter((row) => row.decision === "owner approved")).toEqual([])

    for (const set of chapterSets()) {
      expect(String(objectOf(set["review"])["independence"])).toBe("self_review")
    }
  })

  it("fails a set that no decision covers", () => {
    const ledger = ledgerRows().filter((row) => row.setId !== "lks:set:tang-mission-750-754-v1")
    const violations = approvalViolations(chapterSets(), ledger)

    expect(violations.join("\n")).toContain(
      "lks:set:tang-mission-750-754-v1 is published without a recorded owner decision",
    )
  })

  it("fails a ledger row for a set that does not exist", () => {
    const ledger = [
      ...ledgerRows(),
      { setId: "lks:set:invented-v9", decision: "preparation snapshot", decidedBy: "owner" },
    ]
    const violations = approvalViolations(chapterSets(), ledger)

    expect(violations.join("\n")).toContain(
      "the ledger records lks:set:invented-v9, which is not in the chapter tree",
    )
  })

  it("fails a preparation snapshot that claims a review beyond the preparing editor's", () => {
    const sets = chapterSets().map((set) => ({
      ...set,
      review: { ...objectOf(set["review"]), independence: "independent_review" },
    }))
    const ledger = ledgerRows().map((row) => ({ ...row, decision: "preparation snapshot" }))
    const violations = approvalViolations(sets, ledger)

    expect(violations.join("\n")).toContain(
      'is a preparation snapshot but claims review independence "independent_review"',
    )
  })

  it("fails an owner decision that does not name the owner", () => {
    const ledger = ledgerRows().map((row) => ({ ...row, decidedBy: "the preparing editor" }))
    const violations = approvalViolations(chapterSets(), ledger)

    expect(violations.join("\n")).toContain(
      'records the decision "owner decided" without naming the owner as the decider',
    )
  })

  it("fails a set with two decision rows", () => {
    const ledger = [
      ...ledgerRows(),
      { setId: "lks:set:tang-mission-750-754-v1", decision: "owner approved", decidedBy: "owner" },
    ]
    const violations = approvalViolations(chapterSets(), ledger)

    expect(violations.join("\n")).toContain(
      "lks:set:tang-mission-750-754-v1 has more than one decision row",
    )
  })

  it("fails a decision the gate does not know", () => {
    const ledger = ledgerRows().map((row) => ({ ...row, decision: "looks fine to me" }))
    const violations = approvalViolations(chapterSets(), ledger)

    expect(violations.join("\n")).toContain('records the unknown decision "looks fine to me"')
  })
})
