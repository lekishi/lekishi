import type { HistoricalEvent, Occurrence, TimeWindow } from "./domain"

/**
 * Renderer-independent time filtering.
 *
 * RFD 2 owns the durable calendar/precision contract; until it lands, every
 * comparison below works on inclusive integer year bounds so a bounded but
 * uncertain occurrence can never be treated as an exact date.
 */

/** How an occurrence relates to the selected window. */
export type OccurrenceRelation =
  /** The whole supported span lies inside the window. */
  | "definite"
  /** Part of the supported span lies inside the window: a possible match. */
  | "possible"
  /** The span does not touch the window. */
  | "outside"

/**
 * How the playhead relates to an occurrence. `possible` is an uncertain
 * occurrence window the playhead falls inside; it is never continuous activity.
 */
export type PlaybackState = "active" | "possible" | "inactive"

export function overlapsWindow(occurrence: Occurrence, window: TimeWindow): boolean {
  return occurrence.startYear <= window.end && occurrence.endYear >= window.start
}

export function relationToWindow(occurrence: Occurrence, window: TimeWindow): OccurrenceRelation {
  if (occurrence.startYear >= window.start && occurrence.endYear <= window.end) {
    return "definite"
  }

  return overlapsWindow(occurrence, window) ? "possible" : "outside"
}

/** True when the playhead sits inside the supported occurrence span. */
export function occursAtPlayhead(occurrence: Occurrence, playhead: number): boolean {
  return playhead >= occurrence.startYear && playhead <= occurrence.endYear
}

/**
 * How the playhead relates to an occurrence, mirroring the contract's
 * `playbackState` at year granularity.
 *
 * A duration is `active` while the playhead is inside its support, an instant is
 * active on its own year, and an uncertain occurrence window is only ever
 * `possible`: it is one occurrence at an unknown point inside the span, so the
 * atlas must not animate it as continuous activity. `inactive` is the contextual
 * state for an event that stays visible in the window but is not supported at the
 * playhead.
 */
export function playbackStateAt(occurrence: Occurrence, playhead: number): PlaybackState {
  const inside = occursAtPlayhead(occurrence, playhead)

  if (occurrence.mode === "occurrence_window") {
    return inside ? "possible" : "inactive"
  }

  return inside ? "active" : "inactive"
}

export function clampToWindow(year: number, window: TimeWindow): number {
  return Math.min(Math.max(year, window.start), window.end)
}

/** Events whose supported span overlaps the window, in chronological order. */
export function eventsInWindow(
  events: readonly HistoricalEvent[],
  window: TimeWindow,
): readonly HistoricalEvent[] {
  return events
    .filter((event) => overlapsWindow(event.occurrence, window))
    .slice()
    .sort((a, b) => a.occurrence.startYear - b.occurrence.startYear || a.id.localeCompare(b.id))
}

/**
 * The next (or previous) event boundary after the playhead, used for
 * chronological stepping. Returns `null` at the ends of the window.
 */
export function stepToEventBoundary(
  events: readonly HistoricalEvent[],
  window: TimeWindow,
  playhead: number,
  direction: 1 | -1,
): number | null {
  const candidates = eventsInWindow(events, window)
    .flatMap((event) => [event.occurrence.startYear, event.occurrence.endYear])
    .filter((year) => (direction === 1 ? year > playhead : year < playhead))
    .sort((a, b) => (direction === 1 ? a - b : b - a))

  return candidates[0] ?? null
}
