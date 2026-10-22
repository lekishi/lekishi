import type { Chapter } from "./domain"
import {
  findEvent,
  findPlace,
  includeInWindow,
  jumpToStoryStep,
  selectEvent,
  selectPlace,
  setPlayhead,
  setTimeWindow,
  type AtlasState,
} from "./state"

/**
 * The chapter URL's query: what a reader is looking at inside a chapter, so any
 * view can be linked and Back behaves (RFD 5, "The URL contract").
 *
 * The workspace stays the only owner of selection, window and playhead. These
 * functions are pure: `readChapterQuery` and `applyChapterQuery` turn a query
 * into a state once, when the page opens or Back returns to an entry, and
 * `chapterQuery` writes the state back out as one more projection of it. The
 * URL is never a second owner.
 *
 * The ids in the query are the records' own ids without their kind prefix
 * (`?event=akimeya-landfall-753`), so a link survives a retitle. One selection
 * at a time: `event` wins over `place`, and `place` over `step`.
 *
 * A chapter with several stories names the story with `?story=<key>`, left out
 * for the story the chapter opens on, so every address written before a
 * chapter had stories still means what it meant (rfd/0002/CHAPTER_STORIES.adoc).
 * `?step=` counts within the story named. A link to an event or a place without
 * a story opens the story the reader is in when it holds the record, otherwise
 * the first story that does.
 */

const EVENT_PREFIX = "lks:event:"
const PLACE_PREFIX = "lks:place:"

/** The query as written, before it is checked against the chapter. */
export type ChapterQuery = {
  /** The story's key, or null for the story the chapter opens on. */
  readonly story: string | null
  readonly event: string | null
  readonly place: string | null
  /** The story step, 1-based as a reader counts it. */
  readonly step: string | null
  readonly from: string | null
  readonly to: string | null
}

/** What a query opened, for the arrival plate. */
export type ArrivalTarget =
  | { readonly kind: "event"; readonly id: string }
  | { readonly kind: "place"; readonly id: string }
  | { readonly kind: "step"; readonly index: number }

export type Arrival = {
  readonly state: AtlasState
  /** What the query selected, or null when it named nothing (or nothing the chapter has). */
  readonly opened: ArrivalTarget | null
  /** True when a linked event lay outside the window and the window widened to include it. */
  readonly widened: boolean
  /** The parameter that named something the chapter does not have, with its value. */
  readonly notFound: {
    readonly kind: "story" | "event" | "place" | "step"
    readonly value: string
  } | null
}

export function readChapterQuery(params: URLSearchParams): ChapterQuery {
  const value = (key: string) => {
    const raw = params.get(key)?.trim()
    return raw === undefined || raw === "" ? null : raw
  }

  return {
    story: value("story"),
    event: value("event"),
    place: value("place"),
    step: value("step"),
    from: value("from"),
    to: value("to"),
  }
}

/** True when a query names nothing, so the chapter opens at its start. */
export function isEmptyQuery(query: ChapterQuery): boolean {
  return Object.values(query).every((value) => value === null)
}

function asYear(value: string | null): number | null {
  return value !== null && /^-?\d+$/.test(value) ? Number(value) : null
}

/** The record id a query value names, accepting the full id as well as the short form. */
function recordId(prefix: string, value: string): string {
  return value.startsWith(prefix) ? value : `${prefix}${value}`
}

/**
 * The story a query opens: the one `story` names; for an event or a place, the
 * story the reader is in (`active`) when it holds the record, otherwise the
 * first story that does; and otherwise the story the chapter opens on.
 * `missing` is the story key the chapter does not have, which opens the first.
 */
export function chooseStory(
  stories: readonly Chapter[],
  query: ChapterQuery,
  active: string | null = null,
): { readonly chapter: Chapter; readonly missing: string | null } {
  const first = stories[0]

  if (query.story !== null) {
    const named = stories.find((chapter) => chapter.storyKey === query.story)

    return named === undefined
      ? { chapter: first, missing: query.story }
      : { chapter: named, missing: null }
  }

  const holds = (chapter: Chapter) =>
    query.event !== null
      ? findEvent(chapter, recordId(EVENT_PREFIX, query.event)) !== null
      : query.place !== null && findPlace(chapter, recordId(PLACE_PREFIX, query.place)) !== null

  if (query.event === null && query.place === null) {
    return { chapter: first, missing: null }
  }

  const current = stories.find((chapter) => chapter.storyKey === active)

  return {
    chapter: current !== undefined && holds(current) ? current : (stories.find(holds) ?? first),
    missing: null,
  }
}

/**
 * Applies a query to a freshly opened chapter state.
 *
 * The window comes first, so a linked event is checked against the window the
 * link asked for. A linked event outside that window widens it (RFD 1's
 * explicit time change) and the arrival says so; a linked event inside it keeps
 * the window and puts the playhead at the event's start. A stale id opens the
 * chapter at its start and reports the parameter, so the page can say the item
 * was not found instead of failing silently.
 */
export function applyChapterQuery(
  state: AtlasState,
  chapter: Chapter,
  query: ChapterQuery,
): Arrival {
  const from = asYear(query.from)
  const to = asYear(query.to)
  const windowed =
    from !== null && to !== null ? setTimeWindow(state, chapter, { start: from, end: to }) : state

  if (query.event !== null) {
    const id = recordId(EVENT_PREFIX, query.event)
    const event = findEvent(chapter, id)

    if (event === null) {
      return {
        state,
        opened: null,
        widened: false,
        notFound: { kind: "event", value: query.event },
      }
    }

    const widenedState = includeInWindow(
      windowed,
      event.occurrence.startYear,
      event.occurrence.endYear,
    )
    const selected = selectEvent(widenedState, chapter, id)
    // A link is the reader asking to go there, so it frames the place even
    // though following stays off.
    const framed: AtlasState =
      event.placement.kind === "point"
        ? {
            ...selected,
            cameraFocus: { recordId: id, token: (state.cameraFocus?.token ?? 0) + 1 },
          }
        : selected

    return {
      state: setPlayhead(framed, chapter, event.occurrence.startYear),
      opened: { kind: "event", id },
      widened: widenedState !== windowed,
      notFound: null,
    }
  }

  if (query.place !== null) {
    const id = recordId(PLACE_PREFIX, query.place)

    if (findPlace(chapter, id) === null) {
      return {
        state,
        opened: null,
        widened: false,
        notFound: { kind: "place", value: query.place },
      }
    }

    return {
      state: selectPlace(windowed, chapter, id, true),
      opened: { kind: "place", id },
      widened: false,
      notFound: null,
    }
  }

  if (query.step !== null) {
    const step = /^\d+$/.test(query.step) ? Number(query.step) : 0
    const index = step - 1

    if (chapter.story[index] === undefined) {
      return { state, opened: null, widened: false, notFound: { kind: "step", value: query.step } }
    }

    const jumped = jumpToStoryStep(windowed, chapter, index)

    return {
      state: jumped,
      opened: { kind: "step", index },
      widened:
        jumped.timeWindow.start !== windowed.timeWindow.start ||
        jumped.timeWindow.end !== windowed.timeWindow.end,
      notFound: null,
    }
  }

  return { state: windowed, opened: null, widened: false, notFound: null }
}

/**
 * The query for a state: the story when it is not the one the chapter opens on,
 * the selection (event, else place, else the story step the reader is at) and
 * the window when it is not the story's own. The
 * playhead is not in the contract; a link opens at its selection's time.
 * Returns the search string with its `?`, or the empty string.
 */
export function chapterQuery(state: AtlasState, chapter: Chapter): string {
  const params = new URLSearchParams()

  if (chapter.storyKey !== chapter.stories[0]?.key) {
    params.set("story", chapter.storyKey)
  }

  if (state.selectedEventId !== null) {
    params.set("event", state.selectedEventId.replace(EVENT_PREFIX, ""))
  } else if (state.selectedPlaceId !== null) {
    params.set("place", state.selectedPlaceId.replace(PLACE_PREFIX, ""))
  } else if (state.storyStep !== null) {
    params.set("step", String(state.storyStep + 1))
  }

  const window = state.timeWindow

  if (window.start !== chapter.defaultWindow.start || window.end !== chapter.defaultWindow.end) {
    params.set("from", String(window.start))
    params.set("to", String(window.end))
  }

  const search = params.toString()

  return search === "" ? "" : `?${search}`
}

/** The short id a link carries for a record, without its kind prefix. */
export function shortId(id: string): string {
  return id.replace(EVENT_PREFIX, "").replace(PLACE_PREFIX, "")
}
