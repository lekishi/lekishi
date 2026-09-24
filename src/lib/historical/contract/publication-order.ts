import * as Timestamps from "./timestamps"
import { isObject, listOf, objectOf, type JsonValue } from "./types"

/**
 * Publication ordering for the v0 contract: which published revision is current.
 *
 * This module is the part of `publication.ts` a browser can run. It reads only
 * the records and the publication sets, uses no Node API, and decides "newest"
 * with the contract's own rule — a set's `published_at` instant, where a value
 * that is not a real UTC instant can never win. `publication.ts` owns the full
 * validation (schemas, hashes, source pins, references) and re-exports this
 * surface, so the derived current revision is computed in exactly one place:
 * the content boundary that projects reviewed records into the atlas, and the
 * validator that checks the same tree, cannot disagree about what is published.
 */

export type CurrentPublished = {
  revision_id: JsonValue
  revision_hash: JsonValue
  set_id: JsonValue
  published_at: JsonValue
}

export type PublicationEvent = {
  recordId: string
  revisionId: JsonValue
  revisionHash: JsonValue
  setId: JsonValue
  publishedAt: JsonValue
  independence: JsonValue | undefined
  reviewer: JsonValue | undefined
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

/** Every membership of every set, as publication events. */
export function publicationEvents(sets: JsonValue[]): PublicationEvent[] {
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
