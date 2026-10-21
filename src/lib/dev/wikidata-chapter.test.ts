import { describe, expect, it } from "vitest"
import snapshot from "./wikidata-ancient.json"
import {
  occurrenceOf,
  wikidataChapter,
  type WikidataItem,
  type WikidataSnapshot,
} from "./wikidata-chapter"

const item = (overrides: Partial<WikidataItem>): WikidataItem => ({
  id: "Q1",
  label: "Sample",
  start: -217,
  startPrecision: "year",
  end: null,
  endPrecision: null,
  lon: 10,
  lat: 45,
  classes: [],
  ...overrides,
})

describe("occurrenceOf", () => {
  it("keeps a year as an instant in the astronomical ordinal Wikidata prints", () => {
    // Wikidata's -0217 is 218 BCE, which is the atlas's own -217.
    expect(occurrenceOf(item({}))).toMatchObject({
      startYear: -217,
      endYear: -217,
      mode: "instant",
    })
  })

  it("turns a coarse date into one occurrence inside its span, not a duration", () => {
    expect(occurrenceOf(item({ startPrecision: "century" }))).toMatchObject({
      startYear: -217,
      endYear: -118,
      precision: "century",
      mode: "occurrence_window",
    })
    expect(occurrenceOf(item({ startPrecision: "millennium" }))).toMatchObject({
      endYear: 782,
      precision: "century",
    })
  })

  it("reads a start and end time as a duration", () => {
    expect(occurrenceOf(item({ end: -201, endPrecision: "year" }))).toMatchObject({
      startYear: -217,
      endYear: -201,
      mode: "duration",
    })
  })
})

describe("wikidataChapter", () => {
  const chapter = wikidataChapter(snapshot as WikidataSnapshot)

  it("projects every item as an event on a place that exists", () => {
    const places = new Set(chapter.places.map((place) => place.id))
    expect(chapter.events).toHaveLength(snapshot.items.length)
    for (const event of chapter.events) {
      expect(event.placement.kind).toBe("point")
      expect(places.has(event.placeIds[0])).toBe(true)
    }
  })

  it("merges items on the same coordinate into one place", () => {
    expect(chapter.places.length).toBeLessThan(chapter.events.length)
    expect(new Set(chapter.places.map((place) => place.id)).size).toBe(chapter.places.length)
  })

  it("keeps only dates before 100 CE and no eclipses", () => {
    for (const event of chapter.events) {
      expect(event.occurrence.startYear).toBeLessThan(101)
      expect(event.title.toLowerCase()).not.toContain("eclipse")
    }
  })
})
