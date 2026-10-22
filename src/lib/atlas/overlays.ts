import type { Chapter, GeoPoint, HistoricalEvent, Place, Relationship, Territory } from "./domain"
import { windowLabel } from "./labels"
import type { AtlasState, LayerId } from "./state"
import { overlapsWindow } from "./time"

/**
 * What the map draws besides places: journeys through dated stops, relationship
 * arcs, territory snapshots and dioramas (RFD 1, "Show, then qualify").
 *
 * A line on the map is a presentation of published records. This module says
 * what each kind of line means and draws them:
 *
 * - A journey is a published journey record (RFD 2, "Decided: the
 *   journey record"): stops that are the chapter's own events at their own
 *   places, and the leg arriving at each. The map draws a dashed line only
 *   along the legs the record draws, between two places that assert a
 *   coordinate, labelled "schematic, follows the dated stops"; the line is not
 *   an itinerary. A stop at an unlocated place breaks the line, a drifting leg
 *   is drawn as a drift, and an intended destination is named on the card,
 *   never drawn. A few journeys are still hand-written in
 *   `overlay-definitions.ts` until their records are authored; those connect
 *   their placed stops in order.
 * - An arc is a published relationship drawn between two places. A place end is
 *   the record's own place. An actor end is drawn at a published place that
 *   stands for the actor (a state at its court), named there and stated on the
 *   map as schematic. A relationship whose ends have no such place, or whose
 *   ends meet at one place, is not drawn; the card still lists it.
 * - A territory is a published control snapshot (rfd/0002/TERRITORIES.adoc):
 *   the places a source records a controller holding in a closed range of
 *   years. The map tints those places' markers in the controller's colour and
 *   marks its seat; nothing is filled and no line joins them, because no source
 *   draws a border. A snapshot is shown only while the playhead is inside its
 *   own range, never carried forward or interpolated between two.
 *
 * Nothing here is evidence. Every definition names published record ids, and
 * `overlays.test.ts` fails if one stops resolving, so a retitled or removed
 * record cannot leave a line pointing at nothing.
 */

/** The relationship families the map styles (RFD 5's `rel-*` tokens). */
export const RELATIONSHIP_FAMILIES = [
  "transmission",
  "diplomacy",
  "conflict",
  "trade",
  "institution",
] as const

export type RelationshipFamily = (typeof RELATIONSHIP_FAMILIES)[number]

/**
 * The family a contract relationship type is drawn in, or null when it is not
 * an arc. Travel is drawn as a journey; `other` and the renaming types have no
 * arc form, so they stay in the card.
 */
export function relationshipFamily(type: string): RelationshipFamily | null {
  switch (type) {
    case "transmission":
    case "proposed_influence":
      return "transmission"
    case "diplomacy":
    case "contact":
    case "alliance":
      return "diplomacy"
    case "conflict":
      return "conflict"
    case "trade":
      return "trade"
    case "institutional_change":
    case "changed_boundaries":
    case "membership":
    case "rulership":
    case "successor_of":
      return "institution"
    default:
      return null
  }
}

/** A relationship's family: the first of its types that has one. */
export function familyOf(relationship: Relationship): RelationshipFamily | null {
  for (const type of relationship.types) {
    const family = relationshipFamily(type)

    if (family !== null) {
      return family
    }
  }

  return null
}

/**
 * The symbol at a journey's current stop, from the mode of the leg that
 * reached it: a ship by sea or river, a party by land, and a plain marker when
 * the record states no mode.
 */
export type Vessel = "ship" | "party" | "marker"

/** The leg arriving at a stop. */
export type JourneyLeg = {
  /** The record draws it: both stops' places assert a coordinate. */
  readonly drawn: boolean
  /** The party did not choose the course; the map draws a drift. */
  readonly driven: boolean
  /** The place the leg set out for and did not reach, named on the card. */
  readonly towardPlaceId: string | null
}

export type JourneyStop = {
  readonly eventId: string
  /**
   * The stop's place, as the journey record gives it; null on a hand-written
   * journey, which stops at its events' own placements.
   */
  readonly placeId: string | null
  readonly vessel: Vessel
  /** The leg arriving here; null on the first stop. */
  readonly leg: JourneyLeg | null
}

export type JourneyDefinition = {
  readonly id: string
  /** Whose journey it is, as the card and the legend name it. */
  readonly label: string
  /** The published relationship the journey presents, when there is one. */
  readonly relationshipId: string | null
  readonly stops: readonly JourneyStop[]
}

/**
 * A hand-written journey, as `overlay-definitions.ts` writes it: events in
 * order, each with its symbol. Every leg between its placed stops is drawn.
 */
export type CuratedJourney = {
  readonly id: string
  readonly label: string
  readonly relationshipId: string | null
  readonly stops: readonly { readonly eventId: string; readonly vessel: "ship" | "party" }[]
}

export function curatedJourney(journey: CuratedJourney): JourneyDefinition {
  return {
    ...journey,
    stops: journey.stops.map((stop, index) => ({
      eventId: stop.eventId,
      placeId: null,
      vessel: stop.vessel,
      leg: index === 0 ? null : { drawn: true, driven: false, towardPlaceId: null },
    })),
  }
}

export type DioramaDefinition = {
  readonly id: string
  /** The place the diorama is set at; it is drawn only near that place. */
  readonly placeId: string
  /** The precomputed symbols, served from `static/`. */
  readonly url: string
  /** The camera height below which the symbols appear. */
  readonly showBelowMeters: number
}

export type ChapterOverlays = {
  readonly journeys: readonly JourneyDefinition[]
  /** The published place an actor's arc ends at. */
  readonly actorAnchors: Readonly<Record<string, string>>
  /** Per relationship, a place for an end that is a person, where the record names one. */
  readonly endAnchors: Readonly<Record<string, { readonly from?: string; readonly to?: string }>>
  readonly dioramas: readonly DioramaDefinition[]
}

/** One stop of a journey as the map draws it. */
export type SceneJourneyStop = {
  readonly eventId: string
  readonly placeId: string
  readonly label: string
  readonly position: GeoPoint
  readonly year: number
  /** The playhead has reached the stop's year. */
  readonly reached: boolean
}

/** A drawn leg, between two of the scene journey's stops. */
export type SceneLeg = {
  readonly from: number
  readonly to: number
  readonly drift: boolean
}

export type SceneJourney = {
  readonly id: string
  readonly label: string
  /** The stops the map can place; a stop at an unlocated place is listed on the card only. */
  readonly stops: readonly SceneJourneyStop[]
  /** The legs to draw; a stop with no leg either side stands alone. */
  readonly legs: readonly SceneLeg[]
  /**
   * The schematic vessel or party, at the selected stop when the reader
   * selected one, otherwise at the last stop the playhead has reached; null
   * before the journey starts. The playhead counts years, so within one year
   * the selection is what moves the vessel from stop to stop.
   */
  readonly vessel: { readonly stop: number; readonly kind: Vessel } | null
  /** One of its stops is the selection. */
  readonly selected: boolean
}

/** A relationship arc as the map draws it. */
export type SceneArc = {
  readonly id: string
  readonly family: RelationshipFamily
  readonly label: string
  readonly from: GeoPoint
  readonly to: GeoPoint
  readonly fromLabel: string
  readonly toLabel: string
  readonly directed: boolean
  /** `selected` when the arc touches the selection, `layer` when its orb drew it. */
  readonly emphasis: "selected" | "layer"
}

/**
 * How many controller tints the map has (RFD 5's `control-*` tokens). A chapter
 * with more controllers than tints reuses them in order; the legend names each
 * controller beside its tint, so a reused tint is never the only cue.
 */
export const CONTROL_TINTS = 8

/** A place a snapshot holds, as the map marks it. */
export type SceneTerritoryPlace = {
  readonly placeId: string
  readonly label: string
  readonly role: "seat" | "held"
  /** Null for a place the sources name without a site: named on the card, not drawn. */
  readonly position: GeoPoint | null
}

/** A dated control snapshot at the playhead. */
export type SceneTerritory = {
  readonly id: string
  readonly controllerId: string
  /** The controller's name, as the legend and the marker's title give it. */
  readonly label: string
  /** The snapshot's own range, always shown; snapshots are never interpolated. */
  readonly dateLabel: string
  /** The controller's tint, from 0 to `CONTROL_TINTS - 1`. */
  readonly tint: number
  /** The snapshot carries a dispute, so its marks are drawn disputed. */
  readonly disputed: boolean
  readonly places: readonly SceneTerritoryPlace[]
}

export type SceneDiorama = {
  readonly id: string
  readonly placeId: string
  readonly url: string
  readonly center: GeoPoint
  readonly showBelowMeters: number
}

function eventById(chapter: Chapter): Map<string, HistoricalEvent> {
  return new Map(chapter.events.map((event) => [event.id, event]))
}

function placeById(chapter: Chapter): Map<string, Place> {
  return new Map(chapter.places.map((place) => [place.id, place]))
}

/** The record ids the selection touches: the event, its places and its people, or the place. */
export function selectionRecords(state: AtlasState, chapter: Chapter): ReadonlySet<string> {
  const event = eventById(chapter).get(state.selectedEventId ?? "")

  if (event !== undefined) {
    return new Set([
      event.id,
      ...event.placeIds,
      ...event.participants.map((participant) => participant.actorId),
    ])
  }

  return new Set(state.selectedPlaceId === null ? [] : [state.selectedPlaceId])
}

/** Where the map shows a stop: its record's place, or a hand-written stop's event placement. */
function stopPoint(
  stop: JourneyStop,
  event: HistoricalEvent,
  places: Map<string, Place>,
): { placeId: string; label: string; position: GeoPoint } | null {
  if (stop.placeId === null) {
    return event.placement.kind === "point" ? event.placement : null
  }

  const place = places.get(stop.placeId)

  return place?.position
    ? { placeId: place.id, label: place.label, position: place.position }
    : null
}

export function sceneJourneys(state: AtlasState, chapter: Chapter): SceneJourney[] {
  const events = eventById(chapter)
  const places = placeById(chapter)
  const playhead = Math.round(state.playhead)

  return chapter.overlays.journeys.flatMap((journey) => {
    const stops: {
      stop: SceneJourneyStop
      vessel: Vessel
      span: HistoricalEvent["occurrence"]
      index: number
    }[] = []
    const legs: SceneLeg[] = []

    journey.stops.forEach((stop, index) => {
      const event = events.get(stop.eventId)
      const at = event === undefined ? null : stopPoint(stop, event, places)

      if (event === undefined || at === null) {
        return
      }

      const previous = stops.at(-1)

      // A record draws a leg only between consecutive located stops; a
      // hand-written journey joins each placed stop to the one before it.
      if (
        stop.leg?.drawn === true &&
        previous !== undefined &&
        (stop.placeId === null || previous.index === index - 1)
      ) {
        legs.push({ from: stops.length - 1, to: stops.length, drift: stop.leg.driven })
      }

      stops.push({
        stop: {
          eventId: event.id,
          placeId: at.placeId,
          label: at.label,
          position: at.position,
          year: event.occurrence.startYear,
          reached: event.occurrence.startYear <= playhead,
        },
        vessel: stop.vessel,
        span: event.occurrence,
        index,
      })
    })

    const selectedIndex = stops.findIndex(({ stop }) => stop.eventId === state.selectedEventId)
    const inWindow = stops.some(({ span }) => overlapsWindow(span, state.timeWindow))

    if (stops.length < 2 || (!inWindow && selectedIndex === -1)) {
      return []
    }

    if (!state.layers.journeys && selectedIndex === -1) {
      return []
    }

    let vesselIndex = selectedIndex

    if (vesselIndex === -1) {
      for (const [index, { stop }] of stops.entries()) {
        if (stop.reached) {
          vesselIndex = index
        }
      }
    }

    const vesselStop = stops[vesselIndex]

    return [
      {
        id: journey.id,
        label: journey.label,
        stops: stops.map(({ stop }) => stop),
        legs,
        vessel: vesselStop === undefined ? null : { stop: vesselIndex, kind: vesselStop.vessel },
        selected: selectedIndex !== -1,
      },
    ]
  })
}

/** Where a relationship end is drawn, or null when the map has no place for it. */
function endPlace(
  chapter: Chapter,
  relationship: Relationship,
  end: "from" | "to",
  places: Map<string, Place>,
): Place | null {
  const overlays = chapter.overlays
  const endpoint = relationship[end]
  const placeId =
    overlays.endAnchors[relationship.id]?.[end] ??
    (endpoint.kind === "place" ? endpoint.id : overlays.actorAnchors[endpoint.id])
  const place = placeId === undefined ? undefined : places.get(placeId)

  return place?.position ? place : null
}

/**
 * The arcs to draw. A family whose orb is on draws every one of its arcs the
 * window overlaps; with the orb off, an arc is still drawn when it touches the
 * selection, because RFD 1 draws a relationship on selection. An undated
 * relationship is drawn only on selection: the window cannot place it.
 */
export function sceneArcs(state: AtlasState, chapter: Chapter): SceneArc[] {
  const places = placeById(chapter)
  const touched = selectionRecords(state, chapter)
  const actors = new Map(chapter.actors.map((actor) => [actor.id, actor.label]))

  return chapter.relationships.flatMap((relationship) => {
    const family = familyOf(relationship)
    const from = endPlace(chapter, relationship, "from", places)
    const to = endPlace(chapter, relationship, "to", places)

    if (family === null || from === null || to === null || from.id === to.id) {
      return []
    }

    const touches =
      touched.has(relationship.from.id) ||
      touched.has(relationship.to.id) ||
      touched.has(from.id) ||
      touched.has(to.id)
    const inWindow =
      relationship.validity !== null && overlapsWindow(relationship.validity, state.timeWindow)

    if (!(touches || (state.layers[family] && inWindow))) {
      return []
    }

    const name = (end: "from" | "to", place: Place) =>
      relationship[end].kind === "actor"
        ? (actors.get(relationship[end].id) ?? place.label)
        : place.label

    return [
      {
        id: relationship.id,
        family,
        label: relationship.caption ?? relationship.summary,
        from: from.position!,
        to: to.position!,
        fromLabel: name("from", from),
        toLabel: name("to", to),
        directed: relationship.directionality === "directed",
        emphasis: touches ? "selected" : "layer",
      },
    ]
  })
}

/**
 * Each controller's tint: controllers in the order the chapter's snapshots
 * first name them, so a controller keeps its colour as the playhead moves.
 */
export function controlTints(chapter: Chapter): ReadonlyMap<string, number> {
  const tints = new Map<string, number>()

  for (const territory of chapter.territories) {
    if (!tints.has(territory.controllerId)) {
      tints.set(territory.controllerId, tints.size % CONTROL_TINTS)
    }
  }

  return tints
}

/** The snapshots whose own range holds the playhead year. */
export function territoriesAt(chapter: Chapter, playhead: number): Territory[] {
  const year = Math.round(playhead)

  return chapter.territories.filter(
    (territory) => territory.span.startYear <= year && year <= territory.span.endYear,
  )
}

/**
 * The snapshots to draw: with the territory orb on, every snapshot whose range
 * holds the playhead. Outside every range the map shows no control, because a
 * gap between snapshots is a gap in the evidence.
 */
export function sceneTerritories(state: AtlasState, chapter: Chapter): SceneTerritory[] {
  if (!state.layers.territory) {
    return []
  }

  const places = placeById(chapter)
  const actors = new Map(chapter.actors.map((actor) => [actor.id, actor.label]))
  const tints = controlTints(chapter)

  return territoriesAt(chapter, state.playhead).map((territory) => ({
    id: territory.id,
    controllerId: territory.controllerId,
    label: actors.get(territory.controllerId) ?? territory.controllerId,
    dateLabel: windowLabel({ start: territory.span.startYear, end: territory.span.endYear }),
    tint: tints.get(territory.controllerId) ?? 0,
    disputed: territory.dispute !== null,
    places: territory.places.map((held) => {
      const place = places.get(held.placeId)

      return {
        placeId: held.placeId,
        label: place?.label ?? held.placeId,
        role: held.role,
        position: place?.position ?? null,
      }
    }),
  }))
}

export function sceneDioramas(chapter: Chapter): SceneDiorama[] {
  const places = placeById(chapter)

  return chapter.overlays.dioramas.flatMap((diorama) => {
    const position = places.get(diorama.placeId)?.position

    return position
      ? [
          {
            id: diorama.id,
            placeId: diorama.placeId,
            url: diorama.url,
            center: position,
            showBelowMeters: diorama.showBelowMeters,
          },
        ]
      : []
  })
}

/** An orb the chapter offers, and whether it has anything to draw. */
export type LayerOption = {
  readonly id: LayerId
  readonly available: boolean
}

/**
 * The orbs a chapter shows: the RFD's journeys, transmission, diplomacy and
 * territory always (an orb with nothing to draw is shown disabled, so a reader
 * learns the chapter has none rather than that the atlas cannot show them),
 * plus any other family the chapter has arcs for.
 */
export function layerOptions(chapter: Chapter): LayerOption[] {
  const places = placeById(chapter)
  const drawable = new Set(
    chapter.relationships.flatMap((relationship) => {
      const family = familyOf(relationship)
      const from = endPlace(chapter, relationship, "from", places)
      const to = endPlace(chapter, relationship, "to", places)

      return family !== null && from !== null && to !== null && from.id !== to.id ? [family] : []
    }),
  )
  const journeys = chapter.overlays.journeys.length > 0
  const fixed: LayerOption[] = [
    { id: "journeys", available: journeys },
    { id: "transmission", available: drawable.has("transmission") },
    { id: "diplomacy", available: drawable.has("diplomacy") },
  ]
  const extra: LayerOption[] = (["conflict", "trade", "institution"] as const)
    .filter((family) => drawable.has(family))
    .map((family) => ({ id: family, available: true }))

  return [...fixed, ...extra, { id: "territory", available: chapter.territories.length > 0 }]
}
