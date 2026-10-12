import type {
  Chapter,
  EventDispute,
  EventPlacement,
  GeoPoint,
  HistoricalEvent,
  Occurrence,
} from "./domain"
import type { AtlasState, CameraFocusRequest } from "./state"
import { findEvent, playbackState, selectionTimeStatus } from "./state"
import type { SearchMatchKind, SearchResult } from "./search"
import { relationToWindow, type OccurrenceRelation, type PlaybackState } from "./time"

/**
 * The renderer-facing view of the atlas.
 *
 * A scene is derived from state, never stored in it, and contains no renderer
 * objects: only identifiers, placements, and display status. Swapping the globe for
 * another engine replaces the renderer, not this contract or the state module.
 *
 * The scene keeps every in-window event, including the ones the map cannot
 * place. `placement.kind === "none"` is a list-only event, never a guessed
 * coordinate, and the renderer draws nothing for it. Search is the one surface
 * that also shows events outside the window (`relation === "outside"`), because a
 * reader who searches for a name must find it; the row says so instead of
 * pretending the event is inside the selected window.
 */

export type SceneEvent = {
  readonly id: string
  readonly title: string
  readonly placement: EventPlacement
  readonly occurrence: Occurrence
  /** The published dispute, or null; the list and details surfaces show it verbatim. */
  readonly dispute: EventDispute | null
  /** The event's relation to the window; `outside` only appears in search results. */
  readonly relation: OccurrenceRelation
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

/**
 * One event's row, as the list and the details surface read it. `buildScene` and
 * search both go through here, so a row cannot describe the same event two ways.
 */
export function sceneEvent(
  state: AtlasState,
  chapter: Chapter,
  event: HistoricalEvent,
): SceneEvent {
  return {
    id: event.id,
    title: event.title,
    placement: event.placement,
    occurrence: event.occurrence,
    dispute: event.dispute,
    relation: relationToWindow(event.occurrence, state.timeWindow),
    playback: playbackState(state, event),
    selected: state.selectedEventId === event.id,
    coda: event.coda,
  }
}

export function buildScene(state: AtlasState, chapter: Chapter): AtlasScene {
  const events: SceneEvent[] = []

  for (const event of chapter.events) {
    const relation = relationToWindow(event.occurrence, state.timeWindow)

    // RFD 1: an out-of-window selection keeps its details but not its map marker.
    if (relation === "outside") {
      continue
    }

    events.push(sceneEvent(state, chapter, event))
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

/** One search result, as the list renders it: the event's row plus what matched. */
export type SceneSearchResult = {
  readonly event: SceneEvent
  readonly match: SearchMatchKind
  readonly matchedText: string
}

/**
 * Rows for a search result list.
 *
 * Unlike the window's list, these include events the window excludes: search has
 * to reach the whole chapter, and the row carries its relation so the list can
 * say an event is outside the selected window instead of hiding it. Selecting one
 * keeps its details and shows the outside-window notice, exactly as any other
 * out-of-window selection does.
 */
export function searchRows(
  state: AtlasState,
  chapter: Chapter,
  results: readonly SearchResult[],
): SceneSearchResult[] {
  return results.flatMap((result) => {
    const event = findEvent(chapter, result.eventId)

    return event === null
      ? []
      : [
          {
            event: sceneEvent(state, chapter, event),
            match: result.match,
            matchedText: result.matchedText,
          },
        ]
  })
}
