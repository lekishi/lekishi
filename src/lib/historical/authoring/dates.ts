import type { JsonObject } from "../contract/types"

/**
 * The short date notation of the record files (RFD 2, "Decided: date notation").
 *
 * An author writes `753-12-20`, `753-12`, `753`, `750..754`, `233 BCE` or
 * `233 BCE..226 BCE`; the compiler expands it into the contract's own `time`
 * object, so the v0 vectors and the time semantics keep holding unchanged.
 *
 * The era is spelled out rather than written as an astronomical year: EDTF's
 * `-0232` for 233 BCE is the off-by-one the contract's `era` field exists to
 * prevent, and nothing here ever produces a year zero.
 *
 * Since 2026-10-22 (RFD 2, "Decided: approximate, coarse and open dates") the
 * notation also writes what v0 could already store: `~` before an endpoint marks
 * it approximate (`endpoint_certainty`), `730s` and `5th century BCE` are one
 * decade or one century at that precision, and `after 1451 BCE` and `before 300`
 * are one-sided intervals with the written year as their inclusive bound.
 */

export type Endpoint = {
  year: number
  era: "bce" | "ce"
  month?: number
  day?: number
  endpoint_certainty?: "approximate"
}

export type Precision = "day" | "month" | "year" | "decade" | "century"

export type Bounds = "two_sided" | "lower_only" | "upper_only"

/** The modes an author names. `window` is the contract's `occurrence_window`. */
const MODES: Record<string, string> = {
  instant: "instant",
  window: "occurrence_window",
  duration: "duration",
}

const LONG_COUNT = "mesoamerican_long_count"

const ENDPOINT = /^([1-9][0-9]*)(?:-([0-9]{2})(?:-([0-9]{2}))?)?(?: (BCE))?$/
const DECADE = /^([1-9][0-9]*0)s(?: (BCE))?$/
const CENTURY = /^([1-9][0-9]*)(st|nd|rd|th) century(?: (BCE))?$/

/** One written side of a date: its first and last year, which differ for a decade or century. */
type Side = { first: Endpoint; last: Endpoint; precision: Precision }

function side(written: string): Side {
  const trimmed = written.trim()
  const approximate = trimmed.startsWith("~")
  const text = approximate ? trimmed.slice(1) : trimmed
  const parsed = decade(text) ?? century(text) ?? endpoint(text)

  if (approximate) {
    parsed.first.endpoint_certainty = "approximate"
    parsed.last.endpoint_certainty = "approximate"
  }

  return parsed
}

function endpoint(text: string): Side {
  const match = ENDPOINT.exec(text)

  if (match === null) {
    throw new Error(
      `"${text}" is not a date: write a year, year-month or year-month-day, a decade such as 730s, or a century such as 5th century, with " BCE" for years before the common era`,
    )
  }

  const [, year, month, day, bce] = match
  const era = bce === undefined ? "ce" : "bce"
  const result: Endpoint = { year: Number(year), era }

  if (month !== undefined) {
    result.month = Number(month)

    if (result.month < 1 || result.month > 12) {
      throw new Error(`"${text}" names month ${month}`)
    }
  }

  if (day !== undefined) {
    result.day = Number(day)

    if (result.day < 1 || result.day > 31) {
      throw new Error(`"${text}" names day ${day}`)
    }
  }

  return {
    first: result,
    // A single date is its own end, copied so the two endpoints never share an object.
    last: { ...result },
    precision: day !== undefined ? "day" : month !== undefined ? "month" : "year",
  }
}

/** `730s` is 730–739; `730s BCE` is 739–730 BCE, the contract's decade alignment. */
function decade(text: string): Side | null {
  const match = DECADE.exec(text)

  if (match === null) {
    return null
  }

  const year = Number(match[1])

  return match[2] === undefined
    ? coarse(year, year + 9, "ce", "decade")
    : coarse(year + 9, year, "bce", "decade")
}

/** `5th century` is 401–500; `1st century BCE` is 100–1 BCE, the contract's century alignment. */
function century(text: string): Side | null {
  const match = CENTURY.exec(text)

  if (match === null) {
    return null
  }

  const number = Number(match[1])

  if (match[2] !== ordinal(number)) {
    throw new Error(`"${text}" should be written ${number}${ordinal(number)} century`)
  }

  return match[3] === undefined
    ? coarse((number - 1) * 100 + 1, number * 100, "ce", "century")
    : coarse(number * 100, (number - 1) * 100 + 1, "bce", "century")
}

function coarse(first: number, last: number, era: "bce" | "ce", precision: Precision): Side {
  return { first: { year: first, era }, last: { year: last, era }, precision }
}

function ordinal(number: number): string {
  const tens = number % 100

  if (tens >= 11 && tens <= 13) {
    return "th"
  }

  return ["th", "st", "nd", "rd"][number % 10] ?? "th"
}

/**
 * Parses a written date or range into its inclusive endpoints. A YAML scalar
 * `753` arrives as a number, so a bare year is accepted either way. A one-sided
 * interval has a null for the side it does not bound.
 */
export function parseRange(value: unknown): {
  start: Endpoint | null
  end: Endpoint | null
  precision: Precision
  bounds: Bounds
  range: boolean
} {
  const text = typeof value === "number" ? String(value) : value

  if (typeof text !== "string") {
    throw new Error(`a date must be written as text such as 753-12-20 or 750..754`)
  }

  const open = /^(after|before) (.+)$/.exec(text.trim())

  if (open !== null) {
    const bound = side(open[2])

    return open[1] === "after"
      ? {
          start: bound.first,
          end: null,
          precision: bound.precision,
          bounds: "lower_only",
          range: true,
        }
      : {
          start: null,
          end: bound.last,
          precision: bound.precision,
          bounds: "upper_only",
          range: true,
        }
  }

  const sides = text.split("..")

  if (sides.length > 2) {
    throw new Error(`"${text}" has more than one ".."`)
  }

  if (sides.some((part) => part.trim() === "")) {
    throw new Error(
      `"${text}" is open-ended; write a one-sided date as "after 750" or "before 754"`,
    )
  }

  const first = side(sides[0])
  const last = sides.length === 2 ? side(sides[1]) : first

  // v0 states one precision for the whole interval, so both ends of a range must
  // be written to the same granularity rather than have one silently widened.
  if (first.precision !== last.precision) {
    throw new Error(`"${text}" writes its two ends to different precisions`)
  }

  // v0 holds a decade or century precision to exactly one decade or century.
  if (sides.length === 2 && (first.precision === "decade" || first.precision === "century")) {
    throw new Error(
      `"${text}" spans more than one ${first.precision}; write the range in years, with ~ where an end is approximate`,
    )
  }

  return {
    start: first.first,
    end: last.last,
    precision: first.precision,
    bounds: "two_sided",
    range: sides.length === 2 || first.precision === "decade" || first.precision === "century",
  }
}

/**
 * A record file's date block (`value`, `calendar`, `as_written`, optional
 * `mode`, and `correlation` for a Long Count) as the contract's `time` object.
 * A single date defaults to `instant`; a range, a decade, a century or a
 * one-sided date must say whether it is one occurrence somewhere inside it
 * (`window`) or activity across it (`duration`), because the two answer
 * playback differently and neither is a safe default.
 */
export function compileTime(block: JsonObject): JsonObject {
  const range = parseRange(block["value"])
  const written = block["mode"]

  if (written === undefined && range.range) {
    throw new Error(
      `"${String(block["value"])}" is a span of time and needs a mode: window (one occurrence inside it) or duration (activity across it)`,
    )
  }

  const mode = MODES[written === undefined ? "instant" : String(written)]

  if (mode === undefined) {
    throw new Error(`"${String(written)}" is not a mode; write instant, window, or duration`)
  }

  return {
    source_expression: block["as_written"] === undefined ? null : (block["as_written"] as string),
    calendar: block["calendar"] as string,
    ...correlation(block),
    precision: range.precision,
    mode,
    interval: {
      bounds: range.bounds,
      boundary: "inclusive",
      start: range.start,
      end: range.end,
    },
  }
}

/**
 * A Long Count date's `correlation` (RFD 2, "Decided: a Mesoamerican Long Count
 * calendar"): the Julian day number of 0.0.0.0.0 the source's
 * conversion uses, or `not stated`, which the contract records as null. No other
 * calendar carries one.
 */
function correlation(block: JsonObject): JsonObject {
  const written = block["correlation"]

  if (block["calendar"] !== LONG_COUNT) {
    if (written !== undefined) {
      throw new Error(`only a ${LONG_COUNT} date has a correlation`)
    }

    return {}
  }

  if (written === "not stated") {
    return { correlation: null }
  }

  if (typeof written !== "number" || !Number.isInteger(written) || written < 0) {
    throw new Error(
      `a ${LONG_COUNT} date needs a correlation: the Julian day number of 0.0.0.0.0 its source uses, such as 584283, or "not stated"`,
    )
  }

  return { correlation: written }
}

/** A story span (`750..779`) as the story's inclusive `window`. */
export function compileWindow(value: unknown): JsonObject {
  const range = parseRange(value)

  if (range.precision !== "year" || range.start === null || range.end === null) {
    throw new Error(`a span is written in years from one year to another, not "${String(value)}"`)
  }

  if (range.start.endpoint_certainty !== undefined || range.end.endpoint_certainty !== undefined) {
    throw new Error(
      `a span is the window the atlas opens on and is never approximate: "${String(value)}"`,
    )
  }

  return { start: range.start, end: range.end, boundary: "inclusive" }
}

/** The written form of one endpoint, the inverse of the notation above. */
export function formatEndpoint(point: Endpoint): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  let text = String(point.year)

  if (point.month !== undefined) {
    text += `-${pad(point.month)}`
  }

  if (point.day !== undefined) {
    text += `-${pad(point.day)}`
  }

  return `${point.endpoint_certainty === "approximate" ? "~" : ""}${point.era === "bce" ? `${text} BCE` : text}`
}

/** The written form of an inclusive interval: one date, a decade or century, `start..end`, or one side. */
export function formatRange(
  start: Endpoint | null,
  end: Endpoint | null,
  precision: Precision = "year",
): string {
  if (start === null && end !== null) {
    return `before ${formatEndpoint(end)}`
  }

  if (end === null && start !== null) {
    return `after ${formatEndpoint(start)}`
  }

  if (start === null || end === null) {
    throw new Error(`an interval needs at least one endpoint`)
  }

  if (precision === "decade" || precision === "century") {
    return formatCoarse(start, end, precision)
  }

  const first = formatEndpoint(start)
  const last = formatEndpoint(end)

  return first === last ? first : `${first}..${last}`
}

function formatCoarse(start: Endpoint, end: Endpoint, precision: "decade" | "century"): string {
  const prefix = start.endpoint_certainty === "approximate" ? "~" : ""
  const era = start.era === "bce" ? " BCE" : ""

  if (precision === "decade") {
    return `${prefix}${start.era === "bce" ? end.year : start.year}s${era}`
  }

  const number = (start.era === "bce" ? start.year : end.year) / 100

  return `${prefix}${number}${ordinal(number)} century${era}`
}

/** The author's spelling of a contract mode. */
export function writtenMode(mode: string): string {
  const entry = Object.entries(MODES).find(([, value]) => value === mode)

  if (entry === undefined) {
    throw new Error(`the record files cannot write the mode ${mode}`)
  }

  return entry[0]
}
