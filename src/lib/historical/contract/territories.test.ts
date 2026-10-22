import { describe, expect, it } from "vitest"
import * as Documents from "./documents"
import * as Publication from "./publication"
import { load, runBang } from "./vectors"

/**
 * Territories as control by place (rfd/0002/TERRITORIES.adoc): a dated control
 * snapshot names one controller, a window bounded at both ends, and the places a
 * cited source records it holding. A place is gained by an event or a
 * relationship no later than the snapshot, and two controllers share a place in
 * overlapping windows only under a dispute.
 */

describe("the territory vectors", () => {
  it("document every code they expect, and pin their count", () => {
    const documented = new Set([...Documents.codes(), ...Publication.codes()])
    const vectors = load("territories")

    for (const vector of vectors) {
      for (const code of (vector["expect"] as { codes?: string[] }).codes ?? []) {
        expect(documented.has(code), `${String(vector["id"])} expects ${code}`).toBe(true)
      }
    }

    expect(new Set(vectors.map((vector) => vector["id"])).size).toBe(vectors.length)
    expect(vectors.length).toBe(15)
  })
})

for (const vector of load("territories")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}
