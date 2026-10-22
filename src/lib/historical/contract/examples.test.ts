import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { revisionHash, sourceHash } from "./canonical"
import * as Documents from "./documents"
import * as JSONSchema from "./json-schema"
import * as Publication from "./publication"
import * as Time from "./time"
import type { JsonObject, JsonValue } from "./types"
import { load, names as vectorNames } from "./vectors"

/**
 * Validates the worked examples under `historical/v0/examples` as a whole content
 * tree, and checks that every code and caveat the vectors expect is documented by
 * the reference semantics.
 *
 * The examples are synthetic fixtures: they exercise the contract shape and
 * assert nothing about the past.
 */

const examplesDirectory = Documents.contractFile("examples")

/** The vector files the contract ships, with the case count each one carries. */
const VECTOR_FILES: Record<string, number> = {
  calendars: 6,
  claims: 12,
  documents: 42,
  geometry: 28,
  journeys: 21,
  names: 18,
  ordering: 18,
  publication: 23,
  territories: 15,
  time: 58,
}

function loadExamples(pattern: string): JsonObject[] {
  const [directory, extension] = pattern.split("/*")

  return readdirSync(path.join(examplesDirectory, directory))
    .filter((file) => file.endsWith(extension))
    .sort()
    .map(
      (file) =>
        JSON.parse(
          readFileSync(path.join(examplesDirectory, directory, file), "utf8"),
        ) as JsonObject,
    )
}

function exampleTree(): { documents: JsonObject[]; sets: JsonObject[] } {
  return {
    documents: [...loadExamples("records/*.json"), ...loadExamples("sources/*.json")],
    sets: loadExamples("publication-sets/*.json"),
  }
}

describe("the worked examples", () => {
  it("form a valid content tree", () => {
    const { documents, sets } = exampleTree()

    expect(documents).toHaveLength(11)
    expect(sets).toHaveLength(1)

    const result = Publication.checkAll(documents, sets)

    if (!result.ok) {
      throw new Error(
        [
          "worked examples do not satisfy the contract:",
          ...result.errors.map((error) => `  ${error.code} at ${error.where}: ${error.detail}`),
        ].join("\n"),
      )
    }

    expect(Object.keys(result.currentPublished)).toHaveLength(9)
  })

  it("are sealed, so an edit is detected", () => {
    for (const document of loadExamples("records/*.json")) {
      for (const revision of document["revisions"] as JsonValue[]) {
        const revisionObject = revision as JsonObject

        expect(
          revisionHash(revisionObject),
          `${String(document["record_id"])} revision ${String(revisionObject["revision_id"])} was edited after sealing; ` +
            "rerun `pnpm seal` and review the change as a new revision",
        ).toBe(revisionObject["revision_hash"])
      }
    }
  })

  it("name the sealed revision hashes in their publication sets", () => {
    const { documents, sets } = exampleTree()
    const records = new Map(documents.map((document) => [String(document["record_id"]), document]))

    for (const set of sets) {
      for (const memberValue of set["members"] as JsonValue[]) {
        const member = memberValue as JsonObject
        const record = records.get(String(member["record_id"]))
        const revision = (record?.["revisions"] as JsonValue[] | undefined)?.find(
          (candidate) => (candidate as JsonObject)["revision_id"] === member["revision_id"],
        )

        expect(
          revision,
          `${String(member["revision_id"])} is not a revision of ${String(member["record_id"])}`,
        ).toBeDefined()
        expect(revisionHash(revision as JsonObject)).toBe(member["revision_hash"])
      }
    }
  })

  it("name the sealed source hashes in their publication sets", () => {
    const { documents, sets } = exampleTree()
    const sources = new Map(documents.map((document) => [String(document["source_id"]), document]))
    const pins = sets.flatMap((set) => set["sources"] as JsonValue[])

    expect(pins.length).toBeGreaterThan(0)

    for (const pinValue of pins) {
      const pin = pinValue as JsonObject
      const source = sources.get(String(pin["source_id"]))

      expect(source).toBeDefined()
      expect(sourceHash(source as JsonObject)).toBe(pin["source_hash"])
    }
  })

  it("detect an approved source edit even after resealing", () => {
    const { documents, sets } = exampleTree()

    expect(Publication.checkAll(documents, sets).ok).toBe(true)

    // Rewriting an approved source and resealing it leaves the document's own hash
    // consistent, so the set pin is what preserves the reviewed metadata.
    const edited = documents.map((document) => {
      if (document["document"] !== "source") {
        return document
      }

      const source: JsonObject = {
        ...document,
        license: {
          ...(document["license"] as JsonObject),
          attribution_text: "Edited after approval",
        },
      }

      source["source_hash"] = sourceHash(source)

      return source
    })

    const result = Publication.checkAll(edited, sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      const codes = result.errors.map((error) => error.code)

      expect(codes).toContain("pinned_source_hash_mismatch")
      expect(codes).not.toContain("source_hash_mismatch")
    }
  })

  it("keep the example story window inclusive with steps that reference records", () => {
    const { documents } = exampleTree()
    const story = documents.find(
      (document) => document["record_id"] === "lks:story:example-chapter",
    )
    const revisions = story?.["revisions"] as JsonValue[]
    const content = (revisions[revisions.length - 1] as JsonObject)["content"] as JsonObject
    const steps = content["steps"] as JsonValue[]

    expect((content["window"] as JsonObject)["boundary"]).toBe("inclusive")
    expect((steps[0] as JsonObject)["role"]).toBe("start")
    expect(steps).toHaveLength(5)
  })
})

describe("the vector suite", () => {
  it("documents every code and caveat the vectors expect", () => {
    const documented = new Set([...Documents.codes(), ...Time.codes(), ...Publication.codes()])
    const documentedCaveats = new Set(Time.caveats())

    for (const name of vectorNames()) {
      for (const vector of load(name)) {
        const expectation = vector["expect"] as JsonObject
        const codes = [
          ...asList(expectation["error"]),
          ...asList(expectation["codes"]),
          ...asList(expectation["code"]),
        ]

        for (const code of codes) {
          expect(
            documented.has(String(code)),
            `vector ${String(vector["id"])} expects undocumented code ${JSON.stringify(code)}`,
          ).toBe(true)
        }

        for (const caveat of asList(expectation["caveats"])) {
          expect(
            documentedCaveats.has(String(caveat)),
            `vector ${String(vector["id"])} expects undocumented caveat ${JSON.stringify(caveat)}`,
          ).toBe(true)
        }
      }
    }
  })

  it("loads every vector file with distinct ids and the expected case count", () => {
    expect(vectorNames()).toEqual(Object.keys(VECTOR_FILES).sort())

    let total = 0

    for (const [name, expectedCount] of Object.entries(VECTOR_FILES)) {
      const ids = load(name).map((vector) => vector["id"])

      expect(ids.length, `${name}.json has no vectors`).toBeGreaterThan(0)
      expect(new Set(ids).size, `duplicate vector ids in ${name}.json`).toBe(ids.length)
      expect(ids.length, `${name}.json case count changed`).toBe(expectedCount)

      total += ids.length
    }

    // The adversarial suite is the contract's regression surface: every vector
    // file is loaded here, and the total is pinned so a case cannot be dropped.
    expect(total).toBe(241)
  })

  it("ships a schema for every document kind the contract has", () => {
    for (const name of [
      "common.schema.json",
      "kinds.schema.json",
      "record.schema.json",
      "source.schema.json",
      "publication-set.schema.json",
    ]) {
      expect(() => JSONSchema.checkSchema(path.join(Documents.schemaDir(), name))).not.toThrow()
    }
  })
})

function asList(value: JsonValue | undefined): JsonValue[] {
  if (value === undefined || value === null) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}
