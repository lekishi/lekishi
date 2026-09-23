import { describe, expect, it } from "vitest"
import { FIXTURE_CHAPTER } from "./fixtures"
import { buildScene } from "./scene"
import {
  createAtlasState,
  resumeCameraFollow,
  selectEvent,
  setPlayhead,
  setTimeWindow,
} from "./state"

const chapter = FIXTURE_CHAPTER
const initial = createAtlasState(chapter)

describe("buildScene", () => {
  it("keeps every fixture event inside the default window", () => {
    const scene = buildScene(initial, chapter)

    expect(scene.events).toHaveLength(chapter.events.length)
    expect(scene.events.map((event) => event.id)).toEqual([
      "event-harbor-assembly",
      "event-coastal-crossing",
      "event-plain-workshop",
      "event-island-landfall",
      "event-archive-transfer",
    ])
  })

  it("marks spans that only partly overlap the window as possible matches", () => {
    const narrowed = setTimeWindow(initial, chapter, { start: 1230, end: 1250 })
    const scene = buildScene(narrowed, chapter)
    const workshop = scene.events.find((event) => event.id === "event-plain-workshop")

    expect(workshop?.relation).toBe("possible")
    expect(workshop?.occurrence.precision).toBe("decade")
  })

  it("marks the events at the playhead as active", () => {
    const scene = buildScene(setPlayhead(initial, chapter, 1219), chapter)
    const active = scene.events.filter((event) => event.active).map((event) => event.id)

    expect(active).toEqual(["event-coastal-crossing"])
  })

  it("excludes outside-window events from the scene while keeping the selection", () => {
    const selected = selectEvent(initial, chapter, "event-island-landfall")
    const narrowed = setTimeWindow(selected, chapter, { start: 1200, end: 1230 })
    const scene = buildScene(narrowed, chapter)

    expect(scene.selectedEventId).toBe("event-island-landfall")
    expect(scene.selectionOutsideWindow).toBe(true)
    expect(scene.events.map((event) => event.id)).not.toContain("event-island-landfall")
  })

  it("exposes a camera target only while following a selection", () => {
    const selected = selectEvent(initial, chapter, "event-harbor-assembly")

    expect(buildScene(selected, chapter).cameraTarget).toBeNull()
    expect(buildScene(resumeCameraFollow(selected, chapter), chapter).cameraTarget).toEqual({
      lon: 129.9,
      lat: 32.8,
    })
  })

  it("is plain data with no renderer objects", () => {
    const scene = buildScene(
      resumeCameraFollow(selectEvent(initial, chapter, "event-harbor-assembly"), chapter),
      chapter,
    )
    const roundTripped = JSON.parse(JSON.stringify(scene))

    expect(roundTripped).toEqual(scene)
    expect(Object.getPrototypeOf(roundTripped)).toBe(Object.prototype)
  })
})
