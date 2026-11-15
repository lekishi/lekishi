import type { Chapter } from "$lib/atlas/domain"
import type { RegionKey } from "$lib/historical/regions"

/**
 * The model behind `/dev/timeline` (design review T1, picked by the owner on
 * 2026-11-13): every served chapter as a bar in its region's row, time running
 * left to right, so chapters of the same years stand in the same column.
 *
 * Everything here is plain data and pure functions. The server load reduces
 * each chapter to a few numbers and names, so the page's `__data.json` carries
 * kilobytes, not chapters; the component only measures text and draws.
 */

/** One chapter as the timeline draws and searches it. */
export type TimelineChapter = {
  readonly id: string
  readonly title: string
  /** The window the chapter opens on, in astronomical years (480 BCE is -479). */
  readonly window: { readonly start: number; readonly end: number }
  readonly region: RegionKey
  readonly events: number
  readonly places: number
  /** Steps in the story the chapter opens on. */
  readonly steps: number
  /** Every published name form of the chapter's places, for search. */
  readonly names: readonly string[]
}

/**
 * Two chapters that share a place or a person: the timeline's "threads". A
 * shared record is a link the content makes, never an inferred influence, so
 * the thread says what is shared and nothing more.
 */
export type Thread = {
  readonly a: string
  readonly b: string
  readonly places: readonly string[]
  readonly actors: readonly string[]
}

/** A chapter's own reach: what the threads are computed from. */
export type ChapterReach = {
  readonly chapter: TimelineChapter
  /** Place and actor ids every story of the chapter names, with their labels. */
  readonly places: ReadonlyMap<string, string>
  readonly actors: ReadonlyMap<string, string>
}

/**
 * Reduces a chapter's stories (the one it opens on first) to what the timeline
 * needs. The title and window are the manifest's: the short title the chapter
 * is listed under and the window it opens on.
 */
export function reachOf(
  stories: readonly Chapter[],
  manifest: {
    readonly title: string
    readonly region: RegionKey
    readonly window: { readonly start: number; readonly end: number }
  },
): ChapterReach {
  const first = stories[0]
  const places = new Map<string, string>()
  const actors = new Map<string, string>()
  const names = new Set<string>()

  for (const story of stories) {
    for (const place of story.places) {
      places.set(place.id, place.label)
      names.add(place.label)
      for (const alias of place.aliases) names.add(alias)
    }
    for (const actor of story.actors) actors.set(actor.id, actor.label)
  }

  return {
    chapter: {
      id: first.id,
      title: manifest.title,
      window: manifest.window,
      region: manifest.region,
      events: new Set(stories.flatMap((story) => story.events.map((event) => event.id))).size,
      places: places.size,
      steps: first.story.length,
      names: [...names],
    },
    places,
    actors,
  }
}

/** Every pair of chapters that names a common place or actor, in chapter order. */
export function threadsOf(reaches: readonly ChapterReach[]): Thread[] {
  const threads: Thread[] = []

  for (let i = 0; i < reaches.length; i++) {
    for (let j = i + 1; j < reaches.length; j++) {
      const [a, b] = [reaches[i], reaches[j]]
      const places = [...a.places].filter(([id]) => b.places.has(id)).map(([, label]) => label)
      const actors = [...a.actors].filter(([id]) => b.actors.has(id)).map(([, label]) => label)
      if (places.length + actors.length > 0) {
        threads.push({ a: a.chapter.id, b: b.chapter.id, places, actors })
      }
    }
  }

  return threads
}

/** The threads from one chapter, each with the chapter at its other end. */
export function threadsFrom(
  threads: readonly Thread[],
  id: string,
): { other: string; thread: Thread }[] {
  return threads
    .filter((thread) => thread.a === id || thread.b === id)
    .map((thread) => ({ other: thread.a === id ? thread.b : thread.a, thread }))
}

/** What a thread shares, as one short line: up to three places, then two people. */
export function sharedText(thread: Thread): string {
  const parts: string[] = []
  if (thread.places.length > 0) {
    const more = thread.places.length - 3
    parts.push(thread.places.slice(0, 3).join(", ") + (more > 0 ? ` +${more}` : ""))
  }
  if (thread.actors.length > 0) parts.push(thread.actors.slice(0, 2).join(", "))
  return parts.join(" · ")
}

/** Whether a chapter's window holds a year. */
export const alive = (chapter: TimelineChapter, year: number): boolean =>
  chapter.window.start <= year && chapter.window.end >= year

/**
 * Packs spans into sub-rows: each span takes the first sub-row whose last span
 * ends at least `gap` before it starts, so no two spans (a bar and the name
 * that runs past it) ever touch. Spans are taken in the order given; the
 * caller sorts them by start.
 */
export function pack(spans: readonly { left: number; right: number }[], gap = 10): number[] {
  const ends: number[] = []
  return spans.map(({ left, right }) => {
    let lane = ends.findIndex((end) => end <= left - gap)
    if (lane < 0) lane = ends.push(right) - 1
    else ends[lane] = right
    return lane
  })
}

/**
 * The year in `[from, to]` with the most chapters alive, the latest of a tie:
 * the page opens on a moment where regions line up, which is its point.
 */
export function busiestYear(
  chapters: readonly TimelineChapter[],
  from: number,
  to: number,
): number {
  let best = from
  let most = -1
  for (let year = from; year <= to; year++) {
    const count = chapters.filter((chapter) => alive(chapter, year)).length
    if (count >= most) {
      most = count
      best = year
    }
  }
  return best
}

/**
 * The nearest years before and after `year` where a chapter starts or ends,
 * clamped to the drawn range: stepping between them walks the record instead
 * of empty decades.
 */
export function nearestEdges(
  chapters: readonly TimelineChapter[],
  year: number,
  range: { readonly start: number; readonly end: number },
): { before: number | null; after: number | null } {
  const edges = [
    ...new Set(chapters.flatMap((c) => [Math.max(range.start, c.window.start), c.window.end])),
  ]
    .filter((edge) => edge <= range.end)
    .sort((a, b) => a - b)

  return {
    before: edges.filter((edge) => edge < year).at(-1) ?? null,
    after: edges.find((edge) => edge > year) ?? null,
  }
}

/**
 * Whether a search matches a chapter. A year (`753`, `480 BCE`) matches the
 * chapters alive in it; anything else matches the title, the given words (its
 * region and continent) or a name form of one of its places.
 */
export function matches(
  chapter: TimelineChapter,
  query: string,
  words: readonly string[],
): boolean {
  const q = query.trim().toLocaleLowerCase()
  if (q === "") return false
  const year = /^(\d{1,5})\s*(bce|bc|ce|ad)?$/.exec(q)
  if (year !== null) {
    const n = Number(year[1])
    return alive(chapter, year[2] === "bce" || year[2] === "bc" ? 1 - n : n)
  }
  return [chapter.title, ...words, ...chapter.names].some((text) =>
    text.toLocaleLowerCase().includes(q),
  )
}

/** How the chart maps years to pixels: `labelW` px of region column, then time. */
export type Scale = {
  readonly start: number
  readonly end: number
  readonly pxPerYear: number
  readonly labelW: number
}

/** The x position of a year, clamped to the start of the drawn range. */
export const xOf = (scale: Scale, year: number): number =>
  scale.labelW + (Math.max(scale.start, year) - scale.start) * scale.pxPerYear

/**
 * The pixels per year that fit `[from, to]` exactly into `width`, the scroll
 * position that shows it, and the range it then shows. Fitting and the view
 * read back from the scroll position use the same measure, so a view saved
 * in the address reopens as itself.
 */
export function fitView(
  range: { readonly start: number; readonly end: number },
  labelW: number,
  width: number,
  from: number,
  to: number,
): { pxPerYear: number; scrollLeft: number } {
  const end = Math.min(range.end, to)
  const start = Math.max(range.start, Math.min(from, end - 10))
  const pxPerYear = Math.max(0.12, (width - labelW) / (end - start))
  return { pxPerYear, scrollLeft: xOf({ ...range, pxPerYear, labelW }, start) - labelW }
}

/** The years a scroll position shows, within the drawn range. */
export function viewAt(
  scale: Scale,
  scrollLeft: number,
  width: number,
): { start: number; end: number } {
  const yearAt = (x: number) => Math.round((x - scale.labelW) / scale.pxPerYear + scale.start)
  return {
    start: Math.max(scale.start, yearAt(scrollLeft + scale.labelW)),
    end: Math.min(scale.end, yearAt(scrollLeft + width)),
  }
}

/**
 * Axis ticks on round historical years, at least `minGap` px apart. A tick
 * labelled "250 BCE" stands on the astronomical year -249, so it reads the same
 * as the guide at that point; there is no year 0, and the tick between the
 * eras is 1 CE.
 */
export function axisTicks(
  scale: Scale,
  label: (year: number) => string,
  minGap = 64,
): { year: number; label: string; major: boolean }[] {
  const step = [50, 100, 250, 500].find((s) => scale.pxPerYear * s >= minGap) ?? 1000
  const out: { year: number; label: string; major: boolean }[] = []
  for (let n = Math.ceil((scale.start - 1) / step) * step; n <= scale.end; n += step) {
    const year = n < 0 ? n + 1 : Math.max(1, n)
    if (year >= scale.start) {
      out.push({ year, label: year === 1 ? "1 CE" : label(year), major: n % (step * 2) === 0 })
    }
  }
  return out
}
