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
import type {
  Chapter,
  ChapterPublication,
  DatePrecision,
  EventDispute,
  EventPlacement,
  GeoPoint,
  GeometryPrecision,
  HistoricalEvent,
  Occurrence,
  Place,
  PointPlacement,
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

export function projectChapter(
  name: string,
  documents: JsonValue[],
  sets: JsonValue[],
  coverage: ChapterCoverage,
): ProjectionResult {
  const errors: string[] = []
  const records = documents.filter(
    (document): document is JsonObject => isObject(document) && document["document"] === "record",
  )
  const current = currentPublished(records, sets)
  const published = records
    .map((record) => publishedRevisionOf(record, current, errors))
    .filter((entry): entry is PublishedRevision => entry !== null)

  const story = published.find((entry) => entry.kind === "story")
  const places = new Map<string, Place>()

  for (const entry of published.filter((candidate) => candidate.kind === "place")) {
    const place = projectPlace(entry, errors)

    if (place !== null) {
      places.set(place.id, place)
    }
  }

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
    .map((entry) => projectEvent(entry, places, captions, coverage, errors))
    .filter((entry): entry is HistoricalEvent => entry !== null)

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

  return {
    ok: true,
    chapter: {
      id: name,
      title: chapterTitle(summary),
      summary,
      defaultWindow: coverage.defaultWindow,
      homeView: boundingBoxCenter(mapped),
      places: [...places.values()],
      events,
      publication,
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
  } | null = null
  let assertsNoPosition = false

  for (const candidate of geometry) {
    const interpretation = stringOrUndefined(candidate["interpretation"]) ?? ""

    if (interpretation === "unknown") {
      assertsNoPosition = true
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

    point ??= { placement, precision, position }
  }

  if (point !== null) {
    return {
      id: entry.recordId,
      label,
      placement: point.placement,
      precision: point.precision,
      position: point.position,
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
    placement: "unknown",
    precision: "unspecified",
    position: null,
  }
}

function projectEvent(
  entry: PublishedRevision,
  places: Map<string, Place>,
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

  const occurrence = projectOccurrence(entry, errors)

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

  return {
    id: entry.recordId,
    title,
    placement: projectEventPlacement(entry, places, errors),
    occurrence,
    note,
    dispute: projectDispute(entry, errors),
    coda: labelledCoda,
  }
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

function projectOccurrence(entry: PublishedRevision, errors: string[]): Occurrence | null {
  const result = normalize(entry.content["time"])

  if (!result.ok) {
    errors.push(`${entry.recordId} has an invalid time: ${result.errors.join(", ")}`)
    return null
  }

  const time = result.value

  if (time.mode === "undated") {
    errors.push(
      `${entry.recordId} is undated; the atlas cannot yet keep an undated event discoverable outside the time window, and it will not guess a year`,
    )
    return null
  }

  if (time.bounds !== "two_sided" || time.start === null || time.end === null) {
    errors.push(
      `${entry.recordId} has an open-ended occurrence (${String(time.bounds)}); the atlas window is closed at both ends and will not invent the missing one`,
    )
    return null
  }

  const precision = asPrecision(time.precision)

  if (precision === null) {
    errors.push(`${entry.recordId} publishes the date precision ${String(time.precision)}`)
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
 * Which place, if any, the event is shown at.
 *
 * References are read in the record's own order, and a reference the record
 * marks as context never moves a marker: naming an intended destination is not
 * asserting a landfall there.
 */
function projectEventPlacement(
  entry: PublishedRevision,
  places: Map<string, Place>,
  errors: string[],
): EventPlacement {
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

  if (placed !== undefined) {
    return {
      kind: "point",
      placeId: placed.place.id,
      label: placed.place.label,
      basis: placed.place.placement,
      precision: placed.place.precision,
      position: placed.position,
    }
  }

  const [first] = resolved

  if (first === undefined) {
    return { kind: "none", placeId: null, label: null, reason: "no-place" }
  }

  return {
    kind: "none",
    placeId: first.place.id,
    label: first.place.label,
    reason: resolved.some((candidate) => candidate.place.position !== null)
      ? "context-only"
      : "no-position",
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
