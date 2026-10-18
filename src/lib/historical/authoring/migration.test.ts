import { describe, expect, it } from "vitest"
import { loadChapter } from "../chapter"
import { isList, isObject, type JsonObject } from "../contract/types"
import { compileChapter } from "./compile"
import { readTree } from "./tree"

/**
 * The migration of the two approved chapters from hand-written v0 JSON to record
 * files, checked against the JSON they replace.
 *
 * Passing validation is not evidence of a lossless migration (RFD 2), so this
 * compares what the reader is shown: every published record's content, claims
 * and dispute must compile to exactly what the approved revision carries. Only
 * generated revision metadata may differ (ids, dates, change notes and hashes),
 * and the differences the migration makes on purpose are listed here one by one
 * rather than tolerated in general.
 *
 * Claims are compared field by field: the claims supporting one field keep their
 * order, but the order of fields in a claim list carries no meaning, and the
 * compiler lists them in the order the record file writes its fields.
 */

const CHAPTERS = ["tang-mission-750-754", "qin-conquest-han-233-226"]

/** The one story whose id followed its old file rather than its chapter. */
const RENAMED: Record<string, string> = {
  "lks:story:tang-mission-750-779": "lks:story:tang-mission-750-754",
}

/**
 * Sources whose metadata changes on purpose: the two chapters' Wikidata reads
 * become one `wikidata` source, decided by the owner on 2026-10-18.
 */
const CONSOLIDATED = new Set(["lks:source:wikidata"])

function published(document: JsonObject): JsonObject {
  const revisions = document["revisions"] as JsonObject[]
  const id = (document["publication"] as JsonObject)["published_revision_id"]

  return revisions.find((revision) => revision["revision_id"] === id) as JsonObject
}

function byField(claims: unknown): Record<string, unknown[]> {
  const grouped: Record<string, unknown[]> = {}

  for (const claim of isList(claims) ? claims.filter(isObject) : []) {
    ;(grouped[String(claim["asserts"])] ??= []).push(claim)
  }

  return grouped
}

describe.each(CHAPTERS)("the migration of %s", (chapter) => {
  const legacy = loadChapter(chapter)
  const bundle = compileChapter(readTree(), chapter)
  const compiled = new Map(
    bundle.documents.map((document) => [
      String(document["record_id"] ?? document["source_id"]),
      document,
    ]),
  )
  const legacyRecords = legacy.documents.filter((document) => document["document"] === "record")
  const legacySources = legacy.documents.filter((document) => document["document"] === "source")

  it("reaches exactly the records the approved set published", () => {
    const members = (legacy.sets[0]["members"] as JsonObject[]).map((member) => {
      const id = String(member["record_id"])

      return RENAMED[id] ?? id
    })
    const reached = bundle.documents
      .filter((document) => document["document"] === "record")
      .map((document) => String(document["record_id"]))

    expect(reached.sort()).toEqual(members.sort())
  })

  it("compiles every published record to the content, claims and dispute it was approved with", () => {
    for (const document of legacyRecords) {
      const legacyId = String(document["record_id"])
      const id = RENAMED[legacyId] ?? legacyId
      const before = published(document)
      const after = ((compiled.get(id) as JsonObject)["revisions"] as JsonObject[])[0]

      expect(after["content"], id).toEqual(before["content"])
      expect(byField(after["claims"]), id).toEqual(byField(before["claims"]))
      expect(after["dispute"], id).toEqual(before["dispute"])
    }
  })

  it("keeps every source's approved metadata, apart from the consolidated ones", () => {
    for (const source of legacySources) {
      const id = String(source["source_id"])
      const after = compiled.get(id) as JsonObject

      expect(after, id).toBeDefined()

      if (!CONSOLIDATED.has(id)) {
        expect(after["source_hash"], id).toBe(source["source_hash"])
      }
    }

    expect(bundle.documents.filter((document) => document["document"] === "source")).toHaveLength(
      legacySources.length,
    )
  })

  it("leaves the chapter a draft: no approval is carried over or written for the owner", () => {
    expect(bundle.state).toBe("draft")
    expect(bundle.approval).toBeNull()
  })
})
