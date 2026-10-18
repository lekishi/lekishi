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
    ]) {
      const range = parseRange(text)

      expect(formatRange(range.start, range.end)).toBe(text)
    }
  })
})
