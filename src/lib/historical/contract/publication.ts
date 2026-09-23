import { revisionHash } from "./canonical"
import * as Documents from "./documents"
import { type Violation } from "./documents"
import { cycle, orderingConsistent } from "./time"
import * as Timestamps from "./timestamps"
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
 * Publication semantics for the v0 contract: what is published, in what order,
 * and with which evidence and reuse rights.
 *
 * A publication set is the atomic visibility unit. Related record revisions
 * become visible together, so an event never appears updated while the
 * relationships it participates in are stale. A record's `publication` block is a
 * mirror of the newest published set that contains it; it is verified against the
 * sets rather than trusted, which is how a hand-edited file is caught.
 *
 * Correction history is derived, never stored twice: published revisions are the
 * set members in publication order, each with its change explanation and the
 * review that approved it. A draft correction therefore leaves the previous
 * published revision current until a set publishes the new one.
 *
 * Source metadata is part of what review approves. Each set also pins the
 * `source_hash` of every source cited by a published member revision, and the
 * coverage is complete: a cited source that is not pinned fails validation. A
 * source document is immutable once pinned, so correcting a title or a license
 * attribution means publishing a new source document and republishing the citing
 * records, which preserves the previously approved metadata instead of
 * overwriting it.
 */

const REFERENCE_FIELDS: [string, string | null][] = [
  ["place_id", "place"],
  ["actor_id", "actor"],
  ["event_id", "event"],
  ["record_id", null],
  ["source_id", "source"],
  ["from", null],
  ["to", null],
]

export type CurrentPublished = {
  revision_id: JsonValue
  revision_hash: JsonValue
  set_id: JsonValue
  published_at: JsonValue
}

export type HistoryEntry = {
  revision_id: JsonValue
  set_id: JsonValue
  published_at: JsonValue
  change_explanation: JsonValue
  author: JsonValue
  dispute_status: JsonValue
  independence: JsonValue
  reviewer: JsonValue
}

export type PublicationCheck =
  | { ok: true; currentPublished: Record<string, CurrentPublished>; warnings: string[] }
  | { ok: false; errors: Violation[] }

/** Codes this module can report, for documentation and vector expectations. */
export function codes(): string[] {
  return [
    "member_record_unknown",
    "member_revision_unknown",
    "member_hash_mismatch",
    "publication_without_mirror",
    "publication_without_set",
    "publication_mirror_mismatch",
    "ambiguous_publication_order",
    "unrecorded_source_license",
    "quotation_not_permitted",
    "published_before_revision_created",
    "review_before_revision_created",
    "self_review_mislabelled",
    "self_review_without_matching_author",
    "unresolved_reference",
    "reference_kind_mismatch",
    "ordering_cycle",
    "part_of_cycle",
    "pinned_source_unknown",
    "pinned_source_hash_mismatch",
    "source_not_pinned",
  ]
}

/** Validates a content tree: every document, every publication set, and every rule that spans documents. */
export function checkAll(documents: JsonValue[], sets: JsonValue[]): PublicationCheck {
  const errors: Violation[] = [
    ...documents.flatMap((document) => documentErrors(document)),
    ...sets.flatMap((set) => setErrors(set, documents)),
  ]

  const records = documents.filter(
    (document) => isObject(document) && document["document"] === "record",
  )
  const sources = documents.filter(
    (document) => isObject(document) && document["document"] === "source",
  )

  errors.push(...referenceErrors(records, sources))
  errors.push(...publicationErrors(records, sets))
  errors.push(...sourcePinErrors(records, sources, sets))
  errors.push(...licenseErrors(records, sources, sets))
  errors.push(...orderingErrors(records, sets))
  errors.push(...partOfErrors(records, sets))

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return { ok: true, currentPublished: currentPublishedObject(records, sets), warnings: [] }
}

/** Maps each published record id to its newest published revision. */
export function currentPublished(
  records: JsonValue[],
  sets: JsonValue[],
): Map<string, CurrentPublished> {
  const current = new Map<string, PublicationEvent>()

  for (const event of publicationEvents(sets)) {
    const existing = current.get(event.recordId)

    current.set(event.recordId, existing === undefined ? event : newer(existing, event))
  }

  const known = new Set(records.map((record) => String(valueAt(record, "record_id"))))
  const result = new Map<string, CurrentPublished>()

  for (const [recordId, event] of current) {
    if (known.has(recordId)) {
      result.set(recordId, {
        revision_id: event.revisionId,
        revision_hash: event.revisionHash,
        set_id: event.setId,
        published_at: event.publishedAt,
      })
    }
  }

  return result
}

/** The published view as a plain object, for document-shaped results and vectors. */
export function currentPublishedObject(
  records: JsonValue[],
  sets: JsonValue[],
): Record<string, CurrentPublished> {
  return Object.fromEntries(currentPublished(records, sets))
}

/**
 * Published revisions per record in publication order, oldest first.
 *
 * Each entry carries the change explanation and the review that approved it, so a
 * reader-facing correction history does not require reading Git history.
 */
export function history(records: JsonValue[], sets: JsonValue[]): Record<string, HistoryEntry[]> {
  const recordsById = new Map<string, JsonObject>()

  for (const record of records) {
    if (isObject(record)) {
      recordsById.set(String(record["record_id"]), record)
    }
  }

  const sorted = [...publicationEvents(sets)].sort((a, b) =>
    compareSortKeys(a.publishedAt, b.publishedAt),
  )
  const grouped = new Map<string, PublicationEvent[]>()

  for (const event of sorted) {
    grouped.set(event.recordId, [...(grouped.get(event.recordId) ?? []), event])
  }

  const result: Record<string, HistoryEntry[]> = {}

  for (const [recordId, events] of grouped) {
    const record = recordsById.get(recordId)

    if (record === undefined) {
      continue
    }

    result[recordId] = events.map((event) => {
      const revision =
        listOf(record["revisions"]).find(
          (candidate) => isObject(candidate) && candidate["revision_id"] === event.revisionId,
        ) ?? {}
      const revisionObject = objectOf(revision)

      return {
        revision_id: event.revisionId,
        set_id: event.setId,
        published_at: event.publishedAt,
        change_explanation: revisionObject["change_explanation"] ?? null,
        author: revisionObject["author"] ?? null,
        dispute_status: getIn(revisionObject, ["dispute", "status"]) ?? "undisputed",
        independence: event.independence ?? null,
        reviewer: event.reviewer ?? null,
      }
    })
  }

  return result
}

function compareSortKeys(a: JsonValue, b: JsonValue): number {
  const left = Timestamps.sortKey(a)
  const right = Timestamps.sortKey(b)

  return left[0] - right[0] || left[1] - right[1]
}

type PublicationEvent = {
  recordId: string
  revisionId: JsonValue
  revisionHash: JsonValue
  setId: JsonValue
  publishedAt: JsonValue
  independence: JsonValue | undefined
  reviewer: JsonValue | undefined
}

function publicationEvents(sets: JsonValue[]): PublicationEvent[] {
  return sets.flatMap((setValue) => {
    const set = objectOf(setValue)

    return listOf(set["members"]).map((memberValue) => {
      const member = objectOf(memberValue)

      return {
        recordId: String(member["record_id"]),
        revisionId: member["revision_id"],
        revisionHash: member["revision_hash"],
        setId: set["set_id"],
        publishedAt: set["published_at"],
        independence: getIn(set, ["review", "independence"]),
        reviewer: getIn(set, ["review", "reviewer", "name"]),
      }
    })
  })
}

function newer(existing: PublicationEvent, candidate: PublicationEvent): PublicationEvent {
  // A timestamp that is not a real UTC instant never becomes the newest set.
  const order = Timestamps.compare(candidate.publishedAt, existing.publishedAt)

  return order === "gt" || order === "eq" ? candidate : existing
}

function documentErrors(document: JsonValue): Violation[] {
  const result = Documents.validate(document)

  return result.ok ? [] : result.errors
}

function setErrors(setValue: JsonValue, documents: JsonValue[]): Violation[] {
  const set = objectOf(setValue)
  const records = documents.filter(
    (document) => isObject(document) && document["document"] === "record",
  )
  const reviewer = getIn(set, ["review", "reviewer", "name"])
  const independence = getIn(set, ["review", "independence"])
  const reviewedAt = getIn(set, ["review", "reviewed_at"])
  const errors: Violation[] = []

  for (const memberValue of listOf(set["members"])) {
    const member = objectOf(memberValue)
    const record = records.find(
      (candidate) => valueAt(candidate, "record_id") === member["record_id"],
    )
    const revision =
      record === undefined
        ? undefined
        : listOf(objectOf(record)["revisions"]).find(
            (candidate) =>
              isObject(candidate) && candidate["revision_id"] === member["revision_id"],
          )

    flag(
      errors,
      record === undefined,
      "member_record_unknown",
      "/members",
      `${String(member["record_id"])} is not in the content tree`,
    )
    flag(
      errors,
      record !== undefined && revision === undefined,
      "member_revision_unknown",
      "/members",
      `${String(member["revision_id"])} is not a revision of ${String(member["record_id"])}`,
    )
    flag(
      errors,
      revision !== undefined && revisionHash(objectOf(revision)) !== member["revision_hash"],
      "member_hash_mismatch",
      "/members",
      `the approved revision of ${String(member["record_id"])} changed after approval`,
    )
  }

  const authors = memberAuthors(set, records)
  const selfAuthored = isString(reviewer) && authors.includes(reviewer)

  errors.push(...documentErrors(set))
  errors.push(...timestampErrors(set, documents, reviewedAt))
  flag(
    errors,
    selfAuthored && independence !== "self_review",
    "self_review_mislabelled",
    "/review/independence",
    "the reviewer authored a member revision and must be recorded as self_review",
  )
  flag(
    errors,
    !selfAuthored && independence === "self_review" && authors.length > 0,
    "self_review_without_matching_author",
    "/review/independence",
    "self_review requires the reviewer to be an author of a member revision",
  )

  return errors
}

function memberAuthors(set: JsonObject, records: JsonValue[]): string[] {
  const names: string[] = []

  for (const memberValue of listOf(set["members"])) {
    const member = objectOf(memberValue)
    const record = records.find(
      (candidate) => valueAt(candidate, "record_id") === member["record_id"],
    )

    if (record === undefined) {
      continue
    }

    for (const revision of listOf(objectOf(record)["revisions"])) {
      if (isObject(revision) && revision["revision_id"] === member["revision_id"]) {
        const name = getIn(revision, ["author", "name"])

        if (isString(name) && !names.includes(name)) {
          names.push(name)
        }
      }
    }
  }

  return names
}

function timestampErrors(
  set: JsonObject,
  documents: JsonValue[],
  reviewedAt: JsonValue | undefined,
): Violation[] {
  const createdAts = memberCreatedAts(set, documents)
  const errors: Violation[] = []

  // Comparisons use parsed UTC instants: an invalid timestamp is reported by the
  // document checks and must not be able to win an ordering comparison.
  flag(
    errors,
    createdAts.some((createdAt) => Timestamps.compare(createdAt, set["published_at"]) === "gt"),
    "published_before_revision_created",
    "/published_at",
    "publication cannot precede the creation of the revision it publishes",
  )
  flag(
    errors,
    createdAts.some((createdAt) => Timestamps.compare(createdAt, reviewedAt) === "gt"),
    "review_before_revision_created",
    "/review/reviewed_at",
    "review cannot precede the creation of the revision it approves",
  )

  return errors
}

function memberCreatedAts(set: JsonObject, documents: JsonValue[]): JsonValue[] {
  const records = documents.filter(
    (document) => isObject(document) && document["document"] === "record",
  )
  const createdAts: JsonValue[] = []

  for (const memberValue of listOf(set["members"])) {
    const member = objectOf(memberValue)
    const record = records.find(
      (candidate) => valueAt(candidate, "record_id") === member["record_id"],
    )

    if (record === undefined) {
      continue
    }

    for (const revision of listOf(objectOf(record)["revisions"])) {
      if (isObject(revision) && revision["revision_id"] === member["revision_id"]) {
        const createdAt = revision["created_at"]

        if (isString(createdAt)) {
          createdAts.push(createdAt)
        }
      }
    }
  }

  return createdAts
}

function referenceErrors(records: JsonValue[], sources: JsonValue[]): Violation[] {
  const known = knownReferences(records, sources)
  const errors: Violation[] = []

  for (const record of records) {
    for (const revision of listOf(objectOf(record)["revisions"])) {
      const revisionObject = objectOf(revision)

      for (const [id, expected, path] of collectReferences(
        revision,
        `/revisions/${String(revisionObject["revision_id"])}`,
      )) {
        const kind = known.get(id)

        if (kind === undefined) {
          errors.push(error("unresolved_reference", path, `${id} is not in the content tree`))
        } else if (expected !== null && kind !== expected) {
          errors.push(
            error("reference_kind_mismatch", path, `${id} is a ${kind}, not a ${expected}`),
          )
        }
      }
    }
  }

  return errors
}

function knownReferences(records: JsonValue[], sources: JsonValue[]): Map<string, string> {
  const known = new Map<string, string>()

  for (const record of records) {
    known.set(String(valueAt(record, "record_id")), String(valueAt(record, "kind")))
  }

  for (const source of sources) {
    known.set(String(valueAt(source, "source_id")), "source")
  }

  return known
}

// Source metadata is part of what review approves. A set pins the source_hash of
// every source cited by a published member revision, so editing a title or a
// license attribution afterwards fails validation even if the source document is
// resealed. Correcting approved metadata means publishing a new source document
// (new source_id, optional supersedes_source_id) and a set that pins it, which
// preserves the previously approved metadata instead of overwriting it.
function sourcePinErrors(
  records: JsonValue[],
  sources: JsonValue[],
  sets: JsonValue[],
): Violation[] {
  const sourcesById = new Map<string, JsonObject>()

  for (const source of sources) {
    if (isObject(source)) {
      sourcesById.set(String(source["source_id"]), source)
    }
  }

  return sets.flatMap((setValue) => {
    const set = objectOf(setValue)
    const pinned = listOf(set["sources"])

    return [
      ...pinned.flatMap((pin) => pinErrors(pin, sourcesById)),
      ...coverageErrors(set, records, pinned),
    ]
  })
}

function pinErrors(pinValue: JsonValue, sourcesById: Map<string, JsonObject>): Violation[] {
  const pin = objectOf(pinValue)
  const sourceId = String(pin["source_id"])
  const source = sourcesById.get(sourceId)

  if (source === undefined) {
    return [error("pinned_source_unknown", "/sources", `${sourceId} is not in the content tree`)]
  }

  const errors: Violation[] = []

  flag(
    errors,
    source["source_hash"] !== pin["source_hash"],
    "pinned_source_hash_mismatch",
    "/sources",
    `the approved metadata of ${sourceId} changed after approval`,
  )

  return errors
}

function coverageErrors(set: JsonObject, records: JsonValue[], pinned: JsonValue[]): Violation[] {
  const pinnedIds = pinned.map((pin) => valueAt(pin, "source_id"))

  return citedSourceIds(set, records)
    .filter((sourceId) => !pinnedIds.includes(sourceId))
    .map((sourceId) =>
      error(
        "source_not_pinned",
        "/sources",
        `${String(sourceId)} is cited by a published revision of ${String(set["set_id"])} but is not pinned`,
      ),
    )
}

function citedSourceIds(set: JsonObject, records: JsonValue[]): (JsonValue | undefined)[] {
  const recordsById = new Map<string, JsonObject>()

  for (const record of records) {
    if (isObject(record)) {
      recordsById.set(String(record["record_id"]), record)
    }
  }

  const sourceIds: (JsonValue | undefined)[] = []

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

    for (const sourceId of revisionSourceIds(revision)) {
      if (!sourceIds.includes(sourceId)) {
        sourceIds.push(sourceId)
      }
    }
  }

  return sourceIds
}

function revisionSourceIds(revision: JsonValue | undefined): (JsonValue | undefined)[] {
  if (revision === undefined) {
    return []
  }

  const sourceIds: (JsonValue | undefined)[] = []

  for (const claim of listOf(objectOf(revision)["claims"])) {
    for (const citation of listOf(objectOf(claim)["citations"])) {
      const sourceId = valueAt(citation, "source_id")

      if (!sourceIds.includes(sourceId)) {
        sourceIds.push(sourceId)
      }
    }
  }

  return sourceIds
}

function collectReferences(value: JsonValue, path: string): [string, string | null, string][] {
  if (isObject(value)) {
    const direct: [string, string | null, string][] = REFERENCE_FIELDS.flatMap(([key, expected]) =>
      isString(value[key])
        ? [[value[key] as string, expected, `${path}/${key}`] as [string, string | null, string]]
        : [],
    )

    return [
      ...direct,
      ...Object.entries(value).flatMap(([nestedKey, nested]) =>
        collectReferences(nested, `${path}/${nestedKey}`),
      ),
    ]
  }

  if (isList(value)) {
    return value.flatMap((nested, index) => collectReferences(nested, `${path}/${index}`))
  }

  return []
}

function publicationErrors(records: JsonValue[], sets: JsonValue[]): Violation[] {
  const derived = currentPublished(records, sets)
  const ambiguityErrors = pairsSharingRecordAndTime(sets).map(([recordId, publishedAt]) =>
    error("ambiguous_publication_order", "/published_at", `${recordId} at ${String(publishedAt)}`),
  )

  return [...ambiguityErrors, ...records.flatMap((record) => mirrorErrors(record, derived))]
}

function pairsSharingRecordAndTime(sets: JsonValue[]): [string, JsonValue][] {
  const byRecord = new Map<string, [string, JsonValue, JsonValue][]>()

  for (const setValue of sets) {
    const set = objectOf(setValue)

    for (const memberValue of listOf(set["members"])) {
      const member = objectOf(memberValue)
      const recordId = String(member["record_id"])

      byRecord.set(recordId, [
        ...(byRecord.get(recordId) ?? []),
        [recordId, set["published_at"], set["set_id"]],
      ])
    }
  }

  const ambiguous: [string, JsonValue][] = []

  for (const [recordId, entries] of byRecord) {
    const byTime = new Map<string, { publishedAt: JsonValue; setIds: Set<string> }>()

    for (const [, publishedAt, setId] of entries) {
      const key = JSON.stringify(publishedAt ?? null)
      const group = byTime.get(key) ?? { publishedAt, setIds: new Set<string>() }

      group.setIds.add(String(setId))
      byTime.set(key, group)
    }

    for (const group of byTime.values()) {
      if (group.setIds.size > 1) {
        ambiguous.push([recordId, group.publishedAt])
      }
    }
  }

  return ambiguous
}

function mirrorErrors(recordValue: JsonValue, derived: Map<string, CurrentPublished>): Violation[] {
  const record = objectOf(recordValue)
  const mirror = record["publication"]
  const current = derived.get(String(record["record_id"]))

  if (isNil(mirror) && current === undefined) {
    return []
  }

  if (isNil(mirror)) {
    return [error("publication_without_mirror", "/publication", String(record["record_id"]))]
  }

  if (current === undefined) {
    return [error("publication_without_set", "/publication", String(record["record_id"]))]
  }

  return mirrorMatches(objectOf(mirror), current)
    ? []
    : [error("publication_mirror_mismatch", "/publication", String(record["record_id"]))]
}

function mirrorMatches(mirror: JsonObject, current: CurrentPublished): boolean {
  return (
    mirror["published_revision_id"] === current.revision_id &&
    mirror["published_revision_hash"] === current.revision_hash &&
    mirror["set_id"] === current.set_id &&
    mirror["published_at"] === current.published_at
  )
}

function licenseErrors(records: JsonValue[], sources: JsonValue[], sets: JsonValue[]): Violation[] {
  const sourcesById = new Map<string, JsonObject>()

  for (const source of sources) {
    if (isObject(source)) {
      sourcesById.set(String(source["source_id"]), source)
    }
  }

  return published(records, sets).flatMap(([record, revision]) =>
    listOf(objectOf(revision)["claims"]).flatMap((claimValue) => {
      const claim = objectOf(claimValue)
      const path = `/revisions/${String(objectOf(revision)["revision_id"])}/claims/${String(claim["claim_id"])}`

      return listOf(claim["citations"]).flatMap((citationValue) => {
        const citation = objectOf(citationValue)

        return citationLicenseErrors(
          citation,
          path,
          String(record["record_id"]),
          sourcesById.get(String(citation["source_id"])),
        )
      })
    }),
  )
}

function citationLicenseErrors(
  citation: JsonObject,
  path: string,
  recordId: string,
  source: JsonObject | undefined,
): Violation[] {
  const errors: Violation[] = []

  flag(
    errors,
    source !== undefined && getIn(source, ["license", "status"]) !== "recorded",
    "unrecorded_source_license",
    path,
    `every cited source needs recorded reuse terms before publication (${recordId})`,
  )
  flag(
    errors,
    source !== undefined &&
      !isNil(citation["quoted_text"]) &&
      getIn(source, ["license", "quotation_permitted"]) !== true,
    "quotation_not_permitted",
    path,
    `quoted text requires recorded permission to quote (${recordId})`,
  )

  return errors
}

function orderingErrors(records: JsonValue[], sets: JsonValue[]): Violation[] {
  const recordsById = new Map<string, JsonObject>()

  for (const record of records) {
    if (isObject(record)) {
      recordsById.set(String(record["record_id"]), record)
    }
  }

  const publishedPairs = published(records, sets)
  const errors = publishedPairs.flatMap(([record, revision]) =>
    orderingConsistencyErrors(record, revision, recordsById, sets),
  )

  return [...errors, ...orderingCycleErrors(publishedPairs)]
}

function orderingEdges(publishedPairs: [JsonObject, JsonObject][]): JsonObject[] {
  return publishedPairs.flatMap(([record, revision]) =>
    listOf(getIn(revision, ["content", "time", "ordering"])).map((entryValue) => {
      const entry = objectOf(entryValue)

      return {
        from: record["record_id"],
        to: entry["record_id"],
        relation: entry["relation"],
      }
    }),
  )
}

function orderingConsistencyErrors(
  record: JsonObject,
  revision: JsonObject,
  recordsById: Map<string, JsonObject>,
  sets: JsonValue[],
): Violation[] {
  const ordering = listOf(getIn(revision, ["content", "time", "ordering"]))

  return ordering.flatMap((entryValue) => {
    const entry = objectOf(entryValue)
    const target = recordsById.get(String(entry["record_id"]))
    const targetRevision = target === undefined ? undefined : publishedRevision(target, sets)

    if (targetRevision === undefined) {
      return []
    }

    const result = orderingConsistent(
      getIn(revision, ["content", "time"]),
      getIn(targetRevision, ["content", "time"]),
      entry["relation"],
    )

    if (result.ok) {
      return []
    }

    return [
      error(
        result.errors[0],
        `/revisions/${String(revision["revision_id"])}/content/time/ordering`,
        `${String(record["record_id"])} ${String(entry["relation"])}`,
      ),
    ]
  })
}

function orderingCycleErrors(publishedPairs: [JsonObject, JsonObject][]): Violation[] {
  const found = cycle(orderingEdges(publishedPairs))

  return found === null
    ? []
    : [error("ordering_cycle", "/content/time/ordering", found.join(" -> "))]
}

function partOfErrors(records: JsonValue[], sets: JsonValue[]): Violation[] {
  const edges = published(records, sets).flatMap(([record, revision]) =>
    listOf(getIn(revision, ["content", "part_of"])).map((entryValue) => {
      const entry = objectOf(entryValue)

      return { from: record["record_id"], to: entry["event_id"], relation: "before" }
    }),
  )
  const found = cycle(edges)

  return found === null ? [] : [error("part_of_cycle", "/content/part_of", found.join(" -> "))]
}

function published(records: JsonValue[], sets: JsonValue[]): [JsonObject, JsonObject][] {
  const pairs: [JsonObject, JsonObject][] = []

  for (const recordValue of records) {
    const record = objectOf(recordValue)
    const revision = publishedRevision(record, sets)

    if (revision !== undefined) {
      pairs.push([record, revision])
    }
  }

  return pairs
}

function publishedRevision(record: JsonObject, sets: JsonValue[]): JsonObject | undefined {
  const current = currentPublished([record], sets).get(String(record["record_id"]))

  if (current === undefined) {
    return undefined
  }

  const revision = listOf(record["revisions"]).find(
    (candidate) => isObject(candidate) && candidate["revision_id"] === current.revision_id,
  )

  return revision === undefined ? undefined : objectOf(revision)
}

function flag(
  errors: Violation[],
  condition: boolean,
  code: string,
  path: string,
  detail: string,
): void {
  if (condition) {
    errors.push(error(code, path, detail))
  }
}

function error(code: string, path: string, detail: string): Violation {
  return { code, where: path, detail }
}

function isNil(value: unknown): boolean {
  return value === null || value === undefined
}

function valueAt(value: unknown, key: string): JsonValue | undefined {
  return isObject(value) ? value[key] : undefined
}

function getIn(value: JsonValue | undefined, keys: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value

  for (const key of keys) {
    if (!isObject(current)) {
      return undefined
    }

    current = current[key]
  }

  return current
}
