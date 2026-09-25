/**
 * Renderer-independent atlas contracts.
 *
 * These types describe what the atlas shows, never how it is drawn: no Cesium,
 * DOM, or Svelte object appears here. RFD 2 owns the durable historical data,
 * calendar, precision, and evidence contracts; this layer carries the published
 * view of a reviewed chapter, built by `projection.ts` from the contract's own
 * documents.
 *
 * The vocabulary is deliberately the contract's own. A `day`-precision instant
 * stays `day` here instead of being rounded to a year, a bounded uncertain
 * occurrence keeps its whole support interval, and a place whose published
 * geometry asserts no position carries no coordinate.
 */

/** A longitude/latitude pair in decimal degrees (WGS 84). */
export type GeoPoint = {
  readonly lon: number
  readonly lat: number
}

/** How precisely the occurrence is known, in the contract's own vocabulary. */
export type DatePrecision = "day" | "month" | "year" | "decade" | "century"

/**
 * What the supported interval means. `instant` is one occurrence on the stated
 * date, `occurrence_window` is one occurrence at an unknown point inside the
 * interval, and `duration` is activity supported across it. The atlas never
 * turns a window into a midpoint date or a duration into certainty.
 */
export type OccurrenceMode = "instant" | "occurrence_window" | "duration"

/**
 * A bounded occurrence range. An event whose exact date is unknown keeps the
 * whole supported span instead of collapsing to an invented single year.
 */
export type Occurrence = {
  readonly startYear: number
  readonly endYear: number
  readonly precision: DatePrecision
  readonly mode: OccurrenceMode
  /** The source's own date expression, kept so the details surface never paraphrases it. */
  readonly sourceExpression: string | null
}

/**
 * How a place with a published point is placed on the map. `approximate` is a
 * cited identification or a region-level placement; `display-anchor` only
 * labels an area and asserts no historical coordinate.
 */
export type PointPlacement = "approximate" | "display-anchor"

/** How precisely a placed point is known, in the contract's own vocabulary. */
export type GeometryPrecision = "site" | "locality" | "region" | "unspecified"

/**
 * A place the atlas can name, with its placement claim made explicit. The
 * second variant is the contract's `unknown` geometry: the place stays nameable
 * and listable, and no coordinate is invented for it.
 */
export type Place =
  | {
      readonly id: string
      /** The published primary name form. */
      readonly label: string
      readonly placement: PointPlacement
      readonly precision: GeometryPrecision
      readonly position: GeoPoint
    }
  | {
      readonly id: string
      readonly label: string
      readonly placement: "unknown"
      readonly precision: "unspecified"
      readonly position: null
    }

/**
 * How the published record lets the atlas place an event.
 *
 * `point` is a place reference the map can show. `none` covers every case where
 * the atlas must not invent a position: the record names no place, names a
 * place with no sourced identification, or names a place only as context (an
 * intended destination is not a landfall).
 */
export type EventPlacement =
  | {
      readonly kind: "point"
      readonly placeId: string
      readonly label: string
      readonly basis: PointPlacement
      readonly precision: GeometryPrecision
      readonly position: GeoPoint
    }
  | {
      readonly kind: "none"
      readonly placeId: string | null
      readonly label: string | null
      readonly reason: "no-place" | "no-position" | "context-only"
    }

/**
 * A published dispute, kept as the contract states it.
 *
 * The record's own dispute status and summary, plus the claims that challenge
 * the main account, so a details surface can show the disagreement without
 * paraphrasing it or deciding it. The atlas never merges these accounts or
 * presents one as the record's conclusion.
 */
export type EventDispute = {
  readonly status: "disputed"
  /** The published dispute summary, verbatim. */
  readonly summary: string
  /** The conflicting or alternative claims, verbatim, with their cited locators. */
  readonly accounts: readonly {
    readonly statement: string
    readonly locators: readonly string[]
  }[]
}

/** A published event with the chapter's presentation title and its own summary. */
export type HistoricalEvent = {
  readonly id: string
  readonly title: string
  readonly placement: EventPlacement
  readonly occurrence: Occurrence
  readonly note: string
  /** The published dispute, or null when the record is undisputed. */
  readonly dispute: EventDispute | null
  /** True when the published record is a coda node outside the primary mission window. */
  readonly coda: boolean
}

/** Publication facts the atlas states wherever the chapter's content appears. */
export type ChapterPublication = {
  /** Every set that published a revision the atlas shows, newest first. */
  readonly setIds: readonly string[]
  readonly publishedAt: string
  /** The independence the newest such set recorded, e.g. `self_review`. */
  readonly independence: string
  readonly reviewer: string
  /** The chapter's own coverage statement, from its published story record. */
  readonly coverageNote: string
  /** The newest set's review notes, verbatim. */
  readonly reviewNotes: string
}

/** A reviewed chapter, projected from the versioned contract's published revisions. */
export type Chapter = {
  readonly id: string
  /** The chapter's display title, taken from its published story summary. */
  readonly title: string
  /** The published story summary, verbatim. */
  readonly summary: string
  readonly defaultWindow: TimeWindow
  readonly homeView: GeoPoint
  readonly places: readonly Place[]
  readonly events: readonly HistoricalEvent[]
  readonly publication: ChapterPublication
}

/** An inclusive exploration window in years. */
export type TimeWindow = {
  readonly start: number
  readonly end: number
}
