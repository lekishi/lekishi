/**
 * Renderer-independent atlas contracts.
 *
 * These types describe what the atlas shows, never how it is drawn: no Three.js,
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

import type { ChapterOverlays } from "./overlays"

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
      /** Every published name form and reading aid, for search. */
      readonly aliases: readonly string[]
      /** The primary name's published romanization, or null. */
      readonly romanization: string | null
      /** The primary name's language as the record tags it (`ja`, `lzh`), or null. */
      readonly lang: string | null
      readonly placement: PointPlacement
      readonly precision: GeometryPrecision
      readonly position: GeoPoint
      /**
       * The published note on the geometry the atlas shows, or null. A display
       * anchor's note is what says it asserts no historical coordinate, so the
       * details surface can state that in the record's own words.
       */
      readonly placementNote: string | null
    }
  | {
      readonly id: string
      readonly label: string
      readonly aliases: readonly string[]
      readonly romanization: string | null
      readonly lang: string | null
      readonly placement: "unknown"
      readonly precision: "unspecified"
      readonly position: null
      readonly placementNote: string | null
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

/**
 * One published citation: which source, where in it, and the quoted passage when
 * the source's recorded terms permit quoting. The locator is the record's own
 * locator value, never a rephrasing, so a reader can check the claim.
 */
export type EventCitation = {
  readonly sourceId: string
  readonly locatorKind: string
  readonly locator: string
  /** The published quoted text, or null when the citation carries none. */
  readonly quotedText: string | null
}

/** A published participant of an event, with the role the record gives it. */
export type EventParticipant = {
  readonly actorId: string
  /** The contract's role vocabulary, e.g. `subject` or `leader`. */
  readonly role: string
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
  /**
   * Every place the published record references, each once, in the order the
   * record first names it. The atlas places the event at one of them; search and
   * any other reader surface may name them all, because a record that names four
   * places named them all.
   */
  readonly placeIds: readonly string[]
  /** The event's published participants, in the record's own order. */
  readonly participants: readonly EventParticipant[]
  /** The event's published citations, in the record's own claim order. */
  readonly citations: readonly EventCitation[]
}

/**
 * A published actor the chapter names, kept as a label and its search aliases.
 * The atlas has no actor surface yet; the label is what a reader reads beside an
 * event's participants, and the aliases are the name forms the record publishes.
 */
export type Actor = {
  readonly id: string
  /** The published primary name form. */
  readonly label: string
  /** Every published name form and reading aid, for search. */
  readonly aliases: readonly string[]
  /** The primary name's published romanization, or null. */
  readonly romanization: string | null
  /** The primary name's language as the record tags it, or null. */
  readonly lang: string | null
  /** The contract's actor type vocabulary, e.g. `person` or `state`. */
  readonly types: readonly string[]
}

/**
 * A published source the chapter cites, with the reuse terms the record carries.
 * The atlas states the record's own attribution and links the source's recorded
 * identifier; it never restates or upgrades a licence.
 */
export type Source = {
  readonly id: string
  readonly title: string
  /** The contract's source kind, e.g. `primary`, `reference`, `dataset`. */
  readonly kind: string
  readonly edition: string | null
  readonly attribution: string
  readonly licenseId: string | null
  /** The first recorded URL identifier, or null when the record carries none. */
  readonly url: string | null
}

/**
 * One step of the chapter's published story, in the story's own order.
 *
 * `event` steps are the events the atlas can open; `summary` steps are the
 * story's own captions for published records the atlas has no event surface for
 * (a relationship, for example). The step is kept rather than dropped, because
 * the order is the chapter's presentation order and the atlas must not present a
 * different one; the kind tells a surface whether the step can be opened.
 */
export type StoryStep = {
  readonly recordId: string
  readonly caption: string
  readonly kind: "event" | "summary"
}

/** One end of a relationship: a published actor or a published place. */
export type RelationshipEndpoint = {
  readonly kind: "actor" | "place"
  readonly id: string
}

/**
 * A published relationship between two actors or places, as the record states
 * it: its types in the contract's vocabulary, its direction, whether it asserts
 * causation, when it held, and the claims' citations.
 *
 * Contact is not influence. The record's own `causality` travels with the
 * relationship, so a surface can say "asserts no causation" in the record's
 * terms rather than implying one from an arc on the map.
 */
export type Relationship = {
  readonly id: string
  /** The story's caption for the relationship when the story steps through it, else null. */
  readonly caption: string | null
  /** The published summary, verbatim. */
  readonly summary: string
  /** The contract's relationship types, e.g. `diplomacy` or `transmission`. */
  readonly types: readonly string[]
  readonly from: RelationshipEndpoint
  readonly to: RelationshipEndpoint
  /** `directed`, `undirected` or `mutual`, in the contract's vocabulary. */
  readonly directionality: string
  /** True only when the record asserts causation. */
  readonly causal: boolean
  /** When the relationship held, or null when the record publishes no validity. */
  readonly validity: Occurrence | null
  readonly citations: readonly EventCitation[]
}

/** One place a territory snapshot records its controller holding. */
export type TerritoryPlace = {
  readonly placeId: string
  /** `seat` for a capital or administrative seat, `held` for any other place. */
  readonly role: "seat" | "held"
  /** The event or relationship by which the controller came to hold it, or null. */
  readonly gainedRecordId: string | null
  /** The record's note on this place, verbatim, or null. */
  readonly note: string | null
}

/**
 * A published territory: a dated control snapshot (rfd/0002/TERRITORIES.adoc).
 * One controller, one closed year range, and the places a cited source records
 * it holding then. It asserts no border and no area, and lists only places a
 * source names, never everything the controller held; the atlas draws it only
 * inside its own range and never carries it forward or interpolates.
 */
export type Territory = {
  readonly id: string
  readonly controllerId: string
  /** The published summary, verbatim. */
  readonly summary: string
  /** The years the snapshot covers, with the source's own expression. */
  readonly span: Occurrence
  readonly places: readonly TerritoryPlace[]
  /** The published dispute, or null when the record is undisputed. */
  readonly dispute: EventDispute | null
  readonly citations: readonly EventCitation[]
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

/**
 * One of a chapter's stories, as the story switcher lists it
 * (rfd/0002/CHAPTER_STORIES.adoc).
 */
export type StoryOption = {
  /** The story record's id without `lks:story:`, which `?story=` carries. */
  readonly key: string
  readonly title: string
  /** The window the story opens on. */
  readonly window: TimeWindow
}

/**
 * A reviewed chapter, projected from the versioned contract's published
 * revisions, as one of its stories shows it. Most chapters have one story; a
 * chapter with several is projected once per story, and each view holds that
 * story's steps and what they reach, opening on the story's window.
 */
export type Chapter = {
  readonly id: string
  /** The chapter's display title, taken from the summary of the story it opens on. */
  readonly title: string
  /** This story's published summary, verbatim. */
  readonly summary: string
  /** The window this story opens on. */
  readonly defaultWindow: TimeWindow
  /** The story this view shows. */
  readonly storyKey: string
  /** Every story the chapter publishes, the one it opens on first. */
  readonly stories: readonly StoryOption[]
  readonly homeView: GeoPoint
  readonly places: readonly Place[]
  readonly actors: readonly Actor[]
  readonly events: readonly HistoricalEvent[]
  /** Every published relationship, in record id order. */
  readonly relationships: readonly Relationship[]
  /** Every published territory snapshot, in record id order. */
  readonly territories: readonly Territory[]
  readonly sources: readonly Source[]
  /** This story's published steps, in the story's own presentation order. */
  readonly story: readonly StoryStep[]
  readonly publication: ChapterPublication
  /**
   * What the map draws besides places, defined per chapter in
   * `overlay-definitions.ts`. It travels with the chapter's data rather than in
   * a shared script, so no public script names a chapter (RFD 6).
   */
  readonly overlays: ChapterOverlays
}

/** An inclusive exploration window in years. */
export type TimeWindow = {
  readonly start: number
  readonly end: number
}
