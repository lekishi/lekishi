import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { revisionHash, sourceHash } from "./canonical"
import { contractFile } from "./documents"
import { mapLabel } from "./names"
import * as Publication from "./publication"
import * as Time from "./time"
import {
  isList,
  isObject,
  isString,
  listOf,
  objectOf,
  type JsonObject,
  type JsonValue,
} from "./types"

/**
 * Loads and runs the machine-readable contract vectors under
 * `historical/v0/vectors`.
 *
 * A vector states one boundary case: an operation, an input, and the expected
 * result. Document vectors carry record stubs that are expanded into complete
 * documents here (revision hashes, publication mirrors, and an auto-generated
 * publication set for stubs marked `published`), so a vector can test one rule
 * without restating a whole content tree. A stub that sets `publication`
 * explicitly keeps that value, which is how mirror mismatches are tested.
 *
 * Expectations are matched as a containment: every expected key must match, a
 * list expectation must be contained in the actual list, and a string
 * expectation matches a list containing it. Extra reported codes never fail a
 * vector, so a vector keeps asserting the code it is about.
 */

export const CONTRACT = "lekishi-historical-contract/v0"

const vectorsDirectory = contractFile("vectors")

const DEFAULT_AUTHOR: JsonObject = { name: "Vector Author" }
const DEFAULT_REVIEWER: JsonObject = { name: "Vector Author" }

export class MismatchError extends Error {}

/** All vectors in a named vector file, for example `load("time")`. */
export function load(name: string): JsonObject[] {
  const document = JSON.parse(
    readFileSync(path.join(vectorsDirectory, `${name}.json`), "utf8"),
  ) as JsonObject

  return listOf(document["vectors"]).map((vector) => objectOf(vector))
}

/** Names of the vector files shipped with the contract. */
export function names(): string[] {
  return readdirSync(vectorsDirectory)
    .map((file) => path.parse(file).name)
    .sort()
}

/** Runs a vector and throws when the result does not match its expectation. */
export function runBang(vector: JsonObject): void {
  const actual = run(vector)

  if (!matches(vector["expect"], actual)) {
    throw new MismatchError(
      [
        `contract vector ${String(vector["id"])} did not match its expectation`,
        "",
        `why: ${String(vector["why"])}`,
        `expect: ${JSON.stringify(vector["expect"], null, 2)}`,
        `actual: ${JSON.stringify(actual, null, 2)}`,
      ].join("\n"),
    )
  }
}

export function run(vector: JsonObject): JsonValue {
  const op = vector["op"]
  const input = objectOf(vector["input"])

  switch (op) {
    case "normalize_interval": {
      const result = Time.normalize(input["time"])

      return result.ok ? { interval: intervalView(result.value) } : { error: result.errors }
    }

    case "temporal_match": {
      const result = Time.temporalMatch(input["time"], input["window"], {
        calendar: isString(input["calendar"]) ? input["calendar"] : "gregorian",
      })

      return result.ok
        ? { result: result.value.match, caveats: result.value.caveats }
        : { error: result.errors }
    }

    case "playback_state": {
      const result = Time.playbackState(input["time"], input["playhead"])

      return result.ok ? { result: result.value } : { error: result.errors }
    }

    case "continuous_activity": {
      const result = Time.continuousActivity(input["time"])

      return result.ok ? { result: result.value } : { error: result.errors }
    }

    case "steppable": {
      const result = Time.steppable(input["time"])

      return result.ok ? { result: result.value } : { error: result.errors }
    }

    case "chronological_key": {
      const result = Time.chronologicalKey(input["time"])

      return result.ok
        ? { key: result.value === null ? null : [result.value[0], result.value[1]] }
        : { error: result.errors }
    }

    case "relation": {
      const result = Time.relation(input["a"], input["b"])

      return result.ok
        ? { result: result.value.relation, caveats: result.value.caveats }
        : { error: result.errors }
    }

    case "ordering_check": {
      const result = Time.orderingConsistent(input["a"], input["b"], input["declared"])

      return result.ok ? { consistent: true } : { consistent: false, error: result.errors[0] }
    }

    case "ordering_graph": {
      const found = Time.cycle(input["edges"])

      return { has_cycle: found !== null, cycle: found === null ? null : found }
    }

    case "map_label":
      return { label: mapLabel(input["names"]) }

    case "validate": {
      const tree = buildTree(input)
      const result = Publication.checkAll(tree.documents, tree.sets)

      if (result.ok) {
        return { valid: true, codes: [], current_published: currentView(result.currentPublished) }
      }

      return {
        valid: false,
        codes: [...new Set(result.errors.map((error) => error.code))].sort(),
      }
    }

    case "publication_state": {
      const tree = buildTree(input)
      const records = tree.documents.filter((document) => document["document"] === "record")
      const history = Publication.history(records, tree.sets)

      return {
        current_published: currentView(Publication.currentPublishedObject(records, tree.sets)),
        published_revisions: Object.fromEntries(
          Object.entries(history).map(([recordId, entries]) => [
            recordId,
            entries.map((entry) => entry.revision_id),
          ]),
        ),
        history,
      }
    }

    default:
      throw new MismatchError(`unknown contract vector op ${JSON.stringify(op)}`)
  }
}

/** Expands vector document stubs into documents plus publication sets. */
export function buildTree(input: JsonObject): { documents: JsonObject[]; sets: JsonObject[] } {
  const expanded = listOf(input["documents"]).map((document) => expandDocument(objectOf(document)))
  const documents = expanded.map((entry) => entry.document)
  const autoPublish = expanded
    .filter((entry) => entry.published)
    .map((entry) => entry.document["record_id"])

  let sets: JsonObject[]

  if (Object.hasOwn(input, "sets")) {
    sets = listOf(input["sets"]).map((set) => completeSet(objectOf(set), documents))
  } else if (autoPublish.length > 0) {
    sets = [autoSet(documents, autoPublish)]
  } else {
    sets = []
  }

  const resolved = expanded.map((entry) =>
    entry.explicitPublication ? entry.document : resolveMirror(entry.document, sets),
  )

  return { documents: resolved, sets }
}

type ExpandedDocument = {
  document: JsonObject
  published: boolean
  /** A stub that set `publication` explicitly keeps that value (mirror mismatch tests). */
  explicitPublication: boolean
}

function expandDocument(stub: JsonObject): ExpandedDocument {
  if (Object.hasOwn(stub, "document")) {
    return { document: stub, published: false, explicitPublication: true }
  }

  if (Object.hasOwn(stub, "source_id")) {
    const document: JsonObject = { ...stub }

    if (!Object.hasOwn(document, "title")) {
      document["title"] = "Vector source"
    }

    if (!Object.hasOwn(document, "license")) {
      document["license"] = completeLicense()
    }

    document["contract"] = CONTRACT
    document["document"] = "source"

    // A source stub may pin its own hash explicitly to test tamper detection;
    // otherwise the hash of the stub as written is used.
    if (!Object.hasOwn(document, "source_hash")) {
      document["source_hash"] = sourceHash(document)
    }

    return { document, published: false, explicitPublication: true }
  }

  const kind = stub["kind"]
  const recordId = isString(stub["record_id"])
    ? stub["record_id"]
    : `lks:${String(kind)}:vector-example`
  const revisionStubs = Object.hasOwn(stub, "revisions") ? listOf(stub["revisions"]) : [stub]
  const revisions = revisionStubs.map((revisionStub, index) =>
    buildRevision(objectOf(revisionStub), index),
  )

  const document: JsonObject = {
    contract: CONTRACT,
    document: "record",
    kind,
    record_id: recordId,
    created_at: isString(stub["created_at"]) ? stub["created_at"] : "2026-01-01T00:00:00Z",
    revisions,
    publication: Object.hasOwn(stub, "publication") ? stub["publication"] : null,
  }

  return {
    document,
    published: stub["published"] === true,
    explicitPublication: Object.hasOwn(stub, "publication"),
  }
}

function buildRevision(stub: JsonObject, index: number): JsonObject {
  const revision: JsonObject = {
    revision_id: isString(stub["revision_id"])
      ? stub["revision_id"]
      : `lks:rev:vector-${index + 1}`,
    created_at: isString(stub["created_at"])
      ? stub["created_at"]
      : `2026-01-0${index + 1}T00:00:00Z`,
    author: stub["author"] ?? DEFAULT_AUTHOR,
    change_explanation: isString(stub["change_explanation"])
      ? stub["change_explanation"]
      : `vector revision ${index + 1}`,
    content: stub["content"] ?? {},
    claims: stub["claims"] ?? [],
  }

  putOptional(revision, "dispute", stub["dispute"])
  putOptional(revision, "research_notes", stub["research_notes"])
  revision["revision_hash"] = isString(stub["revision_hash"])
    ? stub["revision_hash"]
    : revisionHash(revision)

  return revision
}

function completeSet(set: JsonObject, documents: JsonObject[]): JsonObject {
  const completed: JsonObject = { ...set }

  putNew(completed, "title", "Vector publication set")
  putNew(completed, "change_explanation", "vector publication")
  putNew(completed, "review", completeReview())
  putNew(completed, "published_at", "2026-01-06T00:00:00Z")
  putNew(completed, "published_by", DEFAULT_AUTHOR)
  completed["contract"] = CONTRACT
  completed["document"] = "publication_set"

  const withMembers = fillMemberHashes(completed, documents)

  return fillSourcePins(withMembers, documents)
}

// Vectors that are about something else should not have to restate source pins,
// so the pin list is derived from the sources cited by the set's members when it
// is absent, and a pin that omits its hash is completed from the source document.
// A vector that tests pinning supplies its own `sources` array, including an
// empty one, or an explicit wrong hash.
function fillSourcePins(set: JsonObject, documents: JsonObject[]): JsonObject {
  const pins = Object.hasOwn(set, "sources")
    ? listOf(set["sources"])
    : derivedSourcePins(set, documents)

  return { ...set, sources: fillPinHashes(pins, documents) }
}

function fillPinHashes(pins: JsonValue[], documents: JsonObject[]): JsonValue[] {
  const sourcesById = new Map<string, JsonObject>()

  for (const document of documents) {
    if (isString(document["source_id"])) {
      sourcesById.set(document["source_id"], document)
    }
  }

  return pins.map((pinValue) => {
    const pin = objectOf(pinValue)

    if (isString(pin["source_hash"])) {
      return pin
    }

    const source = sourcesById.get(String(pin["source_id"]))

    return { ...pin, source_hash: source === undefined ? null : (source["source_hash"] ?? null) }
  })
}

function derivedSourcePins(set: JsonObject, documents: JsonObject[]): JsonValue[] {
  const sourcesById = new Map<string, JsonObject>()
  const recordsById = new Map<string, JsonObject>()

  for (const document of documents) {
    if (isString(document["source_id"])) {
      sourcesById.set(document["source_id"], document)
    }

    if (isString(document["record_id"])) {
      recordsById.set(document["record_id"], document)
    }
  }

  const sourceIds: string[] = []

  for (const memberValue of listOf(set["members"])) {
    const member = objectOf(memberValue)
    const record = recordsById.get(String(member["record_id"]))
    const revision =
      record === undefined
        ? undefined
        : listOf(record["revisions"]).find(
            (candidate) =>
              isObject(candidate) && candidate["revision_id"] === member["revision_id"],
          )

    for (const sourceId of citedSourceIds(revision)) {
      if (!sourceIds.includes(sourceId)) {
        sourceIds.push(sourceId)
      }
    }
  }

  return sourceIds.flatMap((sourceId) => {
    const source = sourcesById.get(sourceId)

    return source === undefined
      ? []
      : [{ source_id: sourceId, source_hash: source["source_hash"] ?? null }]
  })
}

function citedSourceIds(revision: JsonValue | undefined): string[] {
  if (revision === undefined) {
    return []
  }

  const sourceIds: string[] = []

  for (const claim of listOf(objectOf(revision)["claims"])) {
    for (const citation of listOf(objectOf(claim)["citations"])) {
      const sourceId = objectOf(citation)["source_id"]

      if (isString(sourceId) && !sourceIds.includes(sourceId)) {
        sourceIds.push(sourceId)
      }
    }
  }

  return sourceIds
}

function fillMemberHashes(set: JsonObject, documents: JsonObject[]): JsonObject {
  const members = listOf(set["members"]).map((memberValue) => {
    const member = objectOf(memberValue)

    if (isString(member["revision_hash"])) {
      return member
    }

    const record = documents.find((document) => document["record_id"] === member["record_id"])
    const revision =
      record === undefined
        ? undefined
        : listOf(record["revisions"]).find(
            (candidate) =>
              isObject(candidate) && candidate["revision_id"] === member["revision_id"],
          )

    return {
      ...member,
      revision_hash: revision === undefined ? null : (objectOf(revision)["revision_hash"] ?? null),
    }
  })

  return { ...set, members }
}

function completeReview(): JsonObject {
  return {
    reviewed_at: "2026-01-05T00:00:00Z",
    reviewer: DEFAULT_REVIEWER,
    independence: "self_review",
    checklist: {
      source_support: true,
      attribution: true,
      date_location_uncertainty: true,
      attestation_vs_interpretation: true,
      reuse_rights: true,
    },
  }
}

function completeLicense(): JsonObject {
  return {
    status: "recorded",
    license_id: "public-domain",
    attribution_text: "Vector source",
    redistribution: "permitted",
    quotation_permitted: true,
  }
}

function autoSet(documents: JsonObject[], recordIds: JsonValue[]): JsonObject {
  const members = recordIds.map((recordId) => {
    const document = documents.find((candidate) => candidate["record_id"] === recordId)
    const revisions = listOf(document?.["revisions"])
    const revision = objectOf(revisions[revisions.length - 1])

    return {
      record_id: recordId,
      revision_id: revision["revision_id"] ?? null,
      revision_hash: revision["revision_hash"] ?? null,
    }
  })

  return completeSet({ set_id: "lks:set:vector-auto", members }, documents)
}

function resolveMirror(document: JsonObject, sets: JsonObject[]): JsonObject {
  if (document["document"] !== "record") {
    return document
  }

  const current = Publication.currentPublished([document], sets).get(String(document["record_id"]))
  const mirror: JsonValue =
    current === undefined
      ? null
      : {
          published_revision_id: current.revision_id,
          published_revision_hash: current.revision_hash,
          set_id: current.set_id,
          published_at: current.published_at,
          published_by: DEFAULT_AUTHOR,
        }

  return { ...document, publication: mirror }
}

function currentView(
  current: Record<string, Publication.CurrentPublished>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(current).map(([recordId, entry]) => [recordId, entry.revision_id]),
  )
}

function intervalView(normalized: Time.NormalizedTime): JsonObject {
  return {
    mode: normalized.mode,
    bounds: normalized.bounds,
    start_astro: normalized.start === null ? null : normalized.start.astro,
    end_astro: normalized.end === null ? null : normalized.end.astro,
    start_month: normalized.start === null ? null : normalized.start.month,
    start_day: normalized.start === null ? null : normalized.start.day,
    continuous_activity: normalized.continuous,
  }
}

function putOptional(map: JsonObject, key: string, value: JsonValue | undefined): void {
  if (value !== null && value !== undefined) {
    map[key] = value
  }
}

function putNew(map: JsonObject, key: string, value: JsonValue): void {
  if (!Object.hasOwn(map, key)) {
    map[key] = value
  }
}

/** Containment matcher used for vector expectations. */
export function matches(expect: JsonValue | undefined, actual: unknown): boolean {
  if (isObject(expect) && isObject(actual)) {
    // Only own properties count, so an expectation can never be satisfied by an
    // inherited Object.prototype member.
    return Object.entries(expect).every(
      ([key, value]) => Object.hasOwn(actual, key) && matches(value, actual[key]),
    )
  }

  if (isList(expect) && isList(actual)) {
    return expect.every((expected) => actual.some((candidate) => matches(expected, candidate)))
  }

  if (isString(expect) && isList(actual)) {
    return actual.some((candidate) => matches(expect, candidate))
  }

  return expect === actual
}
