import { chapterHref } from "$lib/atlas/chapters"
import type { Chapter, GeoPoint, Place, TimeWindow } from "$lib/atlas/domain"
import { shortId } from "$lib/atlas/query"
import type { RegionKey } from "$lib/historical/regions"

type ChapterView = {
  readonly stories: readonly Chapter[]
  readonly title: string
  readonly region: RegionKey
}

export type PlaceMoment = TimeWindow & {
  readonly id: string
  readonly chapterId: string
  readonly title: string
  readonly note: string
  readonly tradition: boolean
  readonly dispute: string | null
  readonly href: string
}

export type PlaceChapter = {
  readonly id: string
  readonly title: string
  readonly region: RegionKey
  readonly href: string
}

export type PlaceEntry = {
  readonly id: string
  readonly place: Place
  readonly chapters: PlaceChapter[]
  readonly moments: PlaceMoment[]
}

export type PlaceCatalogue = {
  readonly places: PlaceEntry[]
  readonly singletons: { id: string; label: string; href: string }[]
  readonly reach: Record<string, GeoPoint[]>
}

/** One row per record and one reach per chapter, even if several stories repeat
 * it. Keep every occurrence site, including secondary stops and unpositioned
 * places, but not references that simply give context. */
export function placeCatalogue(chapters: readonly ChapterView[]): PlaceCatalogue {
  const entries = new Map<string, PlaceEntry>()
  const reach: Record<string, GeoPoint[]> = {}
  const ordered = [...chapters].sort(
    (a, b) => a.stories[0].defaultWindow.start - b.stories[0].defaultWindow.start,
  )

  for (const { stories, title, region } of ordered) {
    const chapterId = stories[0].id
    const base = chapterHref(chapterId)
    const seenPlaces = new Set<string>()
    const seenEvents = new Set<string>()
    const positions: GeoPoint[] = []
    reach[chapterId] = positions

    for (const story of stories) {
      for (const place of story.places) {
        if (seenPlaces.has(place.id)) continue
        seenPlaces.add(place.id)
        if (place.position !== null) positions.push(place.position)
        const id = shortId(place.id)
        let entry = entries.get(place.id)
        if (entry === undefined) {
          entry = { id, place, chapters: [], moments: [] }
          entries.set(place.id, entry)
        }
        entry.chapters.push({ id: chapterId, title, region, href: `${base}?place=${id}` })
      }
    }

    for (const story of stories) {
      for (const event of story.events) {
        if (seenEvents.has(event.id)) continue
        seenEvents.add(event.id)
        const id = shortId(event.id)
        const moment: PlaceMoment = {
          id,
          chapterId,
          title: event.title,
          note: event.note,
          tradition: event.tradition,
          dispute: event.dispute?.summary ?? null,
          start: event.occurrence.startYear,
          end: event.occurrence.endYear,
          href: `${base}?event=${id}`,
        }
        for (const placeId of event.occurrencePlaceIds) {
          if (seenPlaces.has(placeId)) entries.get(placeId)?.moments.push(moment)
        }
      }
    }
  }

  const places: PlaceEntry[] = []
  const singletons: PlaceCatalogue["singletons"] = []
  for (const entry of entries.values()) {
    if (entry.chapters.length === 1) {
      singletons.push({ id: entry.id, label: entry.place.label, href: entry.chapters[0].href })
    } else {
      entry.moments.sort((a, b) => a.start - b.start || a.end - b.end)
      places.push(entry)
    }
  }
  return { places, singletons, reach }
}

export function momentWindow(moments: readonly PlaceMoment[]): TimeWindow | null {
  if (moments.length === 0) return null
  return {
    start: Math.min(...moments.map((moment) => moment.start)),
    end: Math.max(...moments.map((moment) => moment.end)),
  }
}
