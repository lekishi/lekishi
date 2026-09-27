import type { Chapter, HistoricalEvent, TimeWindow } from "./domain"
import {
  clampToWindow,
  eventsInWindow,
  playbackStateAt,
  stepToEventBoundary,
  type PlaybackState,
} from "./time"

/**
 * The single owner of atlas interaction state.
 *
 * Selection, the exploration window, the playhead, playback, and camera-follow
 * live here and nowhere else: the renderer receives a derived scene and reports
 * user input back as actions, so there is exactly one place that can change what
 * the atlas shows. Every function is pure and renderer-independent, which keeps
 * RFD 1's behavior rules testable without a browser or a graphics engine.
 */

/** Camera follow is on until the user takes manual control of the camera. */
export type CameraFollow = "following" | "manual"

/**
 * A request to move the camera to an event's place. `token` changes whenever a
 * new flight is wanted, including when following resumes, so the renderer can
 * apply each request exactly once without treating it as manual input.
 */
export type CameraFocusRequest = {
  readonly eventId: string
  readonly token: number
}

export type AtlasState = {
  readonly chapterId: string
  readonly timeWindow: TimeWindow
  readonly playhead: number
  readonly playing: boolean
  readonly selectedEventId: string | null
  readonly cameraFollow: CameraFollow
  readonly cameraFocus: CameraFocusRequest | null
}

/** Playback speed. RFD 1 leaves rates to the story; the fixture uses one fixed rate. */
export const YEARS_PER_SECOND = 4

/** A selected event is either inside the window or kept visible as outside-selected-time. */
export type SelectionTimeStatus = "in-window" | "outside-window"

export function createAtlasState(chapter: Chapter): AtlasState {
  return {
    chapterId: chapter.id,
    timeWindow: chapter.defaultWindow,
    playhead: chapter.defaultWindow.start,
    playing: false,
    selectedEventId: null,
    // Following is opt-in: nothing moves the camera until the user asks for it.
    cameraFollow: "manual",
    cameraFocus: null,
  }
}

function nextFocus(state: AtlasState, eventId: string | null): CameraFocusRequest | null {
  if (eventId === null || state.cameraFollow === "manual") {
    return null
  }

  return { eventId, token: (state.cameraFocus?.token ?? 0) + 1 }
}

export function findEvent(chapter: Chapter, eventId: string | null): HistoricalEvent | null {
  if (eventId === null) {
    return null
  }

  return chapter.events.find((event) => event.id === eventId) ?? null
}

export function selectEvent(
  state: AtlasState,
  chapter: Chapter,
  eventId: string | null,
): AtlasState {
  if (eventId !== null && findEvent(chapter, eventId) === null) {
    return state
  }

  return {
    ...state,
    selectedEventId: eventId,
    cameraFocus: nextFocus(state, eventId),
  }
}

export function setTimeWindow(state: AtlasState, chapter: Chapter, window: TimeWindow): AtlasState {
  const start = Math.min(window.start, window.end)
  const end = Math.max(window.start, window.end)
  const timeWindow = { start, end }
  const playhead = clampToWindow(state.playhead, timeWindow)
  // Moving the window past the playhead stops playback instead of silently
  // looping back, matching RFD 1's fixed-window playback rule.
  const playing = state.playing && playhead < timeWindow.end

  return { ...state, timeWindow, playhead, playing }
}

export function setPlayhead(state: AtlasState, chapter: Chapter, playhead: number): AtlasState {
  return { ...state, playhead: clampToWindow(Math.round(playhead), state.timeWindow) }
}

/** Chronological stepping to the next or previous event boundary in the window. */
export function stepPlayhead(state: AtlasState, chapter: Chapter, direction: 1 | -1): AtlasState {
  const boundary = stepToEventBoundary(chapter.events, state.timeWindow, state.playhead, direction)

  if (boundary === null) {
    return { ...state, playing: false }
  }

  return { ...state, playhead: boundary, playing: false }
}

export function setPlaying(state: AtlasState, playing: boolean): AtlasState {
  if (!playing) {
    return { ...state, playing: false }
  }

  // Pressing play at the end of the window restarts from its start; playback
  // itself never loops on its own.
  const playhead = state.playhead >= state.timeWindow.end ? state.timeWindow.start : state.playhead

  return { ...state, playhead, playing: true }
}

/** Advance the playhead by elapsed wall-clock time; stops at the window end. */
export function advancePlayhead(
  state: AtlasState,
  chapter: Chapter,
  elapsedMs: number,
): AtlasState {
  if (!state.playing) {
    return state
  }

  const advanced = state.playhead + (elapsedMs / 1000) * YEARS_PER_SECOND
  const playhead = clampToWindow(advanced, state.timeWindow)

  if (playhead >= state.timeWindow.end) {
    return { ...state, playhead: state.timeWindow.end, playing: false }
  }

  return { ...state, playhead }
}

/**
 * Resume following at the current playback position. Time is not rewound, and
 * the camera moves to the current selection if there is one.
 */
export function resumeCameraFollow(state: AtlasState, chapter: Chapter): AtlasState {
  const cameraFollow: CameraFollow = "following"

  return {
    ...state,
    cameraFollow,
    cameraFocus:
      state.selectedEventId === null
        ? null
        : nextFocus({ ...state, cameraFollow }, state.selectedEventId),
  }
}

/**
 * Manual pan or zoom stops following without pausing playback. Following stays
 * off until the user explicitly resumes it.
 */
export function noteManualCameraInput(state: AtlasState): AtlasState {
  if (state.cameraFollow === "manual") {
    return state
  }

  return { ...state, cameraFollow: "manual" }
}

/**
 * Explicitly return to a selected event's time. The window keeps its current
 * scale where possible, and the playhead lands inside the event's span.
 */
export function returnToEventTime(state: AtlasState, chapter: Chapter): AtlasState {
  const event = findEvent(chapter, state.selectedEventId)

  if (event === null) {
    return state
  }

  const span = event.occurrence
  const spanWidth = span.endYear - span.startYear
  const width = Math.max(state.timeWindow.end - state.timeWindow.start, spanWidth)
  const center = (span.startYear + span.endYear) / 2
  const start = Math.round(center - width / 2)
  const timeWindow = { start, end: start + width }

  return {
    ...state,
    timeWindow,
    playhead: clampToWindow(span.startYear, timeWindow),
    playing: false,
  }
}

/**
 * An explicit jump to another event, as story navigation makes it: select the
 * event and move the window and playhead to its time in one action.
 *
 * RFD 1 keeps this separate from chronological stepping. Stepping walks the
 * window's event boundaries and never changes the window; a story jump is a
 * deliberate move to a named step, so it is allowed to change the window — and it
 * stops playback rather than leaving it running into a window it just replaced.
 */
export function jumpToEvent(state: AtlasState, chapter: Chapter, eventId: string): AtlasState {
  return returnToEventTime(selectEvent(state, chapter, eventId), chapter)
}

export function eventsVisibleInWindow(
  state: AtlasState,
  chapter: Chapter,
): readonly HistoricalEvent[] {
  return eventsInWindow(chapter.events, state.timeWindow)
}

export function selectionTimeStatus(
  state: AtlasState,
  chapter: Chapter,
): SelectionTimeStatus | null {
  const event = findEvent(chapter, state.selectedEventId)

  if (event === null) {
    return null
  }

  return event.occurrence.endYear < state.timeWindow.start ||
    event.occurrence.startYear > state.timeWindow.end
    ? "outside-window"
    : "in-window"
}

/**
 * The playhead's relation to an event: `active` for a supported instant or
 * duration, `possible` for an uncertain occurrence window the playhead falls
 * inside, `inactive` otherwise. The renderer-independent rule lives in `time.ts`,
 * which classifies at the year the timeline displays.
 */
export function playbackState(state: AtlasState, event: HistoricalEvent): PlaybackState {
  return playbackStateAt(event.occurrence, state.playhead)
}
