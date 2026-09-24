import { describe, expect, it } from "vitest"
import type { EventPlacement, Occurrence } from "./domain"
import { occurrenceLabel, placementLabel, reviewLabel, unplacedNote } from "./labels"

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
    expect(occurrenceLabel(occurrence(753, 754, "year", "occurrence_window"))).toBe(
      "753–754 · year precision",
    )
    expect(occurrenceLabel(occurrence(753, 753, "year", "instant"))).toBe("753")
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
