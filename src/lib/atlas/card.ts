import type { Actor, Chapter, HistoricalEvent, Place, Relationship, Territory } from "./domain"
import { familyOf, type RelationshipFamily } from "./overlays"
import { overlapsWindow } from "./time"
import type { TimeWindow } from "./domain"

/**
 * What the selection card and the frame read beside the selected record:
 * connected and nearby events, the relationships it takes part in, the people
 * the pennants show, and the chapter's counts for the About sheet.
 *
 * RFD 1 keeps two lists apart. "Connected" events are linked by the records
 * themselves (the next stop of the same journey, an event with the same
 * person); they can be far apart. "Nearby" events are only close on the map,
 * and the card says "nearby, not necessarily related". Pure functions, so the
 * rules are tested without a browser.
 */

export type ConnectedEvent = {
  readonly event: HistoricalEvent
  /** Why it is connected, in a few words. */
  readonly reason: string
}

export type NearbyEvent = {
  readonly event: HistoricalEvent
  /** "same place", or the distance in kilometres. */
  readonly distance: string
}

const EARTH_RADIUS_KM = 6371
const NEARBY_KM = 150
const MAX_ROWS = 5

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { readonly lon: number; readonly lat: number },
  b: { readonly lon: number; readonly lat: number },
): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

function personIds(chapter: Chapter): Set<string> {
  return new Set(
    chapter.actors.filter((actor) => actor.types.includes("person")).map((actor) => actor.id),
  )
}

/**
 * Events the records connect to this one: the stops either side of it on a
 * journey, then events that share a person with it, in story order.
 */
export function connectedEvents(chapter: Chapter, event: HistoricalEvent): ConnectedEvent[] {
  const events = new Map(chapter.events.map((candidate) => [candidate.id, candidate]))
  const connected: ConnectedEvent[] = []
  const seen = new Set([event.id])
  const add = (candidate: HistoricalEvent | undefined, reason: string) => {
    if (candidate !== undefined && !seen.has(candidate.id)) {
      seen.add(candidate.id)
      connected.push({ event: candidate, reason })
    }
  }

  for (const journey of chapter.overlays.journeys) {
    const index = journey.stops.findIndex((stop) => stop.eventId === event.id)

    if (index === -1) {
      continue
    }

    add(events.get(journey.stops[index - 1]?.eventId ?? ""), `previous stop · ${journey.label}`)
    add(events.get(journey.stops[index + 1]?.eventId ?? ""), `next stop · ${journey.label}`)
  }

  const people = personIds(chapter)
  const actors = new Map(chapter.actors.map((actor) => [actor.id, actor]))
  const shared = event.participants.filter((participant) => people.has(participant.actorId))
  const storyOrder = new Map(chapter.story.map((step, index) => [step.recordId, index]))
  const others = chapter.events
    .filter((candidate) => !seen.has(candidate.id))
    .sort(
      (a, b) =>
        (storyOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (storyOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )

  for (const candidate of others) {
    const person = shared.find((participant) =>
      candidate.participants.some((other) => other.actorId === participant.actorId),
    )

    if (person !== undefined) {
      add(candidate, `with ${actors.get(person.actorId)?.label ?? "the same person"}`)
    }
  }

  return connected.slice(0, MAX_ROWS)
}

/**
 * Events close on the map and not already connected: the same place first,
 * then by distance, within 150 km of the selection's place.
 */
export function nearbyEvents(
  chapter: Chapter,
  event: HistoricalEvent,
  exclude: ReadonlySet<string> = new Set(),
): NearbyEvent[] {
  if (event.placement.kind !== "point") {
    return []
  }

  const origin = event.placement.position

  return chapter.events
    .flatMap((candidate) => {
      if (
        candidate.id === event.id ||
        exclude.has(candidate.id) ||
        candidate.placement.kind !== "point"
      ) {
        return []
      }

      const km = distanceKm(origin, candidate.placement.position)

      return km <= NEARBY_KM ? [{ event: candidate, km }] : []
    })
    .sort((a, b) => a.km - b.km || a.event.occurrence.startYear - b.event.occurrence.startYear)
    .slice(0, MAX_ROWS)
    .map(({ event: candidate, km }) => ({
      event: candidate,
      distance: km < 1 ? "same place" : `${Math.round(km)} km`,
    }))
}

/** The events placed at a place, chronologically, for a selected place's card. */
export function eventsAtPlace(chapter: Chapter, placeId: string): HistoricalEvent[] {
  return chapter.events
    .filter((event) => event.placeIds.includes(placeId))
    .sort((a, b) => a.occurrence.startYear - b.occurrence.startYear)
}

/** One snapshot that holds a place, as the place's card lists it. */
export type ControlRow = {
  readonly territory: Territory
  readonly controllerLabel: string
  readonly role: "seat" | "held"
  /** The event or relationship by which the controller gained the place, or null. */
  readonly gainedRecordId: string | null
  readonly note: string | null
}

/**
 * Every snapshot that records a controller holding the place, in date order.
 * The card lists them all, not only the one at the playhead, so a reader sees
 * the years the sources cover and, by their absence, the years they do not.
 */
export function controlOf(chapter: Chapter, placeId: string): ControlRow[] {
  const actors = new Map(chapter.actors.map((actor) => [actor.id, actor.label]))

  return chapter.territories
    .flatMap((territory) =>
      territory.places
        .filter((held) => held.placeId === placeId)
        .map((held) => ({
          territory,
          controllerLabel: actors.get(territory.controllerId) ?? territory.controllerId,
          role: held.role,
          gainedRecordId: held.gainedRecordId,
          note: held.note,
        })),
    )
    .sort(
      (a, b) =>
        a.territory.span.startYear - b.territory.span.startYear ||
        a.territory.id.localeCompare(b.territory.id),
    )
}

export type RelationshipRow = {
  readonly relationship: Relationship
  readonly family: RelationshipFamily | null
  readonly fromLabel: string
  readonly toLabel: string
}

/** The relationships an event's people or places, or a place, take part in. */
export function relationshipsFor(
  chapter: Chapter,
  records: ReadonlySet<string>,
): RelationshipRow[] {
  const names = new Map<string, string>([
    ...chapter.actors.map((actor): [string, string] => [actor.id, actor.label]),
    ...chapter.places.map((place): [string, string] => [place.id, place.label]),
  ])

  return chapter.relationships
    .filter((relationship) => records.has(relationship.from.id) || records.has(relationship.to.id))
    .map((relationship) => ({
      relationship,
      family: familyOf(relationship),
      fromLabel: names.get(relationship.from.id) ?? relationship.from.id,
      toLabel: names.get(relationship.to.id) ?? relationship.to.id,
    }))
}

/** A person the pennants show, with how many of the chapter's events name them. */
export type Pennant = {
  readonly actor: Actor
  readonly events: number
  /**
   * The medallion's text: the name's first two characters in a CJK script (one
   * would make 韓非 and 韓王安 the same 韓), its first letter otherwise.
   */
  readonly mark: string
}

/**
 * The people in the chapter's story (RFD 1's pennants): persons the events name
 * at least twice, most often named first, at most five.
 */
export function pennants(chapter: Chapter): Pennant[] {
  const people = personIds(chapter)
  const counts = new Map<string, number>()

  for (const event of chapter.events) {
    for (const participant of new Set(event.participants.map((p) => p.actorId))) {
      if (people.has(participant)) {
        counts.set(participant, (counts.get(participant) ?? 0) + 1)
      }
    }
  }

  return chapter.actors
    .filter((actor) => (counts.get(actor.id) ?? 0) >= 2)
    .map((actor) => ({ actor, events: counts.get(actor.id) ?? 0, mark: medallion(actor.label) }))
    .sort((a, b) => b.events - a.events || a.actor.label.localeCompare(b.actor.label))
    .slice(0, 5)
}

const CJK = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

function medallion(label: string): string {
  const characters = [...label]
  return CJK.test(label) ? characters.slice(0, 2).join("") : (characters[0] ?? "")
}

/** The chapter's own counts, as the About sheet states them. */
export type ChapterFacts = {
  readonly inWindow: number
  readonly coda: number
  readonly unplaced: number
  readonly unlocatedPlaces: number
  readonly places: number
  readonly disputed: number
  readonly sources: number
  readonly relationships: number
}

export function chapterFacts(chapter: Chapter): ChapterFacts {
  const inWindow = chapter.events.filter((event) => !event.coda)

  return {
    inWindow: inWindow.length,
    coda: chapter.events.length - inWindow.length,
    unplaced: inWindow.filter((event) => event.placement.kind === "none").length,
    unlocatedPlaces: chapter.places.filter((place) => place.position === null).length,
    places: chapter.places.length,
    disputed: chapter.events.filter((event) => event.dispute !== null).length,
    sources: chapter.sources.length,
    relationships: chapter.relationships.length,
  }
}

/** The events the window shows on the timeline strip, with their spans. */
export function windowEvents(chapter: Chapter, window: TimeWindow): HistoricalEvent[] {
  return chapter.events.filter((event) => overlapsWindow(event.occurrence, window))
}

/** A place's evidence form, as the card's badge names it. */
export function placeEvidence(place: Place): "attested" | "identified" | "anchor" | "none" {
  if (place.position === null) {
    return "none"
  }

  if (place.placement === "display-anchor") {
    return "anchor"
  }

  return place.precision === "site" ? "attested" : "identified"
}
