/**
 * Editorial metadata timestamps are real-world UTC instants, not historical
 * dates.
 *
 * The schema pattern only fixes their shape, so ordering comparisons must parse
 * them first: a value such as `2026-99-99T99:99:99Z` matches the shape but is not
 * a timestamp, and it must not be able to win a publication ordering comparison.
 * `compare` therefore reports `unknown` when either side is not a real UTC
 * instant, and the document checks report `invalid_timestamp` separately.
 */

const UTC_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|[+-]\d{2}:\d{2})$/

type Parsed = { micros: number }

function parse(value: unknown): Parsed | null {
  if (typeof value !== "string") {
    return null
  }

  const match = UTC_INSTANT.exec(value)

  if (match === null) {
    return null
  }

  const [, year, month, day, hour, minute, second, fraction = "", offset] = match

  // The offset must be zero: an editorial timestamp is recorded in UTC.
  if (offset !== "Z" && offset !== "z" && offset !== "+00:00" && offset !== "-00:00") {
    return null
  }

  const [yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber] = [
    year,
    month,
    day,
    hour,
    minute,
    second,
  ].map((part) => Number.parseInt(part, 10))

  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return null
  }

  if (hourNumber > 23 || minuteNumber > 59 || secondNumber > 59) {
    return null
  }

  // `Date.UTC` rolls impossible days into the next month, so a round trip is what
  // rejects `2026-02-30` instead of silently accepting it.
  const milliseconds = Date.UTC(
    yearNumber,
    monthNumber - 1,
    dayNumber,
    hourNumber,
    minuteNumber,
    secondNumber,
  )
  const rolled = new Date(milliseconds)

  if (
    rolled.getUTCFullYear() !== yearNumber ||
    rolled.getUTCMonth() !== monthNumber - 1 ||
    rolled.getUTCDate() !== dayNumber
  ) {
    return null
  }

  const micros = Number.parseInt(fraction.slice(0, 6).padEnd(6, "0"), 10) || 0

  return { micros: milliseconds * 1000 + micros }
}

export function valid(value: unknown): boolean {
  return parse(value) !== null
}

/**
 * Compares two timestamps, or reports `unknown` when either is not a UTC instant.
 *
 * Callers must not treat `unknown` as ordering information; the invalid value is
 * already reported by the document checks.
 */
export function compare(first: unknown, second: unknown): "lt" | "gt" | "eq" | "unknown" {
  const left = parse(first)
  const right = parse(second)

  if (left === null || right === null) {
    return "unknown"
  }

  if (left.micros < right.micros) {
    return "lt"
  }

  if (left.micros > right.micros) {
    return "gt"
  }

  return "eq"
}

/**
 * Sort key for editorial timestamps: real instants sort first, oldest to newest.
 *
 * A value that is not a UTC instant sorts after every real one, so an impossible
 * timestamp cannot displace a real one in a history listing.
 */
export function sortKey(value: unknown): [0 | 1, number] {
  const parsed = parse(value)

  return parsed === null ? [1, 0] : [0, parsed.micros]
}
