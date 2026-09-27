import type { EventPlacement, Occurrence } from "./domain"
import type { PlaybackState } from "./time"

/**
 * Display text for the atlas surfaces.
 *
 * The wording keeps the contract's own distinctions visible instead of smoothing
 * them away: precision is stated rather than rounded, a bounded occurrence keeps
 * its span, and a display anchor is never described as an asserted location. The
 * chapter's place names are the published primary name forms, so they stay in
 * their own script.
 */

/**
 * The atlas's own year text.
 *
 * The domain carries astronomical ordinals (1 BCE is 0, 233 BCE is -232), which
 * are the right numbers to compute with and the wrong ones to show. A year at or
 * before 1 BCE is printed as a BCE year, and a CE year is printed as the number
 * alone, exactly as before, so the Tang chapter's labels do not change.
 */
export function yearLabel(year: number): string {
  return year > 0 ? `${year}` : `${1 - year} BCE`
}

/** An inclusive year window, with both ends in the atlas's own year text. */
export function windowLabel(window: { readonly start: number; readonly end: number }): string {
  return window.start === window.end
    ? yearLabel(window.start)
    : `${yearLabel(window.start)}–${yearLabel(window.end)}`
}

/** The occurrence as the list and the details surface state it. */
export function occurrenceLabel(occurrence: Occurrence): string {
  const span =
    occurrence.startYear === occurrence.endYear
      ? `${yearLabel(occurrence.startYear)}`
      : `${yearLabel(occurrence.startYear)}–${yearLabel(occurrence.endYear)}`
  const stated =
    occurrence.precision === "year" && occurrence.mode === "instant"
      ? span
      : `${span} · ${occurrence.precision} precision`

  // The mode is not decoration: an occurrence window is one occurrence at an
  // unknown point inside the span, and a duration is supported activity. Saying
  // which one it is keeps the two from reading alike.
  if (occurrence.mode === "occurrence_window") {
    return `${stated} · uncertain span`
  }

  return occurrence.mode === "duration" ? `${stated} · duration` : stated
}

/** The playhead badge text, or null when the event is not supported at the playhead. */
export function playbackLabel(playback: PlaybackState): string | null {
  if (playback === "active") {
    return "at playhead"
  }

  return playback === "possible" ? "possible at playhead" : null
}

/**
 * What the occurrence's mode means, for the details surface. An uncertain
 * occurrence window must not be read as activity across the whole span.
 */
export function occurrenceModeNote(occurrence: Occurrence): string | null {
  if (occurrence.mode === "occurrence_window") {
    return "One occurrence somewhere inside this span; the atlas does not treat the span as continuous activity."
  }

  if (occurrence.mode === "duration") {
    return "Activity supported across this span, not a single dated moment."
  }

  return null
}

/** The event's place, or the place the record names without placing the event. */
export function placementLabel(placement: EventPlacement): string {
  if (placement.kind === "none") {
    if (placement.reason === "no-place" || placement.label === null) {
      return "No place named"
    }

    return placement.reason === "no-position"
      ? `${placement.label} · no sourced position`
      : `${placement.label} · named as context only`
  }

  return placement.basis === "approximate"
    ? `${placement.label} · approximate location (${placement.precision})`
    : `${placement.label} · display anchor only`
}

/**
 * Why an event is not on the map, or null when it is. This is the sentence that
 * has to be true for every unplaced event: no coordinate was invented for it.
 */
export function unplacedNote(placement: EventPlacement): string | null {
  if (placement.kind === "point") {
    return null
  }

  if (placement.reason === "no-place") {
    return "The chapter's record names no place for this event, so the atlas claims no position for it."
  }

  if (placement.reason === "no-position") {
    return `${placement.label} is named, but no identification is sourced for it, so the atlas claims no position for it.`
  }

  return `${placement.label} is named only as context — the record does not place the event there — so no position is claimed.`
}

/** The review status a publication set recorded, in the atlas's own words. */
export function reviewLabel(independence: string, reviewer: string): string {
  const author = reviewer === "" ? "the preparing editor" : reviewer

  if (independence === "self_review") {
    return `Self-reviewed by ${author}: not owner review, not independent review, not specialist review.`
  }

  if (independence === "independent_review") {
    return `Independent review recorded by ${author}.`
  }

  if (independence === "specialist_review") {
    return `Specialist review recorded by ${author}.`
  }

  return `Review independence recorded as ${independence || "unknown"}.`
}

/** The same status as one short line, for the map notice where space is scarce. */
export function reviewSummaryLabel(independence: string): string {
  if (independence === "self_review") {
    return "Self-review only"
  }

  if (independence === "independent_review") {
    return "Independent review recorded"
  }

  if (independence === "specialist_review") {
    return "Specialist review recorded"
  }

  return `Review: ${independence || "unknown"}`
}
