import { describe, expect, it } from "vitest"
import * as Documents from "./documents"
import * as Publication from "./publication"
import { load, runBang } from "./vectors"

/**
 * The conventional claim basis (RFD 2, "A conventional basis for standard date
 * conversions"): a date that standard reference chronologies agree on, derived
 * from a source that gives a sequence rather than a calendar date. It names its
 * conversion, cites the passage and the reference, asserts a time, and is never
 * one side of a dispute. And the tradition basis (RFD 2, "A tradition basis for
 * received stories"): what a source passes on as legend, which needs no
 * attribution and never shares a pointer with a conventional date.
 */

describe("the claim-basis vectors", () => {
  it("document every code they expect, and pin their count", () => {
    const documented = new Set([...Documents.codes(), ...Publication.codes()])
    const vectors = load("claims")

    for (const vector of vectors) {
      for (const code of (vector["expect"] as { codes?: string[] }).codes ?? []) {
        expect(documented.has(code), `${String(vector["id"])} expects ${code}`).toBe(true)
      }
    }

    expect(new Set(vectors.map((vector) => vector["id"])).size).toBe(vectors.length)
    expect(vectors.length).toBe(12)
  })
})

for (const vector of load("claims")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}
