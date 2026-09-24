import type { Chapter, GeoPoint, Occurrence, Place } from "./domain"
import type { AtlasState, CameraFocusRequest } from "./state"
import { findEvent, isEventActive, selectionTimeStatus } from "./state"
import { relationToWindow, type OccurrenceRelation } from "./time"

/**
 * The renderer-facing view of the atlas.
 *
 * A scene is derived from state, never stored in it, and contains no renderer
 * objects: only identifiers, positions, and display status. Swapping Cesium for
 * another engine replaces the renderer, not this contract or the state module.
 */

export type SceneEvent = {
  readonly id: string
  readonly title: string
  readonly position: GeoPoint
  readonly placeLabel: string
  readonly locationPrecision: Place["locationPrecision"]
  readonly occurrence: Occurrence
  /** `definite` or `possible` inside the window; outside-window events are excluded. */
  readonly relation: Exclude<OccurrenceRelation, "outside">
  readonly active: boolean
  readonly selected: boolean
  readonly synthetic: true
}

export type AtlasScene = {
  readonly chapterId: string
  readonly homeView: GeoPoint
  readonly timeWindow: { readonly start: number; readonly end: number }
  readonly playhead: number
  readonly playing: boolean
  readonly events: readonly SceneEvent[]
  readonly selectedEventId: string | null
  readonly selectionOutsideWindow: boolean
  readonly cameraFollow: AtlasState["cameraFollow"]
  readonly cameraFocus: CameraFocusRequest | null
  readonly cameraTarget: GeoPoint | null
  readonly synthetic: true
}

export function placeOf(chapter: Chapter, placeId: string): Place | null {
  return chapter.places.find((place) => place.id === placeId) ?? null
}

export function buildScene(state: AtlasState, chapter: Chapter): AtlasScene {
  const events: SceneEvent[] = []

  for (const event of chapter.events) {
    const relation = relationToWindow(event.occurrence, state.timeWindow)

    // RFD 1: an out-of-window selection keeps its details but not its map marker.
    if (relation === "outside") {
      continue
    }

    const place = placeOf(chapter, event.placeId)

    if (place === null) {
      continue
    }

    events.push({
      id: event.id,
      title: event.title,
      position: place.position,
      placeLabel: place.label,
      locationPrecision: place.locationPrecision,
      occurrence: event.occurrence,
      relation,
      active: isEventActive(state, event),
      selected: state.selectedEventId === event.id,
      synthetic: true,
    })
  }

  // Chronological order keeps the non-map event list and stepping predictable.
  events.sort(
    (a, b) => a.occurrence.startYear - b.occurrence.startYear || a.title.localeCompare(b.title),
  )

  const selected = findEvent(chapter, state.selectedEventId)
  const focusPlace = state.cameraFocus === null ? null : placeOf(chapter, selected?.placeId ?? "")

  return {
    chapterId: chapter.id,
    homeView: chapter.homeView,
    timeWindow: state.timeWindow,
    playhead: state.playhead,
    playing: state.playing,
    events,
    selectedEventId: state.selectedEventId,
    selectionOutsideWindow: selectionTimeStatus(state, chapter) === "outside-window",
    cameraFollow: state.cameraFollow,
    cameraFocus: state.cameraFocus,
    cameraTarget:
      state.cameraFollow === "following" && focusPlace !== null ? focusPlace.position : null,
    synthetic: true,
  }
}
