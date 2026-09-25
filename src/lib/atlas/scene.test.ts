import { describe, expect, it } from "vitest"
import { FIXTURE_CHAPTER } from "./fixtures"
import { buildScene, placementPoint } from "./scene"
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
    const atPlayhead = scene.events
      .filter((event) => event.playback !== "inactive")
      .map((event) => ({ id: event.id, playback: event.playback }))

    // The fixture's crossing is an uncertain occurrence window, so the playhead
    // makes it possible, never active.
    expect(atPlayhead).toEqual([{ id: "event-coastal-crossing", playback: "possible" }])

    const onADuration = buildScene(setPlayhead(initial, chapter, 1230), chapter)

    expect(
      onADuration.events.filter((event) => event.playback === "active").map((event) => event.id),
    ).toEqual(["event-plain-workshop"])
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

  it("keeps a list-only event in the scene without a map position", () => {
    const scene = buildScene(initial, chapter)
    const landfall = scene.events.find((event) => event.id === "event-island-landfall")

    expect(landfall?.placement).toEqual({
      kind: "none",
      placeId: "place-island-stop",
      label: "Sample island",
      reason: "no-position",
    })
    expect(placementPoint(landfall!.placement)).toBeNull()
  })

  it("follows only a selection the map can show", () => {
    const following = resumeCameraFollow(initial, chapter)
    const placed = selectEvent(following, chapter, "event-harbor-assembly")
    const unplaced = selectEvent(following, chapter, "event-island-landfall")

    expect(buildScene(placed, chapter).cameraTarget).toEqual({ lon: 129.9, lat: 32.8 })
    // Following an event with no published position would have to invent one.
    expect(buildScene(unplaced, chapter).cameraTarget).toBeNull()
    expect(buildScene(unplaced, chapter).selectedEventId).toBe("event-island-landfall")
  })
})

describe("buildScene and the published dispute", () => {
  const dispute = {
    status: "disputed" as const,
    summary: "The accounts differ about this event.",
    accounts: [{ statement: "One account records it one way.", locators: ["卷六（entry）"] }],
  }
  const disputed = {
    ...chapter,
    events: chapter.events.map((event) =>
      event.id === "event-island-landfall" ? { ...event, dispute } : event,
    ),
  }

  it("carries the dispute into the scene verbatim and leaves the others null", () => {
    const scene = buildScene(createAtlasState(disputed), disputed)
    const landfall = scene.events.find((event) => event.id === "event-island-landfall")

    expect(landfall?.dispute).toEqual(dispute)
    expect(scene.events.filter((event) => event.dispute !== null)).toHaveLength(1)
  })

  it("keeps undisputed events null", () => {
    const scene = buildScene(initial, chapter)

    expect(scene.events.every((event) => event.dispute === null)).toBe(true)
  })
})
