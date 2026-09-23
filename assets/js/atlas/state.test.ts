import { describe, expect, it } from "vitest"
import { FIXTURE_CHAPTER } from "./fixtures"
import {
  advancePlayhead,
  createAtlasState,
  eventsVisibleInWindow,
  isEventActive,
  noteManualCameraInput,
  resumeCameraFollow,
  returnToEventTime,
  selectEvent,
  selectionTimeStatus,
  setPlaying,
  setPlayhead,
  setTimeWindow,
  stepPlayhead,
  type AtlasState,
} from "./state"
import { buildScene } from "./scene"

const chapter = FIXTURE_CHAPTER
const initial = createAtlasState(chapter)

describe("createAtlasState", () => {
  it("starts in the chapter's window without a selection or camera follow", () => {
    expect(initial.timeWindow).toEqual({ start: 1200, end: 1250 })
    expect(initial.playhead).toBe(1200)
    expect(initial.playing).toBe(false)
    expect(initial.selectedEventId).toBeNull()
    expect(initial.cameraFollow).toBe("manual")
    expect(initial.cameraFocus).toBeNull()
  })
})

describe("selection", () => {
  it("selects a known event and ignores unknown identifiers", () => {
    const selected = selectEvent(initial, chapter, "event-harbor-assembly")

    expect(selected.selectedEventId).toBe("event-harbor-assembly")
    expect(selectEvent(initial, chapter, "event-missing")).toBe(initial)
  })

  it("does not move the camera while following is off", () => {
    const selected = selectEvent(initial, chapter, "event-harbor-assembly")

    expect(selected.cameraFollow).toBe("manual")
    expect(selected.cameraFocus).toBeNull()
  })

  it("requests one camera flight per selection while following", () => {
    const following = resumeCameraFollow(initial, chapter)
    const first = selectEvent(following, chapter, "event-harbor-assembly")
    const second = selectEvent(first, chapter, "event-island-landfall")

    expect(first.cameraFocus?.eventId).toBe("event-harbor-assembly")
    expect(second.cameraFocus?.eventId).toBe("event-island-landfall")
    expect(second.cameraFocus!.token).toBeGreaterThan(first.cameraFocus!.token)
  })
})

describe("camera follow", () => {
  it("resumes following at the current playback position", () => {
    const played = setPlayhead(selectEvent(initial, chapter, "event-island-landfall"), chapter, 1246)
    const following = resumeCameraFollow(played, chapter)

    expect(following.playhead).toBe(1246)
    expect(following.cameraFollow).toBe("following")
    expect(following.cameraFocus).toEqual({ eventId: "event-island-landfall", token: 1 })
  })

  it("stops following on manual camera input without pausing playback", () => {
    const playing = setPlaying(resumeCameraFollow(initial, chapter), true)
    const afterInput = noteManualCameraInput(playing)

    expect(afterInput.cameraFollow).toBe("manual")
    expect(afterInput.playing).toBe(true)
    expect(afterInput.playhead).toBe(playing.playhead)
  })

  it("stays off until the user explicitly resumes", () => {
    const stopped = noteManualCameraInput(resumeCameraFollow(initial, chapter))
    const played = advancePlayhead(setPlaying(stopped, true), chapter, 500)
    const selected = selectEvent(played, chapter, "event-harbor-assembly")

    expect(selected.cameraFollow).toBe("manual")
    expect(selected.cameraFocus).toBeNull()

    const resumed = resumeCameraFollow(selected, chapter)

    expect(resumed.cameraFollow).toBe("following")
    expect(resumed.cameraFocus?.eventId).toBe("event-harbor-assembly")
  })

  it("is unaffected by programmatic playhead, window, and playback changes", () => {
    const following = resumeCameraFollow(initial, chapter)
    const steps: AtlasState[] = [
      setPlayhead(following, chapter, 1230),
      setTimeWindow(following, chapter, { start: 1210, end: 1240 }),
      setPlaying(following, true),
      advancePlayhead(setPlaying(following, true), chapter, 250),
    ]

    for (const state of steps) {
      expect(state.cameraFollow).toBe("following")
    }
  })

  it("only follows a selection, not the playhead", () => {
    const following = resumeCameraFollow(initial, chapter)

    expect(buildScene(following, chapter).cameraTarget).toBeNull()

    const selected = selectEvent(following, chapter, "event-harbor-assembly")
    const scene = buildScene(selected, chapter)

    expect(scene.cameraTarget).toEqual({ lon: 129.9, lat: 32.8 })
    expect(scene.cameraFocus?.eventId).toBe("event-harbor-assembly")
  })
})

describe("time window", () => {
  it("keeps a selection whose event falls outside the new window", () => {
    const selected = selectEvent(initial, chapter, "event-island-landfall")
    const narrowed = setTimeWindow(selected, chapter, { start: 1200, end: 1230 })

    expect(narrowed.selectedEventId).toBe("event-island-landfall")
    expect(selectionTimeStatus(narrowed, chapter)).toBe("outside-window")
    expect(eventsVisibleInWindow(narrowed, chapter).map((event) => event.id)).not.toContain("event-island-landfall")
    // RFD 1: no out-of-window marker is kept merely because the event is selected.
    expect(buildScene(narrowed, chapter).events.map((event) => event.id)).not.toContain("event-island-landfall")
  })

  it("returns to a selected event's time explicitly", () => {
    const selected = selectEvent(initial, chapter, "event-island-landfall")
    const narrowed = setTimeWindow(selected, chapter, { start: 1200, end: 1230 })
    const returned = returnToEventTime(narrowed, chapter)

    expect(selectionTimeStatus(returned, chapter)).toBe("in-window")
    expect(returned.playhead).toBeGreaterThanOrEqual(1244)
    expect(returned.playhead).toBeLessThanOrEqual(1244)
    expect(returned.playing).toBe(false)
  })

  it("clamps the playhead into the new window and stops playback at its end", () => {
    const playing = setPlaying(setPlayhead(initial, chapter, 1249), true)
    const narrowed = setTimeWindow(playing, chapter, { start: 1200, end: 1230 })

    expect(narrowed.playhead).toBe(1230)
    expect(narrowed.playing).toBe(false)
  })
})

describe("playback", () => {
  it("advances the playhead and stops at the end of the window without looping", () => {
    const playing = setPlaying(initial, true)
    const advanced = advancePlayhead(playing, chapter, 1000)
    const finished = advancePlayhead(playing, chapter, 60_000)

    expect(advanced.playhead).toBe(1204)
    expect(advanced.playing).toBe(true)
    expect(finished.playhead).toBe(1250)
    expect(finished.playing).toBe(false)
  })

  it("restarts from the window start when play is pressed at the end", () => {
    const atEnd = setPlayhead(initial, chapter, 1250)
    const restarted = setPlaying(atEnd, true)

    expect(restarted.playhead).toBe(1200)
    expect(restarted.playing).toBe(true)
  })

  it("does not advance while paused", () => {
    expect(advancePlayhead(initial, chapter, 1000)).toBe(initial)
  })

  it("steps chronologically through event boundaries and stops playback", () => {
    const playing = setPlaying(initial, true)
    const stepped = stepPlayhead(playing, chapter, 1)

    expect(stepped.playhead).toBe(1204)
    expect(stepped.playing).toBe(false)
    expect(stepPlayhead(stepped, chapter, 1).playhead).toBe(1218)
    expect(stepPlayhead(stepped, chapter, -1).playhead).toBe(1204)
  })

  it("marks only the events at the playhead as active", () => {
    const atSpan = setPlayhead(initial, chapter, 1219)
    const events = eventsVisibleInWindow(atSpan, chapter)
    const active = events.filter((event) => isEventActive(atSpan, event)).map((event) => event.id)

    expect(active).toEqual(["event-coastal-crossing"])
  })
})
