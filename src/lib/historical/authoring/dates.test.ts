import { describe, expect, it } from "vitest"
import * as Time from "../contract/time"
import { compileTime, compileWindow, formatRange, parseRange } from "./dates"

/**
 * The short date notation against the contract's own time semantics. The
 * notation is only a spelling: every case here must normalize through
 * `Time.normalize` to the interval the written form means, and BCE must never
 * be read as an astronomical year.
 */

describe("the short date notation", () => {
  it("carries a Long Count date's correlation, or null when the source states none", () => {
    const stela = {
      value: "36 BCE",
      calendar: "mesoamerican_long_count",
      as_written: "7.16.3.2.13",
    }

    expect(compileTime({ ...stela, correlation: 584283 })).toMatchObject({
      calendar: "mesoamerican_long_count",
      correlation: 584283,
      interval: { start: { year: 36, era: "bce" } },
    })
    expect(compileTime({ ...stela, correlation: "not stated" })["correlation"]).toBeNull()
    expect(() => compileTime(stela)).toThrow(/needs a correlation/)
    expect(() => compileTime({ ...stela, correlation: "GMT" })).toThrow(/needs a correlation/)
    expect(() => compileTime({ value: "36 BCE", calendar: "julian", correlation: 584283 })).toThrow(
      /only a mesoamerican_long_count date has a correlation/,
    )
    expect(compileTime({ value: "36 BCE", calendar: "julian" })).not.toHaveProperty("correlation")
  })

  it("writes day, month and year precision", () => {
    expect(compileTime({ value: "753-12-20", calendar: "chinese_lunisolar" })).toMatchObject({
      precision: "day",
      mode: "instant",
      interval: {
        bounds: "two_sided",
        boundary: "inclusive",
        start: { year: 753, era: "ce", month: 12, day: 20 },
        end: { year: 753, era: "ce", month: 12, day: 20 },
      },
    })
    expect(compileTime({ value: "753-12", calendar: "julian" })).toMatchObject({
      precision: "month",
    })
    expect(compileTime({ value: 753, calendar: "julian" })).toMatchObject({
      precision: "year",
      interval: { start: { year: 753, era: "ce" } },
    })
  })

  it("spells out BCE and keeps the year the source gives, with no year zero", () => {
    const time = compileTime({ value: "233 BCE..226 BCE", mode: "window", calendar: "regnal" })

    expect(time["interval"]).toMatchObject({
      start: { year: 233, era: "bce" },
      end: { year: 226, era: "bce" },
    })

    // The contract's ordinal for 233 BCE is -232; the notation never writes it.
    const normalized = Time.normalize(time)

    expect(normalized.ok && normalized.value.start?.astro).toBe(-232)
    expect(() => parseRange("-232")).toThrow()
    expect(() => parseRange("0")).toThrow()
  })

  it("asks a range whether it is one occurrence or activity across it", () => {
    expect(() => compileTime({ value: "750..754", calendar: "julian" })).toThrow(/needs a mode/)
    expect(compileTime({ value: "750..754", mode: "window", calendar: "julian" })["mode"]).toBe(
      "occurrence_window",
    )
    expect(compileTime({ value: "750..754", mode: "duration", calendar: "julian" })["mode"]).toBe(
      "duration",
    )
    expect(compileTime({ value: "233 BCE", mode: "window", calendar: "regnal" })["mode"]).toBe(
      "occurrence_window",
    )
  })

  it("marks an approximate endpoint without moving it", () => {
    const time = compileTime({ value: "~1000 BCE..800 BCE", mode: "window", calendar: "julian" })

    expect(time["interval"]).toEqual({
      bounds: "two_sided",
      boundary: "inclusive",
      start: { year: 1000, era: "bce", endpoint_certainty: "approximate" },
      end: { year: 800, era: "bce" },
    })

    const normalized = Time.normalize(time)

    expect(normalized.ok && normalized.value.start?.certainty).toBe("approximate")
    expect(normalized.ok && normalized.value.start?.astro).toBe(-999)

    // A single approximate date is still an instant, approximate at both ends.
    expect(compileTime({ value: "~320 BCE", calendar: "julian" })).toMatchObject({
      mode: "instant",
      interval: {
        start: { year: 320, era: "bce", endpoint_certainty: "approximate" },
        end: { year: 320, era: "bce", endpoint_certainty: "approximate" },
      },
    })
    expect(Time.normalize(compileTime({ value: "~320 BCE", calendar: "julian" })).ok).toBe(true)
  })

  it("writes one decade or one century at that precision, aligned as v0 requires", () => {
    const cases: [string, object, object][] = [
      ["730s", { year: 730, era: "ce" }, { year: 739, era: "ce" }],
      ["730s BCE", { year: 739, era: "bce" }, { year: 730, era: "bce" }],
      ["8th century", { year: 701, era: "ce" }, { year: 800, era: "ce" }],
      ["1st century BCE", { year: 100, era: "bce" }, { year: 1, era: "bce" }],
      ["21st century BCE", { year: 2100, era: "bce" }, { year: 2001, era: "bce" }],
      ["12th century", { year: 1101, era: "ce" }, { year: 1200, era: "ce" }],
    ]

    for (const [value, start, end] of cases) {
      const time = compileTime({ value, mode: "window", calendar: "julian" })
      const precision = value.includes("century") ? "century" : "decade"

      expect(time).toMatchObject({ precision, interval: { bounds: "two_sided", start, end } })
      expect(Time.normalize(time).ok).toBe(true)
    }

    // A decade or a century is a span, so it needs a mode like any range.
    expect(() => compileTime({ value: "1st century BCE", calendar: "julian" })).toThrow(
      /needs a mode/,
    )
    expect(() => parseRange("2nd century BCE..1st century BCE")).toThrow(/more than one century/)
    expect(() => parseRange("2th century")).toThrow(/2nd century/)
    expect(() => parseRange("735s")).toThrow(/not a date/)
  })

  it("writes a one-sided date with the written year as its inclusive bound", () => {
    const after = compileTime({ value: "after ~3400 BCE", mode: "window", calendar: "julian" })

    expect(after["interval"]).toEqual({
      bounds: "lower_only",
      boundary: "inclusive",
      start: { year: 3400, era: "bce", endpoint_certainty: "approximate" },
      end: null,
    })
    expect(Time.normalize(after).ok).toBe(true)

    const before = compileTime({ value: "before 300", mode: "window", calendar: "julian" })

    expect(before["interval"]).toMatchObject({
      bounds: "upper_only",
      start: null,
      end: { year: 300, era: "ce" },
    })
    expect(Time.normalize(before).ok).toBe(true)
    expect(() => compileTime({ value: "after 300", calendar: "julian" })).toThrow(/needs a mode/)
    // A story span opens the atlas on a window, so it is never one-sided or approximate.
    expect(() => compileWindow("after 750")).toThrow(/span/)
    expect(() => compileWindow("~750..779")).toThrow(/never approximate/)
  })

  it("refuses what it cannot write rather than guessing", () => {
    expect(() => parseRange("..754")).toThrow(/open-ended/)
    expect(() => parseRange("753-12..754")).toThrow(/different precisions/)
    expect(() => parseRange("753-13")).toThrow(/month/)
    expect(() => parseRange("753/12/20")).toThrow(/not a date/)
    expect(() => compileTime({ value: "753", mode: "sometime", calendar: "julian" })).toThrow(
      /not a mode/,
    )
  })

  it("keeps the source's own expression and a missing one as null", () => {
    expect(
      compileTime({
        value: "753-12-20",
        calendar: "chinese_lunisolar",
        as_written: "廿日乙酉午時",
      })["source_expression"],
    ).toBe("廿日乙酉午時")
    expect(compileTime({ value: "753", calendar: "julian" })["source_expression"]).toBeNull()
  })

  it("writes a story span as an inclusive window in years", () => {
    expect(compileWindow("750..779")).toEqual({
      start: { year: 750, era: "ce" },
      end: { year: 779, era: "ce" },
      boundary: "inclusive",
    })
    expect(() => compileWindow("750-01..779-12")).toThrow(/years/)
  })

  it("formats every interval it parses back to the same text", () => {
    for (const text of [
      "753-12-20",
      "753-12",
      "753",
      "750..754",
      "233 BCE",
      "233-10 BCE",
      "233 BCE..226 BCE",
      "~1000 BCE..800 BCE",
      "~320 BCE",
      "730s",
      "730s BCE",
      "~1st century BCE",
      "21st century BCE",
      "11th century",
      "after ~3400 BCE",
      "before 300",
    ]) {
      const range = parseRange(text)

      expect(formatRange(range.start, range.end, range.precision)).toBe(text)
    }
  })
})
