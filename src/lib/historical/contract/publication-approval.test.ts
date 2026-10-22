import { describe, expect, it } from "vitest"
import { DRAFTS_SERVED, SERVED_CHAPTERS } from "../../atlas/chapter-registry"
import {
  compileAll,
  compileChapter,
  RECORD_FILES_ADOPTED_AT,
  type ChapterBundle,
} from "../authoring/compile"
import { buildTree, readFiles, type TreeFile } from "../authoring/tree"
import * as Publication from "./publication"
import { objectOf } from "./types"

/**
 * The publication approval gate (RFD 2, "Decided: the approval digest").
 *
 * A chapter is published only by the owner's approval in its manifest: a
 * digest of the manifest and of every record and source the chapter reaches,
 * with who approved it and on which day. This suite runs in `pnpm build`
 * through `scripts/check-chapter.mjs` and holds that:
 *
 * - every chapter the site serves is approved at exactly its current content,
 *   so a stale chapter (an edit to approved content, a shared place included)
 *   is left out of production until the owner approves again;
 * - an approval is dated, and not before the record files existed or after
 *   today;
 * - the approval lives in the manifest only, never in a record.
 *
 * A missing or stale approval is never a failure (the owner's decision of
 * 2026-10-21): it only decides what production serves. A chapter without a
 * matching approval compiles and faces every contract test as a preview, but
 * production does not serve it. Only a build that serves drafts (development
 * and pull-request previews; the build's gate runs this suite with
 * `LEKISHI_DRAFTS=1` there) serves it, under its draft preview set. The gate
 * cannot tell who
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

/** An approval's date and name, which must hold whether or not it still matches. */
function approvalViolations(bundles: readonly ChapterBundle[], today: string): string[] {
  const violations: string[] = []
  const adopted = RECORD_FILES_ADOPTED_AT.slice(0, 10)

  for (const bundle of bundles) {
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

/** Full v0 publication violations for every discovered manifest. */
function contractViolations(bundles: readonly ChapterBundle[]): string[] {
  return bundles.flatMap((bundle) => {
    const result = Publication.checkAll(bundle.documents, bundle.sets)

    return result.ok
      ? []
      : result.errors.map((error) => `${bundle.id}: ${error.code} ${error.where}: ${error.detail}`)
  })
}

const TANG = "tang-mission-750-754"
const QIN = "qin-conquest-han-233-226"

/** A record file the Tang chapter reaches, and one no chapter reaches. */
const TANG_RECORD = "events/tang/akimeya-landfall-753.yaml"

describe("publication approval gate", () => {
  // Preview sets let the contract validate draft and stale manifests too; the
  // bundles' approval states remain the production gate's source of truth.
  const bundles = compileAll(buildTree(files()), { preview: true })

  it("leaves no approval misdated", () => {
    expect(approvalViolations(bundles, TODAY)).toEqual([])
  })

  it("serves exactly the approved chapters, and the drafts only on a build that serves drafts", () => {
    expect(SERVED_CHAPTERS.map((chapter) => chapter.id).sort()).toEqual(
      bundles
        .filter((bundle) => DRAFTS_SERVED || bundle.state === "approved")
        .map((bundle) => bundle.id)
        .sort(),
    )

    for (const bundle of bundles.filter((entry) => entry.state === "approved")) {
      expect(bundle.approval?.digest, bundle.id).toBe(bundle.digest)
    }
  })

  it("validates every discovered chapter with the full publication contract", () => {
    expect(contractViolations(bundles)).toEqual([])
  })

  it("rejects a newly discovered chapter whose compiled publication is invalid", () => {
    const added: TreeFile[] = [
      ...files(),
      {
        path: "sources/example-unlicensed.yaml",
        text: `locator: entry
kind: primary
title: An unlicensed test source
license:
  status: unknown
`,
      },
      {
        path: "events/example-contract-invalid.yaml",
        text: `summary: A synthetic event used only to exercise the all-chapter gate.
types: [occurrence]
date:
  value: 750
  calendar: gregorian
  cite:
    says: The unlicensed source dates the synthetic event.
    source: example-unlicensed
    at: example entry
`,
      },
      {
        path: "chapters/example-contract-invalid.yaml",
        text: `title: An invalid synthetic chapter
summary: A synthetic chapter used only to exercise the all-chapter gate.
window: 750
story:
  summary: The invalid synthetic chapter.
  span: 750
  steps:
    - example-contract-invalid: The synthetic event
`,
      },
    ]
    // The previous case checks every real chapter; checking them again here only
    // repeats that cost, so only the synthetic chapter is checked.
    const discovered = compileAll(buildTree(added), { preview: true }).filter(
      (bundle) => bundle.id === "example-contract-invalid",
    )
    const violations = contractViolations(discovered)

    expect(discovered).toHaveLength(1)

    expect(violations.join("\n")).toContain("example-contract-invalid: unrecorded_source_license")
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

  it("makes an approved chapter stale, with nothing to serve, when a record it reaches changes", () => {
    const digest = compiled(files(), TANG).digest
    const changed = edit(approve(files(), TANG, digest), TANG_RECORD, (text) =>
      text.replace(/summary: (.*)/, "summary: $1 Edited after the approval."),
    )
    const bundle = compiled(changed, TANG)

    expect(bundle.state).toBe("stale")
    expect(bundle.sets).toEqual([])
  })

  it("makes an approved chapter stale when its manifest's card text changes", () => {
    const digest = compiled(files(), TANG).digest
    const changed = edit(approve(files(), TANG, digest), `chapters/${TANG}.yaml`, (text) =>
      text.replace(/^title: (.*)$/m, "title: $1, edited"),
    )

    expect(compiled(changed, TANG).state).toBe("stale")
  })

  it("makes an approved chapter stale when a source it cites changes", () => {
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

  it("treats an approval of other content as stale, and does not serve a draft", () => {
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

  it("serves a stale chapter on a draft build as a draft preview, never as approved", () => {
    const stale = compileChapter(
      buildTree(approve(files(), TANG, `sha256:${"0".repeat(64)}`)),
      TANG,
      { preview: true },
    )

    expect(stale.state).toBe("stale")
    expect(approvalViolations([stale], TODAY)).toEqual([])
    expect(objectOf(stale.sets[0]["published_by"])["role"]).toBe("draft preview, not approved")
  })

  it("lets the preview gate validate stale Qin content as a draft", () => {
    const changed = edit(files(), "events/qin/han-submission-233.yaml", (text) =>
      text.replace(
        /^summary: (.*)$/m,
        "summary: $1 Edited after approval for the synthetic preview check.",
      ),
    )
    const stale = compileChapter(buildTree(changed), QIN, { preview: true })

    expect(stale.state).toBe("stale")
    expect(approvalViolations([stale], TODAY)).toEqual([])
    expect(contractViolations([stale])).toEqual([])
  })

  it("fails an approval dated before the record files or in the future", () => {
    const digest = compiled(files(), TANG).digest
    const bundle = compiled(approve(files(), TANG, digest), TANG)
    const early = { ...bundle, approval: { ...bundle.approval!, on: "2026-09-27" } }
    const future = { ...bundle, approval: { ...bundle.approval!, on: "2999-01-01" } }

    expect(approvalViolations([early], TODAY).join("\n")).toContain("before the record files")
    expect(approvalViolations([future], TODAY).join("\n")).toContain("in the future")
  })
})
