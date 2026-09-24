import {
  err,
  isInteger,
  isObject,
  isString,
  listOf,
  ok,
  type JsonObject,
  type JsonValue,
  type Result,
} from "./types"

/**
 * Reference semantics for the v0 time contract.
 *
 * Two rules drive everything here. The normalized interval is a *support*
 * interval: every value the evidence permits lies inside it and every closed
 * boundary is inclusive, so a claim that ends in 740 CE shares the boundary year
 * 740 with a window that starts there. And `mode` records what the interval
 * means: an `occurrence_window` is one occurrence at an unknown point inside the
 * interval, never continuous activity and never a midpoint date, while a
 * `duration` is activity supported across the interval.
 *
 * Civil era years carry no year zero: 1 BCE precedes 1 CE. `astro` derives the
 * astronomical ordinal used for comparison only; it is never stored, displayed,
 * or used to normalize a year-only claim into a January 1 date. Comparisons are
 * made at year granularity, so sub-year ordering is out of scope for v0 and is
 * reported as a caveat rather than silently resolved.
 */

export const DATED_MODES = ["instant", "occurrence_window", "duration"] as const

const ERA_BOUNDARY_CODES = ["bce", "ce"]

export type TimeMode = (typeof DATED_MODES)[number] | "undated"

export type Bounds = "two_sided" | "lower_only" | "upper_only"

export type NormalizedEndpoint = {
  astro: number
  year: number
  era: string
  month: number | null
  day: number | null
  certainty: string | null
}

export type NormalizedTime = {
  mode: TimeMode
  calendar: string | null
  precision: string | null
  bounds: Bounds | null
  start: NormalizedEndpoint | null
  end: NormalizedEndpoint | null
  continuous: boolean
  sourceExpression: string | null
}

export type TemporalMatch = "definite" | "possible" | "outside" | "undated"
export type PlaybackState = "active" | "possible" | "inactive" | "undated"
export type OrderingRelation = "before" | "after" | "overlaps" | "same" | "undetermined"
export type Window = { start: number; end: number }

/**
 * Derives the astronomical ordinal for comparison. 1 BCE is 0; there is no civil
 * year zero.
 *
 * An era year must state its era. There is no default, because assuming CE for a
 * missing or unrecognized era would silently shift a BCE date by two thousand
 * years.
 */
export function astro(endpoint: unknown): number {
  if (isObject(endpoint) && isInteger(endpoint["year"])) {
    const year = endpoint["year"]

    if (endpoint["era"] === "bce") {
      return 1 - year
    }

    if (endpoint["era"] === "ce") {
      return year
    }
  }

  throw new Error(
    `astro requires an era year with an integer year and an explicit bce or ce era, got: ${JSON.stringify(endpoint)}`,
  )
}

/** Codes this module can report, for documentation and vector expectations. */
export function codes(): string[] {
  return [
    "civil_year_zero",
    "year_must_be_positive",
    "year_must_be_integer",
    "era_must_be_bce_or_ce",
    "month_out_of_range",
    "day_out_of_range",
    "day_precision_requires_month_and_day",
    "month_precision_requires_month",
    "month_precision_forbids_day",
    "year_precision_has_month_or_day",
    "unknown_mode_requires_unspecified_precision",
    "unknown_mode_has_interval",
    "missing_interval",
    "time_must_be_object_or_null",
    "dated_mode_requires_precision",
    "boundary_not_inclusive",
    "unknown_bounds",
    "bounds_mismatch",
    "interval_without_endpoint",
    "decade_span_mismatch",
    "century_span_mismatch",
    "interval_start_after_end",
    "instant_start_end_mismatch",
    "instant_requires_two_sided",
    "endpoint_must_be_era_year",
    "window_must_have_start_and_end",
    "playhead_must_be_era_year",
    "playhead_year_must_be_positive",
    "order_with_undated_record",
    "declared_order_not_supported",
    "unknown_ordering_relation",
  ]
}

/** Caveat names this module can report alongside a comparison result. */
export function caveats(): string[] {
  return ["cross_calendar_approximation", "year_granularity_comparison", "undated_record"]
}

/**
 * Normalizes a `time` object (or null) into a support interval.
 *
 * Returns an error with every rule violation found, so an editor sees all
 * problems in one pass rather than one at a time.
 */
export function normalize(time: unknown): Result<NormalizedTime> {
  if (time === null || time === undefined) {
    return ok(undated(null))
  }

  if (!isObject(time)) {
    return err(["time_must_be_object_or_null"])
  }

  if (time["mode"] === "unknown") {
    const errors: string[] = []

    add(errors, time["precision"] !== "unspecified", "unknown_mode_requires_unspecified_precision")
    add(
      errors,
      time["interval"] !== null && time["interval"] !== undefined,
      "unknown_mode_has_interval",
    )

    return errors.length === 0 ? ok(undated(stringOrNull(time["source_expression"]))) : err(errors)
  }

  const mode = time["mode"]

  if (isString(mode) && (DATED_MODES as readonly string[]).includes(mode)) {
    return normalizeDated(time, time["interval"])
  }

  return err(["time_must_be_object_or_null"])
}

function normalizeDated(
  time: JsonObject,
  intervalValue: JsonValue | undefined,
): Result<NormalizedTime> {
  const intervalIsObject = isObject(intervalValue)
  const interval: JsonObject = intervalIsObject ? (intervalValue as JsonObject) : {}
  const bounds = interval["bounds"]
  const startEndpoint = interval["start"]
  const endEndpoint = interval["end"]
  const precision = time["precision"]

  const errors: string[] = []

  add(errors, time["precision"] === "unspecified", "dated_mode_requires_precision")
  add(errors, !intervalIsObject, "missing_interval")

  if (intervalIsObject) {
    add(errors, interval["boundary"] !== "inclusive", "boundary_not_inclusive")
    add(
      errors,
      !(isString(bounds) && ["two_sided", "lower_only", "upper_only"].includes(bounds)),
      "unknown_bounds",
    )
    add(errors, boundsMismatch(bounds, startEndpoint, endEndpoint), "bounds_mismatch")
    add(errors, isNil(startEndpoint) && isNil(endEndpoint), "interval_without_endpoint")
    errors.push(...endpointErrors(startEndpoint, precision))
    errors.push(...endpointErrors(endEndpoint, precision))
    errors.push(...alignmentErrors(interval, precision))
    errors.push(...orderErrors(interval, bounds))
    errors.push(...instantErrors(time["mode"], bounds, startEndpoint, endEndpoint))
  }

  return errors.length === 0 ? ok(build(time, interval)) : err(errors)
}

/** Normalizes an inclusive year window into the comparison form used by matching. */
export function window(value: unknown): Result<Window> {
  if (!isObject(value) || !("start" in value) || !("end" in value)) {
    return err(["window_must_have_start_and_end"])
  }

  const startEndpoint = value["start"]
  const endEndpoint = value["end"]
  const errors: string[] = [
    ...endpointErrors(startEndpoint, "year"),
    ...endpointErrors(endEndpoint, "year"),
  ]

  if (errors.length === 0 && astro(startEndpoint) > astro(endEndpoint)) {
    errors.push("interval_start_after_end")
  }

  if (errors.length > 0) {
    return err(errors)
  }

  return ok({ start: astro(startEndpoint), end: astro(endEndpoint) })
}

/**
 * Classifies a record against an inclusive window.
 *
 * `definite` means the whole support interval lies inside the window, so the
 * occurrence is certainly within it even when the exact year is unknown.
 * `possible` means the intervals intersect without containment, which is the
 * default inclusion policy for bounded uncertain occurrences. `undated` means the
 * record has no usable date and must not match any window.
 */
export function temporalMatch(
  time: unknown,
  windowValue: unknown,
  opts: { calendar?: string } = {},
): Result<{ match: TemporalMatch; caveats: string[] }> {
  const normalized = normalize(time)

  if (!normalized.ok) {
    return normalized
  }

  const normalizedWindow = window(windowValue)

  if (!normalizedWindow.ok) {
    return normalizedWindow
  }

  return ok({
    match: match(normalized.value, normalizedWindow.value),
    caveats: caveatsOf(normalized.value, opts),
  })
}

function match(normalized: NormalizedTime, windowValue: Window): TemporalMatch {
  if (normalized.mode === "undated") {
    return "undated"
  }

  if (normalized.bounds === "two_sided") {
    const start = normalized.start as NormalizedEndpoint
    const end = normalized.end as NormalizedEndpoint

    if (windowValue.start <= start.astro && end.astro <= windowValue.end) {
      return "definite"
    }

    if (start.astro <= windowValue.end && end.astro >= windowValue.start) {
      return "possible"
    }

    return "outside"
  }

  if (normalized.bounds === "lower_only") {
    return (normalized.start as NormalizedEndpoint).astro <= windowValue.end
      ? "possible"
      : "outside"
  }

  if (normalized.bounds === "upper_only") {
    return (normalized.end as NormalizedEndpoint).astro >= windowValue.start
      ? "possible"
      : "outside"
  }

  throw new Error(`a normalized interval cannot have bounds ${String(normalized.bounds)}`)
}

/**
 * Playback state at a playhead position.
 *
 * A duration is `active` while the playhead is inside its support. An uncertain
 * occurrence is only ever `possible`: it must not be animated as continuous
 * activity, and no midpoint playhead is derived for it. `inactive` is the
 * contextual state for a record that stays visible in the window but is not
 * supported at the playhead.
 */
export function playbackState(time: unknown, playhead: unknown): Result<PlaybackState> {
  const normalized = normalize(time)

  if (!normalized.ok) {
    return normalized
  }

  const position = playheadPosition(playhead)

  if (!position.ok) {
    return position
  }

  return ok(playback(normalized.value, position.value))
}

function playheadPosition(playhead: unknown): Result<number> {
  if (isObject(playhead) && isInteger(playhead["year"])) {
    const year = playhead["year"]
    const era = playhead["era"]

    if (year < 1) {
      return err(["playhead_year_must_be_positive"])
    }

    if (!(isString(era) && ERA_BOUNDARY_CODES.includes(era))) {
      return err(["playhead_must_be_era_year"])
    }

    return ok(astro({ year, era }))
  }

  return err(["playhead_must_be_era_year"])
}

function playback(normalized: NormalizedTime, position: number): PlaybackState {
  if (normalized.mode === "undated") {
    return "undated"
  }

  if (normalized.mode === "instant") {
    return activeIf(position === (normalized.start as NormalizedEndpoint).astro)
  }

  if (normalized.mode === "duration") {
    return activeIf(within(normalized, position))
  }

  return within(normalized, position) ? "possible" : "inactive"
}

function activeIf(condition: boolean): PlaybackState {
  return condition ? "active" : "inactive"
}

function within(normalized: NormalizedTime, position: number): boolean {
  if (normalized.bounds === "two_sided") {
    const start = normalized.start as NormalizedEndpoint
    const end = normalized.end as NormalizedEndpoint

    return start.astro <= position && position <= end.astro
  }

  if (normalized.bounds === "lower_only") {
    return position >= (normalized.start as NormalizedEndpoint).astro
  }

  if (normalized.bounds === "upper_only") {
    return position <= (normalized.end as NormalizedEndpoint).astro
  }

  throw new Error(`a normalized interval cannot have bounds ${String(normalized.bounds)}`)
}

/** True when continuous activity is supported. Never true for an occurrence window. */
export function continuousActivity(time: unknown): Result<boolean> {
  const normalized = normalize(time)

  return normalized.ok ? ok(normalized.value.continuous) : normalized
}

/** True when a record may appear in chronological stepping. Undated records are excluded. */
export function steppable(time: unknown): Result<boolean> {
  const normalized = normalize(time)

  return normalized.ok ? ok(normalized.value.mode !== "undated") : normalized
}

/**
 * Partial ordering between two records.
 *
 * `before` and `after` require the evidence to establish the order, so they are
 * never derived from overlapping or open-ended supports. `overlaps` reports
 * intersecting supports whose order is not established; `undetermined` reports
 * that the evidence does not order the two at all. `same` reports identical
 * supports. Consumers must not present `overlaps` or `undetermined` as
 * established historical order.
 *
 * Ordering is compared at year granularity: two records whose supports share a
 * year are never ordered, even when their day-precision dates differ. The
 * comparison reports a `year_granularity_comparison` caveat instead of implying
 * day-level ordering.
 */
export function relation(
  a: unknown,
  b: unknown,
): Result<{ relation: OrderingRelation; caveats: string[] }> {
  const normalizedA = normalize(a)

  if (!normalizedA.ok) {
    return normalizedA
  }

  const normalizedB = normalize(b)

  if (!normalizedB.ok) {
    return normalizedB
  }

  return ok({
    relation: relationOf(normalizedA.value, normalizedB.value),
    caveats: relationCaveats(normalizedA.value, normalizedB.value),
  })
}

function relationOf(a: NormalizedTime, b: NormalizedTime): OrderingRelation {
  if (a.mode === "undated" || b.mode === "undated") {
    return "undetermined"
  }

  if (sameSupport(a, b)) {
    return "same"
  }

  if (mustPrecede(a, b)) {
    return "before"
  }

  if (mustPrecede(b, a)) {
    return "after"
  }

  if (canOverlap(a, b)) {
    return "overlaps"
  }

  return "undetermined"
}

/**
 * Checks a declared ordering relation against the intervals.
 *
 * A declared `before`/`after`/`concurrent` is only consistent when the supports
 * actually establish it; an editor cannot declare an order the evidence does not
 * support. `undetermined` is always consistent.
 */
export function orderingConsistent(a: unknown, b: unknown, declared: unknown): Result<null> {
  const normalizedA = normalize(a)

  if (!normalizedA.ok) {
    return normalizedA
  }

  const normalizedB = normalize(b)

  if (!normalizedB.ok) {
    return normalizedB
  }

  return checkDeclaredOrder(normalizedA.value, normalizedB.value, declared)
}

function checkDeclaredOrder(a: NormalizedTime, b: NormalizedTime, declared: unknown): Result<null> {
  if (declared === "undetermined") {
    return ok(null)
  }

  if (a.mode === "undated" || b.mode === "undated") {
    return err(["order_with_undated_record"])
  }

  if (declared === "before") {
    return mustPrecede(a, b) ? ok(null) : err(["declared_order_not_supported"])
  }

  if (declared === "after") {
    return mustPrecede(b, a) ? ok(null) : err(["declared_order_not_supported"])
  }

  if (declared === "concurrent") {
    return canOverlap(a, b) ? ok(null) : err(["declared_order_not_supported"])
  }

  return err(["unknown_ordering_relation"])
}

/** Sort key for chronological stepping. Undated records have no key. */
export function chronologicalKey(time: unknown): Result<[number, number | null] | null> {
  const normalized = normalize(time)

  if (!normalized.ok) {
    return normalized
  }

  if (normalized.value.mode === "undated") {
    return ok(null)
  }

  if (normalized.value.start === null) {
    throw new Error("chronological_key requires a support interval with a start endpoint")
  }

  return ok([
    normalized.value.start.astro,
    normalized.value.end === null ? null : normalized.value.end.astro,
  ])
}

/** Returns one ordering cycle over `before`/`after` edges, or null when the graph is acyclic. */
export function cycle(edges: unknown): string[] | null {
  const graph = new Map<string, string[]>()

  for (const edge of listOf(edges)) {
    if (!isObject(edge)) {
      continue
    }

    const from = edge["from"]
    const to = edge["to"]
    const relation = edge["relation"]

    if (!isString(from) || !isString(to)) {
      continue
    }

    if (relation === "before") {
      push(graph, from, to)
    } else if (relation === "after") {
      push(graph, to, from)
    }
  }

  return findCycle(graph)
}

function push(graph: Map<string, string[]>, from: string, to: string): void {
  graph.set(from, [to, ...(graph.get(from) ?? [])])
}

type Visit = { kind: "ok"; visited: Set<string> } | { kind: "cycle"; path: string[] }

function findCycle(graph: Map<string, string[]>): string[] | null {
  let visited = new Set<string>()

  for (const node of [...graph.keys()].sort(compareBytes)) {
    const result = visit(node, graph, visited, new Set(), [])

    if (result.kind === "cycle") {
      return result.path
    }

    visited = result.visited
  }

  return null
}

function visit(
  node: string,
  graph: Map<string, string[]>,
  visited: Set<string>,
  stack: Set<string>,
  path: string[],
): Visit {
  if (visited.has(node)) {
    return { kind: "ok", visited }
  }

  if (stack.has(node)) {
    return { kind: "cycle", path: [...[node, ...path]].reverse() }
  }

  return descend(node, graph, visited, new Set([...stack, node]), [node, ...path])
}

function descend(
  node: string,
  graph: Map<string, string[]>,
  visited: Set<string>,
  stack: Set<string>,
  path: string[],
): Visit {
  let current = visited

  for (const neighbour of graph.get(node) ?? []) {
    const result = visit(neighbour, graph, current, stack, path)

    if (result.kind === "cycle") {
      return result
    }

    current = result.visited
  }

  return { kind: "ok", visited: new Set([...current, node]) }
}

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))
}

// Ordering is compared at year granularity in v0, so month and day never
// establish an order between two records: two day-precision records inside the
// same year stay unordered even when their dates differ. A single interval's own
// endpoints are still checked at day precision (see orderErrors), which is
// internal consistency rather than a cross-record ordering claim.
function mustPrecede(a: NormalizedTime, b: NormalizedTime): boolean {
  return a.end !== null && b.start !== null && a.end.astro < b.start.astro
}

function canOverlap(a: NormalizedTime, b: NormalizedTime): boolean {
  return (
    (a.start === null || b.end === null || a.start.astro <= b.end.astro) &&
    (b.start === null || a.end === null || b.start.astro <= a.end.astro)
  )
}

function sameSupport(a: NormalizedTime, b: NormalizedTime): boolean {
  return (
    a.mode === b.mode &&
    a.bounds === b.bounds &&
    a.calendar === b.calendar &&
    sameEndpoint(a.start, b.start) &&
    sameEndpoint(a.end, b.end)
  )
}

function sameEndpoint(a: NormalizedEndpoint | null, b: NormalizedEndpoint | null): boolean {
  if (a === null || b === null) {
    return a === b
  }

  return a.astro === b.astro && a.month === b.month && a.day === b.day
}

function caveatsOf(normalized: NormalizedTime, opts: { calendar?: string }): string[] {
  if (normalized.mode === "undated") {
    return []
  }

  const displayCalendar = opts.calendar ?? "gregorian"
  const result: string[] = []

  add(result, normalized.calendar !== displayCalendar, "cross_calendar_approximation")
  add(
    result,
    normalized.precision === "day" || normalized.precision === "month",
    "year_granularity_comparison",
  )

  return result
}

function relationCaveats(a: NormalizedTime, b: NormalizedTime): string[] {
  const result: string[] = []

  add(result, a.mode === "undated" || b.mode === "undated", "undated_record")
  add(result, crossCalendar(a, b), "cross_calendar_approximation")
  add(
    result,
    a.precision === "day" ||
      a.precision === "month" ||
      b.precision === "day" ||
      b.precision === "month",
    "year_granularity_comparison",
  )

  return result
}

function crossCalendar(a: NormalizedTime, b: NormalizedTime): boolean {
  if (a.mode === "undated" || b.mode === "undated") {
    return false
  }

  return a.calendar !== b.calendar
}

function boundsMismatch(bounds: unknown, startEndpoint: unknown, endEndpoint: unknown): boolean {
  if (bounds === "two_sided") {
    return isNil(startEndpoint) || isNil(endEndpoint)
  }

  if (bounds === "lower_only") {
    return isNil(startEndpoint) || !isNil(endEndpoint)
  }

  if (bounds === "upper_only") {
    return isNil(endEndpoint) || !isNil(startEndpoint)
  }

  return false
}

function endpointErrors(endpoint: unknown, precision: unknown): string[] {
  if (endpoint === null || endpoint === undefined) {
    return []
  }

  if (!isObject(endpoint)) {
    return ["endpoint_must_be_era_year"]
  }

  const year = endpoint["year"]
  const era = endpoint["era"]
  const month = endpoint["month"]
  const day = endpoint["day"]
  const errors: string[] = []

  add(errors, !isInteger(year), "year_must_be_integer")
  add(errors, isInteger(year) && year === 0, "civil_year_zero")
  add(errors, isInteger(year) && year < 0, "year_must_be_positive")
  add(errors, !(isString(era) && ERA_BOUNDARY_CODES.includes(era)), "era_must_be_bce_or_ce")
  add(errors, isInteger(month) && (month < 1 || month > 12), "month_out_of_range")
  add(errors, isInteger(day) && (day < 1 || day > 31), "day_out_of_range")
  errors.push(...precisionErrors(precision, month, day))

  return errors
}

function precisionErrors(precision: unknown, month: unknown, day: unknown): string[] {
  const errors: string[] = []

  if (precision === "day") {
    add(errors, !isInteger(month), "day_precision_requires_month_and_day")
    add(errors, !isInteger(day), "day_precision_requires_month_and_day")

    return errors
  }

  if (precision === "month") {
    add(errors, !isInteger(month), "month_precision_requires_month")
    add(errors, isInteger(day), "month_precision_forbids_day")

    return errors
  }

  add(errors, !isNil(month) || !isNil(day), "year_precision_has_month_or_day")

  return errors
}

function alignmentErrors(interval: JsonObject, precision: unknown): string[] {
  if (precision === "decade") {
    return spanErrors(interval, 10, 0, "decade_span_mismatch")
  }

  if (precision === "century") {
    return spanErrors(interval, 100, 1, "century_span_mismatch")
  }

  return []
}

function spanErrors(interval: JsonObject, span: number, residue: number, code: string): string[] {
  const endpoints = spanEndpoints(interval)

  if (endpoints === null) {
    return []
  }

  const [startEndpoint, endEndpoint] = endpoints
  const eras = spanEras(startEndpoint, endEndpoint)

  if (eras === "same_era") {
    return alignedSpanErrors(startEndpoint, endEndpoint, span, residue, code)
  }

  if (eras === "different_era") {
    return [code]
  }

  return []
}

function spanEndpoints(interval: JsonObject): [JsonObject, JsonObject] | null {
  const startEndpoint = interval["start"]
  const endEndpoint = interval["end"]

  if (
    isObject(startEndpoint) &&
    isObject(endEndpoint) &&
    isInteger(startEndpoint["year"]) &&
    isInteger(endEndpoint["year"])
  ) {
    return [startEndpoint, endEndpoint]
  }

  return null
}

function spanEras(
  startEndpoint: JsonObject,
  endEndpoint: JsonObject,
): "same_era" | "different_era" | "unknown" {
  const startEra = startEndpoint["era"]
  const endEra = endEndpoint["era"]

  if (!(isString(startEra) && ERA_BOUNDARY_CODES.includes(startEra))) {
    return "unknown"
  }

  if (!(isString(endEra) && ERA_BOUNDARY_CODES.includes(endEra))) {
    return "unknown"
  }

  return startEra === endEra ? "same_era" : "different_era"
}

function alignedSpanErrors(
  startEndpoint: JsonObject,
  endEndpoint: JsonObject,
  span: number,
  residue: number,
  code: string,
): string[] {
  const [anchor, other] =
    startEndpoint["era"] === "ce" ? [startEndpoint, endEndpoint] : [endEndpoint, startEndpoint]
  const anchorYear = anchor["year"] as number
  const otherYear = other["year"] as number

  return anchorYear % span === residue && otherYear === anchorYear + span - 1 ? [] : [code]
}

function orderErrors(interval: JsonObject, bounds: unknown): string[] {
  if (bounds !== "two_sided" || !("start" in interval) || !("end" in interval)) {
    return []
  }

  const startOrdinal = rawOrdinal(interval["start"])
  const endOrdinal = rawOrdinal(interval["end"])

  if (startOrdinal === null || endOrdinal === null) {
    return []
  }

  return compareOrdinals(startOrdinal, endOrdinal) > 0 ? ["interval_start_after_end"] : []
}

// Raw era years arrive from a source document, so the ordering check reads object
// keys and skips endpoints that endpointErrors already rejected.
function rawOrdinal(endpoint: unknown): [number, number, number] | null {
  if (
    isObject(endpoint) &&
    isInteger(endpoint["year"]) &&
    isString(endpoint["era"]) &&
    ERA_BOUNDARY_CODES.includes(endpoint["era"])
  ) {
    const month = isInteger(endpoint["month"]) ? endpoint["month"] : 0
    const day = isInteger(endpoint["day"]) ? endpoint["day"] : 0

    return [astro(endpoint), month, day]
  }

  return null
}

function compareOrdinals(a: [number, number, number], b: [number, number, number]): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index]
    }
  }

  return 0
}

function instantErrors(
  mode: unknown,
  bounds: unknown,
  startEndpoint: unknown,
  endEndpoint: unknown,
): string[] {
  if (mode === "instant" && bounds === "two_sided") {
    return ordinalsEqual(rawOrdinal(startEndpoint), rawOrdinal(endEndpoint))
      ? []
      : ["instant_start_end_mismatch"]
  }

  if (mode === "instant") {
    return ["instant_requires_two_sided"]
  }

  return []
}

function ordinalsEqual(
  a: [number, number, number] | null,
  b: [number, number, number] | null,
): boolean {
  if (a === null || b === null) {
    return a === b
  }

  return compareOrdinals(a, b) === 0
}

function build(time: JsonObject, interval: JsonObject): NormalizedTime {
  return {
    mode: time["mode"] as TimeMode,
    calendar: stringOrNull(time["calendar"]),
    precision: stringOrNull(time["precision"]),
    bounds: interval["bounds"] as Bounds,
    start: endpoint(interval["start"]),
    end: endpoint(interval["end"]),
    continuous: time["mode"] === "duration",
    sourceExpression: stringOrNull(time["source_expression"]),
  }
}

function endpoint(value: unknown): NormalizedEndpoint | null {
  if (!isObject(value)) {
    return null
  }

  return {
    astro: astro(value),
    year: value["year"] as number,
    era: value["era"] as string,
    month: isInteger(value["month"]) ? value["month"] : null,
    day: isInteger(value["day"]) ? value["day"] : null,
    certainty: stringOrNull(value["endpoint_certainty"]),
  }
}

function undated(sourceExpression: string | null): NormalizedTime {
  return {
    mode: "undated",
    calendar: null,
    precision: null,
    bounds: null,
    start: null,
    end: null,
    continuous: false,
    sourceExpression,
  }
}

function add(errors: string[], condition: boolean, code: string): void {
  if (condition) {
    errors.push(code)
  }
}

function isNil(value: unknown): boolean {
  return value === null || value === undefined
}

function stringOrNull(value: unknown): string | null {
  return isString(value) ? value : null
}
