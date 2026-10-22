import { encode, revisionHash, sha256, sourceHash } from "../contract/canonical"
import { isList, isObject, type JsonObject, type JsonValue } from "../contract/types"
import { compileWindow } from "./dates"
import { compileRecord, type Lookup, type RecordKind } from "./records"
import type { AuthoringFile, AuthoringTree } from "./tree"

/**
 * The compiler from record files to the v0 contract (RFD 2, "Decided: the
 * compiler and what ships").
 *
 * A chapter compiles to one bundle: the manifest's stories, the closure of every
 * record and source it reaches, and, when the chapter carries a matching
 * approval, the publication set that approval stands for. The bundle holds
 * complete v0 documents, so `Publication.checkAll`, the vectors and the
 * projection judge compiled content exactly as they judged hand-written files.
 *
 * Revision metadata is generated and is a function of the content alone: one
 * revision per record, its id carrying a prefix of its content hash. A record's
 * history lives in Git, not in a revision list an author maintains. Publication
 * metadata copies the approval block (who, when), which never feeds back into
 * the digest the approval pins, so writing an approval cannot change what it
 * approves.
 *
 * Nothing compiled is checked in: the build, the dev server and the tests all
 * compile from the record files.
 */

export const CONTRACT = "lekishi-historical-contract/v0"

/**
 * The creation time every generated revision carries: the day record files
 * replaced hand-written revisions. A generated revision has no authoring time of
 * its own, because it is derived from the file as it stands; when a record
 * changed is in Git. Every approval is dated on or after this day, so a set is
 * never published before the revisions it publishes.
 */
export const RECORD_FILES_ADOPTED_AT = "2026-10-18T00:00:00Z"

/**
 * Who a generated revision names as its author. Who wrote which line is in Git;
 * the revision names the project's contributors as a body, because a compiled
 * revision has no single author, and per-claim credit arrives with contract v1.
 */
const CONTRIBUTORS = { name: "Lekishi contributors", role: "record file authors (see Git history)" }

/**
 * The digest format version. Changing what the digest covers or how it is
 * encoded is a new version, because it would invalidate every approval at once.
 */
export const DIGEST_VERSION = "lekishi-chapter-digest/2"

export type Approval = { readonly digest: string; readonly by: string; readonly on: string }

/**
 * A chapter's approval state:
 * - `approved`: the approval pins exactly the content the chapter reaches now;
 * - `draft`: no approval, so the chapter is not served;
 * - `stale`: the approval pins different content; production leaves it out.
 */
export type ApprovalState = "approved" | "draft" | "stale"

/** An inclusive window in astronomical year ordinals (233 BCE is -232). */
export type YearWindow = { readonly start: number; readonly end: number }

/**
 * One of a chapter's stories, as the reader's story switcher lists it
 * (rfd/0002/CHAPTER_STORIES.adoc). The story itself is the v0 story record
 * `lks:story:<key>`; this is what the switcher needs without reading v0.
 */
export type ChapterStory = {
  readonly key: string
  /** The story's name in the switcher; a chapter with one story uses the chapter's title. */
  readonly title: string
  /** The window the story opens on, against which its coda steps are checked. */
  readonly window: YearWindow
  /** The story's span, as its story record publishes it. */
  readonly span: YearWindow
}

export type ChapterBundle = {
  readonly id: string
  readonly title: string
  readonly summary: string
  /** The window the chapter opens on, in astronomical year ordinals (233 BCE is -232). */
  readonly window: YearWindow
  /** The chapter's stories, the one it opens on first. */
  readonly stories: readonly ChapterStory[]
  /** The digest of the chapter's content closure as it stands. */
  readonly digest: string
  readonly approval: Approval | null
  readonly state: ApprovalState
  /** Record and source documents, sorted by id. */
  readonly documents: JsonObject[]
  /** The publication set: an approved chapter's, or a draft preview when asked for. */
  readonly sets: JsonObject[]
  /** The files the closure reached, by path below `historical/`, for review tools. */
  readonly files: readonly string[]
}

/** The contract's astronomical ordinal of an era year: 1 BCE is 0. */
function ordinal(point: JsonObject): number {
  const year = Number(point["year"])

  return point["era"] === "bce" ? 1 - year : year
}

function yearWindow(window: JsonObject): YearWindow {
  return {
    start: ordinal(window["start"] as JsonObject),
    end: ordinal(window["end"] as JsonObject),
  }
}

function lookupFor(tree: AuthoringTree): Lookup {
  return {
    file(id) {
      const file = tree.records.get(id)

      if (file === undefined) {
        throw new Error(`no record is ${id}`)
      }

      return file.data
    },
    record(name, kinds, where) {
      const [kind, short] = name.includes(":") ? name.split(":", 2) : [undefined, name]
      const candidates = (kind === undefined ? kinds : kinds.filter((allowed) => allowed === kind))
        .map((allowed) => `lks:${allowed}:${short}`)
        .filter((id) => tree.records.has(id))

      if (candidates.length === 0) {
        throw new Error(`${where}: no ${kinds.join(" or ")} record is named ${name}`)
      }

      if (candidates.length > 1) {
        throw new Error(
          `${where}: ${name} names ${candidates.join(" and ")}; write the kind, as in ${candidates[0].split(":")[1]}:${short}`,
        )
      }

      return candidates[0]
    },
    locator(source, where) {
      const file = tree.sources.get(source)

      if (file === undefined) {
        throw new Error(`${where}: no source is named ${source}`)
      }

      return String(file.data["locator"])
    },
  }
}

/** The records a compiled record refers to, which the closure must include. */
function references(kind: RecordKind, content: JsonObject): string[] {
  const found: string[] = []

  for (const field of ["places", "participants", "part_of"]) {
    for (const entry of isList(content[field]) ? content[field] : []) {
      if (isObject(entry)) {
        for (const key of ["place_id", "actor_id", "event_id"]) {
          if (typeof entry[key] === "string") {
            found.push(entry[key])
          }
        }
      }
    }
  }

  if (kind === "relationship") {
    found.push(String(content["from"]), String(content["to"]))
  }

  // A snapshot reaches its controller, its places and how each was gained, so
  // the chapter that includes it publishes everything its card names.
  if (kind === "territory") {
    found.push(String(content["controller_id"]))

    for (const entry of isList(content["places"]) ? content["places"] : []) {
      if (isObject(entry)) {
        found.push(String(entry["place_id"]))

        if (typeof entry["gained_record_id"] === "string") {
          found.push(entry["gained_record_id"])
        }
      }
    }
  }

  // A journey brings its travellers and the places its legs set out for, but
  // never its stops: a chapter that includes a journey must reach every stop's
  // event itself, so the map never draws through an event the chapter does not
  // publish (`stopsOutsideChapter`).
  if (kind === "journey") {
    for (const traveller of isList(content["travellers"]) ? content["travellers"] : []) {
      found.push(String((traveller as JsonObject)["actor_id"]))
    }

    for (const stop of isList(content["stops"]) ? content["stops"] : []) {
      if (isObject(stop) && typeof stop["toward_place_id"] === "string") {
        found.push(stop["toward_place_id"])
      }
    }
  }

  return found
}

/** The stops of a chapter's journeys whose events the chapter does not reach. */
function stopsOutsideChapter(records: Map<string, JsonObject>): string[] {
  return [...records.values()]
    .filter((record) => record["kind"] === "journey")
    .flatMap((record) => {
      const [revision] = record["revisions"] as JsonObject[]
      const stops = (revision["content"] as JsonObject)["stops"] as JsonObject[]

      return stops
        .map((stop) => String(stop["event_id"]))
        .filter((eventId) => !records.has(eventId))
        .map((eventId) => `${String(record["record_id"])} stops at ${eventId}`)
    })
}

function cited(claims: JsonObject[]): string[] {
  return claims.flatMap((claim) =>
    (isList(claim["citations"]) ? claim["citations"] : [])
      .filter(isObject)
      .map((citation) => String(citation["source_id"])),
  )
}

function revision(
  content: JsonObject,
  claims: JsonObject[],
  dispute: JsonObject | undefined,
  name: string,
) {
  const body: JsonObject = { content, claims }

  if (dispute !== undefined) {
    body["dispute"] = dispute
  }

  const id = `lks:rev:${name}-${sha256(encode(body)).slice(0, 12)}`

  if (id.length > "lks:rev:".length + 63) {
    throw new Error(`${name} is too long to carry a revision id; shorten the file name`)
  }

  const compiled: JsonObject = {
    revision_id: id,
    created_at: RECORD_FILES_ADOPTED_AT,
    author: CONTRIBUTORS,
    change_explanation: "Compiled from the record file as it stands; its history is in Git.",
    ...body,
  }

  return { ...compiled, revision_hash: revisionHash(compiled) }
}

function sourceDocument(file: AuthoringFile): JsonObject {
  // `locator` is an authoring convenience (the citations' default locator
  // kind), not source metadata, so it never reaches the v0 document or its hash.
  const { locator, ...metadata } = file.data
  void locator

  const document: JsonObject = {
    contract: CONTRACT,
    document: "source",
    source_id: `lks:source:${file.name}`,
    ...metadata,
  }

  return { ...document, source_hash: sourceHash(document) }
}

type Step = { readonly record: string; readonly caption: string | undefined }

/** One story as its manifest writes it, with where it is written for messages. */
type WrittenStory = {
  readonly key: string
  readonly title: string
  readonly content: JsonObject
  /** The manifest's window for the first story, else the story's own, else its span. */
  readonly window: JsonValue
  /** Where the story sits in the manifest, as in `stories[1]`. */
  readonly at: string
}

/**
 * A manifest's stories. A manifest with one story writes `story:`, whose key is
 * the chapter id and whose title is the chapter's; a manifest with several
 * writes `stories:`, and the first opens on the chapter's `window`.
 */
export function writtenStories(manifest: AuthoringFile): WrittenStory[] {
  const data = manifest.data

  if (!isList(data["stories"])) {
    return [
      {
        key: manifest.name,
        title: String(data["title"]),
        content: data["story"] as JsonObject,
        window: data["window"] as JsonValue,
        at: "story",
      },
    ]
  }

  return data["stories"].filter(isObject).map((story, index) => {
    if (index === 0 && story["window"] !== undefined) {
      throw new Error(
        `${manifest.path}: stories[0] opens on the chapter's window; write it as the manifest's \`window\``,
      )
    }

    return {
      key: String(story["key"]),
      title: String(story["title"]),
      content: story,
      window: (index === 0 ? data["window"] : (story["window"] ?? story["span"])) as JsonValue,
      at: `stories[${index}]`,
    }
  })
}

/**
 * Fails when a story key is written twice, in this manifest or any other: a
 * story's key is its record id, `lks:story:<key>`, and ids are unique across the
 * project. A one-story manifest's key is its chapter id.
 */
function checkStoryKeys(tree: AuthoringTree, manifest: AuthoringFile, stories: WrittenStory[]) {
  const seen = new Set<string>()

  for (const story of stories) {
    if (seen.has(story.key)) {
      throw new Error(`${manifest.path}: two stories have the key ${story.key}`)
    }

    seen.add(story.key)
  }

  for (const other of tree.chapters.values()) {
    if (other.name === manifest.name) {
      continue
    }

    const keys = isList(other.data["stories"])
      ? other.data["stories"].filter(isObject).map((story) => String(story["key"]))
      : [other.name]

    for (const key of keys.filter((candidate) => seen.has(candidate))) {
      throw new Error(`${manifest.path}: the story key ${key} is already a story in ${other.path}`)
    }
  }
}

function steps(manifest: AuthoringFile, story: WrittenStory, lookup: Lookup): Step[] {
  return (story.content["steps"] as JsonValue[]).map((entry, index) => {
    const where = `${manifest.path}: ${story.at}.steps[${index}]`

    if (typeof entry === "string") {
      return { record: lookup.record(entry, ["event", "relationship"], where), caption: undefined }
    }

    const pairs = Object.entries(entry as JsonObject)

    if (pairs.length !== 1) {
      throw new Error(
        `${where}: a step is one id and its caption, as in "- akimeya-landfall-753: The landfall"`,
      )
    }

    const [[name, caption]] = pairs

    return {
      record: lookup.record(name, ["event", "relationship"], where),
      caption: String(caption),
    }
  })
}

/**
 * The digest an approval pins: the manifest without its approval, then every
 * record and source the chapter reaches, each as its kind, id and parsed
 * content, in id order. A record also carries its compiled claim-id order,
 * because the first quoted claim is reader-visible and follows the order of
 * cited fields in the YAML file. Parsed content, so a comment or reformatting
 * never re-opens an approval; a changed value or reader-visible claim order
 * always does, including in a shared place or source licence.
 */
function digest(
  manifest: AuthoringFile,
  files: readonly AuthoringFile[],
  version: string,
  claimOrder?: ReadonlyMap<string, readonly string[]>,
): string {
  const { approval, ...unapproved } = manifest.data
  void approval

  const payload = {
    version,
    chapter: manifest.name,
    manifest: unapproved,
    files: [...files]
      .map((file) => ({
        kind: file.kind,
        id: file.name,
        content: file.data,
        ...(file.kind === "source" || claimOrder === undefined
          ? {}
          : { claim_order: claimOrder.get(file.path) ?? [] }),
      }))
      .sort((a, b) =>
        a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind),
      ),
  }

  return `sha256:${sha256(encode(payload))}`
}

export function chapterDigest(
  manifest: AuthoringFile,
  files: readonly AuthoringFile[],
  claimOrder: ReadonlyMap<string, readonly string[]>,
): string {
  return digest(manifest, files, DIGEST_VERSION, claimOrder)
}

/**
 * Recomputes a v1 digest only so `pnpm approvals` can locate an approval's
 * historical snapshot after the v2 upgrade. Publication state never calls
 * this: a v1 approval remains stale until the owner approves its v2 digest.
 */
export function historicalChapterDigestV1(
  manifest: AuthoringFile,
  files: readonly AuthoringFile[],
): string {
  return digest(manifest, files, "lekishi-chapter-digest/1")
}

function approvalOf(manifest: AuthoringFile): Approval | null {
  const approval = manifest.data["approval"]

  return isObject(approval)
    ? { digest: String(approval["digest"]), by: String(approval["by"]), on: String(approval["on"]) }
    : null
}

/** Who publishes a set, when, and what the set says about it. */
type Publisher = {
  readonly at: string
  readonly by: JsonObject
  readonly setSuffix: string
  readonly explanation: string
  readonly notes: string
}

function approvedBy(approval: Approval, digest: string): Publisher {
  return {
    at: `${approval.on}T00:00:00Z`,
    by: { name: approval.by, role: "owner" },
    setSuffix: digest.slice("sha256:".length, "sha256:".length + 12),
    explanation: `Publishes the chapter at the content its approval pins, ${digest}.`,
    notes: `Self-review by the contributors. ${approval.by} approved this content for publication on ${approval.on} at ${digest}; that approval is an owner decision, not independent or specialist review.`,
  }
}

/**
 * The publisher of a draft preview: the chapter as it stands, published to the
 * contract's checks and nowhere else. It never names an owner and never reads as
 * an approval, so a check that needs the owner's word reads the bundle's
 * `state`, never the existence of a set.
 */
function previewOf(digest: string): Publisher {
  return {
    at: RECORD_FILES_ADOPTED_AT,
    by: { name: CONTRIBUTORS.name, role: "draft preview, not approved" },
    setSuffix: `draft-${digest.slice("sha256:".length, "sha256:".length + 12)}`,
    explanation: `Previews the chapter's unapproved content, ${digest}, for checks and review only.`,
    notes: "Self-review by the contributors. The owner has not approved this content.",
  }
}

function publicationSet(
  bundle: { id: string; title: string },
  publisher: Publisher,
  members: JsonObject[],
  sources: JsonObject[],
): JsonObject {
  return {
    contract: CONTRACT,
    document: "publication_set",
    set_id: `lks:set:${bundle.id}-${publisher.setSuffix}`,
    title: bundle.title,
    change_explanation: publisher.explanation,
    members: members.map((record) => {
      const revisions = record["revisions"] as JsonObject[]
      const latest = revisions[revisions.length - 1]

      return {
        record_id: record["record_id"],
        revision_id: latest["revision_id"],
        revision_hash: latest["revision_hash"],
      }
    }),
    sources: sources.map((source) => ({
      source_id: source["source_id"],
      source_hash: source["source_hash"],
    })),
    // The review the set can honestly record is the contributors' own: the
    // owner's approval is an editorial decision about publication, not a review
    // by anyone independent of the preparation, so it is recorded as who
    // published and in the notes, and the atlas keeps saying that independent
    // and specialist review remain open.
    review: {
      reviewed_at: publisher.at,
      reviewer: CONTRIBUTORS,
      independence: "self_review",
      checklist: {
        source_support: true,
        attribution: true,
        date_location_uncertainty: true,
        attestation_vs_interpretation: true,
        reuse_rights: true,
      },
      notes: publisher.notes,
    },
    published_at: publisher.at,
    published_by: publisher.by,
    supersedes: null,
    correction_of_revision: null,
  }
}

export type CompileOptions = {
  /**
   * Publish a chapter without a matching approval as a draft preview, so its
   * content can be checked and reviewed. The bundle's `state` still says it is a
   * draft or stale; nothing that serves readers may set this.
   */
  readonly preview?: boolean
}

/** Compiles one chapter manifest and everything it reaches. */
export function compileChapter(
  tree: AuthoringTree,
  id: string,
  options: CompileOptions = {},
): ChapterBundle {
  const manifest = tree.chapters.get(id)

  if (manifest === undefined) {
    throw new Error(`no chapter manifest is named ${id}`)
  }

  const lookup = lookupFor(tree)
  const stories = writtenStories(manifest)

  checkStoryKeys(tree, manifest, stories)

  const storySteps = stories.map((story) => steps(manifest, story, lookup))
  const records = new Map<string, JsonObject>()
  const reached: AuthoringFile[] = []
  const claimOrder = new Map<string, string[]>()
  // A chapter may publish a record its story does not step through (an arc the
  // map draws, say); `include` names those, so the closure is still explicit.
  const included = (isList(manifest.data["include"]) ? manifest.data["include"] : []).map(
    (name, index) =>
      lookup.record(
        String(name),
        ["place", "actor", "event", "relationship", "territory", "journey"],
        `${manifest.path}: include[${index}]`,
      ),
  )
  const pending = [...storySteps.flat().map((step) => step.record), ...included]
  const sourceNames = new Set<string>()

  while (pending.length > 0) {
    const recordId = pending.shift() as string

    if (records.has(recordId)) {
      continue
    }

    const file = tree.records.get(recordId) as AuthoringFile
    const kind = file.kind as RecordKind
    let compiled

    try {
      compiled = compileRecord(kind, file.name, file.data, lookup)
    } catch (error) {
      throw new Error(`${file.path}: ${(error as Error).message}`)
    }

    records.set(recordId, {
      contract: CONTRACT,
      document: "record",
      kind,
      record_id: recordId,
      revisions: [revision(compiled.content, compiled.claims, compiled.dispute, file.name)],
      publication: null,
    })
    reached.push(file)
    claimOrder.set(
      file.path,
      compiled.claims.map((claim) => String(claim["claim_id"])),
    )
    pending.push(...references(kind, compiled.content))

    for (const source of cited(compiled.claims)) {
      sourceNames.add(source.slice("lks:source:".length))
    }
  }

  const outside = stopsOutsideChapter(records)

  if (outside.length > 0) {
    throw new Error(
      `${manifest.path}: a journey the chapter includes stops at events the chapter does not reach, so the map would draw through them (${outside.join("; ")}); step through or include those events, or leave the journey out`,
    )
  }

  const sourceFiles = [...sourceNames].sort().map((name) => {
    const file = tree.sources.get(name)

    if (file === undefined) {
      throw new Error(`${manifest.path}: a record cites ${name}, which has no source file`)
    }

    return file
  })

  // One v0 story record per story; v0 publishes several in one set unchanged.
  const chapterStories = stories.map((story, index): ChapterStory => {
    const storyId = `lks:story:${story.key}`
    const span = compileWindow(story.content["span"])
    const storyContent: JsonObject = {
      summary: story.content["summary"] as string,
      window: span,
      steps: storySteps[index].map((step, position) => ({
        record_id: step.record,
        // The first step is where the story starts; the contract has no other role.
        role: position === 0 ? "start" : "step",
        ...(step.caption === undefined ? {} : { caption: step.caption }),
      })),
    }

    if (story.content["coverage"] !== undefined) {
      storyContent["coverage_note"] = story.content["coverage"]
    }

    if (story.content["notes"] !== undefined) {
      storyContent["editorial_notes"] = story.content["notes"]
    }

    records.set(storyId, {
      contract: CONTRACT,
      document: "record",
      kind: "story",
      record_id: storyId,
      revisions: [revision(storyContent, [], undefined, story.key)],
      publication: null,
    })

    return {
      key: story.key,
      title: story.title,
      window: yearWindow(compileWindow(story.window)),
      span: yearWindow(span),
    }
  })

  const digest = chapterDigest(manifest, [...reached, ...sourceFiles], claimOrder)
  const approval = approvalOf(manifest)
  const state: ApprovalState =
    approval === null ? "draft" : approval.digest === digest ? "approved" : "stale"
  const sources = sourceFiles.map(sourceDocument)
  const members = [...records.values()].sort((a, b) =>
    String(a["record_id"]).localeCompare(String(b["record_id"])),
  )
  const title = String(manifest.data["title"])
  const publisher =
    state === "approved"
      ? approvedBy(approval as Approval, digest)
      : options.preview === true
        ? previewOf(digest)
        : undefined
  const sets =
    publisher === undefined ? [] : [publicationSet({ id, title }, publisher, members, sources)]

  if (sets.length === 1) {
    const set = sets[0]

    for (const record of members) {
      const member = (set["members"] as JsonObject[]).find(
        (entry) => entry["record_id"] === record["record_id"],
      ) as JsonObject

      record["publication"] = {
        published_revision_id: member["revision_id"],
        published_revision_hash: member["revision_hash"],
        set_id: set["set_id"],
        published_at: set["published_at"],
        published_by: set["published_by"],
      }
    }
  }

  return {
    id,
    title,
    summary: String(manifest.data["summary"]),
    window: yearWindow(compileWindow(manifest.data["window"])),
    stories: chapterStories,
    digest,
    approval,
    state,
    documents: [...members, ...sources],
    sets,
    files: [manifest.path, ...[...reached, ...sourceFiles].map((file) => file.path).sort()],
  }
}

/** Every chapter in the tree, in id order. */
export function compileAll(tree: AuthoringTree, options: CompileOptions = {}): ChapterBundle[] {
  return [...tree.chapters.keys()].sort().map((id) => compileChapter(tree, id, options))
}
