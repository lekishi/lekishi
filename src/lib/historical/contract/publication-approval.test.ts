import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { listChapters, loadChapter, type ChapterTree } from "../chapter"
import { encode, sha256 } from "./canonical"
import { objectOf, type JsonObject } from "./types"
import { SERVED_CHAPTERS } from "../../atlas/chapter-registry"
import { currentPublished } from "./publication-order"

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
 * The gate reads every chapter tree under `historical/chapters/`, so a new
 * chapter directory cannot appear with a set the ledger does not cover. Both
 * served chapters' sets carry the owner's release approval, and a chapter the
 * site serves must be showing revisions that approval covers: the served list in
 * `src/lib/atlas/chapter-registry.ts` is what the chapter route prerenders, and a
 * `preparation snapshot` set may exist in the repository without being served.
 *
 * The rule is a predicate over (sets, ledger rows) so it can be exercised
 * against deliberately wrong readings — a set without a row, a row without a
 * set, a preparation snapshot labelled as approved, a set whose content changed
 * after the decision — and not only against the tree as it happens to be today.
 *
 * Each row also carries the canonical digest of the set it decided on. The digest
 * binds the decision to that snapshot: changing a member revision hash or a
 * source pin invalidates the row instead of silently inheriting its decision.
 * It is a consistency check, not an authentication — a person still has to check
 * that the row, the digest, and the set describe what the owner decided.
 *
 * The served-chapter rule is the reader-facing half of the same idea: a set may
 * exist as a preparation snapshot, but the chapters the site renders must come
 * from a set the owner approved. Adding a chapter to the served list, or moving a
 * served chapter to a later revision, therefore fails the build until the owner
 * decides again.
 */

const TANG_SET = "lks:set:tang-mission-750-754-v1"
const QIN_SET = "lks:set:qin-conquest-han-233-226-v1"

/** The record that holds the owner's publication decisions, relative to the repo root. */
const LEDGER_URL = new URL("../../../../rfd/0002/PUBLICATION_APPROVAL.adoc", import.meta.url)

/** The only decisions the ledger may record. */
const DECISIONS = ["preparation snapshot", "owner decided", "owner approved"] as const

type Decision = (typeof DECISIONS)[number]

type LedgerRow = {
  setId: string
  decision: string
  decidedBy: string
  digest: string
}

/** The digest a decision row records: the canonical encoding of the whole set. */
function setDigest(set: JsonObject): string {
  return `sha256:${sha256(encode(set))}`
}

/**
 * Reads the ledger table out of the AsciiDoc record. Cells continue until the
 * next line that starts a cell, so the notes may wrap.
 */
function parseLedger(text: string, columns = 5): LedgerRow[] {
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
      digest: (row[3] ?? "").replaceAll("`", "").trim(),
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

    // The row decides on one snapshot, not on whatever later carries the set id.
    if (row.digest !== setDigest(set)) {
      violations.push(
        `${setId} no longer matches the digest recorded for its decision: the content changed after the decision was taken`,
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

/** Every chapter tree under `historical/chapters`, so a new one cannot slip past the gate. */
function chapterNames(): string[] {
  return listChapters()
}

function allSets(): JsonObject[] {
  return chapterNames().flatMap((chapter) => loadChapter(chapter).sets)
}

/**
 * The rule the served chapters add: a chapter the site renders must be showing
 * revisions an `owner approved` decision covers.
 *
 * The gate's other rules keep an undecided set from existing; this one keeps a
 * served chapter from *rendering* content whose decision is missing, stale, or
 * was taken on a snapshot the chapter has since moved past. A chapter that is
 * prepared for review but not served is deliberately out of scope: it may carry a
 * `preparation snapshot` set, and the served list — not the repository — is what
 * a reader can open.
 */
function servedViolations(served: ChapterTree[], ledger: LedgerRow[]): string[] {
  const violations: string[] = []
  const approved = new Set(
    ledger.filter((row) => row.decision === "owner approved").map((row) => row.setId),
  )

  for (const tree of served) {
    const current = currentPublished(tree.documents, tree.sets)
    const setIds = [...new Set([...current.values()].map((value) => String(value.set_id)))].sort()

    for (const setId of setIds) {
      if (!approved.has(setId)) {
        violations.push(
          `${tree.name} is served, but the revisions it renders come from ${setId}, which has no owner approved decision`,
        )
      }
    }
  }

  return violations
}

/** The served chapters' trees, read from the list the chapter route prerenders. */
function servedTrees(): ChapterTree[] {
  return SERVED_CHAPTERS.map((chapter) => loadChapter(chapter.id))
}

describe("publication approval gate", () => {
  it("records a decision for every set in every chapter tree", () => {
    const ledger = ledgerRows()

    // The parse must not quietly produce nothing: the two prepared sets and the
    // decisions that cover them are the state the gate covers.
    expect(ledger.map((row) => row.setId).sort()).toEqual([QIN_SET, TANG_SET].sort())
    expect(chapterNames()).toEqual(["qin-conquest-han-233-226", "tang-mission-750-754"])
    expect(approvalViolations(allSets(), ledger)).toEqual([])
  })

  it("serves only chapters whose rendered revisions an owner decision covers", () => {
    const served = servedTrees()

    // The served list is what the chapter route prerenders; both entries are
    // chapters, and neither renders content the ledger has not approved.
    expect(served.map((tree) => tree.name).sort()).toEqual(
      ["qin-conquest-han-233-226", "tang-mission-750-754"].sort(),
    )
    expect(servedViolations(served, ledgerRows())).toEqual([])
  })

  it("fails a served chapter whose rendered revisions lost their approval", () => {
    // The same content, decided as a preparation snapshot instead of an
    // approval: the chapter trees are still covered, but the served chapters are
    // rendering content no decision released.
    const ledger = ledgerRows().map((row) => ({ ...row, decision: "preparation snapshot" }))
    const violations = servedViolations(servedTrees(), ledger)

    expect(violations.join("\n")).toContain(
      "is served, but the revisions it renders come from lks:set:tang-mission-750-754-v1, which has no owner approved decision",
    )
    expect(violations.join("\n")).toContain(
      "is served, but the revisions it renders come from lks:set:qin-conquest-han-233-226-v1, which has no owner approved decision",
    )
  })

  it("fails a served chapter that moved to a revision its approved set does not publish", () => {
    // A later revision inside the served chapter's tree: the approval covered the
    // snapshot the row records, not whatever the chapter carries next.
    const served = servedTrees().map((tree) =>
      tree.name !== "tang-mission-750-754"
        ? tree
        : {
            ...tree,
            sets: tree.sets.map((set) => ({
              ...set,
              set_id: "lks:set:tang-mission-750-754-v2",
            })),
          },
    )
    const violations = servedViolations(served, ledgerRows())

    expect(violations.join("\n")).toContain(
      "is served, but the revisions it renders come from lks:set:tang-mission-750-754-v2, which has no owner approved decision",
    )
  })

  it("does not apply the served rule to a chapter the site does not serve", () => {
    // A preparation snapshot may exist in the repository without being served:
    // that is what keeps the review workflow possible without shipping it. The
    // set stays ledger-covered, so the approval gate itself is satisfied, and the
    // served rule only looks at the chapters the site actually renders.
    const ledger = ledgerRows().map((row) =>
      row.setId === QIN_SET ? { ...row, decision: "preparation snapshot" } : row,
    )
    const served = servedTrees().filter((tree) => tree.name !== "qin-conquest-han-233-226")

    expect(approvalViolations(allSets(), ledger)).toEqual([])
    expect(servedViolations(served, ledger)).toEqual([])
    expect(servedViolations(servedTrees(), ledger)).toContain(
      "qin-conquest-han-233-226 is served, but the revisions it renders come from lks:set:qin-conquest-han-233-226-v1, which has no owner approved decision",
    )
  })

  it("records the owner's approval for both served sets, and describes neither as review", () => {
    const approved = ledgerRows().filter((row) => row.decision === "owner approved")

    // Both chapter trees are served by the site, and both carry the owner's
    // editorial approval of the exact snapshot their row records.
    expect(approved.map((row) => row.setId).sort()).toEqual([QIN_SET, TANG_SET].sort())

    // The approval is a ledger decision, not a review relabel: each approved set
    // still records the preparing editor's self-review, and the row's own note
    // keeps the specialist reviews open.
    for (const [chapter, setId] of [
      ["tang-mission-750-754", TANG_SET],
      ["qin-conquest-han-233-226", QIN_SET],
    ] as const) {
      for (const set of loadChapter(chapter).sets) {
        expect(String(objectOf(set["review"])["independence"]), chapter).toBe("self_review")
      }

      const row = ledgerRows().find((candidate) => candidate.setId === setId)

      expect(row?.decidedBy, chapter).toContain("owner")
      expect(row?.decidedBy, chapter).not.toContain("independent")
    }
  })

  it("fails a set that no decision covers", () => {
    const ledger = ledgerRows().filter((row) => row.setId !== TANG_SET)
    const violations = approvalViolations(allSets(), ledger)

    expect(violations.join("\n")).toContain(
      `${TANG_SET} is published without a recorded owner decision`,
    )
  })

  it("fails a second chapter's set that no decision covers", () => {
    const ledger = ledgerRows().filter((row) => row.setId !== QIN_SET)
    const violations = approvalViolations(allSets(), ledger)

    expect(violations.join("\n")).toContain(
      `${QIN_SET} is published without a recorded owner decision`,
    )
  })

  it("fails a ledger row for a set that does not exist", () => {
    const ledger = [
      ...ledgerRows(),
      {
        setId: "lks:set:invented-v9",
        decision: "preparation snapshot",
        decidedBy: "owner",
        digest: "sha256:" + "0".repeat(64),
      },
    ]
    const violations = approvalViolations(allSets(), ledger)

    expect(violations.join("\n")).toContain(
      "the ledger records lks:set:invented-v9, which is not in the chapter tree",
    )
  })

  it("fails a preparation snapshot that claims a review beyond the preparing editor's", () => {
    const sets = loadChapter("qin-conquest-han-233-226").sets.map((set) => ({
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
    const violations = approvalViolations(allSets(), ledger)

    expect(violations.join("\n")).toContain(
      'records the decision "owner approved" without naming the owner as the decider',
    )
  })

  it("fails a set with two decision rows", () => {
    const ledger = [
      ...ledgerRows(),
      {
        setId: TANG_SET,
        decision: "preparation snapshot",
        decidedBy: "owner",
        digest: ledgerRows()[0]?.digest ?? "",
      },
    ]
    const violations = approvalViolations(allSets(), ledger)

    expect(violations.join("\n")).toContain(`${TANG_SET} has more than one decision row`)
  })

  it("fails the approved Tang set when its content changes after the decision", () => {
    const sets = loadChapter("tang-mission-750-754").sets.map((set) => {
      const members = (set["members"] as JsonObject[]).map((member, index) =>
        index === 0 ? { ...member, revision_hash: `sha256:${"0".repeat(64)}` } : member,
      )

      return { ...set, members }
    })
    const violations = approvalViolations(sets, ledgerRows())

    expect(violations.join("\n")).toContain(
      "no longer matches the digest recorded for its decision: the content changed after the decision was taken",
    )
  })

  it("fails the approved Tang set when its source pin changes after the decision", () => {
    const sets = loadChapter("tang-mission-750-754").sets.map((set) => {
      const sources = (set["sources"] as JsonObject[]).map((source, index) =>
        index === 0 ? { ...source, source_hash: `sha256:${"1".repeat(64)}` } : source,
      )

      return { ...set, sources }
    })
    const violations = approvalViolations(sets, ledgerRows())

    expect(violations.join("\n")).toContain(
      "no longer matches the digest recorded for its decision: the content changed after the decision was taken",
    )
  })

  it("fails the comparison fixture when its content changes after preparation", () => {
    const sets = loadChapter("qin-conquest-han-233-226").sets.map((set) => {
      const members = (set["members"] as JsonObject[]).map((member, index) =>
        index === 0 ? { ...member, revision_hash: `sha256:${"2".repeat(64)}` } : member,
      )

      return { ...set, members }
    })
    const violations = approvalViolations(sets, ledgerRows())

    expect(violations.join("\n")).toContain(
      "no longer matches the digest recorded for its decision: the content changed after the decision was taken",
    )
  })

  it("fails a decision the gate does not know", () => {
    const ledger = ledgerRows().map((row) => ({ ...row, decision: "looks fine to me" }))
    const violations = approvalViolations(allSets(), ledger)

    expect(violations.join("\n")).toContain('records the unknown decision "looks fine to me"')
  })
})
