import { describe, expect, it } from "vitest"
import * as Time from "./time"
import type { JsonObject } from "./types"
import { load, runBang } from "./vectors"

/**
 * Runs the partial-ordering vectors and pins the rule that an unordered pair is
 * reported as unordered rather than given an arbitrary tie-break.
 */

for (const vector of load("ordering")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}

function window(startYear: number, endYear: number): JsonObject {
  return {
    source_expression: "example range",
    calendar: "julian",
    precision: "year",
    mode: "occurrence_window",
    interval: {
      bounds: "two_sided",
      boundary: "inclusive",
      start: { year: startYear, era: "ce" },
      end: { year: endYear, era: "ce" },
    },
  }
}

describe("partial ordering", () => {
  it("keeps overlapping intervals unordered instead of receiving a tie-break", () => {
    expect(Time.relation(window(730, 740), window(735, 745))).toMatchObject({
      ok: true,
      value: { relation: "overlaps" },
    })
    expect(Time.relation(window(730, 739), window(740, 750))).toMatchObject({
      ok: true,
      value: { relation: "before" },
    })
    expect(Time.relation(window(740, 750), window(730, 739))).toMatchObject({
      ok: true,
      value: { relation: "after" },
    })
  })

  it("detects an ordering cycle across three events", () => {
    const edges = [
      { from: "lks:event:a", to: "lks:event:b", relation: "before" },
      { from: "lks:event:b", to: "lks:event:c", relation: "before" },
      { from: "lks:event:c", to: "lks:event:a", relation: "before" },
    ]

    const found = Time.cycle(edges)

    expect(found).not.toBeNull()
    expect(found).toContain("lks:event:a")
  })
})
