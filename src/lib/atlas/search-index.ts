import { chapterHref, chapterPresentation } from "./chapters"
import type { Chapter, GeoPoint } from "./domain"
import { windowLabel, yearLabel } from "./labels"
import { shortId } from "./query"
import { normalizeForSearch } from "./search"

/**
 * The site's one search index (RFD 5, "Search").
 *
 * One static file, built with the site from the published chapters, so search
 * needs no service and covers exactly what a reader can open: chapters, events,
 * places, people and states, and the story's captions. Every name form and
 * romanization the records publish is searchable (`韓非` and "Han Fei" find the
 * same person). Modern names are not: the contract keeps them out of the
 * historical name list, and a search alias is not a map label.
 *
 * The index is plain data and the search over it is a pure function, so the
 * home page, the chapter's search dialog and the tests all search the same way.
 */

export type SearchKind = "chapter" | "event" | "place" | "person" | "state" | "step"

export type SearchEntry = {
  readonly chapterId: string
  readonly kind: SearchKind
  /** The record id, or the chapter id for a chapter entry. */
  readonly id: string
  /** What the row shows first: a title or a name in its own script. */
  readonly title: string
  /** What the row shows beneath: the date, the place, a romanization. */
  readonly detail: string
  /** Every name form the record publishes. */
  readonly names: readonly string[]
  /** The rest of the record's own text a query may match. */
  readonly text: readonly string[]
  /** Where Enter goes: the chapter URL with the query that opens the entry. */
  readonly href: string
  readonly disputed: boolean
  /** The entry's year for ordering, or null for an undated entry. */
  readonly year: number | null
}

export type SearchChapter = {
  readonly id: string
  readonly name: string
  readonly window: string
  readonly href: string
  readonly start: number
  /** Where the chapter opens on the globe; the home page marks it there. */
  readonly home: GeoPoint
  /** The chapter's events in its window, for the home globe's marker. */
  readonly events: number
}

export type SearchIndex = {
  readonly version: 1
  readonly chapters: readonly SearchChapter[]
  readonly entries: readonly SearchEntry[]
}

/** A chapter's display name: its card's, or the one a caller supplies for a chapter without a card. */
type ChapterNamer = (chapter: Chapter) => string

function chapterName(chapter: Chapter): string {
  return chapterPresentation(chapter.id)?.name ?? chapter.title
}

/** The entries for one chapter, in the story's order where the story names them. */
export function chapterEntries(chapter: Chapter, name: ChapterNamer = chapterName): SearchEntry[] {
  const href = chapterHref(chapter.id)
  const places = new Map(chapter.places.map((place) => [place.id, place]))
  const actors = new Map(chapter.actors.map((actor) => [actor.id, actor]))
  const storyOrder = new Map(chapter.story.map((step, index) => [step.recordId, index]))
  const byStory = [...chapter.events].sort(
    (a, b) =>
      (storyOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (storyOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
      a.occurrence.startYear - b.occurrence.startYear,
  )

  const entries: SearchEntry[] = [
    {
      chapterId: chapter.id,
      kind: "chapter",
      id: chapter.id,
      title: name(chapter),
      detail: windowLabel(chapter.defaultWindow),
      names: [name(chapter), chapter.title],
      text: [chapter.summary],
      href,
      disputed: false,
      year: chapter.defaultWindow.start,
    },
  ]

  for (const event of byStory) {
    const place = event.placement.label

    entries.push({
      chapterId: chapter.id,
      kind: "event",
      id: event.id,
      title: event.title,
      detail: [
        windowLabel({ start: event.occurrence.startYear, end: event.occurrence.endYear }),
        place,
      ]
        .filter((part) => part !== null && part !== "")
        .join(" · "),
      names: [
        ...event.placeIds.flatMap((id) => {
          const named = places.get(id)
          return named === undefined ? [] : [named.label, ...named.aliases]
        }),
        ...event.participants.flatMap((participant) => {
          const actor = actors.get(participant.actorId)
          return actor === undefined ? [] : [actor.label, ...actor.aliases]
        }),
      ],
      text: [
        event.title,
        event.note,
        event.occurrence.sourceExpression ?? "",
        ...(event.dispute === null ? [] : [event.dispute.summary]),
      ],
      href: `${href}?event=${shortId(event.id)}`,
      disputed: event.dispute !== null,
      year: event.occurrence.startYear,
    })
  }

  for (const place of chapter.places) {
    const placed = byStory.find((event) => event.placeIds.includes(place.id))

    entries.push({
      chapterId: chapter.id,
      kind: "place",
      id: place.id,
      title: place.label,
      detail: [
        place.aliases.find((alias) => alias !== place.label && /\p{Script=Latin}/u.test(alias)),
        place.position === null ? "location not identified" : null,
      ]
        .filter((part): part is string => typeof part === "string")
        .join(" · "),
      names: [place.label, ...place.aliases],
      text: place.placementNote === null ? [] : [place.placementNote],
      href: `${href}?place=${shortId(place.id)}`,
      disputed: false,
      year: placed?.occurrence.startYear ?? null,
    })
  }

  for (const actor of chapter.actors) {
    // An actor has no card of its own yet, so a person or a state opens the
    // first event the story gives them, and the row says so.
    const first = byStory.find((event) =>
      event.participants.some((participant) => participant.actorId === actor.id),
    )
    const romanized = actor.aliases.find(
      (alias) => alias !== actor.label && /\p{Script=Latin}/u.test(alias),
    )

    entries.push({
      chapterId: chapter.id,
      kind: actor.types.includes("person") ? "person" : "state",
      id: actor.id,
      title: actor.label,
      detail: [romanized, first === undefined ? null : `first in “${first.title}”`]
        .filter((part): part is string => typeof part === "string")
        .join(" · "),
      names: [actor.label, ...actor.aliases],
      text: [],
      href: first === undefined ? href : `${href}?event=${shortId(first.id)}`,
      disputed: false,
      year: first?.occurrence.startYear ?? null,
    })
  }

  for (const [index, step] of chapter.story.entries()) {
    if (step.kind !== "summary") {
      continue
    }

    const relationship = chapter.relationships.find((candidate) => candidate.id === step.recordId)

    entries.push({
      chapterId: chapter.id,
      kind: "step",
      id: step.recordId,
      title: step.caption,
      detail: `Story step ${index + 1}${
        relationship?.validity
          ? ` · ${windowLabel({ start: relationship.validity.startYear, end: relationship.validity.endYear })}`
          : ""
      }`,
      names: [],
      text: [step.caption, relationship?.summary ?? ""],
      href: `${href}?step=${index + 1}`,
      disputed: false,
      year: relationship?.validity?.startYear ?? null,
    })
  }

  return entries
}

/**
 * `name` names a chapter that has no card in this build: a member's draft on the
 * published site (RFD 6) is named by its manifest, which only the server knows.
 */
export function buildSearchIndex(
  chapters: readonly Chapter[],
  name: ChapterNamer = chapterName,
): SearchIndex {
  const ordered = [...chapters].sort((a, b) => a.defaultWindow.start - b.defaultWindow.start)

  return {
    version: 1,
    chapters: ordered.map((chapter) => ({
      id: chapter.id,
      name: name(chapter),
      window: windowLabel(chapter.defaultWindow),
      href: chapterHref(chapter.id),
      start: chapter.defaultWindow.start,
      home: chapter.homeView,
      events: chapter.events.filter((event) => !event.coda).length,
    })),
    entries: ordered.flatMap((chapter) => chapterEntries(chapter, name)),
  }
}

export type SearchHit = {
  readonly entry: SearchEntry
  /** `name` when the query is one of the entry's names, `text` otherwise. */
  readonly match: "name" | "text"
  /** The published text that matched, for the row's "matched …" line. */
  readonly matchedText: string
}

export type SearchGroup = {
  readonly chapter: SearchChapter
  readonly hits: readonly SearchHit[]
}

/**
 * The comparison form for the index: the chapter search's folding, plus
 * spaces, hyphens and apostrophes dropped, so "todaiji" finds "Tōdai-ji" and
 * "penglaigong" finds "Penglai gong". Display text is never changed.
 */
function compact(text: string): string {
  return normalizeForSearch(text).replace(/[\s\-\u2010\u2011'\u2019·]/g, "")
}

const KIND_ORDER: Record<SearchKind, number> = {
  chapter: 0,
  place: 1,
  person: 2,
  state: 3,
  event: 4,
  step: 5,
}

/**
 * Searches the index. Results are grouped by chapter with the current chapter
 * first (then the rest oldest first, as the time ribbon orders them); within a
 * chapter, name matches come before text matches, then by kind and year. With
 * `scope` set, only that chapter is searched. An empty query matches nothing.
 */
export function searchIndex(
  index: SearchIndex,
  query: string,
  options: { readonly current?: string | null; readonly scope?: string | null } = {},
): SearchGroup[] {
  const needle = compact(query)

  if (needle === "") {
    return []
  }

  const hits = new Map<string, SearchHit[]>()

  for (const entry of index.entries) {
    if (options.scope && entry.chapterId !== options.scope) {
      continue
    }

    const name = [entry.title, ...entry.names].find((candidate) =>
      compact(candidate).includes(needle),
    )
    const text =
      name === undefined
        ? entry.text.find((candidate) => compact(candidate).includes(needle))
        : undefined

    if (name === undefined && text === undefined) {
      continue
    }

    const hit: SearchHit = {
      entry,
      match: name !== undefined ? "name" : "text",
      matchedText: name ?? text ?? "",
    }

    hits.set(entry.chapterId, [...(hits.get(entry.chapterId) ?? []), hit])
  }

  const chapters = [...index.chapters].sort(
    (a, b) =>
      Number(b.id === options.current) - Number(a.id === options.current) || a.start - b.start,
  )

  return chapters.flatMap((chapter) => {
    const found = hits.get(chapter.id)

    if (found === undefined) {
      return []
    }

    return [
      {
        chapter,
        hits: [...found].sort(
          (a, b) =>
            Number(a.match === "text") - Number(b.match === "text") ||
            KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
            (a.entry.year ?? 0) - (b.entry.year ?? 0),
        ),
      },
    ]
  })
}

/** A kind as a row names it. */
export function kindLabel(kind: SearchKind): string {
  return {
    chapter: "Chapter",
    event: "Event",
    place: "Place",
    person: "Person",
    state: "State",
    step: "Story",
  }[kind]
}

/** A year for a row, in the atlas's own year text. */
export function entryYear(entry: SearchEntry): string | null {
  return entry.year === null ? null : yearLabel(entry.year)
}
