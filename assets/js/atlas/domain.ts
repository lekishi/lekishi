/**
 * Renderer-independent atlas contracts.
 *
 * These types describe what the atlas shows, never how it is drawn: no Cesium,
 * DOM, or Svelte object appears here. RFD 2 owns the durable historical data,
 * calendar, precision, and evidence contracts; this foundation layer models a
 * deliberately small subset so the workspace and the renderer can be built and
 * tested before that contract lands. Fixture years are plain CE integers.
 */

/** A longitude/latitude pair in decimal degrees (WGS 84). */
export type GeoPoint = {
  readonly lon: number
  readonly lat: number
}

/** How precisely a fixture date is known. RFD 2 replaces this with the real contract. */
export type DatePrecision = "year" | "decade" | "century"

/**
 * A bounded occurrence range. An event whose exact date is unknown keeps the
 * whole supported span instead of collapsing to an invented single date.
 */
export type Occurrence = {
  readonly startYear: number
  readonly endYear: number
  readonly precision: DatePrecision
}

/** A location the atlas can place, with its placement claim made explicit. */
export type Place = {
  readonly id: string
  readonly label: string
  readonly position: GeoPoint
  /** `approximate` is a supported rough position; `display-anchor` only labels an area. */
  readonly locationPrecision: "approximate" | "display-anchor"
}

/** An occurrence with a place and a note. `synthetic` marks nonhistorical fixture content. */
export type HistoricalEvent = {
  readonly id: string
  readonly title: string
  readonly placeId: string
  readonly occurrence: Occurrence
  readonly note: string
  readonly synthetic: true
}

/** A curated selection of places and events, plus the window exploration starts in. */
export type Chapter = {
  readonly id: string
  readonly title: string
  readonly synthetic: true
  readonly defaultWindow: TimeWindow
  readonly homeView: GeoPoint
  readonly places: readonly Place[]
  readonly events: readonly HistoricalEvent[]
}

/** An inclusive exploration window in fixture years. */
export type TimeWindow = {
  readonly start: number
  readonly end: number
}
