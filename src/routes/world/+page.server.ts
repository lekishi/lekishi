import type { Chapter } from "$lib/atlas/domain"
import type { ChapterReach, NamedPlaces } from "$lib/dev/world-turn"

// Editorial choices for the board. Only entries for served chapters are serialized.
const BANNERS: Readonly<Record<string, { glyph: string; icon: "ship" | "party" }>> = {
  "tang-mission-750-754": { glyph: "鑒", icon: "ship" },
  "du-huan-751-762": { glyph: "杜", icon: "party" },
  "stephen-ii-journey-753-754": { glyph: "S", icon: "party" },
}
const PREFERRED_HOME = "tang-mission-750-754"

/**
 * The public campaign board uses only the build's served catalog.
 *
 * The chapters load on the server, as the chapter route's do, so their data
 * reaches the browser as this page's `__data.json` and never as a client
 * chunk. The full chapters in that file are limited to the board's turns.
 */
export async function load(): Promise<{
  chapters: Chapter[]
  named: NamedPlaces
  reach: ChapterReach[]
  banners: Record<string, { glyph: string; icon: "ship" | "party" | "list" }>
  defaultHome: string | null
}> {
  const [{ SERVED_CHAPTERS }, { loadServedStories }, { TURN_ERA, namedPlaces }] = await Promise.all(
    [
      import("$lib/atlas/chapter-registry"),
      import("$lib/atlas/chapter-catalog"),
      import("$lib/dev/world-turn"),
    ],
  )
  const overlapping = SERVED_CHAPTERS.filter(
    ({ coverage: { defaultWindow } }) =>
      defaultWindow.start <= TURN_ERA.end && defaultWindow.end >= TURN_ERA.start,
  )

  // The globe draws each chapter's opening story; shared places count every
  // story, so a place one story names (the Tang chapter's 廣州) still links.
  const stories = await Promise.all(overlapping.map(({ id }) => loadServedStories(id)))

  // The board's reach needs every chapter's places, but only their positions
  // and windows: a few kilobytes, not the chapters themselves.
  const all = await Promise.all(SERVED_CHAPTERS.map(({ id }) => loadServedStories(id)))
  const reach = all.map((views) => {
    const seen = new Map<string, { lon: number; lat: number }>()
    for (const view of views) {
      for (const place of view.places) {
        if (place.position !== null) seen.set(place.id, place.position)
      }
    }
    return { id: views[0].id, window: views[0].defaultWindow, places: [...seen.values()] }
  })

  const chapters = stories.map((views) => views[0])
  return {
    chapters,
    named: namedPlaces(stories),
    reach,
    banners: Object.fromEntries(
      chapters.map(({ id, title }) => [
        id,
        BANNERS[id] ?? { glyph: title.at(0) ?? "?", icon: "list" },
      ]),
    ),
    defaultHome: chapters.some(({ id }) => id === PREFERRED_HOME) ? PREFERRED_HOME : null,
  }
}
