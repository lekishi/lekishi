import type {
  Chapter,
  EventDispute,
  EventPlacement,
  GeoPoint,
  HistoricalEvent,
  Occurrence,
} from "./domain"
import {
  CONTROL_TINTS,
  sceneArcs,
  sceneJourneys,
  sceneTerritories,
  type SceneArc,
  type SceneJourney,
  type SceneTerritory,
} from "./overlays"
import type { AtlasState, CameraFocusRequest } from "./state"
import { findEvent, findPlace, playbackState, selectionTimeStatus } from "./state"
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
  /** Some of the record's main claims are tradition; the list and the card say so. */
  readonly tradition: boolean
  /** The event's relation to the window; `outside` only appears in search results. */
  readonly relation: OccurrenceRelation
  /** `active` at the playhead, `possible` for an uncertain occurrence window, or `inactive`. */
  readonly playback: PlaybackState
  readonly selected: boolean
  /** A coda node of the chapter, outside the primary mission window. */
  readonly coda: boolean
}

/**
 * How a place is marked (RFD 1's evidence grammar, RFD 5's evidence tokens).
 * `attested` is a site: a solid ring. `identified` is a locality or region: a
 * soft halo whose size is the precision. `anchor` is a display anchor that
 * places the name and asserts no historical coordinate: a small hollow
 * diamond, never a ring, so it is not read as a surveyed site.
 */
export type PlaceMark = "attested" | "identified" | "anchor"

/**
 * One place on the map with the window's events at it (RFD 1, "Places
 * first"): one marker, one label and a count, however many events it has.
 */
export type ScenePlace = {
  readonly id: string
  readonly label: string
  readonly position: GeoPoint
  readonly mark: PlaceMark
  /** For an identified place, how wide the halo is: a region's is wider than a locality's. */
  readonly precision: "site" | "locality" | "region" | "unspecified"
  /** The window's events placed here. */
  readonly eventCount: number
  /** `possible` when every event here only partly overlaps the window. */
  readonly tone: "definite" | "possible"
  /** `active` when an event here is supported at the playhead, `possible` for an uncertain one. */
  readonly playback: PlaybackState
  /** The place is the selection, or the selected event's place. */
  readonly selected: boolean
  /** An event here carries a disputed account. */
  readonly disputed: boolean
  /** An event here is told as tradition; the name is dotted, the marker keeps the place's evidence. */
  readonly tradition: boolean
  /**
   * The controller a drawn territory snapshot records holding the place, or
   * null. The marker takes the controller's tint and a seat is marked; when two
   * snapshots hold it, which the contract allows only under a dispute, the
   * first is tinted and `disputed` says the holding is contested.
   */
  readonly control: {
    readonly tint: number
    readonly label: string
    readonly seat: boolean
    readonly disputed: boolean
  } | null
  /**
   * The place's city banner on the campaign board: its tint (the controller's
   * where a drawn snapshot holds the place, otherwise the story's), whether a
   * story is there at the playhead, and the glyph of a unit standing there.
   * `/dev/world` tints it by the chapter whose story is there.
   */
  readonly banner?: {
    readonly tint: number
    /** A player's story is at the place this turn: the banner is filled in its tint. */
    readonly active: boolean
    readonly unit: string | null
  } | null
}

/**
 * What the frame covers, in CSS pixels from each edge of the scene (RFD 5,
 * "Scene safe area"). A view input like the canvas size, not state: the
 * workspace measures its regions and the renderer frames flights into the
 * clear zone between them.
 */
export type SafeArea = {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export const NO_INSETS: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * The campaign board the globe is drawn as (the owner's decision of
 * 2026-11-12, `rfd/0003/CAMPAIGN_BOARD.adoc`): the hexes lit where a story is
 * at the playhead, each with its player's tint, and the places the story has
 * already passed, drawn as remembered paper. Everywhere else is dark.
 */
export type SceneBoard = {
  readonly lit: readonly { readonly lon: number; readonly lat: number; readonly player: number }[]
  readonly remembered: readonly GeoPoint[]
  /**
   * The board's pieces: a city on each place a player's story has reached
   * (larger where its story is this turn), and each player's unit, a ship or a
   * travelling party, where it stands. Symbols of the story's presence, never
   * a claim about a settlement's size or a force's strength.
   */
  readonly cities?: readonly {
    readonly lon: number
    readonly lat: number
    readonly player: number
    readonly active: boolean
  }[]
  readonly units?: readonly {
    readonly lon: number
    readonly lat: number
    readonly player: number
    readonly kind: "ship" | "party"
  }[]
}

export type AtlasScene = {
  readonly chapterId: string
  readonly homeView: GeoPoint
  readonly timeWindow: { readonly start: number; readonly end: number }
  readonly playhead: number
  readonly playing: boolean
  readonly events: readonly SceneEvent[]
  /** The places the map marks, each once. */
  readonly places: readonly ScenePlace[]
  readonly journeys: readonly SceneJourney[]
  readonly arcs: readonly SceneArc[]
  readonly territories: readonly SceneTerritory[]
  readonly selectedEventId: string | null
  readonly selectedPlaceId: string | null
  readonly selectionOutsideWindow: boolean
  readonly cameraFollow: AtlasState["cameraFollow"]
  readonly cameraFocus: CameraFocusRequest | null
  /** Changes when the reader asks for the chapter's opening view again. */
  readonly homeToken: number
  /** Where the focus request flies to, or null when there is no flight to make. */
  readonly cameraTarget: GeoPoint | null
  readonly safeArea: SafeArea
  /** The board to draw over the terrain, when the renderer was made with one. */
  readonly board?: SceneBoard | null
}

/**
 * The board's tint for a chapter's own story: the design system's gold, one
 * past the controllers' tints (`CONTROL_TINTS`), so no controller wears it. A
 * place a drawn snapshot records held keeps its controller's tint instead, so
 * the legend's "held by" colours stay true.
 */
export const STORY_TINT = CONTROL_TINTS

/**
 * The window at the playhead as the campaign board. The light follows the
 * story, as a strategy game's fog follows its units: a hex is lit where an
 * event stands (or may stand) at the playhead or a journey's vessel stands, a
 * town stands wherever the window's story has reached by the playhead, and
 * the hexes of the window's places whose events are over are remembered. Like
 * the markers, the board draws the window's events only. An event the source
 * dates only within a range reaches its place when the whole range has
 * passed, never on the earliest year it might have happened. Towns and units
 * are symbols of the story's presence, never a claim about a settlement's
 * size or a force.
 */
function sceneBoard(
  state: AtlasState,
  events: readonly SceneEvent[],
  places: readonly ScenePlace[],
  journeys: readonly SceneJourney[],
): SceneBoard {
  const playhead = Math.round(state.playhead)
  const at = (place: ScenePlace) => ({
    lon: place.position.lon,
    lat: place.position.lat,
    player: STORY_TINT,
  })
  const lit = places.filter((place) => place.playback !== "inactive").map(at)
  const reached = new Set<string>()
  const remembered: GeoPoint[] = []
  for (const { placement, occurrence } of events) {
    if (placement.kind !== "point") continue
    const arrives =
      occurrence.mode === "occurrence_window" ? occurrence.endYear : occurrence.startYear
    if (arrives <= playhead) reached.add(placement.placeId)
    if (occurrence.endYear < playhead) remembered.push(placement.position)
  }
  const cities = places
    .filter((place) => place.eventCount > 0 && reached.has(place.id))
    .map((place) => ({ ...at(place), active: place.playback === "active" }))
  const eventIds = new Set(events.map((event) => event.id))
  const units = journeys.flatMap((journey) => {
    // A selected journey can retain an excluded stop in its schematic overlay,
    // but cannot light the board outside the window or invent an unstated mode.
    if (journey.vessel === null || journey.vessel.kind === "marker") return []
    const { position, eventId } = journey.stops[journey.vessel.stop]
    if (!eventIds.has(eventId)) return []
    const kind = journey.vessel.kind
    lit.push({ lon: position.lon, lat: position.lat, player: STORY_TINT })
    return [{ lon: position.lon, lat: position.lat, player: STORY_TINT, kind }]
  })
  return { lit, remembered, cities, units }
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
    tradition: event.tradition,
    relation: relationToWindow(event.occurrence, state.timeWindow),
    playback: playbackState(state, event),
    selected: state.selectedEventId === event.id,
    coda: event.coda,
  }
}

function placeMark(place: { placement: string; precision: string }): PlaceMark {
  if (place.placement === "display-anchor") {
    return "anchor"
  }

  return place.precision === "site" ? "attested" : "identified"
}

/** Who holds each place in the drawn snapshots, keyed by place id. */
function controlByPlace(
  territories: readonly SceneTerritory[],
): Map<string, ScenePlace["control"]> {
  const control = new Map<string, ScenePlace["control"]>()

  for (const territory of territories) {
    for (const held of territory.places) {
      const existing = control.get(held.placeId)

      control.set(
        held.placeId,
        existing === undefined || existing === null
          ? {
              tint: territory.tint,
              label: territory.label,
              seat: held.role === "seat",
              disputed: territory.disputed,
            }
          : { ...existing, disputed: true },
      )
    }
  }

  return control
}

/**
 * The places the scene's events stand at, the places a drawn snapshot holds,
 * and a selected place with a position.
 */
function scenePlaces(
  state: AtlasState,
  chapter: Chapter,
  events: readonly SceneEvent[],
  territories: readonly SceneTerritory[],
): ScenePlace[] {
  const selectedEvent = findEvent(chapter, state.selectedEventId)
  const selectedPlaceId =
    state.selectedPlaceId ??
    (selectedEvent?.placement.kind === "point" ? selectedEvent.placement.placeId : null)
  const byPlace = new Map<string, SceneEvent[]>()

  for (const event of events) {
    if (event.placement.kind === "point") {
      byPlace.set(event.placement.placeId, [...(byPlace.get(event.placement.placeId) ?? []), event])
    }
  }

  if (selectedPlaceId !== null && !byPlace.has(selectedPlaceId)) {
    byPlace.set(selectedPlaceId, [])
  }

  const control = controlByPlace(territories)

  for (const placeId of control.keys()) {
    if (!byPlace.has(placeId)) {
      byPlace.set(placeId, [])
    }
  }

  return chapter.places.flatMap((place) => {
    const here = byPlace.get(place.id)

    if (here === undefined || place.position === null) {
      return []
    }

    return [
      {
        id: place.id,
        label: place.label,
        position: place.position,
        mark: placeMark(place),
        precision: place.precision,
        eventCount: here.length,
        tone:
          here.length > 0 && here.every((event) => event.relation === "possible")
            ? "possible"
            : "definite",
        playback: here.some((event) => event.playback === "active")
          ? "active"
          : here.some((event) => event.playback === "possible")
            ? "possible"
            : "inactive",
        selected: place.id === selectedPlaceId,
        disputed: here.some((event) => event.dispute !== null),
        tradition: here.some((event) => event.tradition),
        control: control.get(place.id) ?? null,
        banner: {
          tint: control.get(place.id)?.tint ?? STORY_TINT,
          active: here.some((event) => event.playback === "active"),
          unit: null,
        },
      },
    ]
  })
}

/** Where a focus request flies: the event's placed point or the place's position. */
function focusTarget(chapter: Chapter, recordId: string): GeoPoint | null {
  const event = findEvent(chapter, recordId)

  if (event !== null) {
    return placementPoint(event.placement)
  }

  return findPlace(chapter, recordId)?.position ?? null
}

export function buildScene(
  state: AtlasState,
  chapter: Chapter,
  safeArea: SafeArea = NO_INSETS,
): AtlasScene {
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

  const territories = sceneTerritories(state, chapter)
  const places = scenePlaces(state, chapter, events, territories)
  const journeys = sceneJourneys(state, chapter)

  return {
    chapterId: chapter.id,
    homeView: chapter.homeView,
    timeWindow: state.timeWindow,
    playhead: state.playhead,
    playing: state.playing,
    events,
    places,
    journeys,
    arcs: sceneArcs(state, chapter),
    territories,
    selectedEventId: state.selectedEventId,
    selectedPlaceId: state.selectedPlaceId,
    selectionOutsideWindow: selectionTimeStatus(state, chapter) === "outside-window",
    cameraFollow: state.cameraFollow,
    cameraFocus: state.cameraFocus,
    homeToken: state.homeToken,
    // A focus request exists only when following or for an explicit jump, and
    // flies to a position the map can actually show.
    cameraTarget:
      state.cameraFocus === null ? null : focusTarget(chapter, state.cameraFocus.recordId),
    safeArea,
    board: sceneBoard(state, events, places, journeys),
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
