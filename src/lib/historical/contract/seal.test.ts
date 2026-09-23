import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { revisionHash, sourceHash } from "./canonical"
import { placeholder, sealAll } from "./seal"
import type { JsonObject } from "./types"

/**
 * The seal utility rewrites hash fields positionally so an author's formatting
 * survives. These tests exercise the rewrite on a temporary tree: the real
 * examples are sealed already, and resealing them must be a no-op.
 */

let directory: string | undefined

afterEach(() => {
  if (directory !== undefined) {
    rmSync(directory, { recursive: true, force: true })
    directory = undefined
  }
})

function writeExampleTree(): string {
  directory = mkdtempSync(path.join(tmpdir(), "lekishi-seal-"))
  const records = path.join(directory, "records")
  const sources = path.join(directory, "sources")
  const sets = path.join(directory, "publication-sets")

  for (const folder of [records, sources, sets]) {
    mkdirSync(folder, { recursive: true })
  }

  const revision: JsonObject = {
    revision_id: "lks:rev:vector-1",
    created_at: "2026-01-01T00:00:00Z",
    author: { name: "Example author" },
    change_explanation: "initial",
    content: { summary: "s" },
    claims: [],
    revision_hash: placeholder(1),
  }
  const source: JsonObject = {
    contract: "lekishi-historical-contract/v0",
    document: "source",
    source_id: "lks:source:vector-a",
    title: "Example source",
    license: {
      status: "recorded",
      license_id: "public-domain",
      attribution_text: "Example source",
      redistribution: "permitted",
      quotation_permitted: true,
    },
    source_hash: placeholder(1),
  }
  const record: JsonObject = {
    contract: "lekishi-historical-contract/v0",
    document: "record",
    kind: "event",
    record_id: "lks:event:vector-example",
    created_at: "2026-01-01T00:00:00Z",
    revisions: [revision],
    publication: {
      published_revision_id: "lks:rev:vector-1",
      published_revision_hash: placeholder(2),
      set_id: "lks:set:vector-auto",
      published_at: "2026-01-06T00:00:00Z",
      published_by: { name: "Vector Author" },
    },
  }
  const set: JsonObject = {
    contract: "lekishi-historical-contract/v0",
    document: "publication_set",
    set_id: "lks:set:vector-auto",
    members: [
      {
        record_id: "lks:event:vector-example",
        revision_id: "lks:rev:vector-1",
        revision_hash: placeholder(1),
      },
    ],
    sources: [{ source_id: "lks:source:vector-a", source_hash: placeholder(2) }],
  }

  writeFileSync(path.join(sources, "example.json"), JSON.stringify(source, null, 2))
  writeFileSync(path.join(records, "example.json"), JSON.stringify(record, null, 2))
  writeFileSync(path.join(sets, "example.json"), JSON.stringify(set, null, 2))

  return directory
}

describe("sealing the worked examples", () => {
  it("replaces placeholders with the hashes of the current content", () => {
    const root = writeExampleTree()

    sealAll(root)

    const source = JSON.parse(
      readFileSync(path.join(root, "sources", "example.json"), "utf8"),
    ) as JsonObject
    const record = JSON.parse(
      readFileSync(path.join(root, "records", "example.json"), "utf8"),
    ) as JsonObject
    const set = JSON.parse(
      readFileSync(path.join(root, "publication-sets", "example.json"), "utf8"),
    ) as JsonObject
    const revision = (record["revisions"] as JsonObject[])[0]

    expect(source["source_hash"]).toBe(sourceHash(source))
    expect(revision["revision_hash"]).toBe(revisionHash(revision))
    expect((record["publication"] as JsonObject)["published_revision_hash"]).toBe(
      revision["revision_hash"],
    )
    expect((set["members"] as JsonObject[])[0]["revision_hash"]).toBe(revision["revision_hash"])
    expect((set["sources"] as JsonObject[])[0]["source_hash"]).toBe(source["source_hash"])
  })

  it("keeps the file's own formatting and key order", () => {
    const root = writeExampleTree()
    const before = readFileSync(path.join(root, "sources", "example.json"), "utf8")

    sealAll(root)

    const after = readFileSync(path.join(root, "sources", "example.json"), "utf8")

    expect(after.split("\n").length).toBe(before.split("\n").length)
    expect(after.indexOf('"source_id"')).toBe(before.indexOf('"source_id"'))
  })

  it("refuses to seal when the file has the wrong number of hash fields", () => {
    const root = writeExampleTree()
    const file = path.join(root, "sources", "example.json")
    const source = JSON.parse(readFileSync(file, "utf8")) as JsonObject

    delete source["source_hash"]
    writeFileSync(file, JSON.stringify(source, null, 2))

    expect(() => sealAll(root)).toThrow(/hash fields/)
  })

  it("builds the documented placeholder", () => {
    expect(placeholder(1)).toBe(`sha256:${"0".repeat(63)}1`)
  })
})
