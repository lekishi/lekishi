import type { Chapter, GeoPoint, HistoricalEvent, Place, Relationship } from "./domain"
import type { AtlasState, LayerId } from "./state"
import { overlapsWindow } from "./time"

/**
 * What the map draws besides places: journeys through dated stops, relationship
 * arcs, territory snapshots and dioramas (RFD 1, "Show, then qualify").
 *
 * The contract publishes events, places and relationships, not lines. A line
 * on the map is therefore a presentation of published records. This module
 * says what each kind of line means and draws them; `overlay-definitions.ts`
 * defines each chapter's, in the open, so a reviewer can read exactly what the
 * map connects and why:
 *
 * - A journey is a list of a chapter's own events in the order the story
 *   tells them, each at its published place. The map draws a dashed line
 *   through those stops, labelled "schematic, follows the dated stops"; the
 *   line connects attested places and is not an itinerary between them.
 * - An arc is a published relationship drawn between two places. A place end is
 *   the record's own place. An actor end is drawn at a published place that
 *   stands for the actor (a state at its court), named there and stated on the
 *   map as schematic. A relationship whose ends have no such place, or whose
 *   ends meet at one place, is not drawn; the card still lists it.
 * - Neither served chapter publishes a territory snapshot, so there are none.
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

/** The symbol at a journey's current stop: a ship for a sea stop, a party ashore. */
export type Vessel = "ship" | "party"

export type JourneyDefinition = {
  readonly id: string
  /** Whose journey it is, as the card and the legend name it. */
  readonly label: string
  /** The published relationship the journey presents, when there is one. */
  readonly relationshipId: string | null
  readonly stops: readonly { readonly eventId: string; readonly vessel: Vessel }[]
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

export type SceneJourney = {
  readonly id: string
  readonly label: string
  readonly stops: readonly SceneJourneyStop[]
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

/** A dated control snapshot. Neither served chapter has one. */
export type SceneTerritory = {
  readonly id: string
  readonly label: string
  /** The snapshot's date, always shown on the map; snapshots are never interpolated. */
  readonly dateLabel: string
  readonly rings: readonly (readonly GeoPoint[])[]
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

export function sceneJourneys(state: AtlasState, chapter: Chapter): SceneJourney[] {
  const events = eventById(chapter)
  const playhead = Math.round(state.playhead)

  return chapter.overlays.journeys.flatMap((journey) => {
    const stops = journey.stops.flatMap((stop) => {
      const event = events.get(stop.eventId)

      if (event === undefined || event.placement.kind !== "point") {
        return []
      }

      return [
        {
          stop: {
            eventId: event.id,
            placeId: event.placement.placeId,
            label: event.placement.label,
            position: event.placement.position,
            year: event.occurrence.startYear,
            reached: event.occurrence.startYear <= playhead,
          },
          vessel: stop.vessel,
          span: event.occurrence,
        },
      ]
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

  return [...fixed, ...extra, { id: "territory", available: false }]
}
