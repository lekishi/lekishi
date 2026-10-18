import { encode, revisionHash, sha256, sourceHash } from "../contract/canonical"
import { isList, isObject, type JsonObject, type JsonValue } from "../contract/types"
import { compileWindow } from "./dates"
import { compileRecord, type Lookup, type RecordKind } from "./records"
import type { AuthoringFile, AuthoringTree } from "./tree"

/**
 * The compiler from record files to the v0 contract (RFD 2, "Decided: the
 * compiler and what ships").
 *
 * A chapter compiles to one bundle: the manifest's story, the closure of every
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
export const DIGEST_VERSION = "lekishi-chapter-digest/1"

export type Approval = { readonly digest: string; readonly by: string; readonly on: string }

/**
 * A chapter's approval state:
 * - `approved`: the approval pins exactly the content the chapter reaches now;
 * - `draft`: no approval, so the chapter is not served;
 * - `stale`: the approval pins different content, which fails the build.
 */
export type ApprovalState = "approved" | "draft" | "stale"

export type ChapterBundle = {
  readonly id: string
  readonly title: string
  readonly summary: string
  /** The window the chapter opens on, in astronomical year ordinals (233 BCE is -232). */
  readonly window: { readonly start: number; readonly end: number }
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

function lookupFor(tree: AuthoringTree): Lookup {
  return {
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

  return found
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

function steps(manifest: AuthoringFile, lookup: Lookup): Step[] {
  const story = manifest.data["story"] as JsonObject

  return (story["steps"] as JsonValue[]).map((entry, index) => {
    const where = `${manifest.path}: story.steps[${index}]`

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
 * content, in id order. Parsed content, so a comment or reformatting never
 * re-opens an approval; a changed value always does, including a shared place
 * or a source's licence.
 */
export function chapterDigest(manifest: AuthoringFile, files: readonly AuthoringFile[]): string {
  const { approval, ...unapproved } = manifest.data
  void approval

  const payload = {
    version: DIGEST_VERSION,
    chapter: manifest.name,
    manifest: unapproved,
    files: [...files]
      .map((file) => ({ kind: file.kind, id: file.name, content: file.data }))
      .sort((a, b) =>
        a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind),
      ),
  }

  return `sha256:${sha256(encode(payload))}`
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
  const story = manifest.data["story"] as JsonObject
  const storySteps = steps(manifest, lookup)
  const records = new Map<string, JsonObject>()
  const reached: AuthoringFile[] = []
  // A chapter may publish a record its story does not step through (an arc the
  // map draws, say); `include` names those, so the closure is still explicit.
  const included = (isList(manifest.data["include"]) ? manifest.data["include"] : []).map(
    (name, index) =>
      lookup.record(
        String(name),
        ["place", "actor", "event", "relationship"],
        `${manifest.path}: include[${index}]`,
      ),
  )
  const pending = [...storySteps.map((step) => step.record), ...included]
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
    pending.push(...references(kind, compiled.content))

    for (const source of cited(compiled.claims)) {
      sourceNames.add(source.slice("lks:source:".length))
    }
  }

  const sourceFiles = [...sourceNames].sort().map((name) => {
    const file = tree.sources.get(name)

    if (file === undefined) {
      throw new Error(`${manifest.path}: a record cites ${name}, which has no source file`)
    }

    return file
  })

  const storyId = `lks:story:${id}`
  const storyContent: JsonObject = {
    summary: story["summary"] as string,
    window: compileWindow(story["span"]),
    steps: storySteps.map((step, index) => ({
      record_id: step.record,
      // The first step is where the story starts; the contract has no other role.
      role: index === 0 ? "start" : "step",
      ...(step.caption === undefined ? {} : { caption: step.caption }),
    })),
  }

  if (story["coverage"] !== undefined) {
    storyContent["coverage_note"] = story["coverage"]
  }

  if (story["notes"] !== undefined) {
    storyContent["editorial_notes"] = story["notes"]
  }

  records.set(storyId, {
    contract: CONTRACT,
    document: "record",
    kind: "story",
    record_id: storyId,
    revisions: [revision(storyContent, [], undefined, id)],
    publication: null,
  })

  const digest = chapterDigest(manifest, [...reached, ...sourceFiles])
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

  const window = compileWindow(manifest.data["window"])

  return {
    id,
    title,
    summary: String(manifest.data["summary"]),
    window: {
      start: ordinal(window["start"] as JsonObject),
      end: ordinal(window["end"] as JsonObject),
    },
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

