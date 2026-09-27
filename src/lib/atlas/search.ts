import type { Chapter, HistoricalEvent } from "./domain"
import { occurrenceLabel, placementLabel } from "./labels"

/**
 * Chapter search.
 *
 * Search is a pure function over the published chapter: it answers with the
 * events a query matches, and nothing it answers with is invented. The haystack
 * is the chapter's own text — an event's presentation title and published
 * summary, its date as written and as the atlas states it, its place, its
 * published dispute, and the published name forms of its places and participants.
 * A place or actor is therefore found by the name the record carries, in its own
 * script or in the romanization the record publishes; a modern equivalent is
 * deliberately not searchable, because the contract keeps it out of the
 * historical name list and forbids reading it as an identification.
 *
 * Search is not time-filtered. The event list shows the selected window, but
 * search has to reach the whole chapter: a reader who types a name must find the
 * event even when it sits outside the current window, and the atlas then keeps
 * the selection's details with the outside-window notice rather than hiding it.
 * That is the same rule the atlas applies to any selection the window excludes.
 */

/** How a query matched an event: by one of its names, or by its text. */
export type SearchMatchKind = "name" | "text"

export type SearchResult = {
  readonly eventId: string
  readonly match: SearchMatchKind
  /** The published text the query matched, for a result's own explanation. */
  readonly matchedText: string
}

/**
 * Case- and diacritic-insensitive comparison form.
 *
 * A romanization is written with its diacritics (`Ōtomo no Komaro`, `Tōdai-ji`),
 * and a reader typing on an ordinary keyboard should still find it, so the
 * comparison folds them away: NFD decomposition drops combining marks, and
 * whitespace runs collapse so a two-word name matches however it is spaced.
 * Folding is a comparison aid only — the label the atlas displays is always the
 * record's own form.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The name forms an event's places and participants publish, for name matching.
 *
 * Every place the record references is searched, not only the one the map shows:
 * a record that names four places named them all, and a reader looking for the
 * second ship's island should find the voyage that mentions it.
 */
function eventNames(event: HistoricalEvent, chapter: Chapter): string[] {
  const names: string[] = []

  for (const placeId of event.placeIds) {
    const published = chapter.places.find((candidate) => candidate.id === placeId)

    if (published !== undefined) {
      names.push(published.label, ...published.aliases)
    }
  }

  for (const participant of event.participants) {
    const actor = chapter.actors.find((candidate) => candidate.id === participant.actorId)

    if (actor !== undefined) {
      names.push(actor.label, ...actor.aliases)
    }
  }

  return names
}

/** The event's own published text, as one haystack. */
function eventText(event: HistoricalEvent, chapter: Chapter): string[] {
  const text = [
    event.title,
    event.note,
    placementLabel(event.placement),
    occurrenceLabel(event.occurrence),
    event.occurrence.sourceExpression ?? "",
    ...event.participants.map((participant) => participant.role),
  ]

  if (event.dispute !== null) {
    text.push(event.dispute.summary, ...event.dispute.accounts.map((account) => account.statement))
  }

  for (const citation of event.citations) {
    text.push(citation.locator)

    if (citation.quotedText !== null) {
      text.push(citation.quotedText)
    }
  }

  return [...text, ...eventNames(event, chapter)]
}

/**
 * The events a query matches, name matches first and then chronological order.
 *
 * A name match is what a reader usually means: the query is one of the chapter's
 * own name forms (a place or a participant), so those results come first, in the
 * same chronological order the event list uses. An empty query matches nothing —
 * search is a deliberate act, not a filter that hides the chapter by default.
 */
export function searchChapter(chapter: Chapter, query: string): SearchResult[] {
  const needle = normalizeForSearch(query)

  if (needle === "") {
    return []
  }

  const results: SearchResult[] = []

  for (const event of chapter.events) {
    const names = eventNames(event, chapter)
    const named = names.find((name) => normalizeForSearch(name).includes(needle))

    if (named !== undefined) {
      results.push({ eventId: event.id, match: "name", matchedText: named })
      continue
    }

    const matched = eventText(event, chapter).find((text) =>
      normalizeForSearch(text).includes(needle),
    )

    if (matched !== undefined) {
      results.push({ eventId: event.id, match: "text", matchedText: matched })
    }
  }

  const order = new Map(chapter.events.map((event, index) => [event.id, index]))
  const startYear = new Map(chapter.events.map((event) => [event.id, event.occurrence.startYear]))

  return results.sort((left, right) => {
    if (left.match !== right.match) {
      return left.match === "name" ? -1 : 1
    }

    return (
      (startYear.get(left.eventId) ?? 0) - (startYear.get(right.eventId) ?? 0) ||
      (order.get(left.eventId) ?? 0) - (order.get(right.eventId) ?? 0)
    )
  })
}
