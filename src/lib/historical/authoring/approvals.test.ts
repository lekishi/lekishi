import { describe, expect, it } from "vitest"
import { type JsonObject } from "../contract/types"
import {
  chapterViews,
  compareViews,
  findBaseline,
  viewsOf,
  where,
  withApproval,
  type History,
} from "./approvals"
import { compileChapter, type ChapterBundle } from "./compile"
import { buildTree, readFiles, type TreeFile } from "./tree"

/**
 * `pnpm approvals` against in-memory histories of the real tree.
 *
 * The tool's job is to show the owner what changed since the content they last
 * approved, so these tests pin where it finds that content: the commit whose
 * record files compile to the digest the approval pins, a removed approval
 * found in the manifest's history, or the hand-written JSON set that published
 * the chapter before the record files. The approval it writes must compile to
 * an approval of exactly the content shown, and nothing else in the manifest
 * may change.
 */

const TANG = "tang-mission-750-754"

const MANIFEST = `chapters/${TANG}.yaml`

const RECORD = "events/tang/akimeya-landfall-753.yaml"

/**
 * The tree as it stands, with the Tang chapter's approval removed, so the cases
 * hold whether or not the owner has approved it on this branch.
 */
function files(): TreeFile[] {
  return readFiles().map((file) =>
    file.path === MANIFEST
      ? { ...file, text: file.text.replace(/\napproval:\n(?: {2}.*\n?)*/, "\n") }
      : { ...file },
  )
}

function edit(source: TreeFile[], path: string, change: (text: string) => string): TreeFile[] {
  return source.map((file) => (file.path === path ? { ...file, text: change(file.text) } : file))
}

function approved(source: TreeFile[], digest: string): TreeFile[] {
  return edit(source, MANIFEST, (text) =>
    withApproval(text, { digest, by: "Example Owner", on: "2026-10-18" }),
  )
}

function compiled(source: TreeFile[]): ChapterBundle {
  return compileChapter(buildTree(source), TANG)
}

/** A history whose commits hold the given trees, newest first. */
function history(
  commits: Record<string, TreeFile[]>,
  touched: Record<string, string[]> = {},
): History {
  return {
    commits: (path) => touched[path] ?? Object.keys(commits),
    files: (commit) => commits[commit] ?? [],
    describe: (commit) => commit,
  }
}

const edited = (text: string) => text.replace(/summary: (.*)/, "summary: $1 Edited.")

describe("pnpm approvals", () => {
  const digest = compiled(files()).digest

  it("compares a stale chapter with the commit that holds the content its approval pins", () => {
    const now = edit(approved(files(), digest), RECORD, edited)
    const bundle = compiled(now)
    const baseline = findBaseline(
      history({ newer: now, approved: approved(files(), digest), older: [] }),
      bundle,
    )

    expect(bundle.state).toBe("stale")
    expect(baseline.kind).toBe("approval")

    if (baseline.kind !== "approval") {
      return
    }

    expect(baseline.commit).toBe("approved")

    const changes = compareViews(baseline.views, chapterViews(buildTree(now), bundle))

    expect(changes.map((change) => [change.label, change.status, change.file])).toEqual([
      ["lks:event:akimeya-landfall-753", "changed", RECORD],
    ])
    expect(changes[0]?.fields.map((field) => field.field)).toEqual(["content.summary"])
  })

  it("finds a removed approval in the manifest's history", () => {
    const bundle = compiled(files())
    const baseline = findBaseline(
      history(
        { approved: approved(files(), digest) },
        { [`historical/${MANIFEST}`]: ["approved"] },
      ),
      bundle,
    )

    expect(bundle.state).toBe("draft")
    expect(baseline.kind).toBe("approval")
    expect(
      baseline.kind === "approval" &&
        compareViews(baseline.views, chapterViews(buildTree(files()), bundle)),
    ).toEqual([])
  })

  it("compares a chapter never approved as record files with its hand-written set", () => {
    const preview = compileChapter(buildTree(files()), TANG, { preview: true })
    const legacyDocuments = structuredClone(preview.documents)
    const landfall = legacyDocuments.find(
      (document) => document["record_id"] === "lks:event:akimeya-landfall-753",
    ) as JsonObject
    const revision = (landfall["revisions"] as JsonObject[])[0] as JsonObject

    ;(revision["content"] as JsonObject)["summary"] = "The approved wording."

    const legacy: TreeFile[] = [
      ...legacyDocuments.map((document, index) => ({
        path: `chapters/${TANG}/${document["document"] === "record" ? "records" : "sources"}/${index}.json`,
        text: JSON.stringify(document),
      })),
      {
        path: `chapters/${TANG}/publication-sets/${TANG}-v1.json`,
        text: JSON.stringify({ set_id: `lks:set:${TANG}-v1` }),
      },
    ]
    const baseline = findBaseline(
      history(
        { removal: [], "removal^": legacy },
        { [`historical/chapters/${TANG}/publication-sets/`]: ["removal"] },
      ),
      compiled(files()),
    )

    expect(baseline.kind).toBe("legacy")

    if (baseline.kind !== "legacy") {
      return
    }

    expect(baseline.setId).toBe(`lks:set:${TANG}-v1`)

    const changes = compareViews(baseline.views, chapterViews(buildTree(files()), preview))

    // The card was code before the record files, so it reads as new; the one
    // edited record reads as changed and nothing else does.
    expect(changes.map((change) => [change.label, change.status])).toEqual([
      ["the chapter card", "added"],
      ["lks:event:akimeya-landfall-753", "changed"],
    ])
  })

  it("says so when there is nothing to compare with", () => {
    expect(findBaseline(history({}), compiled(files()))).toMatchObject({ kind: "none" })
  })

  it("follows a claim by the field it supports, not by its position or id", () => {
    const record: JsonObject = {
      document: "record",
      kind: "event",
      record_id: "lks:event:example-landing",
      revisions: [
        {
          content: { summary: "A landing." },
          claims: [
            { claim_id: "lks:claim:a", asserts: "/summary", statement: "One." },
            { claim_id: "lks:claim:b", asserts: "/places", statement: "Two." },
          ],
        },
      ],
    }
    const reordered = structuredClone(record)
    const claims = (reordered["revisions"] as JsonObject[])[0]?.["claims"] as JsonObject[]

    claims.reverse()

    expect(compareViews(viewsOf([record]), viewsOf([reordered]))).toEqual([])
  })

  it("writes an approval of the content shown and changes nothing else in the manifest", () => {
    const original = files().find((file) => file.path === MANIFEST)?.text as string

    expect(original).not.toContain("approval:")
    const once = withApproval(original, { digest: "sha256:old", by: "Someone", on: "2026-10-18" })
    const again = withApproval(once, { digest, by: "Example Owner", on: "2026-10-18" })

    expect(again.startsWith(original.trimEnd())).toBe(true)
    expect(again.match(/^approval:/gm)).toHaveLength(1)
    expect(
      again.endsWith(`approval:\n  digest: ${digest}\n  by: Example Owner\n  on: 2026-10-18\n`),
    ).toBe(true)
    expect(compiled(edit(files(), MANIFEST, () => again)).state).toBe("approved")
    expect(withApproval(original, { digest, by: "null", on: "2026-10-18" })).toContain('by: "null"')
  })

  it("points at an edit inside a long text", () => {
    const before = `${"a".repeat(40)} the old reading ${"z".repeat(40)}`
    const after = `${"a".repeat(40)} the new reading ${"z".repeat(40)}`

    expect(where(before, after)).toBe(
      `…${"a".repeat(25)} the [-old-]{+new+} reading ${"z".repeat(21)}…`,
    )
  })
})
