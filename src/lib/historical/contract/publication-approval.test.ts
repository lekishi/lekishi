import { describe, expect, it } from "vitest"
import { SERVED_CHAPTERS } from "../../atlas/chapter-registry"
import {
  compileAll,
  compileChapter,
  RECORD_FILES_ADOPTED_AT,
  type ChapterBundle,
} from "../authoring/compile"
import { buildTree, readFiles, type TreeFile } from "../authoring/tree"
import { objectOf } from "./types"

/**
 * The publication approval gate (RFD 2, "Decided: the approval digest").
 *
 * A chapter is published only by the owner's approval in its manifest: a
 * digest of the manifest and of every record and source the chapter reaches,
 * with who approved it and on which day. This suite fails `pnpm build` through
 * `scripts/check-chapter.mjs` when that approval does not hold:
 *
 * - every chapter the site serves is approved at exactly its current content;
 * - no chapter is stale, so an edit to approved content, a shared place
 *   included, cannot reach readers until the owner approves again;
 * - an approval is dated, and not before the record files existed or after
 *   today;
 * - the approval lives in the manifest only, never in a record.
 *
 * A chapter without an approval is a draft: it compiles and faces every
 * contract test as a preview, but it is not served. The gate cannot tell who
 * wrote an approval, so `.github/CODEOWNERS` requires the owner's review on
 * every manifest, and `pnpm approvals` shows the owner what changed since the
 * last approval. Nothing here, and no agent, writes an approval for the owner.
 *
 * The rules are exercised against in-memory copies of the real tree, with an
 * approval written into the copy, so they hold whether or not the owner has
 * approved the chapters on this branch.
 */

const TODAY = new Date().toISOString().slice(0, 10)

/** A fresh in-memory copy of the authoring tree's files. */
function files(): TreeFile[] {
  return readFiles().map((file) => ({ ...file }))
}

/** The files with one file's text changed. */
function edit(source: TreeFile[], path: string, change: (text: string) => string): TreeFile[] {
  const target = source.find((file) => file.path === path)

  if (target === undefined) {
    throw new Error(`${path} is not in the authoring tree`)
  }

  return source.map((file) => (file === target ? { ...file, text: change(file.text) } : file))
}

/**
 * The files with a chapter's approval replaced by one of `digest`, standing in
 * for the owner's line. Tests only: the gate never writes one.
 */
function approve(source: TreeFile[], chapter: string, digest: string, on = TODAY) {
  return edit(
    source,
    `chapters/${chapter}.yaml`,
    (text) =>
      `${text.replace(/\napproval:\n(?: {2}.*\n?)*/, "\n").trimEnd()}\napproval:\n  digest: ${digest}\n  by: Example Owner\n  on: ${on}\n`,
  )
}

function compiled(source: TreeFile[], chapter: string): ChapterBundle {
  return compileChapter(buildTree(source), chapter)
}

/** The chapters the gate would let the site serve: approved, never stale. */
function approvalViolations(bundles: readonly ChapterBundle[], today: string): string[] {
  const violations: string[] = []
  const adopted = RECORD_FILES_ADOPTED_AT.slice(0, 10)

  for (const bundle of bundles) {
    if (bundle.state === "stale") {
      violations.push(
        `${bundle.id}: approved ${String(bundle.approval?.digest)}, but the content is now ${bundle.digest}; run \`pnpm approvals\` to see what changed`,
      )
    }

    if (bundle.approval !== null) {
      if (bundle.approval.on < adopted) {
        violations.push(
          `${bundle.id}: approved on ${bundle.approval.on}, before the record files existed`,
        )
      }

      if (bundle.approval.on > today) {
        violations.push(`${bundle.id}: approved on ${bundle.approval.on}, which is in the future`)
      }

      if (bundle.approval.by.trim() === "") {
        violations.push(`${bundle.id}: the approval does not name who approved it`)
      }
    }
  }

  return violations
}

const TANG = "tang-mission-750-754"

/** A record file the Tang chapter reaches, and one no chapter reaches. */
const TANG_RECORD = "events/tang/akimeya-landfall-753.yaml"

describe("publication approval gate", () => {
  const bundles = compileAll(buildTree(files()))

  it("leaves no chapter stale and no approval misdated", () => {
    expect(approvalViolations(bundles, TODAY)).toEqual([])
  })

  it("serves exactly the approved chapters", () => {
    expect(SERVED_CHAPTERS.map((chapter) => chapter.id).sort()).toEqual(
      bundles
        .filter((bundle) => bundle.state === "approved")
        .map((bundle) => bundle.id)
        .sort(),
    )

    for (const bundle of bundles.filter((entry) => entry.state === "approved")) {
      expect(bundle.approval?.digest, bundle.id).toBe(bundle.digest)
    }
  })

  it("keeps the approval in the manifest, never in a record's revisions", () => {
    // A record's publication mirror repeats its set's publisher, as the contract
    // requires; what a record's own revisions carry is content, never a decision.
    for (const bundle of compileAll(buildTree(files()), { preview: true })) {
      const revisions = JSON.stringify(bundle.documents.map((document) => document["revisions"]))

      expect(revisions, bundle.id).not.toContain('"role":"owner"')
      expect(revisions, bundle.id).not.toContain("owner approved")
    }
  })

  it("approves a chapter whose approval names its current digest", () => {
    const digest = compiled(files(), TANG).digest
    const bundle = compiled(approve(files(), TANG, digest), TANG)

    expect(bundle.state).toBe("approved")
    expect(approvalViolations([bundle], TODAY)).toEqual([])
    expect(objectOf(bundle.sets[0]["published_by"])).toEqual({
      name: "Example Owner",
      role: "owner",
    })
    expect(objectOf(bundle.sets[0]["review"])["independence"]).toBe("self_review")
  })

  it("fails an approved chapter when a record it reaches changes", () => {
    const digest = compiled(files(), TANG).digest
    const changed = edit(approve(files(), TANG, digest), TANG_RECORD, (text) =>
      text.replace(/summary: (.*)/, "summary: $1 Edited after the approval."),
    )
    const bundle = compiled(changed, TANG)

    expect(bundle.state).toBe("stale")
    expect(bundle.sets).toEqual([])
    expect(approvalViolations([bundle], TODAY).join("\n")).toContain("pnpm approvals")
  })

  it("fails an approved chapter when its manifest's card text changes", () => {
    const digest = compiled(files(), TANG).digest
    const changed = edit(approve(files(), TANG, digest), `chapters/${TANG}.yaml`, (text) =>
      text.replace(/^title: (.*)$/m, "title: $1, edited"),
    )

    expect(compiled(changed, TANG).state).toBe("stale")
  })

  it("fails an approved chapter when a source it cites changes", () => {
    const digest = compiled(files(), TANG).digest
    const changed = edit(approve(files(), TANG, digest), "sources/wikidata.yaml", (text) =>
      text.replace(/^title: (.*)$/m, "title: $1 (edited)"),
    )

    expect(compiled(changed, TANG).state).toBe("stale")
  })

  it("keeps an approved chapter approved when an unreached record is added", () => {
    const digest = compiled(files(), TANG).digest
    const unreached = files().find((file) => file.path === TANG_RECORD) as TreeFile
    const added = [
      ...approve(files(), TANG, digest),
      { path: "events/unreached-example-753.yaml", text: unreached.text },
    ]

    expect(compiled(added, TANG).state).toBe("approved")
  })

  it("fails an approval of other content, and does not serve a draft", () => {
    const other = `sha256:${"0".repeat(64)}`
    const stale = compiled(approve(files(), TANG, other), TANG)
    const draft = compiled(
      edit(files(), `chapters/${TANG}.yaml`, (text) =>
        text.replace(/\napproval:\n(?: {2}.*\n?)*/, "\n"),
      ),
      TANG,
    )

    expect(stale.state).toBe("stale")
    expect(draft.state).toBe("draft")
    expect(draft.sets).toEqual([])
    expect(approvalViolations([draft], TODAY)).toEqual([])
  })

  it("fails an approval dated before the record files or in the future", () => {
    const digest = compiled(files(), TANG).digest
    const early = compiled(approve(files(), TANG, digest, "2026-09-27"), TANG)
    const future = compiled(approve(files(), TANG, digest, "2999-01-01"), TANG)

    expect(approvalViolations([early], TODAY).join("\n")).toContain("before the record files")
    expect(approvalViolations([future], TODAY).join("\n")).toContain("in the future")
  })
})
