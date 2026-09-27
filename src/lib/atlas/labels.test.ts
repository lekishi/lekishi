import { describe, expect, it } from "vitest"
import type { EventPlacement, Occurrence } from "./domain"
import {
  occurrenceLabel,
  occurrenceModeNote,
  playbackLabel,
  placementLabel,
  reviewLabel,
  unplacedNote,
  windowLabel,
  yearLabel,
} from "./labels"

/**
 * Display text is where historical semantics become visible or disappear. These
 * cases pin the wording the atlas must not soften: a display anchor is never an
 * asserted location, an uncertain occurrence keeps its span and its precision,
 * and an event with no published position says why instead of reading as placed.
 */

function occurrence(
  startYear: number,
  endYear: number,
  precision: Occurrence["precision"],
  mode: Occurrence["mode"],
): Occurrence {
  return { startYear, endYear, precision, mode, sourceExpression: null }
}

const placed = (basis: "approximate" | "display-anchor"): EventPlacement => ({
  kind: "point",
  placeId: "lks:place:test",
  label: "大宰府",
  basis,
  precision: basis === "approximate" ? "region" : "unspecified",
  position: { lon: 130.5, lat: 33.5 },
})

describe("placementLabel", () => {
  it("never presents a display anchor as an asserted location", () => {
    expect(placementLabel(placed("display-anchor"))).toBe("大宰府 · display anchor only")
  })

  it("states the precision of an approximate placement", () => {
    expect(placementLabel(placed("approximate"))).toBe("大宰府 · approximate location (region)")
  })

  it("says why an event is not on the map instead of naming a place as if it were", () => {
    expect(placementLabel({ kind: "none", placeId: null, label: null, reason: "no-place" })).toBe(
      "No place named",
    )
    expect(
      placementLabel({
        kind: "none",
        placeId: "lks:place:huanzhou",
        label: "驩州",
        reason: "no-position",
      }),
    ).toBe("驩州 · no sourced position")
    expect(
      placementLabel({
        kind: "none",
        placeId: "lks:place:tane",
        label: "多禰島",
        reason: "context-only",
      }),
    ).toBe("多禰島 · named as context only")
  })
})

describe("unplacedNote", () => {
  it("explains each unplaced case and stays silent for a placed event", () => {
    expect(unplacedNote(placed("approximate"))).toBeNull()
    expect(
      unplacedNote({ kind: "none", placeId: null, label: null, reason: "no-place" }),
    ).toContain("names no place")
    expect(
      unplacedNote({
        kind: "none",
        placeId: "lks:place:huanzhou",
        label: "驩州",
        reason: "no-position",
      }),
    ).toContain("no identification is sourced")
    expect(
      unplacedNote({
        kind: "none",
        placeId: "lks:place:tane",
        label: "多禰島",
        reason: "context-only",
      }),
    ).toContain("named only as context")
  })
})

describe("occurrenceLabel", () => {
  it("keeps the span and states the precision instead of rounding it away", () => {
    expect(occurrenceLabel(occurrence(753, 753, "day", "instant"))).toBe("753 · day precision")
    expect(occurrenceLabel(occurrence(750, 750, "month", "instant"))).toBe("750 · month precision")
    expect(occurrenceLabel(occurrence(753, 753, "year", "instant"))).toBe("753")
  })

  it("distinguishes a duration from an uncertain occurrence window", () => {
    expect(occurrenceLabel(occurrence(753, 754, "year", "occurrence_window"))).toBe(
      "753–754 · year precision · uncertain span",
    )
    expect(occurrenceLabel(occurrence(753, 754, "day", "duration"))).toBe(
      "753–754 · day precision · duration",
    )
  })
})

describe("playbackLabel and occurrenceModeNote", () => {
  it("labels the playhead relation without implying certainty", () => {
    expect(playbackLabel("active")).toBe("at playhead")
    expect(playbackLabel("possible")).toBe("possible at playhead")
    expect(playbackLabel("inactive")).toBeNull()
  })

  it("explains what the mode means", () => {
    expect(occurrenceModeNote(occurrence(753, 754, "year", "occurrence_window"))).toContain(
      "does not treat the span as continuous activity",
    )
    expect(occurrenceModeNote(occurrence(753, 754, "day", "duration"))).toContain(
      "Activity supported across this span",
    )
    expect(occurrenceModeNote(occurrence(753, 753, "day", "instant"))).toBeNull()
  })
})

describe("reviewLabel", () => {
  it("states that self-review is not owner, independent, or specialist review", () => {
    expect(reviewLabel("self_review", "Lekishi editorial preparation")).toBe(
      "Self-reviewed by Lekishi editorial preparation: not owner review, not independent review, not specialist review.",
    )
    expect(reviewLabel("independent_review", "A reviewer")).toBe(
      "Independent review recorded by A reviewer.",
    )
  })
})

describe("the atlas's year text", () => {
  it("prints BCE years as BCE years and CE years as the plain number", () => {
    expect(yearLabel(-232)).toBe("233 BCE")
    expect(yearLabel(0)).toBe("1 BCE")
    expect(yearLabel(-1)).toBe("2 BCE")
    expect(yearLabel(750)).toBe("750")
    expect(windowLabel({ start: -232, end: -225 })).toBe("233 BCE–226 BCE")
    expect(windowLabel({ start: 750, end: 754 })).toBe("750–754")
    expect(windowLabel({ start: 750, end: 750 })).toBe("750")
  })

  it("uses the BCE year in an occurrence and leaves a CE occurrence unchanged", () => {
    expect(
      occurrenceLabel({
        startYear: -232,
        endYear: -232,
        precision: "year",
        mode: "occurrence_window",
        sourceExpression: "十四年（史記・秦始皇本紀）",
      }),
    ).toBe("233 BCE · year precision · uncertain span")

    expect(
      occurrenceLabel({
        startYear: 750,
        endYear: 750,
        precision: "year",
        mode: "instant",
        sourceExpression: null,
      }),
    ).toBe("750")
  })
})
