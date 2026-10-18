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
 * prevent, and nothing here ever produces a year zero. Every interval the
 * notation can write is two-sided and inclusive, which is every interval the
 * chapters use; an open-ended or half-open interval is refused rather than
 * guessed until the notation gains a spelling for it.
 */

export type Endpoint = { year: number; era: "bce" | "ce"; month?: number; day?: number }

export type Precision = "day" | "month" | "year"

/** The modes an author names. `window` is the contract's `occurrence_window`. */
const MODES: Record<string, string> = {
  instant: "instant",
  window: "occurrence_window",
  duration: "duration",
}

const ENDPOINT = /^([1-9][0-9]*)(?:-([0-9]{2})(?:-([0-9]{2}))?)?(?: (BCE))?$/

function endpoint(text: string): { endpoint: Endpoint; precision: Precision } {
  const match = ENDPOINT.exec(text.trim())

  if (match === null) {
    throw new Error(
      `"${text}" is not a date: write a year, year-month or year-month-day, with " BCE" for years before the common era`,
    )
  }

  const [, year, month, day, bce] = match
  const result: Endpoint = { year: Number(year), era: bce === undefined ? "ce" : "bce" }

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
    endpoint: result,
    precision: day !== undefined ? "day" : month !== undefined ? "month" : "year",
  }
}

/**
 * Parses a written date or range into its two inclusive endpoints. A YAML
 * scalar `753` arrives as a number, so a bare year is accepted either way.
 */
export function parseRange(value: unknown): {
  start: Endpoint
  end: Endpoint
  precision: Precision
  range: boolean
} {
  const text = typeof value === "number" ? String(value) : value

  if (typeof text !== "string") {
    throw new Error(`a date must be written as text such as 753-12-20 or 750..754`)
  }

  const sides = text.split("..")

  if (sides.length > 2) {
    throw new Error(`"${text}" has more than one ".."`)
  }

  if (sides.some((side) => side.trim() === "")) {
    throw new Error(
      `"${text}" is open-ended; the record files only write two-sided ranges such as 750..754`,
    )
  }

  const start = endpoint(sides[0])
  const end = sides.length === 2 ? endpoint(sides[1]) : start

  // v0 states one precision for the whole interval, so both ends of a range must
  // be written to the same granularity rather than have one silently widened.
  if (start.precision !== end.precision) {
    throw new Error(`"${text}" writes its two ends to different precisions`)
  }

  return {
    start: start.endpoint,
    end: end.endpoint,
    precision: start.precision,
    range: sides.length === 2,
  }
}

/**
 * A record file's date block (`value`, `calendar`, `as_written`, optional
 * `mode`) as the contract's `time` object. A single date defaults to `instant`;
 * a range must say whether it is one occurrence somewhere inside it (`window`)
 * or activity across it (`duration`), because the two answer playback
 * differently and neither is a safe default.
 */
export function compileTime(block: JsonObject): JsonObject {
  const range = parseRange(block["value"])
  const written = block["mode"]

  if (written === undefined && range.range) {
    throw new Error(
      `the range "${String(block["value"])}" needs a mode: window (one occurrence inside it) or duration (activity across it)`,
    )
  }

  const mode = MODES[written === undefined ? "instant" : String(written)]

  if (mode === undefined) {
    throw new Error(`"${String(written)}" is not a mode; write instant, window, or duration`)
  }

  return {
    source_expression: block["as_written"] === undefined ? null : (block["as_written"] as string),
    calendar: block["calendar"] as string,
    precision: range.precision,
    mode,
    interval: {
      bounds: "two_sided",
      boundary: "inclusive",
      start: range.start,
      end: range.end,
    },
  }
}

/** A story span (`750..779`) as the story's inclusive `window`. */
export function compileWindow(value: unknown): JsonObject {
  const range = parseRange(value)

  if (range.precision !== "year") {
    throw new Error(`a span is written in years, not "${String(value)}"`)
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

  return point.era === "bce" ? `${text} BCE` : text
}

/** The written form of an inclusive interval: one date, or `start..end`. */
export function formatRange(start: Endpoint, end: Endpoint): string {
  const first = formatEndpoint(start)
  const last = formatEndpoint(end)

  return first === last ? first : `${first}..${last}`
}

/** The author's spelling of a contract mode. */
export function writtenMode(mode: string): string {
  const entry = Object.entries(MODES).find(([, value]) => value === mode)

  if (entry === undefined) {
    throw new Error(`the record files cannot write the mode ${mode}`)
  }

  return entry[0]
}
