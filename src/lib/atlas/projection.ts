import {
  currentPublished,
  publicationEvents,
  type CurrentPublished,
  type PublicationEvent,
} from "../historical/contract/publication-order"
import * as Timestamps from "../historical/contract/timestamps"
import { normalize } from "../historical/contract/time"
import {
  isNumber,
  isObject,
  listOf,
  objectOf,
  type JsonObject,
  type JsonValue,
} from "../historical/contract/types"
import { overlayDefinitions } from "./overlay-definitions"
import type {
  Actor,
  Chapter,
  ChapterPublication,
  DatePrecision,
  EventCitation,
  EventDispute,
  EventParticipant,
  EventPlacement,
  GeoPoint,
  GeometryPrecision,
  HistoricalEvent,
  Occurrence,
  Place,
  PointPlacement,
  Relationship,
  RelationshipEndpoint,
  Source,
  StoryOption,
  StoryStep,
  TimeWindow,
} from "./domain"

/**
 * The projection from reviewed contract documents into the atlas domain.
 *
 * This module is the explicit boundary between historical meaning and the
 * atlas: it reads published revisions through the contract's own publication
 * semantics and produces the renderer-independent `Chapter` the workspace and
 * the scene consume. It runs in Node (tests) and in the browser (the bundled
 * chapter), so it uses no Node API and no renderer object, and it never
 * validates by hash — `Publication.checkAll` stays the Node-side validator.
 *
 * What it refuses to do is as important as what it maps. It selects the newest
 * published revision per record, so a retained earlier revision can never
 * reach the atlas. It fails instead of inventing: an event with no published
 * place keeps its whole support interval and no coordinate, a place whose
 * geometry is `unknown` carries no position, a place named only as context does
 * not move a marker, route geometry is rejected rather than flattened into
 * points, and an occurrence the atlas cannot represent (undated, or open-ended)
 * is an error rather than a guessed year.
 *
 * The chapter's coverage model comes from the caller, not from this module: the
 * production boundary names the reviewed chapter's own primary window and the
 * comparison catalog names the fixture's, so adding a chapter does not add a
 * chapter branch here. Coda nodes outside that window stay outside it — the
 * projection labels them, it does not fold them in.
 */

export type ProjectionResult = { ok: true; chapter: Chapter } | { ok: false; errors: string[] }

/**
 * A chapter's own coverage model, supplied by the caller that owns the chapter
 * decision: the inclusive window the atlas opens in, in the same year numbers
 * the contract's normalized endpoints use (astronomical ordinals, so 230 BCE is
 * -229). A chapter with no coda nodes simply passes the window its events share.
 */
export type ChapterCoverage = {
  readonly defaultWindow: TimeWindow
  /**
   * The chapter's stories in the manifest's order, as the chapter index lists
   * them (rfd/0002/CHAPTER_STORIES.adoc). Without the list, the chapter
   * publishes exactly one story, which opens on `defaultWindow`.
   */
  readonly stories?: readonly StoryOption[]
}

const POINT_INTERPRETATIONS: ReadonlyMap<string, PointPlacement> = new Map([
  ["approximate_point", "approximate"],
  ["display_anchor", "display-anchor"],
])

const ROUTE_INTERPRETATIONS = ["attested_itinerary", "reconstructed_route", "schematic_link"]

const DATE_PRECISIONS: readonly DatePrecision[] = ["day", "month", "year", "decade", "century"]

const GEOMETRY_PRECISIONS: readonly GeometryPrecision[] = [
  "site",
  "locality",
  "region",
  "unspecified",
]

/** A place reference the record marks as context is named, not placed. */
const CONTEXT_ROLE = "context"

/**
 * The story labels a coda step in its caption; the projection cross-checks that
 * label against the published date, so a coda node cannot be moved into the
 * primary window (or a mission event out of it) without failing.
 */
const CODA_CAPTION_PREFIX = "Coda — "

/** The published revision of one record, with the content the atlas reads. */
type PublishedRevision = {
  readonly recordId: string
  readonly kind: string
  readonly revision: JsonObject
  readonly content: JsonObject
}

export type StoriesResult = { ok: true; chapters: Chapter[] } | { ok: false; errors: string[] }

/**
 * Projects one story of a chapter, by default the one it opens on.
 *
 * A chapter with several stories is read one story at a time: the view holds
 * that story's steps and the events, relationships, places, people and sources
 * it reaches, opens on the story's window, and checks its coda steps against
 * that window. Everything else the chapter publishes stays out of the view, so
 * the 743 coast never crowds the 753 landfall.
 */
export function projectChapter(
  name: string,
  documents: JsonValue[],
  sets: JsonValue[],
  coverage: ChapterCoverage,
  storyKey?: string,
): ProjectionResult {
  const projected = projectViews(name, documents, sets, coverage, storyKey ?? null)

  return projected.ok ? { ok: true, chapter: projected.chapters[0] } : projected
}

/** Projects every story of a chapter, in the manifest's order. */
export function projectStories(
  name: string,
  documents: JsonValue[],
  sets: JsonValue[],
  coverage: ChapterCoverage,
): StoriesResult {
  return projectViews(name, documents, sets, coverage, undefined)
}

const STORY_PREFIX = "lks:story:"

/**
 * The stories a chapter publishes, matched to the stories its index lists. A
 * chapter without a list publishes one story, named by its record and opening
 * on the chapter's window; its title is the chapter's.
 */
function storyOptions(
  stories: PublishedRevision[],
  coverage: ChapterCoverage,
  errors: string[],
): { option: StoryOption; record: PublishedRevision }[] {
  if (coverage.stories === undefined) {
    if (stories.length > 1) {
      errors.push(
        `the chapter publishes ${stories.length} stories, but its index lists none, so the atlas cannot order them`,
      )
      return []
    }

    return stories.map((record) => ({
      option: {
        key: record.recordId.slice(STORY_PREFIX.length),
        title: chapterTitle(stringOrUndefined(record.content["summary"]) ?? ""),
        window: coverage.defaultWindow,
      },
      record,
    }))
  }

  const byId = new Map(stories.map((record) => [record.recordId, record]))
  const listed = new Set(coverage.stories.map((option) => `${STORY_PREFIX}${option.key}`))

  for (const record of stories.filter((candidate) => !listed.has(candidate.recordId))) {
    errors.push(`${record.recordId} is published, but the chapter's index does not list it`)
  }

  return coverage.stories.flatMap((option) => {
    const record = byId.get(`${STORY_PREFIX}${option.key}`)

    if (record === undefined) {
      errors.push(
        `the chapter's index lists the story ${option.key}, which it publishes no revision of`,
      )
      return []
    }

    return [{ option, record }]
  })
}

/**
 * The records each story reaches: the records its steps name, and the places
 * and people those name, with the places the chapter's overlays anchor them to.
 * A record no story reaches belongs to the chapter's first story, where a record
 * the manifest only `include`s has always been shown, and where an event no
 * story captions fails as it always has.
 */
function storyReach(
  name: string,
  stories: { record: PublishedRevision }[],
  published: PublishedRevision[],
): Set<string>[] {
  const byId = new Map(published.map((entry) => [entry.recordId, entry]))
  const overlays = overlayDefinitions(name)
  const extend = (reached: Set<string>, ids: (string | undefined)[]) => {
    for (const id of ids) {
      const entry = id === undefined ? undefined : byId.get(id)

      if (entry === undefined) continue

      reached.add(entry.recordId)

      if (entry.kind === "event") {
        for (const reference of listOf(entry.content["places"]).map(objectOf)) {
          add(reached, stringOrUndefined(reference["place_id"]))
        }

        for (const participant of listOf(entry.content["participants"]).map(objectOf)) {
          add(reached, stringOrUndefined(participant["actor_id"]))
        }
      }

      if (entry.kind === "relationship") {
        for (const end of ["from", "to"] as const) {
          const endId = stringOrUndefined(entry.content[end])

          add(reached, endId)
          add(reached, endId === undefined ? undefined : overlays.actorAnchors[endId])
          add(reached, overlays.endAnchors[entry.recordId]?.[end])
        }
      }
    }

    return reached
  }
  const add = (reached: Set<string>, id: string | undefined) => {
    if (id !== undefined && byId.has(id)) reached.add(id)
  }
  const reach = stories.map(({ record }) =>
    extend(
      new Set(),
      listOf(record.content["steps"]).map((step) => stringOrUndefined(objectOf(step)["record_id"])),
    ),
  )
  const reachedByAny = new Set(reach.flatMap((reached) => [...reached]))

  extend(
    reach[0],
    published
      .filter((entry) => entry.kind !== "story" && !reachedByAny.has(entry.recordId))
      .map((entry) => entry.recordId),
  )

  return reach
}

function projectViews(
  name: string,
  documents: JsonValue[],
  sets: JsonValue[],
  coverage: ChapterCoverage,
  only: string | null | undefined,
): StoriesResult {
  const errors: string[] = []
  const records = documents.filter(
    (document): document is JsonObject => isObject(document) && document["document"] === "record",
  )
  const current = currentPublished(records, sets)
  const published = records
    .map((record) => publishedRevisionOf(record, current, errors))
    .filter((entry): entry is PublishedRevision => entry !== null)
  const reported = errors.length
  const stories = storyOptions(
    published.filter((entry) => entry.kind === "story"),
    coverage,
    errors,
  )

  if (stories.length === 0) {
    // Unless the stories are there and only cannot be ordered.
    if (errors.length === reported) {
      errors.push(
        "the chapter publishes no story record, so the atlas has no presentation order or captions",
      )
    }

    return { ok: false, errors }
  }

  const reach = storyReach(name, stories, published)
  const options = stories.map((story) => story.option)
  const openingSummary = stringOrUndefined(stories[0].record.content["summary"]) ?? ""
  const chosen = only === null ? 0 : options.findIndex((option) => option.key === only)
  const wanted = only === undefined ? stories.map((_, index) => index) : [chosen]
  const chapters: Chapter[] = []

  if (chosen === -1 && only !== undefined) {
    return { ok: false, errors: [`the chapter has no story ${only}`] }
  }

  for (const index of wanted) {
    const story = stories[index]
    const view = published.filter(
      (entry) => entry.recordId === story.record.recordId || reach[index].has(entry.recordId),
    )
    const projected = projectView(
      name,
      view,
      documents,
      sets,
      current,
      story.option,
      options,
      chapterTitle(openingSummary),
    )

    if (projected.ok) {
      chapters.push(projected.chapter)
    } else {
      errors.push(...projected.errors.filter((error) => !errors.includes(error)))
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, chapters }
}

function projectView(
  name: string,
  published: PublishedRevision[],
  documents: JsonValue[],
  sets: JsonValue[],
  current: Map<string, CurrentPublished>,
  option: StoryOption,
  options: readonly StoryOption[],
  chapterName: string,
): ProjectionResult {
  const errors: string[] = []
  const coverage: ChapterCoverage = { defaultWindow: option.window }
  const story = published.find((entry) => entry.kind === "story")
  const places = new Map<string, Place>()

  for (const entry of published.filter((candidate) => candidate.kind === "place")) {
    const place = projectPlace(entry, errors)

    if (place !== null) {
      places.set(place.id, place)
    }
  }

  const actors = new Map<string, Actor>()

  for (const entry of published.filter((candidate) => candidate.kind === "actor")) {
    const actor = projectActor(entry, errors)

    if (actor !== null) {
      actors.set(actor.id, actor)
    }
  }

  // The sources the atlas shows are the ones the published revisions actually
  // cite, not every source file the chapter tree happens to carry: a source that
  // no published revision cites is preparation, and showing it would let a draft
  // change the chapter's Sources surface without any decision covering it.
  const sources = projectSources(documents, citedSourceIds(published), errors)
  const sourceIds = new Set(sources.map((source) => source.id))

  const captions = story === undefined ? new Map<string, string>() : storyCaptions(story)
  const summary = story === undefined ? "" : (stringOrUndefined(story.content["summary"]) ?? "")

  if (story === undefined) {
    errors.push(
      "the chapter publishes no story record, so the atlas has no presentation order or captions",
    )
  } else if (summary === "") {
    errors.push(`${story.recordId} has no published summary, so the atlas has no chapter title`)
  }

  const events = published
    .filter((entry) => entry.kind === "event")
    .map((entry) => projectEvent(entry, places, actors, sourceIds, captions, coverage, errors))
    .filter((entry): entry is HistoricalEvent => entry !== null)

  const storySteps = story === undefined ? [] : projectStory(story, published, errors)

  const relationships = published
    .filter((entry) => entry.kind === "relationship")
    .map((entry) => projectRelationship(entry, places, actors, sourceIds, captions, errors))
    .filter((entry): entry is Relationship => entry !== null)
    .sort((a, b) => a.id.localeCompare(b.id))

  eventGeometryErrors(published, errors)

  if (events.length === 0) {
    errors.push("the chapter publishes no events, so the atlas would show an empty map")
  }

  const mapped = events.flatMap((event) =>
    event.placement.kind === "point" ? [event.placement.position] : [],
  )

  if (mapped.length === 0 && events.length > 0) {
    errors.push(
      "no published place reference resolves to a point, so the atlas has nowhere to open",
    )
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const publication = projectPublication(sets, current, story ?? null, errors)

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const eventIds = new Set(events.map((event) => event.id))
  const overlays = overlayDefinitions(name)

  return {
    ok: true,
    chapter: {
      id: name,
      title: chapterName,
      summary,
      defaultWindow: coverage.defaultWindow,
      storyKey: option.key,
      stories: options,
      homeView: boundingBoxCenter(mapped),
      places: [...places.values()],
      actors: [...actors.values()],
      events,
      relationships,
      sources,
      story: storySteps,
      publication,
      // The overlays this story can draw: a journey with two of its stops in
      // the story, and a diorama of one of its places.
      overlays: {
        ...overlays,
        journeys: overlays.journeys.filter(
          (journey) => journey.stops.filter((stop) => eventIds.has(stop.eventId)).length >= 2,
        ),
        dioramas: overlays.dioramas.filter((diorama) => places.has(diorama.placeId)),
      },
    },
  }
}

/**
 * The chapter's display title. The contract has no chapter-title document; the
 * published story summary names the mission, so the title is that sentence's
 * leading clause and the full sentence stays the chapter summary. Nothing is
 * composed and nothing is invented.
 */
function chapterTitle(summary: string): string {
  const [leading = ""] = summary.split(",")

  return leading.trim()
}

/** The published revision of a record, checked against the contract's own publication mirror. */
function publishedRevisionOf(
  record: JsonObject,
  current: Map<string, CurrentPublished>,
  errors: string[],
): PublishedRevision | null {
  const recordId = String(record["record_id"])
  const published = current.get(recordId)
  const mirrorValue = record["publication"]

  if (published === undefined) {
    if (!isNil(mirrorValue)) {
      errors.push(`${recordId} carries a publication mirror that no publication set publishes`)
    }

    return null
  }

  if (isNil(mirrorValue)) {
    errors.push(`${recordId} is published but carries no publication mirror`)
    return null
  }

  const mirror = objectOf(mirrorValue)

  if (
    mirror["published_revision_id"] !== published.revision_id ||
    mirror["published_revision_hash"] !== published.revision_hash ||
    mirror["set_id"] !== published.set_id ||
    mirror["published_at"] !== published.published_at
  ) {
    errors.push(`${recordId} publication mirror disagrees with the newest set that publishes it`)
    return null
  }

  const revision = listOf(record["revisions"])
    .map(objectOf)
    .find((candidate) => candidate["revision_id"] === published.revision_id)

  if (revision === undefined) {
    errors.push(
      `${recordId} is published at ${String(published.revision_id)}, which is not one of its revisions`,
    )
    return null
  }

  return {
    recordId,
    kind: String(record["kind"]),
    revision,
    content: objectOf(revision["content"]),
  }
}

function projectPlace(entry: PublishedRevision, errors: string[]): Place | null {
  const names = listOf(entry.content["names"]).map(objectOf)
  const primary = names.find((name) => name["role"] === "primary")
  const label = primary === undefined ? undefined : stringOrUndefined(primary["form"])

  if (label === undefined) {
    errors.push(`${entry.recordId} has no primary name form, so the atlas has nothing to label`)
    return null
  }

  const geometry = listOf(entry.content["geometry"]).map(objectOf)
  let point: {
    placement: PointPlacement
    precision: GeometryPrecision
    position: GeoPoint
    note: string | null
  } | null = null
  let assertsNoPosition = false
  let unknownNote: string | null = null

  for (const candidate of geometry) {
    const interpretation = stringOrUndefined(candidate["interpretation"]) ?? ""

    if (interpretation === "unknown") {
      assertsNoPosition = true
      unknownNote ??= stringOrUndefined(candidate["notes"]) ?? null
      continue
    }

    const placement = POINT_INTERPRETATIONS.get(interpretation)

    if (placement === undefined) {
      errors.push(
        ROUTE_INTERPRETATIONS.includes(interpretation)
          ? `${entry.recordId} carries ${interpretation} route geometry; the atlas draws documented points and never flattens a route into one`
          : `${entry.recordId} uses ${interpretation || "(missing)"} geometry, which the atlas domain cannot draw yet`,
      )
      continue
    }

    const precision = asGeometryPrecision(candidate["precision"])

    if (precision === null) {
      errors.push(
        `${entry.recordId} places ${interpretation} geometry with the precision ${String(candidate["precision"])}, which the atlas cannot state`,
      )
      continue
    }

    // A display anchor is a label position, not a claim: if it carries a stated
    // precision, the atlas would show an asserted coordinate the review never
    // approved.
    if (placement === "display-anchor" && precision !== "unspecified") {
      errors.push(
        `${entry.recordId} gives its display anchor the precision ${precision}; a display anchor asserts no placement precision`,
      )
      continue
    }

    if (placement === "approximate" && precision === "unspecified") {
      errors.push(`${entry.recordId} places an approximate point without stating its precision`)
      continue
    }

    const position = pointCoordinates(candidate["geojson"])

    if (position === null) {
      errors.push(
        `${entry.recordId} declares ${interpretation} geometry without a Point coordinate`,
      )
      continue
    }

    point ??= {
      placement,
      precision,
      position,
      note: stringOrUndefined(candidate["notes"]) ?? null,
    }
  }

  const aliases = nameAliases(entry.content)
  const { romanization, lang } = primaryNameFacts(primary)

  if (point !== null) {
    return {
      id: entry.recordId,
      label,
      aliases,
      romanization,
      lang,
      placement: point.placement,
      precision: point.precision,
      position: point.position,
      placementNote: point.note,
    }
  }

  if (!assertsNoPosition) {
    errors.push(
      `${entry.recordId} carries no geometry entry, so the atlas cannot tell an unlocated place from an unpublished one`,
    )
  }

  return {
    id: entry.recordId,
    label,
    aliases,
    romanization,
    lang,
    placement: "unknown",
    precision: "unspecified",
    position: null,
    placementNote: unknownNote,
  }
}

/**
 * Every published name form and reading aid, for search.
 *
 * The aliases are the record's own name list: the local-script forms, their
 * romanizations, and their translations. A modern equivalent is deliberately
 * excluded — the contract keeps it out of the historical name list and forbids
 * reading it as an identification, so it must not become the string that finds a
 * historical place either.
 */
function nameAliases(content: JsonObject): string[] {
  const aliases = listOf(content["names"]).flatMap((nameValue) => {
    const name = objectOf(nameValue)
    const values: string[] = []
    const form = stringOrUndefined(name["form"])
    const romanization = stringOrUndefined(objectOf(name["romanization"])["value"])
    const translation = stringOrUndefined(objectOf(name["translation"])["value"])

    if (form !== undefined) {
      values.push(form)
    }

    if (romanization !== undefined) {
      values.push(romanization)
    }

    if (translation !== undefined) {
      values.push(translation)
    }

    return values
  })

  return [...new Set(aliases.map((alias) => alias.trim()).filter((alias) => alias !== ""))]
}

/** A published actor: its primary name form, its aliases, and its types. */
function projectActor(entry: PublishedRevision, errors: string[]): Actor | null {
  const names = listOf(entry.content["names"]).map(objectOf)
  const primary = names.find((name) => name["role"] === "primary")
  const label = primary === undefined ? undefined : stringOrUndefined(primary["form"])

  if (label === undefined) {
    errors.push(`${entry.recordId} has no primary name form, so the atlas cannot name it`)
    return null
  }

  const types = listOf(entry.content["actor_types"])
    .map((value) => stringOrUndefined(value) ?? "")
    .filter((value) => value !== "")

  return {
    id: entry.recordId,
    label,
    aliases: nameAliases(entry.content),
    ...primaryNameFacts(primary),
    types,
  }
}

/** The primary name's romanization and language tag, as the record publishes them. */
function primaryNameFacts(primary: JsonObject | undefined): {
  romanization: string | null
  lang: string | null
} {
  return {
    romanization:
      primary === undefined
        ? null
        : (stringOrUndefined(objectOf(primary["romanization"])["value"]) ?? null),
    lang: primary === undefined ? null : (stringOrUndefined(primary["language"]) ?? null),
  }
}

/**
 * Every source id the published revisions cite.
 *
 * The atlas shows a source because a published revision rests on it, so this set
 * is what the Sources surface is built from. A source document that no published
 * revision cites is preparation content: it stays in the tree and out of the
 * chapter, exactly as an unpublished revision does.
 */
function citedSourceIds(published: PublishedRevision[]): Set<string> {
  const cited = new Set<string>()

  for (const entry of published) {
    for (const claimValue of listOf(entry.revision["claims"])) {
      for (const citationValue of listOf(objectOf(claimValue)["citations"])) {
        const sourceId = stringOrUndefined(objectOf(citationValue)["source_id"])

        if (sourceId !== undefined) {
          cited.add(sourceId)
        }
      }
    }
  }

  return cited
}

/**
 * The chapter's cited sources, in the tree's own order.
 *
 * A source is shown because a published revision rests on it: the set of cited
 * ids comes from the published revisions, so a source document that nothing
 * published cites cannot change the chapter's Sources surface on its own. The
 * atlas states the record's own attribution and licence id, and links the first
 * URL identifier the record carries. It never restates reuse terms: a source
 * whose terms are not recorded would fail the contract's own validation before
 * the projection ran.
 */
function projectSources(
  documents: JsonValue[],
  cited: ReadonlySet<string>,
  errors: string[],
): Source[] {
  return documents
    .filter(
      (document): document is JsonObject => isObject(document) && document["document"] === "source",
    )
    .flatMap((document) => {
      const id = stringOrUndefined(document["source_id"])
      const title = stringOrUndefined(document["title"])

      if (id === undefined || title === undefined) {
        errors.push(
          `${String(id ?? "(unnamed source)")} is published without an id or a title, so the atlas cannot cite it`,
        )
        return []
      }

      // A source the published revisions do not cite is preparation: it stays in
      // the tree and out of the chapter, exactly as an unpublished revision does.
      if (!cited.has(id)) {
        return []
      }

      const license = objectOf(document["license"])
      const url = listOf(document["identifiers"])
        .map(objectOf)
        .find((identifier) => identifier["system"] === "url")

      return [
        {
          id,
          title,
          kind: stringOrUndefined(document["kind"]) ?? "",
          edition: stringOrUndefined(document["edition"]) ?? null,
          attribution: stringOrUndefined(license["attribution_text"]) ?? "",
          licenseId: stringOrUndefined(license["license_id"]) ?? null,
          url: stringOrUndefined(url?.["value"]) ?? null,
        },
      ]
    })
}

/**
 * The chapter's published story steps, in the story's own order.
 *
 * A step whose record is a published event can be opened; a step whose record is
 * published but has no event surface (a relationship, for example) is kept as a
 * summary step, because the atlas must not present a different order or drop a
 * step the chapter publishes. A step that names a record the chapter does not
 * publish is an error rather than a silently missing row.
 */
function projectStory(
  story: PublishedRevision,
  published: PublishedRevision[],
  errors: string[],
): StoryStep[] {
  const kinds = new Map(published.map((entry) => [entry.recordId, entry.kind]))

  return listOf(story.content["steps"]).flatMap((stepValue) => {
    const step = objectOf(stepValue)
    const recordId = stringOrUndefined(step["record_id"])
    const caption = stringOrUndefined(step["caption"]) ?? ""

    if (recordId === undefined) {
      errors.push(`${story.recordId} has a story step without a record id`)
      return []
    }

    const kind = kinds.get(recordId)

    if (kind === undefined) {
      errors.push(
        `${story.recordId} steps through ${recordId}, which the chapter publishes no revision of`,
      )
      return []
    }

    if (caption === "") {
      errors.push(`${recordId} is a story step without a caption, so the atlas cannot label it`)
      return []
    }

    return [{ recordId, caption, kind: kind === "event" ? "event" : "summary" }]
  })
}

function projectEvent(
  entry: PublishedRevision,
  places: Map<string, Place>,
  actors: Map<string, Actor>,
  sourceIds: ReadonlySet<string>,
  captions: Map<string, string>,
  coverage: ChapterCoverage,
  errors: string[],
): HistoricalEvent | null {
  const title = captions.get(entry.recordId)

  if (title === undefined || title === "") {
    errors.push(
      `${entry.recordId} has no story caption, and the atlas does not invent event titles`,
    )
    return null
  }

  const note = stringOrUndefined(entry.content["summary"])

  if (note === undefined) {
    errors.push(`${entry.recordId} has no published summary for the details surface`)
    return null
  }

  const occurrence = projectOccurrence(entry.recordId, entry.content["time"], "event", errors)

  if (occurrence === null) {
    return null
  }

  // The coda distinction is the chapter's own presentation label, cross-checked
  // against the caller's primary window: a coda node that moved inside the
  // window, or a mission event that moved out of it, fails here instead of
  // being folded in.
  const labelledCoda = title.startsWith(CODA_CAPTION_PREFIX)
  const outsidePrimaryWindow =
    occurrence.startYear > coverage.defaultWindow.end ||
    occurrence.endYear < coverage.defaultWindow.start

  if (labelledCoda && !outsidePrimaryWindow) {
    errors.push(
      `${entry.recordId} is presented as a coda node but its published date falls inside the primary ${coverage.defaultWindow.start}–${coverage.defaultWindow.end} window`,
    )
    return null
  }

  if (!labelledCoda && outsidePrimaryWindow) {
    errors.push(
      `${entry.recordId} falls outside the primary ${coverage.defaultWindow.start}–${coverage.defaultWindow.end} window and is not presented as a coda node`,
    )
    return null
  }

  const eventPlaces = projectEventPlaces(entry, places, errors)

  return {
    id: entry.recordId,
    title,
    placement: eventPlaces.placement,
    occurrence,
    note,
    dispute: projectDispute(entry, errors),
    coda: labelledCoda,
    placeIds: eventPlaces.placeIds,
    participants: projectParticipants(entry, actors, errors),
    citations: projectCitations(entry, sourceIds, errors),
  }
}

/**
 * The event's published participants.
 *
 * The role is the record's own role value, kept so a surface can say how the
 * actor took part; an actor the chapter does not publish is an error rather than
 * an unnamed participant.
 */
function projectParticipants(
  entry: PublishedRevision,
  actors: Map<string, Actor>,
  errors: string[],
): EventParticipant[] {
  return listOf(entry.content["participants"]).flatMap((referenceValue) => {
    const reference = objectOf(referenceValue)
    const actorId = stringOrUndefined(reference["actor_id"])

    if (actorId === undefined) {
      errors.push(`${entry.recordId} has a participant without an actor_id`)
      return []
    }

    if (!actors.has(actorId)) {
      errors.push(`${entry.recordId} names ${actorId}, which is not a published actor`)
      return []
    }

    return [{ actorId, role: stringOrUndefined(reference["role"]) ?? "" }]
  })
}

/**
 * The event's published citations, deduplicated by source and locator.
 *
 * These are the claims' own citations, so the details surface can show a reader
 * where a statement comes from without rephrasing it. A citation to a source the
 * chapter does not publish is an error: the atlas must not show a locator that
 * cannot be followed to a source record. Quoted text is carried as published —
 * the contract's own validation already refuses a quotation whose source terms do
 * not permit quoting.
 */
function projectCitations(
  entry: PublishedRevision,
  sourceIds: ReadonlySet<string>,
  errors: string[],
): EventCitation[] {
  const citations: EventCitation[] = []
  const seen = new Set<string>()

  for (const claimValue of listOf(entry.revision["claims"])) {
    for (const citationValue of listOf(objectOf(claimValue)["citations"])) {
      const citation = objectOf(citationValue)
      const sourceId = stringOrUndefined(citation["source_id"])
      const locator = objectOf(citation["locator"])
      const locatorValue = stringOrUndefined(locator["value"])

      if (sourceId === undefined || locatorValue === undefined) {
        errors.push(`${entry.recordId} has a citation without a source or a locator value`)
        continue
      }

      if (!sourceIds.has(sourceId)) {
        errors.push(`${entry.recordId} cites ${sourceId}, which the chapter does not publish`)
        continue
      }

      const locatorKind = stringOrUndefined(locator["kind"]) ?? ""
      const quotedText = stringOrUndefined(citation["quoted_text"]) ?? null
      const key = `${sourceId}\u0000${locatorKind}\u0000${locatorValue}\u0000${quotedText ?? ""}`

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      citations.push({ sourceId, locatorKind, locator: locatorValue, quotedText })
    }
  }

  return citations
}

/**
 * The record's published dispute, or null when it is undisputed.
 *
 * The atlas must not smooth a disagreement into one account, so a record marked
 * `disputed` carries its summary and the claims that challenge the main account
 * into the details surface. A disputed record without a summary is an error
 * rather than an empty panel: the contract already requires a challenging claim,
 * and the summary is what the reader is shown.
 */
function projectDispute(entry: PublishedRevision, errors: string[]): EventDispute | null {
  const dispute = entry.revision["dispute"]
  const challenging = listOf(entry.revision["claims"])
    .map(objectOf)
    .filter((claim) => claim["role"] === "conflicting" || claim["role"] === "alternative")

  if (!isObject(dispute) || dispute["status"] !== "disputed") {
    // The contract's validator refuses this shape too; the projection refuses it
    // as well so the atlas can never smooth challenging accounts into one
    // undisputed reading.
    if (challenging.length > 0) {
      errors.push(
        `${entry.recordId} carries ${challenging.length} conflicting or alternative claims without a disputed status, and the atlas will not present them as undisputed`,
      )
    }

    return null
  }

  const summary = stringOrUndefined(dispute["summary"])

  if (summary === undefined || summary === "") {
    errors.push(`${entry.recordId} is disputed but carries no dispute summary to show`)
    return null
  }

  const accounts = challenging.flatMap((claim) => {
    const statement = stringOrUndefined(claim["statement"])

    if (statement === undefined || statement === "") {
      return []
    }

    const locators = listOf(claim["citations"])
      .map(objectOf)
      .map((citation) => stringOrUndefined(objectOf(citation["locator"])["value"]) ?? "")
      .filter((value) => value !== "")

    return [{ statement, locators }]
  })

  return { status: "disputed", summary, accounts }
}

/**
 * A published time value as the atlas's closed year range. `what` names the
 * record kind in the error, because an undated event and an undated
 * relationship are refused for the same reason.
 */
function projectOccurrence(
  recordId: string,
  value: JsonValue | undefined,
  what: "event" | "relationship",
  errors: string[],
): Occurrence | null {
  const result = normalize(value)

  if (!result.ok) {
    errors.push(`${recordId} has an invalid time: ${result.errors.join(", ")}`)
    return null
  }

  const time = result.value

  if (time.mode === "undated") {
    errors.push(
      `${recordId} is undated; the atlas cannot yet keep an undated ${what} discoverable outside the time window, and it will not guess a year`,
    )
    return null
  }

  if (time.bounds !== "two_sided" || time.start === null || time.end === null) {
    errors.push(
      `${recordId} has an open-ended occurrence (${String(time.bounds)}); the atlas window is closed at both ends and will not invent the missing one`,
    )
    return null
  }

  const precision = asPrecision(time.precision)

  if (precision === null) {
    errors.push(`${recordId} publishes the date precision ${String(time.precision)}`)
    return null
  }

  return {
    startYear: time.start.astro,
    endYear: time.end.astro,
    precision,
    mode: time.mode,
    sourceExpression: time.sourceExpression,
  }
}

/**
 * A published relationship, with both ends resolved against the chapter's own
 * actors and places.
 *
 * The validity is optional in the contract: a relationship the record does not
 * date (the Qin chapter's conflict between the two states, for one) keeps a
 * null validity instead of borrowing a span from its events, and a surface says
 * it is undated. An end the chapter does not publish is an error rather than an
 * arc to nowhere.
 */
function projectRelationship(
  entry: PublishedRevision,
  places: Map<string, Place>,
  actors: Map<string, Actor>,
  sourceIds: ReadonlySet<string>,
  captions: Map<string, string>,
  errors: string[],
): Relationship | null {
  const summary = stringOrUndefined(entry.content["summary"])
  const types = listOf(entry.content["relationship_types"]).filter(
    (type): type is string => typeof type === "string",
  )
  const from = relationshipEndpoint(entry, "from", places, actors, errors)
  const to = relationshipEndpoint(entry, "to", places, actors, errors)

  if (summary === undefined || types.length === 0) {
    errors.push(`${entry.recordId} has no published summary or relationship type`)
    return null
  }

  const validityValue = entry.content["validity"]
  const validity = isNil(validityValue)
    ? null
    : projectOccurrence(entry.recordId, validityValue, "relationship", errors)

  if (from === null || to === null || (!isNil(validityValue) && validity === null)) {
    return null
  }

  return {
    id: entry.recordId,
    caption: captions.get(entry.recordId) || null,
    summary,
    types,
    from,
    to,
    directionality: stringOrUndefined(entry.content["directionality"]) ?? "directed",
    causal: entry.content["causality"] === "asserted",
    validity,
    citations: projectCitations(entry, sourceIds, errors),
  }
}

function relationshipEndpoint(
  entry: PublishedRevision,
  key: "from" | "to",
  places: Map<string, Place>,
  actors: Map<string, Actor>,
  errors: string[],
): RelationshipEndpoint | null {
  const id = stringOrUndefined(entry.content[key])

  if (id !== undefined && actors.has(id)) {
    return { kind: "actor", id }
  }

  if (id !== undefined && places.has(id)) {
    return { kind: "place", id }
  }

  errors.push(`${entry.recordId} relates ${String(id)}, which is not a published actor or place`)
  return null
}

/**
 * Event geometry the atlas must not quietly drop.
 *
 * The chapter's coverage model asserts no route, and the atlas domain has no
 * line or area: a published route is an error here rather than something the
 * projection flattens into points or silently ignores. An event's own point
 * geometry is reported for the same reason — the atlas places events by their
 * published place references, so that point would otherwise be dropped.
 */
function eventGeometryErrors(published: PublishedRevision[], errors: string[]): void {
  for (const entry of published.filter((candidate) => candidate.kind === "event")) {
    for (const candidate of listOf(entry.content["geometry"]).map(objectOf)) {
      const interpretation = stringOrUndefined(candidate["interpretation"]) ?? ""
      const type = stringOrUndefined(objectOf(candidate["geojson"])["type"])

      if (ROUTE_INTERPRETATIONS.includes(interpretation)) {
        errors.push(
          `${entry.recordId} carries ${interpretation} route geometry; the atlas draws documented points and never flattens a route into one`,
        )
        continue
      }

      if (type === undefined) {
        continue
      }

      errors.push(
        type === "Point"
          ? `${entry.recordId} carries its own Point geometry; the atlas places events by their published place references, so this point would be dropped`
          : `${entry.recordId} carries ${type} geometry; the atlas draws documented points, not shapes or routes`,
      )
    }
  }
}

/**
 * Which places the event's published record references, and which one the map
 * shows.
 *
 * References are read in the record's own order and resolved once, so the
 * placement and the list of referenced places cannot disagree about which
 * references are valid: a reference the record marks as context never moves a
 * marker — naming an intended destination is not asserting a landfall there —
 * while every valid reference stays searchable, because a record that names four
 * places named them all.
 */
function projectEventPlaces(
  entry: PublishedRevision,
  places: Map<string, Place>,
  errors: string[],
): { placement: EventPlacement; placeIds: string[] } {
  const resolved = listOf(entry.content["places"]).flatMap((referenceValue) => {
    const reference = objectOf(referenceValue)
    const placeId = stringOrUndefined(reference["place_id"])

    if (placeId === undefined) {
      errors.push(`${entry.recordId} has a place reference without a place_id`)
      return []
    }

    const place = places.get(placeId)

    if (place === undefined) {
      errors.push(`${entry.recordId} references ${placeId}, which is not a published place`)
      return []
    }

    return [{ place, role: stringOrUndefined(reference["role"]) ?? "" }]
  })

  const placed = resolved.flatMap((candidate) =>
    candidate.role !== CONTEXT_ROLE && candidate.place.position !== null
      ? [{ place: candidate.place, position: candidate.place.position }]
      : [],
  )[0]

  // A record may reference the same place twice (the schema does not forbid it);
  // the domain carries each place once, in the order it was first referenced.
  const placeIds = [...new Set(resolved.map((candidate) => candidate.place.id))]

  if (placed !== undefined) {
    return {
      placement: {
        kind: "point",
        placeId: placed.place.id,
        label: placed.place.label,
        basis: placed.place.placement,
        precision: placed.place.precision,
        position: placed.position,
      },
      placeIds,
    }
  }

  const [first] = resolved

  if (first === undefined) {
    return { placement: { kind: "none", placeId: null, label: null, reason: "no-place" }, placeIds }
  }

  return {
    placement: {
      kind: "none",
      placeId: first.place.id,
      label: first.place.label,
      reason: resolved.some((candidate) => candidate.place.position !== null)
        ? "context-only"
        : "no-position",
    },
    placeIds,
  }
}

function projectPublication(
  sets: JsonValue[],
  current: Map<string, CurrentPublished>,
  story: PublishedRevision | null,
  errors: string[],
): ChapterPublication {
  const shown = publicationEvents(sets).filter(
    (event) => current.get(event.recordId)?.revision_id === event.revisionId,
  )
  const ordered = [...shown].sort(newestFirst)
  const newest = ordered[0]
  const setIds = [...new Set(ordered.map((event) => String(event.setId)))]
  const coverageNote =
    story === null ? undefined : stringOrUndefined(story.content["coverage_note"])
  const newestSet = sets.map(objectOf).find((set) => set["set_id"] === newest?.setId)

  if (newest === undefined || newestSet === undefined) {
    errors.push("no publication set publishes a revision the atlas shows")
  }

  if (story !== null && coverageNote === undefined) {
    errors.push(
      `${story.recordId} has no coverage note, which the atlas must state with the chapter`,
    )
  }

  return {
    setIds,
    publishedAt: String(newest?.publishedAt ?? ""),
    independence: String(newest?.independence ?? ""),
    reviewer: String(newest?.reviewer ?? ""),
    coverageNote: coverageNote ?? "",
    reviewNotes: getIn(newestSet, ["review", "notes"]) ?? "",
  }
}

/**
 * Newest first. `Timestamps.compare` reports `unknown` for a value that is not a
 * real UTC instant, and such a value must not win an ordering comparison.
 */
function newestFirst(a: PublicationEvent, b: PublicationEvent): number {
  const order = Timestamps.compare(a.publishedAt, b.publishedAt)

  return order === "gt" ? -1 : order === "lt" ? 1 : 0
}

function storyCaptions(story: PublishedRevision): Map<string, string> {
  return new Map(
    listOf(story.content["steps"]).map((stepValue) => {
      const step = objectOf(stepValue)

      return [String(step["record_id"]), String(step["caption"] ?? "")]
    }),
  )
}

/** The centre of the placed points, so the atlas opens on the documented area. */
function boundingBoxCenter(points: GeoPoint[]): GeoPoint {
  const lons = points.map((point) => point.lon)
  const lats = points.map((point) => point.lat)

  return {
    lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
  }
}

/** A `Point` position, or null for anything else: the atlas maps points, not shapes. */
function pointCoordinates(value: JsonValue | undefined): GeoPoint | null {
  const geojson = objectOf(value)

  if (geojson["type"] !== "Point") {
    return null
  }

  const coordinates = listOf(geojson["coordinates"])
  const [lon, lat] = coordinates

  if (!isNumber(lon) || !isNumber(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    return null
  }

  return { lon, lat }
}

function asPrecision(value: string | null): DatePrecision | null {
  return DATE_PRECISIONS.find((precision) => precision === value) ?? null
}

function asGeometryPrecision(value: unknown): GeometryPrecision | null {
  return GEOMETRY_PRECISIONS.find((precision) => precision === value) ?? null
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function isNil(value: unknown): boolean {
  return value === null || value === undefined
}

function getIn(value: JsonObject | undefined, keys: string[]): string | undefined {
  let current: JsonValue | undefined = value

  for (const key of keys) {
    if (!isObject(current)) {
      return undefined
    }

    current = current[key]
  }

  return stringOrUndefined(current)
}
