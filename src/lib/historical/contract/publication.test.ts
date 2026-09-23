import { describe, expect, it } from "vitest"
import { sourceHash } from "./canonical"
import * as Publication from "./publication"
import * as Timestamps from "./timestamps"
import type { JsonObject, JsonValue } from "./types"
import { buildTree, load, runBang } from "./vectors"

/**
 * Runs the publication vectors and pins the correction-history rule that the
 * vectors can only state as data: a published revision stays current until a set
 * publishes its successor, and the history keeps both.
 */

for (const vector of load("publication")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}

describe("publication history", () => {
  it("keeps prior published revisions with their change explanations", () => {
    const { documents, sets } = buildTree({
      documents: [
        { source_id: "lks:source:vector-a", kind: "scholarly" },
        {
          kind: "event",
          revisions: [
            {
              content: { summary: "First.", event_types: ["occurrence"], time: null },
              change_explanation: "Initial account.",
              claims: [attestedClaim("lks:claim:vector-1", "1")],
            },
            {
              content: { summary: "Corrected.", event_types: ["occurrence"], time: null },
              change_explanation: "Corrected the year after reviewing the second source.",
              claims: [attestedClaim("lks:claim:vector-2", "2")],
            },
          ],
        },
      ],
      sets: [
        {
          set_id: "lks:set:vector-1",
          members: [{ record_id: "lks:event:vector-example", revision_id: "lks:rev:vector-1" }],
          published_at: "2026-01-06T00:00:00Z",
        },
        {
          set_id: "lks:set:vector-2",
          members: [{ record_id: "lks:event:vector-example", revision_id: "lks:rev:vector-2" }],
          published_at: "2026-01-08T00:00:00Z",
          correction_of_revision: "lks:rev:vector-1",
        },
      ],
    })

    expect(Publication.checkAll(documents, sets).ok).toBe(true)

    const records = documents.filter((document) => document["document"] === "record")
    const history = Publication.history(records, sets)
    const entries = history["lks:event:vector-example"]

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      revision_id: "lks:rev:vector-1",
      change_explanation: "Initial account.",
    })
    expect(entries[1]).toMatchObject({
      revision_id: "lks:rev:vector-2",
      change_explanation: "Corrected the year after reviewing the second source.",
      independence: "self_review",
      reviewer: "Vector Author",
    })
  })

  it("still catches a resealed source edit through the set pin", () => {
    const { documents, sets } = citedEventTree()

    expect(Publication.checkAll(documents, sets).ok).toBe(true)

    // Simulate an editor rewriting an approved source and resealing it: the
    // document's own hash is consistent again, so only the set pin can catch it.
    const edited = documents.map((document) => {
      if (document["document"] !== "source") {
        return document
      }

      const source: JsonObject = {
        ...document,
        title: "Edited after approval",
        license: { ...(document["license"] as JsonObject), attribution_text: "Edited attribution" },
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

  it("never lets an invalid timestamp win publication order", () => {
    expect(Timestamps.valid("2026-99-99T99:99:99Z")).toBe(false)
    expect(Timestamps.compare("2026-99-99T99:99:99Z", "2026-01-06T00:00:00Z")).toBe("unknown")
    expect(Timestamps.valid("2026-01-06T00:00:00Z")).toBe(true)

    const { documents, sets } = buildTree({
      documents: [
        {
          kind: "event",
          revisions: [
            { content: { summary: "First.", event_types: ["occurrence"], time: null } },
            { content: { summary: "Second.", event_types: ["occurrence"], time: null } },
          ],
        },
      ],
      sets: [
        {
          set_id: "lks:set:vector-1",
          members: [{ record_id: "lks:event:vector-example", revision_id: "lks:rev:vector-1" }],
          sources: [],
          published_at: "2026-01-06T00:00:00Z",
        },
        {
          set_id: "lks:set:vector-2",
          members: [{ record_id: "lks:event:vector-example", revision_id: "lks:rev:vector-2" }],
          sources: [],
          published_at: "2026-99-99T99:99:99Z",
        },
      ],
    })

    const result = Publication.checkAll(documents, sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("invalid_timestamp")
    }

    // String comparison would make the impossible timestamp the newest set; the
    // derived current revision must stay on the set that has a real timestamp.
    const records = documents.filter((document) => document["document"] === "record")
    const current = Publication.currentPublished(records, sets)

    expect(current.get("lks:event:vector-example")?.revision_id).toBe("lks:rev:vector-1")
  })
})

function attestedClaim(claimId: string, page: string): JsonValue {
  return {
    claim_id: claimId,
    statement: "The source reports the event.",
    asserts: "",
    basis: "attested",
    role: "main",
    citations: [{ source_id: "lks:source:vector-a", locator: { kind: "page", value: page } }],
  }
}

function citedEventTree(): { documents: JsonObject[]; sets: JsonObject[] } {
  return buildTree({
    documents: [
      { source_id: "lks:source:vector-a", kind: "scholarly", title: "Approved title" },
      {
        kind: "event",
        published: true,
        content: { summary: "An event.", event_types: ["occurrence"], time: null },
        claims: [attestedClaim("lks:claim:vector-1", "2")],
      },
    ],
  })
}
