import { describe, expect, it } from "vitest"
import { parse, stringify } from "yaml"
import { type JsonObject } from "../contract/types"
import {
  approveEach,
  chapterViews,
  compareViews,
  confirmed,
  findBaseline,
  viewsOf,
  where,
  withApproval,
  type History,
} from "./approvals"
import {
  compileChapter,
  historicalChapterDigestV1,
  type Approval,
  type ChapterBundle,
} from "./compile"
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

function v1Digest(source: TreeFile[]): string {
  const tree = buildTree(source)
  const bundle = compileChapter(tree, TANG)
  const byPath = new Map(
    [...tree.records.values(), ...tree.sources.values()].map((file) => [file.path, file]),
  )
  const reached = bundle.files.slice(1).map((path) => {
    const file = byPath.get(path)

    if (file === undefined) {
      throw new Error(`missing ${path}`)
    }

    return file
  })

  return historicalChapterDigestV1(tree.chapters.get(TANG)!, reached)
}

function reorderLandfallClaims(source: TreeFile[]): TreeFile[] {
  return edit(source, RECORD, (text) => {
    const start = text.indexOf("cites:\n")
    const cites = text.slice(start)

    return text.slice(0, start).replace("date:\n", `${cites}date:\n`)
  })
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
      history(
        {
          newer: now,
          approved: approved(files(), digest),
          "approved^": files(),
        },
        { [`historical/${MANIFEST}`]: ["approved"] },
      ),
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
        { approved: approved(files(), digest), "approved^": files() },
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

  it("finds a v1 approval's snapshot without accepting it as a current approval", () => {
    const before = files()
    const v1 = approved(before, v1Digest(before))
    const bundle = compiled(v1)
    const baseline = findBaseline(
      history(
        { approvedV1: v1, "approvedV1^": before },
        { [`historical/${MANIFEST}`]: ["approvedV1"] },
      ),
      bundle,
    )

    expect(bundle.state).toBe("stale")
    expect(baseline.kind).toBe("approval")
    expect(baseline.kind === "approval" && baseline.commit).toBe("approvedV1")
    expect(
      baseline.kind === "approval" &&
        compareViews(baseline.views, chapterViews(buildTree(v1), bundle)),
    ).toEqual([])
  })

  it("anchors a v1 baseline before a committed claim-order edit", () => {
    const before = files()
    const approvedV1 = approved(before, v1Digest(before))
    const reordered = reorderLandfallClaims(approvedV1)
    const bundle = compiled(reordered)
    const baseline = findBaseline(
      history(
        { reordered, approvedV1, "approvedV1^": before },
        { [`historical/${MANIFEST}`]: ["approvedV1"] },
      ),
      bundle,
    )

    expect(baseline.kind).toBe("approval")
    expect(baseline.kind === "approval" && baseline.commit).toBe("approvedV1")

    const changes =
      baseline.kind === "approval"
        ? compareViews(baseline.views, chapterViews(buildTree(reordered), bundle))
        : []
    const landfall = changes.find((change) => change.key === "lks:event:akimeya-landfall-753")

    expect(landfall?.fields.map((field) => field.field)).toEqual([
      "claim_order[0]",
      "claim_order[1]",
    ])
  })

  it("does not substitute a legacy set when a known approval cannot be recovered", () => {
    const unknown = approved(files(), `sha256:${"0".repeat(64)}`)
    const legacyPath = `chapters/${TANG}/publication-sets/${TANG}-v1.json`
    const baseline = findBaseline(
      history(
        {
          unknown,
          "unknown^": files(),
          removal: [],
          "removal^": [
            { path: legacyPath, text: JSON.stringify({ set_id: `lks:set:${TANG}-v1` }) },
          ],
        },
        {
          [`historical/${MANIFEST}`]: ["unknown"],
          [`historical/chapters/${TANG}/publication-sets/`]: ["removal"],
        },
      ),
      compiled(unknown),
    )

    expect(baseline).toMatchObject({
      kind: "none",
      reason: expect.stringContaining("No older baseline was substituted"),
    })
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

  it("follows claim details by field while reporting reader-visible order", () => {
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

    const changes = compareViews(viewsOf([record]), viewsOf([reordered]))

    expect(changes).toHaveLength(1)
    expect(changes[0]?.fields.map((field) => field.field)).toEqual([
      "claim_order[0]",
      "claim_order[1]",
    ])
  })

  it("reports a YAML field reorder that changes the leading claim", () => {
    const beforeTree = buildTree(files())
    const before = compileChapter(beforeTree, TANG, { preview: true })
    const afterFiles = reorderLandfallClaims(files())
    const afterTree = buildTree(afterFiles)
    const after = compileChapter(afterTree, TANG, { preview: true })
    const changes = compareViews(chapterViews(beforeTree, before), chapterViews(afterTree, after))
    const landfall = changes.find((change) => change.key === "lks:event:akimeya-landfall-753")

    expect(after.digest).not.toBe(before.digest)
    expect(landfall?.fields.map((field) => field.field)).toEqual([
      "claim_order[0]",
      "claim_order[1]",
    ])
  })

  it("reads an added story as one added block, with the first story still paired", () => {
    // The chapter with its first story only, then with a fixture story added.
    const withStories = (...added: JsonObject[]) =>
      edit(files(), MANIFEST, (text) => {
        const { story, stories, ...manifest } = parse(text) as JsonObject
        const first = (stories as JsonObject[] | undefined)?.[0] ?? {
          key: TANG,
          title: "The embassy",
          ...(story as JsonObject),
        }

        return stringify({ ...manifest, stories: [first, ...added] })
      })
    const beforeTree = buildTree(withStories())
    const before = compileChapter(beforeTree, TANG, { preview: true })
    const afterTree = buildTree(
      withStories({
        key: "example-second-story",
        title: "A second story",
        summary: "A story that exists only to test the comparison.",
        span: "753",
        steps: [{ "yangzhou-invitation-753": "The invitation, told again" }],
      }),
    )
    const after = compileChapter(afterTree, TANG, { preview: true })
    const changes = compareViews(chapterViews(beforeTree, before), chapterViews(afterTree, after))

    expect(after.digest).not.toBe(before.digest)
    expect(changes.map((change) => [change.label, change.status, change.file])).toEqual([
      ["lks:story:example-second-story (a story)", "added", MANIFEST],
    ])
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

  it("approves only on an explicit yes", () => {
    for (const answer of ["y", "Y", " yes ", "YES"]) {
      expect(confirmed(answer)).toBe(true)
    }

    for (const answer of ["", "n", "no", "yy", TANG, "approve"]) {
      expect(confirmed(answer)).toBe(false)
    }
  })

  it("asks about each chapter in turn and writes an approval only for a yes", async () => {
    const tang = compiled(files())
    const other = { ...tang, id: "other-chapter", digest: `sha256:${"1".repeat(64)}` }
    const questions: string[] = []
    const written: [string, Approval][] = []
    const out: string[] = []
    const answers = ["y", ""]

    const code = await approveEach([tang, other], {
      approver: "Example Owner",
      on: "2026-10-21",
      ask: async (question) => {
        questions.push(question)
        return answers.shift() as string
      },
      show: (bundle) => `changes of ${bundle.id}`,
      write: (bundle, approval) => {
        written.push([bundle.id, approval])
        return "approved"
      },
      out: (text) => out.push(text),
    })

    expect(code).toBe(0)
    expect(questions).toHaveLength(2)
    expect(questions[0]).toContain(`${TANG} (1 of 2) at ${tang.digest}`)
    expect(questions[0]).toMatch(/as Example Owner, on 2026-10-21\? \[y\/N\] $/)
    expect(out.indexOf(`changes of ${TANG}`)).toBeLessThan(out.indexOf("changes of other-chapter"))
    expect(written).toEqual([
      [TANG, { digest: tang.digest, by: "Example Owner", on: "2026-10-21" }],
    ])
    expect(out).toContain(`Approved ${TANG}.`)
    expect(out).toContain("Not approved: other-chapter.")
  })

  it("fails when a written approval does not compile as approved", async () => {
    const out: string[] = []
    const code = await approveEach([compiled(files())], {
      approver: "Example Owner",
      on: "2026-10-21",
      ask: async () => "y",
      show: () => "",
      write: () => "stale",
      out: (text) => out.push(text),
    })

    expect(code).toBe(1)
    expect(out.join("\n")).toContain(`${TANG} is stale`)
    expect(out.join("\n")).not.toContain("Approved")
  })
})
