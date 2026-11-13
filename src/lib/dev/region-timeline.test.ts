import { describe, expect, it } from "vitest"
import { yearLabel } from "$lib/atlas/labels"
import {
  axisTicks,
  busiestYear,
  fitView,
  matches,
  nearestEdges,
  pack,
  threadsOf,
  viewAt,
  type ChapterReach,
  type TimelineChapter,
} from "./region-timeline"

const chapter = (id: string, start: number, end: number): TimelineChapter => ({
  id,
  title: id,
  window: { start, end },
  region: "mediterranean",
  events: 1,
  places: 1,
  steps: 1,
  names: [],
})

const reach = (id: string, places: string[], actors: string[] = []): ChapterReach => ({
  chapter: chapter(id, 0, 1),
  places: new Map(places.map((p) => [p, p.toUpperCase()])),
  actors: new Map(actors.map((a) => [a, a.toUpperCase()])),
})

describe("the regions-in-time model", () => {
  it("packs a span into the first sub-row it clears, not always a new one", () => {
    // The third span clears the first by 10 but not the second, so it reuses
    // sub-row 0; the fourth touches both and opens sub-row 2.
    expect(
      pack([
        { left: 0, right: 100 },
        { left: 50, right: 200 },
        { left: 110, right: 150 },
        { left: 155, right: 300 },
      ]),
    ).toEqual([0, 1, 0, 2])
  })

  it("threads chapters by a shared place or person only, naming what they share", () => {
    const threads = threadsOf([
      reach("a", ["sardis", "susa"]),
      reach("b", ["susa"], ["darius"]),
      reach("c", ["rome"], ["darius"]),
    ])

    expect(threads).toEqual([
      { a: "a", b: "b", places: ["SUSA"], actors: [] },
      { a: "b", b: "c", places: [], actors: ["DARIUS"] },
    ])
  })

  it("opens on the latest of the busiest years, with windows inclusive at both ends", () => {
    const chapters = [chapter("a", -10, 0), chapter("b", 0, 5), chapter("c", 5, 8)]
    // Years 0 and 5 each hold two chapters; 5 is the later.
    expect(busiestYear(chapters, -20, 20)).toBe(5)
  })

  it("steps to the nearest start or end, clamping a start before the drawn range", () => {
    const chapters = [chapter("deep", -21050, 100), chapter("b", 300, 320)]
    const range = { start: -2400, end: 820 }

    expect(nearestEdges(chapters, 200, range)).toEqual({ before: 100, after: 300 })
    expect(nearestEdges(chapters, -2400, range)).toEqual({ before: null, after: 100 })
  })

  it("reads a year in a search as the chapters alive then, BCE included", () => {
    // 480 BCE is -479: a text match on "480" would miss the window's own label.
    const xerxes = chapter("xerxes", -482, -478)
    expect(matches(xerxes, "480 BCE", [])).toBe(true)
    expect(matches(xerxes, "480", [])).toBe(false)
    expect(matches({ ...xerxes, names: ["Σάρδεις"] }, "σάρδ", [])).toBe(true)
  })

  it("labels each tick as the guide labels the same point, with no year 0", () => {
    const ticks = axisTicks({ start: -400, end: 300, pxPerYear: 0.3, labelW: 0 }, yearLabel)

    // At 0.3 px a year the ticks are 250 years apart: 250 BCE is -249, then 1 CE.
    expect(ticks.map(({ year, label }) => [year, label])).toEqual([
      [-249, "250 BCE"],
      [1, "1 CE"],
      [250, "250"],
    ])
    expect(ticks.every(({ year, label }) => year === 1 || label === yearLabel(year))).toBe(true)
  })

  it("reopens a saved view as itself, including one that ends at the drawn range's end", () => {
    const range = { start: -2400, end: 1002 }
    for (const [from, to, labelW, width] of [
      [600, 820, 220, 1440],
      [-800, -180, 8, 390],
      [-2400, 1002, 220, 1440],
    ]) {
      const fitted = fitView(range, labelW, width, from, to)
      const scale = { ...range, pxPerYear: fitted.pxPerYear, labelW }

      expect(viewAt(scale, fitted.scrollLeft, width)).toEqual({ start: from, end: to })
    }
  })
})
