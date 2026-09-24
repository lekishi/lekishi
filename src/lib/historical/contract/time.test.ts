import { describe, expect, it } from "vitest"
import * as Time from "./time"
import type { JsonObject } from "./types"
import { load, runBang } from "./vectors"

/**
 * Runs the time boundary vectors and pins two rules that no single vector can
 * express: an uncertain occurrence has no midpoint coordinate, and the
 * chronological key of an occurrence window spans the whole uncertainty range.
 */

for (const vector of load("time")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}

const occurrenceWindow: JsonObject = {
  source_expression: "sometime between 730 and 760 CE",
  calendar: "julian",
  precision: "year",
  mode: "occurrence_window",
  interval: {
    bounds: "two_sided",
    boundary: "inclusive",
    start: { year: 730, era: "ce" },
    end: { year: 760, era: "ce" },
  },
}

describe("time semantics the vectors cannot state as data", () => {
  it("keeps the whole range as the chronological key of an uncertain occurrence", () => {
    expect(Time.chronologicalKey(occurrenceWindow)).toEqual({ ok: true, value: [730, 760] })
  })

  it("never reports an uncertain occurrence as continuous activity at any playhead", () => {
    for (const year of [730, 745, 760]) {
      expect(Time.playbackState(occurrenceWindow, { year, era: "ce" })).toEqual({
        ok: true,
        value: "possible",
      })
    }
  })

  it("distinguishes a duration from the same span of uncertainty", () => {
    const duration = { ...occurrenceWindow, mode: "duration" }

    expect(Time.continuousActivity(duration)).toEqual({ ok: true, value: true })
    expect(Time.continuousActivity(occurrenceWindow)).toEqual({ ok: true, value: false })
    expect(Time.relation(duration, occurrenceWindow)).toMatchObject({
      ok: true,
      value: { relation: "overlaps" },
    })
  })

  it("keeps day-precision records inside one year unordered at v0 granularity", () => {
    const thirdOfMarch = dayInstant(740, 3, 3)
    const fourthOfMarch = dayInstant(740, 3, 4)

    expect(Time.relation(thirdOfMarch, fourthOfMarch)).toEqual({
      ok: true,
      value: { relation: "overlaps", caveats: ["year_granularity_comparison"] },
    })

    expect(Time.orderingConsistent(thirdOfMarch, fourthOfMarch, "before")).toEqual({
      ok: false,
      errors: ["declared_order_not_supported"],
    })
    expect(Time.orderingConsistent(fourthOfMarch, thirdOfMarch, "after")).toEqual({
      ok: false,
      errors: ["declared_order_not_supported"],
    })
    expect(Time.orderingConsistent(thirdOfMarch, fourthOfMarch, "concurrent").ok).toBe(true)
    expect(Time.orderingConsistent(thirdOfMarch, fourthOfMarch, "undetermined").ok).toBe(true)

    // A year boundary still establishes the order, so this is granularity and not
    // a refusal to compare day-precision records at all.
    expect(Time.relation(dayInstant(740, 12, 31), dayInstant(741, 1, 1))).toEqual({
      ok: true,
      value: { relation: "before", caveats: ["year_granularity_comparison"] },
    })
  })

  it("requires an explicit era instead of assuming CE", () => {
    expect(Time.astro({ year: 1, era: "bce" })).toBe(0)
    expect(Time.astro({ year: 1, era: "ce" })).toBe(1)
    expect(() => Time.astro({ year: 740 })).toThrow()
    expect(() => Time.astro({ year: 740, era: "ad" })).toThrow()
  })

  it("accepts only valid civil era years as playheads", () => {
    expect(Time.playbackState(occurrenceWindow, { year: 745, era: "ce" })).toEqual({
      ok: true,
      value: "possible",
    })

    // A BCE playhead is a valid civil era year; it is simply outside this CE window.
    expect(Time.playbackState(occurrenceWindow, { year: 745, era: "bce" })).toEqual({
      ok: true,
      value: "inactive",
    })

    expect(Time.playbackState(occurrenceWindow, { year: 740 })).toEqual({
      ok: false,
      errors: ["playhead_must_be_era_year"],
    })
    expect(Time.playbackState(occurrenceWindow, { year: 740, era: "ad" })).toEqual({
      ok: false,
      errors: ["playhead_must_be_era_year"],
    })
    expect(Time.playbackState(occurrenceWindow, { year: 0, era: "ce" })).toEqual({
      ok: false,
      errors: ["playhead_year_must_be_positive"],
    })
    expect(Time.playbackState(occurrenceWindow, { year: 0, era: "bce" })).toEqual({
      ok: false,
      errors: ["playhead_year_must_be_positive"],
    })
  })
})

function dayInstant(year: number, month: number, day: number): JsonObject {
  return {
    source_expression: `${day}/${month}/${year} CE`,
    calendar: "julian",
    precision: "day",
    mode: "instant",
    interval: {
      bounds: "two_sided",
      boundary: "inclusive",
      start: { year, era: "ce", month, day },
      end: { year, era: "ce", month, day },
    },
  }
}
