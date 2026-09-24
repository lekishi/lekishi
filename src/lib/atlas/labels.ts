import type { EventPlacement, Occurrence } from "./domain"

/**
 * Display text for the atlas surfaces.
 *
 * The wording keeps the contract's own distinctions visible instead of smoothing
 * them away: precision is stated rather than rounded, a bounded occurrence keeps
 * its span, and a display anchor is never described as an asserted location. The
 * chapter's place names are the published primary name forms, so they stay in
 * their own script.
 */

/** The occurrence as the list and the details surface state it. */
export function occurrenceLabel(occurrence: Occurrence): string {
  const span =
    occurrence.startYear === occurrence.endYear
      ? `${occurrence.startYear}`
      : `${occurrence.startYear}–${occurrence.endYear}`

  return occurrence.precision === "year" && occurrence.mode === "instant"
    ? span
    : `${span} · ${occurrence.precision} precision`
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
    return "The published record names no place for this event, so the atlas claims no position for it."
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
