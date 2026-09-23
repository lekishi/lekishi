import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import * as Documents from "./documents"
import * as JSONSchema from "./json-schema"
import type { JsonObject, JsonValue } from "./types"
import { CONTRACT, names as vectorNames } from "./vectors"

/**
 * Tests for the JSON Schema subset validator that the contract relies on.
 *
 * The validator is load-bearing: if it silently ignored a keyword, the contract
 * tests would pass while the schema said nothing. These tests pin the subset
 * behaviour and the loud-failure rule.
 */

const schemaDirectory = Documents.schemaDir()
const temporaryDirectories: string[] = []

function schemaPath(name: string): string {
  return path.join(schemaDirectory, name)
}

function writeSchema(name: string, schema: JsonObject): string {
  const directory = mkdtempSync(path.join(tmpdir(), "lekishi-contract-schema-"))

  temporaryDirectories.push(directory)

  const file = path.join(directory, name)

  writeFileSync(file, JSON.stringify(schema))

  return file
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("the JSON Schema subset validator", () => {
  it("accepts every contract schema with only supported keywords", () => {
    const schemas = readdirSync(schemaDirectory).filter((file) => file.endsWith(".json"))

    expect(schemas.length).toBeGreaterThan(0)

    for (const name of schemas) {
      expect(
        () => JSONSchema.checkSchema(schemaPath(name)),
        `${name} uses an unsupported keyword`,
      ).not.toThrow()
    }
  })

  it("resolves the record schema's cross-file refs", () => {
    const document = {
      contract: CONTRACT,
      document: "record",
      kind: "place",
      record_id: "lks:place:example",
      revisions: [],
      publication: null,
    }

    const result = JSONSchema.validate(schemaPath("record.schema.json"), document)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.violations.some((violation) => violation.keyword === "minItems")).toBe(true)
    }
  })

  it("raises on unknown keywords instead of ignoring them", () => {
    const file = writeSchema("strict.schema.json", {
      type: "object",
      propertiez: { name: { type: "string" } },
    })

    expect(() => JSONSchema.validate(file, { name: 1 })).toThrow(JSONSchema.UnsupportedKeywordError)
    expect(() => JSONSchema.validate(file, { name: 1 })).toThrow(/propertiez/)
  })

  it("enforces type, required, and additionalProperties", () => {
    const file = writeSchema("object.schema.json", {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: { name: { type: "string" }, count: { type: "integer" } },
    })

    expect(JSONSchema.validate(file, { name: "a", count: 2 }).ok).toBe(true)

    const result = JSONSchema.validate(file, { count: "two", extra: true })

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.violations.map((violation) => violation.keyword).sort()).toEqual([
        "additionalProperties",
        "required",
        "type",
      ])
    }
  })

  it("enforces enum, const, and pattern", () => {
    const file = writeSchema("values.schema.json", {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: { enum: ["a", "b"] },
        document: { const: "record" },
        id: { pattern: "^lks:[a-z]+$" },
      },
    })

    expect(JSONSchema.validate(file, { mode: "a", document: "record", id: "lks:place" }).ok).toBe(
      true,
    )

    const result = JSONSchema.validate(file, { mode: "c", document: "source", id: "PLACE" })

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.violations.map((violation) => violation.keyword).sort()).toEqual([
        "const",
        "enum",
        "pattern",
      ])
    }
  })

  it("enforces array constraints", () => {
    const file = writeSchema("array.schema.json", {
      type: "array",
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
      items: { type: "string" },
    })

    expect(JSONSchema.validate(file, ["a"]).ok).toBe(true)
    expect(JSONSchema.validate(file, ["a", "b"]).ok).toBe(true)

    const result = JSONSchema.validate(file, ["a", "a", 1])

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.violations.map((violation) => violation.keyword).sort()).toEqual([
        "maxItems",
        "type",
        "uniqueItems",
      ])
    }
  })

  it("enforces anyOf, oneOf, not, and if/then", () => {
    const file = writeSchema("combinators.schema.json", {
      type: "object",
      properties: {
        kind: { enum: ["place", "event"] },
        geometry: { anyOf: [{ type: "null" }, { type: "object" }] },
      },
      allOf: [
        { if: { properties: { kind: { const: "event" } } }, then: { required: ["geometry"] } },
        { not: { required: ["forbidden"] } },
      ],
    })

    expect(JSONSchema.validate(file, { kind: "event", geometry: null }).ok).toBe(true)
    expect(JSONSchema.validate(file, { kind: "place" }).ok).toBe(true)

    const wrongType = JSONSchema.validate(file, { kind: "event", geometry: 1 })

    expect(wrongType.ok).toBe(false)

    if (!wrongType.ok) {
      expect(wrongType.violations.some((violation) => violation.keyword === "anyOf")).toBe(true)
    }

    const forbidden = JSONSchema.validate(file, { kind: "place", forbidden: true })

    expect(forbidden.ok).toBe(false)

    if (!forbidden.ok) {
      expect(forbidden.violations.some((violation) => violation.keyword === "not")).toBe(true)
    }
  })

  it("rejects a renderer key inside record content", () => {
    const document: JsonObject = {
      contract: CONTRACT,
      document: "record",
      kind: "place",
      record_id: "lks:place:example",
      created_at: "2026-01-01T00:00:00Z",
      revisions: [
        {
          revision_id: "lks:rev:example-1",
          created_at: "2026-01-01T00:00:00Z",
          author: { name: "Contract example" },
          change_explanation: "example",
          content: {
            summary: "s",
            names: [],
            place_types: ["settlement"],
            geometry: [],
            color: "#fff",
          },
          claims: [],
          revision_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
        },
      ],
      publication: null,
    }

    const result = JSONSchema.validate(schemaPath("record.schema.json"), document)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(
        result.violations.some(
          (violation) =>
            violation.keyword === "additionalProperties" && violation.detail === "color",
        ),
      ).toBe(true)
    }

    const documentResult = Documents.validate(document)

    expect(documentResult.ok).toBe(false)

    if (!documentResult.ok) {
      expect(
        documentResult.errors.some((error) => error.code === "presentation_field_in_content"),
      ).toBe(true)
    }
  })

  it("pins the contract version in the schemas and the vectors", () => {
    const common = JSONSchema.readSchema(schemaPath("common.schema.json"))
    const contractDefinition = (common["$defs"] as JsonObject)["contract"] as JsonObject

    expect(contractDefinition["const"]).toBe(CONTRACT)

    for (const name of vectorNames()) {
      const file = JSON.parse(
        readFileSync(path.join(Documents.contractFile("vectors"), `${name}.json`), "utf8"),
      ) as JsonValue

      expect((file as JsonObject)["contract"]).toBe(CONTRACT)
    }
  })
})
