import type { Chapter, EventDispute, EventPlacement, GeoPoint, Occurrence } from "./domain"
import type { AtlasState, CameraFocusRequest } from "./state"
import { findEvent, playbackState, selectionTimeStatus } from "./state"
import { relationToWindow, type OccurrenceRelation, type PlaybackState } from "./time"

/**
 * The renderer-facing view of the atlas.
 *
 * A scene is derived from state, never stored in it, and contains no renderer
 * objects: only identifiers, placements, and display status. Swapping Cesium for
 * another engine replaces the renderer, not this contract or the state module.
 *
 * The scene keeps every in-window event, including the ones the map cannot
 * place. `placement.kind === "none"` is a list-only event, never a guessed
 * coordinate, and the renderer draws nothing for it.
 */

export type SceneEvent = {
  readonly id: string
  readonly title: string
  readonly placement: EventPlacement
  readonly occurrence: Occurrence
  /** The published dispute, or null; the list and details surfaces show it verbatim. */
  readonly dispute: EventDispute | null
  /** `definite` or `possible` inside the window; outside-window events are excluded. */
  readonly relation: Exclude<OccurrenceRelation, "outside">
  /** `active` at the playhead, `possible` for an uncertain occurrence window, or `inactive`. */
  readonly playback: PlaybackState
  readonly selected: boolean
  /** A coda node of the chapter, outside the primary mission window. */
  readonly coda: boolean
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
}

/** The map position of a placement, or null when the atlas must not draw one. */
export function placementPoint(placement: EventPlacement): GeoPoint | null {
  return placement.kind === "point" ? placement.position : null
}

export function buildScene(state: AtlasState, chapter: Chapter): AtlasScene {
  const events: SceneEvent[] = []

  for (const event of chapter.events) {
    const relation = relationToWindow(event.occurrence, state.timeWindow)

    // RFD 1: an out-of-window selection keeps its details but not its map marker.
    if (relation === "outside") {
      continue
    }

    events.push({
      id: event.id,
      title: event.title,
      placement: event.placement,
      occurrence: event.occurrence,
      dispute: event.dispute,
      relation,
      playback: playbackState(state, event),
      selected: state.selectedEventId === event.id,
      coda: event.coda,
    })
  }

  // Chronological order keeps the non-map event list and stepping predictable.
  events.sort(
    (a, b) => a.occurrence.startYear - b.occurrence.startYear || a.title.localeCompare(b.title),
  )

  const selected = findEvent(chapter, state.selectedEventId)
  const target = selected === null ? null : placementPoint(selected.placement)

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
    // Following moves the camera to a selection the map can actually show.
    cameraTarget: state.cameraFollow === "following" ? target : null,
  }
}
