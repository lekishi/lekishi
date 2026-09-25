import { describe, expect, it } from "vitest"
import { FIXTURE_CHAPTER } from "./fixtures"
import {
  eventsInWindow,
  occursAtPlayhead,
  playbackStateAt,
  relationToWindow,
  stepToEventBoundary,
} from "./time"
import type { Occurrence } from "./domain"

const window = { start: 1200, end: 1250 }

function occurrence(
  startYear: number,
  endYear: number,
  precision: Occurrence["precision"] = "year",
  mode: Occurrence["mode"] = startYear === endYear ? "instant" : "occurrence_window",
): Occurrence {
  return { startYear, endYear, precision, mode, sourceExpression: null }
}

describe("relationToWindow", () => {
  it("treats a fully contained span as definite", () => {
    expect(relationToWindow(occurrence(1218, 1220), window)).toBe("definite")
  })

  it("treats a partially overlapping span as a possible match", () => {
    expect(relationToWindow(occurrence(1190, 1210), window)).toBe("possible")
    expect(relationToWindow(occurrence(1240, 1260), window)).toBe("possible")
  })

  it("includes spans that only touch a window boundary", () => {
    expect(relationToWindow(occurrence(1190, 1200), window)).toBe("possible")
    expect(relationToWindow(occurrence(1250, 1290), window)).toBe("possible")
  })

  it("excludes spans that do not overlap the window", () => {
    expect(relationToWindow(occurrence(1100, 1199), window)).toBe("outside")
    expect(relationToWindow(occurrence(1251, 1300), window)).toBe("outside")
  })
})

describe("occursAtPlayhead", () => {
  it("is true only inside the supported span", () => {
    expect(occursAtPlayhead(occurrence(1218, 1220), 1219)).toBe(true)
    expect(occursAtPlayhead(occurrence(1218, 1220), 1221)).toBe(false)
    expect(occursAtPlayhead(occurrence(1228, 1236, "decade"), 1231)).toBe(true)
  })
})

describe("playbackStateAt", () => {
  it("is active inside a supported instant or duration", () => {
    expect(playbackStateAt(occurrence(1204, 1204, "year", "instant"), 1204)).toBe("active")
    expect(playbackStateAt(occurrence(1204, 1204, "year", "instant"), 1205)).toBe("inactive")
    expect(playbackStateAt(occurrence(753, 754, "day", "duration"), 754)).toBe("active")
    expect(playbackStateAt(occurrence(753, 754, "day", "duration"), 755)).toBe("inactive")
  })

  it("is only ever possible inside an uncertain occurrence window", () => {
    const drift = occurrence(753, 754, "year", "occurrence_window")

    // The playhead never makes an uncertain occurrence active: the span says one
    // occurrence happened somewhere inside it, not that activity continued.
    expect(playbackStateAt(drift, 753)).toBe("possible")
    expect(playbackStateAt(drift, 754)).toBe("possible")
    expect(playbackStateAt(drift, 755)).toBe("inactive")
  })
})

describe("eventsInWindow", () => {
  it("keeps overlapping events in chronological order", () => {
    const ids = eventsInWindow(FIXTURE_CHAPTER.events, window).map((event) => event.id)

    expect(ids).toEqual([
      "event-harbor-assembly",
      "event-coastal-crossing",
      "event-plain-workshop",
      "event-island-landfall",
      "event-archive-transfer",
    ])
  })

  it("drops events that fall outside the window", () => {
    const narrowed = eventsInWindow(FIXTURE_CHAPTER.events, { start: 1200, end: 1210 }).map(
      (event) => event.id,
    )

    expect(narrowed).toEqual(["event-harbor-assembly"])
  })
})

describe("stepToEventBoundary", () => {
  it("steps forward to the next boundary after the playhead", () => {
    expect(stepToEventBoundary(FIXTURE_CHAPTER.events, window, 1200, 1)).toBe(1204)
    expect(stepToEventBoundary(FIXTURE_CHAPTER.events, window, 1205, 1)).toBe(1218)
  })

  it("steps back to the previous boundary before the playhead", () => {
    expect(stepToEventBoundary(FIXTURE_CHAPTER.events, window, 1240, -1)).toBe(1236)
  })

  it("returns null at the ends of the window", () => {
    expect(stepToEventBoundary(FIXTURE_CHAPTER.events, window, 1251, 1)).toBeNull()
    expect(stepToEventBoundary(FIXTURE_CHAPTER.events, window, 1200, -1)).toBeNull()
  })
})
