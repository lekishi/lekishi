import type { Chapter, GeoPoint, HistoricalEvent, TimeWindow } from "$lib/atlas/domain"
import type { SceneJourney } from "$lib/atlas/overlays"
import {
  buildScene,
  NO_INSETS,
  type AtlasScene,
  type SafeArea,
  type SceneBoard,
  type ScenePlace,
} from "$lib/atlas/scene"
import { createAtlasState } from "$lib/atlas/state"

/**
 * The `/dev/world` prototype's scene: every chapter alive in one year, drawn
 * together on the one globe, as a strategy game draws a turn (the Civilization
 * direction, design review of 2026-11-09). It is a development page, not a
 * product decision, and it adds nothing to the scene contract: each chapter's
 * scene is the one `buildScene` gives the atlas for a one-year window at that
 * year, and the turn's scene is their union.
 *
 * - A chapter is alive in a year when its own window holds the year. The
 *   window is the chapter's, so this is what the chapter tells, not a claim
 *   about what existed.
 * - A place two chapters name is one marker, its counts added: places are
 *   shared records, so this is how a thread between chapters shows on the map.
 * - Journeys keep their vessel at the last stop the year has reached, as the
 *   atlas already places it. Within one year the vessel stands at that year's
 *   last stop; nothing here invents a position between stops.
 */

/**
 * The turns the prototype carries: 750 to 762, from the Tang embassy's
 * appointment to 杜環's return through 廣州. Three chapters overlap in
 * 752–754; 杜環's carries the turns on alone after 754.
 */
export const TURN_ERA: TimeWindow = { start: 750, end: 762 }

/**
 * Every served chapter's window and located places, across all its stories:
 * the board's memory of chapters that are not alive this turn. One that ended
 * before the turn leaves its places remembered; one that starts after it
 * leaves the map dark there, because no source has been yet. A chapter alive
 * this turn is drawn from its own dated events instead (`worldTurn`).
 */
export type ChapterReach = {
  readonly id: string
  readonly window: TimeWindow
  readonly places: readonly GeoPoint[]
}

/** Per chapter, the located places any of its stories names. */
export type NamedPlaces = Readonly<
  Record<string, readonly { readonly id: string; readonly label: string }[]>
>

/** The located places each chapter names across all its stories, from its story views. */
export function namedPlaces(stories: readonly (readonly Chapter[])[]): NamedPlaces {
  return Object.fromEntries(
    stories.map((views) => {
      const places = new Map<string, string>()
      for (const view of views) {
        for (const place of view.places)
          if (place.position !== null) places.set(place.id, place.label)
      }
      return [views[0].id, [...places].map(([id, label]) => ({ id, label }))]
    }),
  )
}

/**
 * Each player's banner glyph: a character from its own account, hand-picked
 * for the prototype's three chapters; any other chapter takes its title's
 * first character.
 */
const GLYPHS: Readonly<Record<string, string>> = {
  "tang-mission-750-754": "鑒",
  "du-huan-751-762": "杜",
  "stephen-ii-journey-753-754": "S",
}

export function glyphOf(chapter: Pick<Chapter, "id" | "title">): string {
  return GLYPHS[chapter.id] ?? chapter.title.at(0) ?? "?"
}

export function aliveIn(chapter: Chapter, year: number): boolean {
  return chapter.defaultWindow.start <= year && year <= chapter.defaultWindow.end
}

/** A chapter alive this turn, as the players list shows it. */
export type WorldPlayer = {
  readonly chapterId: string
  /**
   * The player's seat: its chapter's index among every chapter the prototype
   * carries, so its colour stays the same from turn to turn as other players
   * enter and leave.
   */
  readonly seat: number
  readonly title: string
  readonly window: TimeWindow
  /** Where its unit stands: a journey's vessel, or the chapter's own home view. */
  readonly unit: {
    readonly label: string
    readonly position: GeoPoint
    readonly moving: boolean
    /** The place the unit stands at, or null at a chapter's home view. */
    readonly placeId: string | null
    /** The board's piece for it: a journey's own vessel, or a travelling party. */
    readonly kind: "ship" | "party"
  }
  /** Events of this chapter at this year. */
  readonly eventCount: number
  /** How far through its own window the chapter is this turn, 0 to 1. */
  readonly progress: number
  /** This turn's events, in the chapter's date order. */
  readonly events: readonly HistoricalEvent[]
}

/** A place two or more chapters alive this turn both name. */
export type WorldThread = {
  readonly placeId: string
  readonly label: string
  readonly chapterIds: readonly string[]
}

export type WorldTurn = {
  readonly year: number
  readonly scene: AtlasScene
  readonly players: readonly WorldPlayer[]
  readonly threads: readonly WorldThread[]
  /** Places a story first reaches this turn: what the board newly lights. */
  readonly reached: number
}

export type WorldTurnOptions = {
  /** Places named across all stories; without it, only each opening story's places count. */
  readonly named?: NamedPlaces
  /** Every chapter's reach; with it, the turn's scene carries the board. */
  readonly reach?: readonly ChapterReach[]
  /** Leave the journeys out of the scene (the journeys lens off). */
  readonly journeys?: boolean
  readonly safeArea?: SafeArea
  /** Fly to this point once per new token, as a scene camera request does. */
  readonly focus?: { readonly target: GeoPoint; readonly token: number } | null
  /** Bumped to fly back to the turn's opening view. */
  readonly homeToken?: number
  /**
   * The chapter whose unit the turn opens over. A tilted view cannot hold
   * Rome and Nara at once, so it opens on one player, as a strategy game
   * opens on the player's own units; without one, on the middle of them all.
   */
  readonly home?: string | null
  /** The place of the event the page shows, whose banner is drawn selected. */
  readonly selectedPlaceId?: string | null
}

function vesselOf(journeys: readonly SceneJourney[]): WorldPlayer["unit"] | null {
  for (const journey of journeys) {
    if (journey.vessel === null) continue
    const stop = journey.stops[journey.vessel.stop]
    return {
      label: stop.label,
      position: stop.position,
      moving: true,
      placeId: stop.placeId,
      kind: journey.vessel.kind === "ship" ? "ship" : "party",
    }
  }

  return null
}

/**
 * Where a chapter without a journey stands: the place of its latest located
 * event that has begun by the year. That is where the story last was, not a
 * claim about where its people were between events.
 */
function lastStop(chapter: Chapter, year: number): WorldPlayer["unit"] | null {
  let last: { label: string; position: GeoPoint; start: number; placeId: string } | null = null
  for (const event of chapter.events) {
    const { placement, occurrence } = event
    if (placement.kind !== "point" || event.coda || occurrence.startYear > year) continue
    if (last === null || occurrence.startYear >= last.start)
      last = {
        label: placement.label,
        position: placement.position,
        start: occurrence.startYear,
        placeId: placement.placeId,
      }
  }
  return last === null
    ? null
    : {
        label: last.label,
        position: last.position,
        moving: false,
        placeId: last.placeId,
        kind: "party" as const,
      }
}

/** Merges two markers for the same place record: one marker, both chapters' events. */
function mergePlace(a: ScenePlace, b: ScenePlace): ScenePlace {
  return {
    ...a,
    eventCount: a.eventCount + b.eventCount,
    tone: a.tone === "definite" || b.tone === "definite" ? "definite" : "possible",
    playback:
      a.playback === "active" || b.playback === "active"
        ? "active"
        : a.playback === "possible" || b.playback === "possible"
          ? "possible"
          : "inactive",
    selected: a.selected || b.selected,
    disputed: a.disputed || b.disputed,
    tradition: a.tradition && b.tradition,
    control: a.control ?? b.control,
  }
}

export function worldTurn(
  chapters: readonly Chapter[],
  year: number,
  options: WorldTurnOptions = {},
): WorldTurn {
  const alive = chapters.filter((chapter) => aliveIn(chapter, year))
  const seats = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  const seatOf = (chapter: Chapter) => seats.get(chapter.id) ?? 0
  const scenes = alive.map((chapter) => {
    const state = {
      ...createAtlasState(chapter),
      timeWindow: { start: year, end: year },
      playhead: year,
    }
    return { chapter, scene: buildScene(state, chapter, options.safeArea ?? NO_INSETS) }
  })

  const places = new Map<string, ScenePlace>()
  for (const { scene } of scenes) {
    for (const place of scene.places) {
      const seen = places.get(place.id)
      places.set(place.id, seen === undefined ? place : mergePlace(seen, place))
    }
  }

  // Journey and arc ids are unique within a chapter only.
  const scoped = <T extends { readonly id: string }>(chapterId: string, items: readonly T[]) =>
    items.map((item) => ({ ...item, id: `${chapterId}/${item.id}` }))

  const dioramas = new Map(
    scenes.flatMap(({ scene }) => scene.dioramas).map((diorama) => [diorama.id, diorama]),
  )

  // A chapter's events this turn: those whose own date range holds the year.
  // An event the source dates only as "751–762" holds every one of those
  // years, which is what the source says; nothing narrows it here.
  const holds = (event: HistoricalEvent) =>
    event.occurrence.startYear <= year && year <= event.occurrence.endYear
  const byDate = (a: HistoricalEvent, b: HistoricalEvent) =>
    a.occurrence.startYear - b.occurrence.startYear || a.occurrence.endYear - b.occurrence.endYear

  // A player's unit is a ship in a turn its journey sails: when a stop the
  // record makes by ship falls in the year, the turn is a voyage, wherever
  // the year's last stop lands.
  const sailed = (chapter: Chapter) => {
    const thisYear = new Set(chapter.events.filter(holds).map((event) => event.id))
    return chapter.overlays.journeys.some((journey) =>
      journey.stops.some((stop) => stop.vessel === "ship" && thisYear.has(stop.eventId)),
    )
  }

  const players: WorldPlayer[] = scenes.map(({ chapter, scene }) => {
    const { start, end } = chapter.defaultWindow
    const unit: WorldPlayer["unit"] = vesselOf(scene.journeys) ??
      lastStop(chapter, year) ?? {
        label: chapter.title,
        position: chapter.homeView,
        moving: false,
        placeId: null,
        kind: "party",
      }
    return {
      chapterId: chapter.id,
      seat: seatOf(chapter),
      title: chapter.title,
      window: chapter.defaultWindow,
      unit: { ...unit, kind: sailed(chapter) ? "ship" : unit.kind },
      eventCount: scene.events.length,
      progress: end === start ? 1 : (year - start + 1) / (end - start + 1),
      events: chapter.events.filter(holds).toSorted(byDate),
    }
  })
  // City banners: each place takes the tint of the first player whose story
  // is there this turn (or, failing that, whose scene draws it), filled when a
  // story is there this turn, and the glyph of a unit standing on it.
  const tintAt = new Map<string, number>()
  for (const p of players) {
    for (const event of p.events)
      for (const id of event.placeIds) if (!tintAt.has(id)) tintAt.set(id, p.seat)
  }
  const active = new Set(tintAt.keys())
  for (const { chapter, scene } of scenes) {
    for (const place of scene.places)
      if (!tintAt.has(place.id)) tintAt.set(place.id, seatOf(chapter))
  }
  for (const [id, place] of places) {
    const standing = players.findIndex((p) => p.unit.placeId === id)
    const tint = standing >= 0 ? players[standing].seat : (tintAt.get(id) ?? 0)
    places.set(id, {
      ...place,
      selected: id === options.selectedPlaceId,
      banner: {
        tint,
        active: active.has(id) || standing >= 0,
        unit: standing >= 0 ? glyphOf(alive[standing]) : null,
      },
    })
  }

  const namedBy = new Map<string, { label: string; chapterIds: string[] }>()
  for (const chapter of alive) {
    const named =
      options.named?.[chapter.id] ?? chapter.places.filter((place) => place.position !== null)
    for (const place of named) {
      const entry = namedBy.get(place.id) ?? { label: place.label, chapterIds: [] }
      if (!entry.chapterIds.includes(chapter.id)) entry.chapterIds.push(chapter.id)
      namedBy.set(place.id, entry)
    }
  }
  const threads = [...namedBy.entries()]
    .filter(([, entry]) => entry.chapterIds.length > 1)
    .map(([placeId, entry]) => ({ placeId, ...entry }))

  // The board follows the stories, as a strategy game's fog follows its
  // units: a hex is lit where a chapter alive now has an event this turn, or
  // where its unit stands; it is remembered where that chapter's story has
  // already been, or where a chapter that ended before the turn named a place.
  // So each turn the light moves with the stories and leaves paper behind.
  // The places reached count the same walk, so they hold with the board off.
  const reachedIds = new Set<string>()
  const lit: { lon: number; lat: number; player: number }[] = []
  const remembered: GeoPoint[] = []
  const cities: { lon: number; lat: number; player: number; active: boolean }[] = []
  alive.forEach((chapter, index) => {
    const player = players[index].seat
    const located = new Map(
      chapter.places.flatMap((place) =>
        place.position === null ? [] : [[place.id, place.position] as const],
      ),
    )
    // Where the story is this turn, where it was in turns already over, and
    // where it had been before this turn began. The last differs from the
    // second for an event that spans turns (a source's "751–762"): its place
    // is reached in its first turn, not again in each one after.
    const now = new Map<string, GeoPoint>()
    const before = new Map<string, GeoPoint>()
    const earlier = new Set<string>()
    for (const event of chapter.events) {
      const into = holds(event) ? now : event.occurrence.endYear < year ? before : null
      for (const id of event.placeIds) {
        const position = located.get(id)
        if (position === undefined) continue
        into?.set(id, position)
        if (event.occurrence.startYear < year) earlier.add(id)
      }
    }
    for (const [id, { lon, lat }] of now) {
      lit.push({ lon, lat, player })
      if (!earlier.has(id)) reachedIds.add(id)
    }
    for (const [id, position] of before) if (!now.has(id)) remembered.push(position)
    // A city wherever the story has been, the ones it is at this turn first.
    for (const [id, { lon, lat }] of [...now, ...[...before].filter(([id]) => !now.has(id))]) {
      cities.push({ lon, lat, player, active: now.has(id) })
    }
    const unit = players[index].unit.position
    lit.push({ lon: unit.lon, lat: unit.lat, player })
  })
  let board: SceneBoard | null = null
  if (options.reach !== undefined) {
    const aliveIds = new Set(alive.map((chapter) => chapter.id))
    for (const entry of options.reach) {
      if (!aliveIds.has(entry.id) && entry.window.end < year) remembered.push(...entry.places)
    }
    const units = players.map(({ unit, seat }) => ({
      lon: unit.position.lon,
      lat: unit.position.lat,
      player: seat,
      kind: unit.kind,
    }))
    board = { lit, remembered, cities, units }
  }

  const homeView =
    players.find((player) => player.chapterId === options.home)?.unit.position ??
    centroid(players.map((player) => player.unit.position))
  const focus = options.focus ?? null

  const scene: AtlasScene = {
    chapterId: `world-${year}`,
    homeView,
    timeWindow: { start: year, end: year },
    playhead: year,
    playing: false,
    events: scenes.flatMap(({ scene }) => scene.events),
    places: [...places.values()],
    journeys:
      options.journeys === false
        ? []
        : scenes.flatMap(({ chapter, scene }) => scoped(chapter.id, scene.journeys)),
    arcs: scenes.flatMap(({ chapter, scene }) => scoped(chapter.id, scene.arcs)),
    territories: scenes.flatMap(({ scene }) => scene.territories),
    dioramas: [...dioramas.values()],
    selectedEventId: null,
    selectedPlaceId: null,
    selectionOutsideWindow: false,
    cameraFollow: "manual",
    cameraFocus: focus === null ? null : { recordId: "world-focus", token: focus.token },
    homeToken: options.homeToken ?? 0,
    cameraTarget: focus?.target ?? null,
    safeArea: options.safeArea ?? NO_INSETS,
    board,
  }

  return { year, scene, players, threads, reached: reachedIds.size }
}

/** The middle of the units, on the sphere, so the opening view sees them all. */
function centroid(points: readonly GeoPoint[]): GeoPoint {
  if (points.length === 0) return { lon: 100, lat: 30 }
  const rad = Math.PI / 180
  let x = 0
  let y = 0
  let z = 0
  for (const { lon, lat } of points) {
    x += Math.cos(lat * rad) * Math.cos(lon * rad)
    y += Math.cos(lat * rad) * Math.sin(lon * rad)
    z += Math.sin(lat * rad)
  }
  return { lon: Math.atan2(y, x) / rad, lat: Math.atan2(z, Math.hypot(x, y)) / rad }
}
