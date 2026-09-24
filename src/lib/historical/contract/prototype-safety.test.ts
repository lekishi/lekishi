import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { encode, revisionHash, sourceHash } from "./canonical"
import * as Documents from "./documents"
import * as JSONSchema from "./json-schema"
import { type JsonObject } from "./types"
import { CONTRACT } from "./vectors"

/**
 * Prototype-safety regressions for the v0 contract.
 *
 * The contract reads JSON, and a JSON object's keys are not restricted to a safe
 * vocabulary: `__proto__`, `constructor`, `toString`, and `valueOf` are ordinary
 * own properties of a parsed object and ordinary strings in a JSON Pointer. Every
 * check here is built with `JSON.parse`, because that is what produces an own
 * `__proto__` data property; an object literal would set the prototype instead.
 *
 * These tests pin three rules that a prototype-sensitive lookup would break: an
 * undeclared prototype-named field is still an undeclared field, an own
 * `__proto__` field is part of the canonical hash, and an evidence pointer that
 * names an absent key does not resolve.
 */

const PROTOTYPE_NAMES = ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]

/** A schema-valid place record whose content carries one extra field. */
function placeRecordWithContentField(field: string): JsonObject {
  const text = `{
    "contract": "${CONTRACT}",
    "document": "record",
    "kind": "place",
    "record_id": "lks:place:prototype-safety",
    "created_at": "2026-01-01T00:00:00Z",
    "revisions": [
      {
        "revision_id": "lks:rev:prototype-safety-1",
        "created_at": "2026-01-01T00:00:00Z",
        "author": { "name": "Contract example" },
        "change_explanation": "prototype safety regression",
        "content": {
          "summary": "A place used to check prototype safety.",
          "names": [],
          "place_types": ["settlement"],
          "geometry": [],
          ${JSON.stringify(field)}: "undeclared"
        },
        "claims": [],
        "revision_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000001"
      }
    ],
    "publication": null
  }`

  return JSON.parse(text) as JsonObject
}

/** The first worked example record, with one claim asserting a different pointer. */
function changanWithClaimPointer(pointer: string): JsonObject {
  const document = JSON.parse(
    readFileSync(
      Documents.contractFile("examples", "records", "place-example-changan.json"),
      "utf8",
    ),
  ) as JsonObject
  const revisions = document["revisions"] as JsonObject[]
  const revision = revisions[0]
  const claims = revision["claims"] as JsonObject[]
  const nameClaim = claims.find((claim) => claim["claim_id"] === "lks:claim:example-changan-name")

  if (nameClaim === undefined) {
    throw new Error("the changan example no longer has the expected name claim")
  }

  nameClaim["asserts"] = pointer
  revision["revision_hash"] = revisionHash(revision)

  return document
}

function schemaViolations(document: JsonObject): { keyword: string; detail: string }[] {
  const result = JSONSchema.validate(Documents.schemaPath("record"), document)

  return result.ok ? [] : result.violations.map(({ keyword, detail }) => ({ keyword, detail }))
}

/** Writes a schema to a temporary file, since the validator reads from disk. */
function writeSchema(schema: JsonObject): string {
  const directory = mkdtempSync(path.join(tmpdir(), "lekishi-prototype-schema-"))
  const file = path.join(directory, "schema.json")

  writeFileSync(file, JSON.stringify(schema))

  return file
}

describe("an undeclared prototype-named content field", () => {
  it.each(PROTOTYPE_NAMES)("is rejected by additionalProperties: %s", (field) => {
    const violations = schemaViolations(placeRecordWithContentField(field))

    expect(violations).toContainEqual({ keyword: "additionalProperties", detail: field })
  })

  it("is reported as a schema violation by the document checks", () => {
    const result = Documents.validate(placeRecordWithContentField("constructor"))

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("schema_violation")
    }
  })

  it("does not satisfy a required field of the same name", () => {
    // `required` must read own properties too: a document that omits a required
    // field named after a prototype member is missing that field.
    const document = JSON.parse(`{
      "contract": "${CONTRACT}",
      "document": "record",
      "kind": "place",
      "record_id": "lks:place:prototype-required",
      "created_at": "2026-01-01T00:00:00Z",
      "revisions": [],
      "publication": null
    }`) as JsonObject
    const result = JSONSchema.validate(
      writeSchema({
        type: "object",
        required: ["toString"],
        additionalProperties: false,
        properties: {},
      }),
      document,
    )

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.violations.some((violation) => violation.keyword === "required")).toBe(true)
    }
  })
})

describe("an own __proto__ field", () => {
  it("stays in the canonical encoding", () => {
    const value = JSON.parse(
      '{"revision_id":"lks:rev:1","content":{"__proto__":{"sneaky":true}}}',
    ) as JsonObject

    expect(Object.hasOwn(value["content"] as JsonObject, "__proto__")).toBe(true)
    expect(encode(value)).toBe(
      '{"content":{"__proto__":{"sneaky":true}},"revision_id":"lks:rev:1"}',
    )
  })

  it("changes the revision hash", () => {
    const withProto = JSON.parse(
      '{"revision_id":"lks:rev:1","content":{"__proto__":{"sneaky":true}}}',
    ) as JsonObject
    const without = JSON.parse('{"revision_id":"lks:rev:1","content":{}}') as JsonObject

    expect(revisionHash(withProto)).not.toBe(revisionHash(without))
  })

  it("changes the source hash", () => {
    const withProto = JSON.parse('{"source_id":"lks:source:1","__proto__":"edited"}') as JsonObject
    const without = JSON.parse('{"source_id":"lks:source:1"}') as JsonObject

    expect(sourceHash(withProto)).not.toBe(sourceHash(without))
  })
})

describe("an evidence pointer that names an absent key", () => {
  it.each(["/constructor", "/__proto__", "/toString", "/valueOf"])(
    "does not resolve: %s",
    (pointer) => {
      const result = Documents.validate(changanWithClaimPointer(pointer))

      expect(result.ok).toBe(false)

      if (!result.ok) {
        expect(result.errors.map((error) => error.code)).toContain("claim_pointer_unresolved")
      }
    },
  )

  it("still resolves a pointer to a present key", () => {
    expect(Documents.validate(changanWithClaimPointer("/names/0")).ok).toBe(true)
  })
})

describe("the schema validator's own pointer resolution", () => {
  it("does not resolve a $ref into the prototype", () => {
    const file = writeSchema({
      type: "object",
      properties: { value: { $ref: "#/$defs/constructor" } },
      $defs: {},
    })

    expect(() => JSONSchema.validate(file, { value: 1 })).toThrow(JSONSchema.SchemaError)
  })
})
