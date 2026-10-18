import { execFileSync } from "node:child_process"
import path from "node:path"
import { createInterface } from "node:readline/promises"
import { readFileSync, writeFileSync } from "node:fs"
import { parse } from "yaml"
import { isList, isObject, type JsonObject, type JsonValue } from "../contract/types"
import { compileAll, compileChapter, type Approval, type ChapterBundle } from "./compile"
import {
  buildTree,
  historicalDirectory,
  readFiles,
  type AuthoringTree,
  type TreeFile,
} from "./tree"

/**
 * `pnpm approvals`: what needs the owner's approval, and what changed since the
 * last one (RFD 2, "Decided: the approval digest").
 *
 * Every chapter is listed as approved, draft, or stale. For a chapter that is
 * not approved, the tool finds the content the owner last approved and shows
 * the field-level changes since then, record by record:
 *
 * - the last approval is the one the manifest carries (a stale chapter) or the
 *   newest one in the manifest's Git history (a chapter whose approval was
 *   removed), and its content is the newest commit whose record files compile
 *   to the digest that approval pins;
 * - a chapter never approved as record files is compared with the hand-written
 *   JSON set it was published as before the record files, the newest commit
 *   that still carries `historical/chapters/<id>/publication-sets/`;
 * - otherwise everything is new, and the tool says so.
 *
 * The comparison reads what a reader is shown: each record's content, claims
 * and dispute, each source's metadata, and the chapter card's title, summary
 * and window. Generated revision metadata is not compared. Claims are keyed by
 * the field they assert rather than by position or id, so a renumbered claim
 * reads as unchanged.
 *
 * `pnpm approvals approve <chapter>` writes the approval, and only for a person:
 * it needs an interactive terminal and the chapter id typed back. It names the
 * approver from `git config user.name` unless `--by` gives a name, and dates the
 * approval in UTC, as the build's gate does.
 */

/** Reads the repository's history. Split out so the comparison can be tested without Git. */
export type History = {
  /** Commits that touched a path below the repository root, newest first. */
  commits(path: string): string[]
  /** Every file below `historical/` at a commit, as paths below it and their text. */
  files(commit: string): TreeFile[]
  /** A commit's short id and subject, for messages. */
  describe(commit: string): string
}

/** The content a chapter is compared with. */
export type Baseline =
  | {
      readonly kind: "approval"
      readonly commit: string
      readonly approval: Approval
      readonly views: Map<string, View>
    }
  | {
      readonly kind: "legacy"
      readonly commit: string
      readonly setId: string
      readonly views: Map<string, View>
    }
  | { readonly kind: "none"; readonly reason: string }

/** One document as the comparison reads it, with the file an author edits. */
export type View = { readonly label: string; readonly file?: string; readonly value: JsonObject }

export type FieldChange = {
  readonly field: string
  readonly before?: JsonValue
  readonly after?: JsonValue
}

export type DocumentChange = {
  readonly key: string
  readonly label: string
  readonly file?: string
  readonly status: "added" | "removed" | "changed"
  readonly fields: FieldChange[]
}

const STORY = "story"

const CARD = "card"

/** The revision a reader is shown: the published one, else the newest. */
function shownRevision(document: JsonObject): JsonObject {
  const revisions = isList(document["revisions"]) ? document["revisions"].filter(isObject) : []
  const mirror = document["publication"]
  const published = isObject(mirror)
    ? revisions.find((revision) => revision["revision_id"] === mirror["published_revision_id"])
    : undefined

  return published ?? revisions[revisions.length - 1] ?? {}
}

/**
 * Claims keyed by the field they assert, with a counter when a field carries
 * several, so the comparison follows what a claim supports rather than its id.
 */
function claimsByField(claims: JsonValue | undefined): JsonObject {
  const keyed: JsonObject = {}
  const seen = new Map<string, number>()

  for (const claim of isList(claims) ? claims.filter(isObject) : []) {
    const field = String(claim["asserts"]) || "the whole record"
    const count = (seen.get(field) ?? 0) + 1

    seen.set(field, count)
    keyed[count === 1 ? field : `${field} #${count}`] = claim
  }

  return keyed
}

/** The comparable part of each record and source, keyed so one chapter's story pairs with another's. */
export function viewsOf(
  documents: readonly JsonObject[],
  fileOf: (id: string) => string | undefined = () => undefined,
): Map<string, View> {
  const views = new Map<string, View>()

  for (const document of documents) {
    if (document["document"] === "record") {
      const id = String(document["record_id"])
      const revision = shownRevision(document)
      const value: JsonObject = {
        content: revision["content"] ?? null,
        claims: claimsByField(revision["claims"]),
      }

      if (revision["dispute"] !== undefined) {
        value["dispute"] = revision["dispute"]
      }

      // A chapter has one story; pairing it by role keeps a renamed story
      // readable as one changed record.
      views.set(document["kind"] === "story" ? STORY : id, {
        label: document["kind"] === "story" ? `${id} (the story)` : id,
        file: fileOf(id),
        value: document["kind"] === "story" ? { record_id: id, ...value } : value,
      })
    } else if (document["document"] === "source") {
      const id = String(document["source_id"])
      const { source_hash, ...value } = document

      void source_hash
      views.set(id, { label: id, file: fileOf(id), value })
    }
  }

  return views
}

/** The chapter card a reader meets on the root page. */
function cardView(manifest: JsonObject | undefined, file: string): View {
  return {
    label: "the chapter card",
    file,
    value: {
      title: manifest?.["title"] ?? null,
      summary: manifest?.["summary"] ?? null,
      window: manifest?.["window"] ?? null,
    },
  }
}

function fileLookup(tree: AuthoringTree): (id: string) => string | undefined {
  return (id) =>
    tree.records.get(id)?.path ??
    // A chapter's story is written in its manifest.
    (id.startsWith("lks:story:")
      ? tree.chapters.get(id.slice("lks:story:".length))?.path
      : undefined) ??
    (id.startsWith("lks:source:")
      ? tree.sources.get(id.slice("lks:source:".length))?.path
      : undefined)
}

/** A compiled chapter's views, its card included. */
export function chapterViews(tree: AuthoringTree, bundle: ChapterBundle): Map<string, View> {
  const views = viewsOf(bundle.documents, fileLookup(tree))

  views.set(CARD, cardView(tree.chapters.get(bundle.id)?.data, `chapters/${bundle.id}.yaml`))

  return views
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Every leaf of a value, by a readable path such as `content.places[0]`. */
function leaves(value: JsonValue | undefined, prefix: string, into: Map<string, JsonValue>): void {
  if (isList(value)) {
    if (value.length === 0) {
      into.set(prefix, [])
    }

    value.forEach((item, index) => leaves(item, `${prefix}[${index}]`, into))
  } else if (isObject(value)) {
    const keys = Object.keys(value).sort()

    if (keys.length === 0) {
      into.set(prefix, {})
    }

    for (const key of keys) {
      const step = IDENTIFIER.test(key)
        ? `${prefix === "" ? "" : `${prefix}.`}${key}`
        : `${prefix}[${JSON.stringify(key)}]`

      leaves(value[key], step, into)
    }
  } else if (value !== undefined) {
    into.set(prefix, value)
  }
}

/** The field-level changes between two views of one document. */
export function fieldChanges(
  before: JsonObject | undefined,
  after: JsonObject | undefined,
): FieldChange[] {
  const old = new Map<string, JsonValue>()
  const now = new Map<string, JsonValue>()

  leaves(before, "", old)
  leaves(after, "", now)

  const fields = [...new Set([...old.keys(), ...now.keys()])].sort()

  return fields.flatMap((field) => {
    const a = old.get(field)
    const b = now.get(field)

    return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ field, before: a, after: b }]
  })
}

/** What changed from one set of views to another, documents in key order. */
export function compareViews(
  before: Map<string, View>,
  after: Map<string, View>,
): DocumentChange[] {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) =>
    a === CARD ? -1 : b === CARD ? 1 : a.localeCompare(b),
  )

  return keys.flatMap((key): DocumentChange[] => {
    const old = before.get(key)
    const now = after.get(key)
    const fields = fieldChanges(old?.value, now?.value)

    if (fields.length === 0) {
      return []
    }

    const shown = (now ?? old) as View

    return [
      {
        key,
        label: shown.label,
        file: now?.file ?? old?.file,
        status: old === undefined ? "added" : now === undefined ? "removed" : "changed",
        fields,
      },
    ]
  })
}

/** The approval a manifest's text carries, if any. */
function approvalIn(text: string | undefined): Approval | null {
  if (text === undefined) {
    return null
  }

  const data = parse(text) as unknown
  const approval = isObject(data) ? data["approval"] : undefined

  return isObject(approval)
    ? { digest: String(approval["digest"]), by: String(approval["by"]), on: String(approval["on"]) }
    : null
}

/** How many commits the search for approved content reads before giving up. */
const SEARCH_LIMIT = 300

/** Finds the content a chapter was last approved at, or its hand-written predecessor. */
export function findBaseline(history: History, bundle: ChapterBundle): Baseline {
  const id = bundle.id
  const manifestPath = `chapters/${id}.yaml`
  let approval = bundle.approval

  if (approval === null) {
    for (const commit of history.commits(`historical/${manifestPath}`)) {
      approval = approvalIn(history.files(commit).find((file) => file.path === manifestPath)?.text)

      if (approval !== null) {
        break
      }
    }
  }

  if (approval !== null) {
    for (const commit of history.commits("historical").slice(0, SEARCH_LIMIT)) {
      let tree: AuthoringTree
      let earlier: ChapterBundle

      try {
        tree = buildTree(history.files(commit))

        if (!tree.chapters.has(id)) {
          continue
        }

        earlier = compileChapter(tree, id)
      } catch {
        // A commit the current schemas or compiler cannot read cannot hold the
        // approved content either: the digest is over content they accept.
        continue
      }

      if (earlier.digest === approval.digest) {
        return { kind: "approval", commit, approval, views: chapterViews(tree, earlier) }
      }
    }
  }

  const legacyDirectory = `chapters/${id}/publication-sets/`
  const legacy = history
    .commits(`historical/${legacyDirectory}`)
    .flatMap((commit) => [commit, `${commit}^`])
    .find((commit) => history.files(commit).some((file) => file.path.startsWith(legacyDirectory)))

  if (legacy !== undefined) {
    const files = history.files(legacy)
    const documents = files
      .filter(
        (file) =>
          file.path.startsWith(`chapters/${id}/`) &&
          file.path.endsWith(".json") &&
          (file.path.includes("/records/") || file.path.includes("/sources/")),
      )
      .map((file) => JSON.parse(file.text) as JsonObject)
    const set = files.find(
      (file) => file.path.startsWith(legacyDirectory) && file.path.endsWith(".json"),
    )
    // The hand-written chapters had no card in their content (the card text was
    // code), so the card shows as added: the owner approves it for the first time.
    const views = viewsOf(documents)

    return {
      kind: "legacy",
      commit: legacy,
      setId:
        set === undefined
          ? "an unnamed set"
          : String((JSON.parse(set.text) as JsonObject)["set_id"]),
      views,
    }
  }

  return {
    kind: "none",
    reason:
      approval === null
        ? "This chapter has never been approved, so everything in it is new."
        : `No commit holds the content its approval of ${approval.on} pins (${approval.digest}), so everything is shown as new.`,
  }
}

/** A name YAML reads as the same string when written unquoted. */
const PLAIN = /^[\p{L}][\p{L}\p{M} .'-]*$/u

/** Plain words YAML reads as something other than a string. */
const RESERVED = /^(true|false|null)$/i

/** A manifest's text with its approval replaced by `approval`, every other line kept as written. */
export function withApproval(text: string, approval: Approval): string {
  const lines = text.replace(/\s+$/, "").split("\n")
  const kept: string[] = []
  let inApproval = false

  for (const line of lines) {
    if (/^approval:\s*(#.*)?$/.test(line)) {
      inApproval = true
      continue
    }

    if (inApproval && (/^\s/.test(line) || line === "")) {
      continue
    }

    inApproval = false
    kept.push(line)
  }

  return [
    ...kept,
    "approval:",
    `  digest: ${approval.digest}`,
    `  by: ${PLAIN.test(approval.by) && !RESERVED.test(approval.by) ? approval.by : JSON.stringify(approval.by)}`,
    `  on: ${approval.on}`,
    "",
  ].join("\n")
}

/* ---------------------------------------------------------------- output */

type Paint = (code: string, text: string) => string

function painter(enabled: boolean): Paint {
  return enabled ? (code, text) => `\u001b[${code}m${text}\u001b[0m` : (_code, text) => text
}

function show(value: JsonValue | undefined): string {
  return value === undefined ? "(none)" : JSON.stringify(value)
}

/** How much unchanged text `where` keeps on each side of an edit. */
const CONTEXT = 30

/**
 * Where two long texts differ, as `…before [-old-]{+new+} after…`, so an edit
 * inside a paragraph can be read without comparing two paragraphs by eye.
 */
export function where(before: string, after: string): string {
  let start = 0

  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1
  }

  let end = 0

  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1
  }

  const lead = before.slice(Math.max(0, start - CONTEXT), start)
  const tail = before.slice(before.length - end, before.length - end + CONTEXT)

  return [
    start > CONTEXT ? "…" : "",
    lead,
    `[-${before.slice(start, before.length - end)}-]`,
    `{+${after.slice(start, after.length - end)}+}`,
    tail,
    end > CONTEXT ? "…" : "",
  ].join("")
}

const STATE_LABEL = { approved: "approved", draft: "draft   ", stale: "STALE   " } as const

export function formatList(
  bundles: readonly ChapterBundle[],
  paint: Paint = painter(false),
): string {
  const width = Math.max(...bundles.map((bundle) => bundle.id.length))
  const lines = ["Chapters", ""]

  for (const bundle of bundles) {
    const colour = bundle.state === "approved" ? "32" : bundle.state === "stale" ? "31" : "33"
    const approval =
      bundle.approval === null
        ? "never approved"
        : `approved by ${bundle.approval.by} on ${bundle.approval.on}${bundle.state === "stale" ? `, at ${bundle.approval.digest.slice(0, 19)}…` : ""}`

    lines.push(
      `  ${paint(colour, STATE_LABEL[bundle.state])}  ${bundle.id.padEnd(width)}  ${bundle.digest.slice(0, 19)}…  ${approval}`,
    )
  }

  return lines.join("\n")
}

function baselineLine(baseline: Baseline, history: History): string {
  switch (baseline.kind) {
    case "approval":
      return `Compared with the content ${baseline.approval.by} approved on ${baseline.approval.on}, at ${history.describe(baseline.commit)}.`
    case "legacy":
      return `Never approved as record files. Compared with the hand-written set it was published as, ${baseline.setId}, at ${history.describe(baseline.commit)}; the ledger in rfd/0002/PUBLICATION_APPROVAL.adoc records that decision.`
    case "none":
      return baseline.reason
  }
}

export function formatChanges(
  bundle: ChapterBundle,
  baseline: Baseline,
  changes: readonly DocumentChange[],
  history: History,
  paint: Paint = painter(false),
): string {
  const counts = { added: 0, removed: 0, changed: 0 }

  for (const change of changes) {
    counts[change.status] += 1
  }

  const lines = [
    paint("1", `${bundle.id}: ${bundle.state}`),
    `  ${baselineLine(baseline, history)}`,
    `  ${counts.changed} changed, ${counts.added} added, ${counts.removed} removed.`,
  ]

  for (const change of changes) {
    const mark = change.status === "added" ? "+" : change.status === "removed" ? "-" : "~"
    const colour = change.status === "added" ? "32" : change.status === "removed" ? "31" : "33"

    lines.push(
      "",
      `  ${paint(colour, mark)} ${paint("1", change.label)}${change.file === undefined ? "" : `  historical/${change.file}`}`,
    )

    // An added or removed document lists every field it carries, so the owner
    // reads new content in full rather than as a name.
    for (const field of change.fields) {
      lines.push(`      ${field.field}`)

      if (field.before !== undefined || change.status === "changed") {
        lines.push(`        ${paint("31", `- ${show(field.before)}`)}`)
      }

      if (field.after !== undefined || change.status === "changed") {
        lines.push(`        ${paint("32", `+ ${show(field.after)}`)}`)
      }

      if (
        typeof field.before === "string" &&
        typeof field.after === "string" &&
        Math.max(field.before.length, field.after.length) > 2 * CONTEXT
      ) {
        lines.push(`        ${paint("36", `~ ${where(field.before, field.after)}`)}`)
      }
    }
  }

  lines.push(
    "",
    `  This content is ${bundle.digest}.`,
    `  To approve it: pnpm approvals approve ${bundle.id}`,
  )

  return lines.join("\n")
}

/* ------------------------------------------------------------------- git */

/** The repository's history through the `git` command, reading each commit once. */
export function gitHistory(root: string): History {
  const cache = new Map<string, TreeFile[]>()
  const run = (args: string[], input?: Buffer): Buffer =>
    execFileSync("git", args, { cwd: root, input, maxBuffer: 1 << 28 })

  return {
    commits(target) {
      return run(["log", "--format=%H", "--", target]).toString("utf8").split("\n").filter(Boolean)
    },
    files(commit) {
      const cached = cache.get(commit)

      if (cached !== undefined) {
        return cached
      }

      let listing: string

      try {
        listing = run(["ls-tree", "-r", "-z", commit, "--", "historical/"]).toString("utf8")
      } catch {
        cache.set(commit, [])
        return []
      }

      const entries = listing
        .split("\0")
        .filter(Boolean)
        .map((line) => {
          const [meta, file] = line.split("\t") as [string, string]
          const [, type, hash] = meta.split(" ") as [string, string, string]

          return { type, hash, file }
        })
        .filter((entry) => entry.type === "blob" && /\.(ya?ml|json)$/.test(entry.file))
      const output = run(
        ["cat-file", "--batch"],
        Buffer.from(entries.map((entry) => entry.hash).join("\n") + "\n"),
      )
      const files: TreeFile[] = []
      let offset = 0

      for (const entry of entries) {
        const header = output.indexOf(0x0a, offset)
        const size = Number(output.subarray(offset, header).toString("utf8").split(" ")[2])
        const start = header + 1

        files.push({
          path: entry.file.slice("historical/".length),
          text: output.subarray(start, start + size).toString("utf8"),
        })
        offset = start + size + 1
      }

      cache.set(commit, files)

      return files
    },
    describe(commit) {
      return run(["log", "-1", "--format=%h (%s)", commit]).toString("utf8").trim()
    },
  }
}

/* ------------------------------------------------------------------- CLI */

const USAGE = `Usage:
  pnpm approvals                     list every chapter, with the changes awaiting approval
  pnpm approvals diff <chapter>      show one chapter's changes since its last approval
  pnpm approvals approve <chapter> [--by "Name"]
                                     approve a chapter's current content (the owner only,
                                     in an interactive terminal)`

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function approve(
  root: string,
  bundle: ChapterBundle,
  by: string | undefined,
  out: (text: string) => void,
): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    out(
      "Approval needs an interactive terminal: only the owner approves a chapter, by typing its id.",
    )
    return 1
  }

  const approver =
    by ??
    (() => {
      try {
        return execFileSync("git", ["config", "user.name"], { cwd: root }).toString("utf8").trim()
      } catch {
        return ""
      }
    })()

  if (approver === "") {
    out('Give your name with --by "Name"; git config user.name is not set.')
    return 1
  }

  const approval: Approval = { digest: bundle.digest, by: approver, on: today() }
  const file = path.join(historicalDirectory(), `chapters/${bundle.id}.yaml`)
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt.question(
    `\nApprove ${bundle.id} at ${bundle.digest}\nas ${approver}, on ${approval.on}? Type the chapter id to confirm: `,
  )

  prompt.close()

  if (answer.trim() !== bundle.id) {
    out("Not approved: the id did not match.")
    return 1
  }

  writeFileSync(file, withApproval(readFileSync(file, "utf8"), approval))

  // The written file must compile to an approval of exactly what was shown.
  const check = compileChapter(buildTree(readFiles()), bundle.id)

  if (check.state !== "approved") {
    out(
      `The approval was written but does not match: ${check.id} is ${check.state}. Check historical/chapters/${bundle.id}.yaml.`,
    )
    return 1
  }

  out(`Approved. Commit historical/chapters/${bundle.id}.yaml; nothing else changed.`)

  return 0
}

/** Runs the command line; returns the exit code. */
export async function main(
  argv: readonly string[],
  out: (text: string) => void = console.log,
): Promise<number> {
  const root = path.resolve(historicalDirectory(), "..")
  const paint = painter(process.stdout.isTTY === true && process.env["NO_COLOR"] === undefined)
  const [command, chapter, ...rest] = argv
  const tree = buildTree(readFiles())
  const bundles = compileAll(tree)
  const history = gitHistory(root)
  const changesOf = (bundle: ChapterBundle) => {
    const baseline = findBaseline(history, bundle)
    const before = baseline.kind === "none" ? new Map<string, View>() : baseline.views

    return formatChanges(
      bundle,
      baseline,
      compareViews(before, chapterViews(tree, bundle)),
      history,
      paint,
    )
  }
  const named = (id: string | undefined) => bundles.find((bundle) => bundle.id === id)

  if (command === undefined || command === "list") {
    out(formatList(bundles, paint))

    for (const bundle of bundles.filter((entry) => entry.state !== "approved")) {
      out("")
      out(changesOf(bundle))
    }

    return 0
  }

  if ((command === "diff" || command === "approve") && named(chapter) === undefined) {
    out(chapter === undefined ? USAGE : `There is no chapter manifest named ${chapter}.`)
    return 1
  }

  if (command === "diff") {
    out(changesOf(named(chapter) as ChapterBundle))
    return 0
  }

  if (command === "approve") {
    const bundle = named(chapter) as ChapterBundle
    const byIndex = rest.indexOf("--by")

    if (bundle.state === "approved") {
      out(`${bundle.id} is already approved at its current content.`)
      return 0
    }

    out(changesOf(bundle))

    return approve(root, bundle, byIndex === -1 ? undefined : rest[byIndex + 1], out)
  }

  out(USAGE)

  return command === "help" || command === "--help" ? 0 : 1
}
