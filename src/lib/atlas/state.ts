import type { Chapter, HistoricalEvent, Place, TimeWindow } from "./domain"
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
 * A request to move the camera to an event's or a place's position. `recordId`
 * is the record's own id (events and places never share one). `token` changes
 * whenever a new flight is wanted, including when following resumes, so the
 * renderer can apply each request exactly once without treating it as manual
 * input.
 */
export type CameraFocusRequest = {
  readonly recordId: string
  readonly token: number
}

/**
 * The map's optional layers (RFD 1's orbs). Journeys are on by default. A
 * relationship family that is off still draws the arcs that touch the
 * selection, because RFD 1 draws a relationship on selection; turning a family
 * on draws every arc of that family the window overlaps. Territory has no
 * snapshots in either served chapter, so its orb is shown disabled.
 */
export const LAYERS = [
  "journeys",
  "transmission",
  "diplomacy",
  "conflict",
  "trade",
  "institution",
  "territory",
] as const

export type LayerId = (typeof LAYERS)[number]

export type LayerVisibility = { readonly [layer in LayerId]: boolean }

export const DEFAULT_LAYERS: LayerVisibility = {
  journeys: true,
  transmission: false,
  diplomacy: false,
  conflict: false,
  trade: false,
  institution: false,
  territory: false,
}

export type AtlasState = {
  readonly chapterId: string
  readonly timeWindow: TimeWindow
  readonly playhead: number
  readonly playing: boolean
  readonly selectedEventId: string | null
  /**
   * A selected place, for a place with several events (RFD 1, "Places first").
   * One selection at a time: selecting an event clears it and selecting a place
   * clears the event.
   */
  readonly selectedPlaceId: string | null
  /**
   * The story step the reader is at, as an index into `chapter.story`, or null.
   * Selecting an event that is a story step moves it there; a summary step (a
   * relationship the story narrates) can only be reached by a story jump, and
   * selects nothing.
   */
  readonly storyStep: number | null
  readonly cameraFollow: CameraFollow
  readonly cameraFocus: CameraFocusRequest | null
  /** Bumped by "back to the chapter's view"; the renderer flies home once per value. */
  readonly homeToken: number
  readonly layers: LayerVisibility
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
    selectedPlaceId: null,
    storyStep: null,
    // Following is opt-in: nothing moves the camera until the user asks for it.
    cameraFollow: "manual",
    cameraFocus: null,
    homeToken: 0,
    layers: DEFAULT_LAYERS,
  }
}

/**
 * The next camera request. A selection moves the camera only while following;
 * an explicit jump (a story step, a search result, a link) is the reader asking
 * to go there, so it always asks for one flight, and it does not turn following
 * on.
 */
function nextFocus(
  state: AtlasState,
  recordId: string | null,
  explicit = false,
): CameraFocusRequest | null {
  if (recordId === null || (state.cameraFollow === "manual" && !explicit)) {
    return null
  }

  return { recordId, token: (state.cameraFocus?.token ?? 0) + 1 }
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
    selectedPlaceId: null,
    storyStep: stepOf(chapter, eventId),
    cameraFocus: nextFocus(state, eventId),
  }
}

/** The story step that carries a record, or null when the story does not step through it. */
function stepOf(chapter: Chapter, recordId: string | null): number | null {
  const index = chapter.story.findIndex((step) => step.recordId === recordId)

  return index === -1 ? null : index
}

export function findPlace(chapter: Chapter, placeId: string | null): Place | null {
  if (placeId === null) {
    return null
  }

  return chapter.places.find((place) => place.id === placeId) ?? null
}

/**
 * Selects a place and clears any selected event. `explicit` marks a jump the
 * reader asked for elsewhere (search, a link), which frames the place even when
 * following is off; a click on the place's own marker does not move the camera.
 * A place the map cannot show (no sourced position) can still be selected from
 * search: its card names it and says it is not located.
 */
export function selectPlace(
  state: AtlasState,
  chapter: Chapter,
  placeId: string | null,
  explicit = false,
): AtlasState {
  const place = findPlace(chapter, placeId)

  if (placeId !== null && place === null) {
    return state
  }

  return {
    ...state,
    selectedEventId: null,
    selectedPlaceId: placeId,
    storyStep: null,
    cameraFocus: place?.position ? nextFocus(state, placeId, explicit) : state.cameraFocus,
  }
}

/**
 * An explicit return to the chapter's opening view. It is a programmatic
 * flight, so it does not stop following by itself; following has nothing to
 * hold the camera on without a selection anyway.
 */
export function returnHome(state: AtlasState): AtlasState {
  return { ...state, homeToken: state.homeToken + 1 }
}

export function setLayer(state: AtlasState, layer: LayerId, visible: boolean): AtlasState {
  return { ...state, layers: { ...state.layers, [layer]: visible } }
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
    cameraFocus: nextFocus(
      { ...state, cameraFollow },
      state.selectedEventId ?? state.selectedPlaceId,
    ),
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
  const event = findEvent(chapter, eventId)

  if (event === null) {
    return state
  }

  const selected = selectEvent(state, chapter, eventId)
  const framed =
    event.placement.kind === "point"
      ? { ...selected, cameraFocus: nextFocus(state, eventId, true) }
      : selected

  return returnToEventTime(framed, chapter)
}

/**
 * A jump to a story step, by its index in the chapter's story. An event step is
 * an event jump; a summary step (a relationship the story narrates) selects
 * nothing and moves the playhead to the relationship's date when it has one,
 * widening the window only as far as that date needs. An index outside the
 * story leaves the state as it was.
 */
export function jumpToStoryStep(state: AtlasState, chapter: Chapter, index: number): AtlasState {
  const step = chapter.story[index]

  if (step === undefined) {
    return state
  }

  if (step.kind === "event") {
    return { ...jumpToEvent(state, chapter, step.recordId), storyStep: index }
  }

  const validity =
    chapter.relationships.find((relationship) => relationship.id === step.recordId)?.validity ??
    null
  const cleared: AtlasState = {
    ...state,
    selectedEventId: null,
    selectedPlaceId: null,
    storyStep: index,
    playing: false,
  }

  if (validity === null) {
    return cleared
  }

  const widened = includeInWindow(cleared, validity.startYear, validity.endYear)

  return { ...widened, playhead: clampToWindow(validity.startYear, widened.timeWindow) }
}

/**
 * The window widened just enough to include a span, or unchanged when it
 * already does. RFD 5's URL contract: a linked event outside the window widens
 * it, and the arrival plate says so, rather than re-centring the reader's
 * window.
 */
export function includeInWindow(state: AtlasState, start: number, end: number): AtlasState {
  const timeWindow = {
    start: Math.min(state.timeWindow.start, start),
    end: Math.max(state.timeWindow.end, end),
  }

  if (timeWindow.start === state.timeWindow.start && timeWindow.end === state.timeWindow.end) {
    return state
  }

  return { ...state, timeWindow, playhead: clampToWindow(state.playhead, timeWindow) }
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
