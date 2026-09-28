import type { HistoricalEvent, Place } from "./domain"
import { unplacedNote } from "./labels"

/**
 * The illustrated-local treatment's scene model.
 *
 * This module is the whole content decision behind the illustrated treatment,
 * and it is deliberately renderer-independent: it returns a scene kind, the
 * record's own event types, the place the record names, and a list of plain
 * shapes. The Svelte surface turns those shapes into SVG; nothing here knows
 * about SVG, the DOM, or the map.
 *
 * What the scene may and may not say is the point of the treatment comparison:
 *
 * * the card shows the record's published `event_types` verbatim — the contract's
 *   own vocabulary — and never a classification of the atlas's own. An event
 *   whose published types the atlas does not know gets the plain scene rather
 *   than a wrong one, and the drawing never narrows a type into a claim it does
 *   not carry (a `journey` is not drawn as a sea voyage, because the record does
 *   not say it was one).
 * * the scene is a *pictogram of a kind*, not a portrait of a place: every event
 *   of a kind draws the same shapes. That is why the vignette can exist at all
 *   without inventing a reconstruction — it claims nothing about this place's
 *   buildings, coastline, distances, or bearing, and every surface that shows it
 *   states so in words.
 * * the scene carries no position: a shape is never placed from a coordinate,
 *   and an event the atlas does not place keeps the record's own statement of
 *   why, so the illustration cannot quietly supply the location the record does
 *   not.
 */

/**
 * The restrained compositions the treatment can draw.
 *
 * These name pictograms, not historical classifications: a composition is chosen
 * from a published event type only where that type supports the pictogram, and
 * the card never prints the composition's name. `travel` is deliberately
 * land-neutral — a `journey` record does not say how the journey was made.
 */
export type LocalSceneKind =
  "travel" | "assembly" | "campaign" | "foundation" | "exchange" | "plain"

/**
 * RFD 1's two local-detail treatments, as a surface can present them.
 *
 * `geographic-symbolic` is the shipped treatment: the map, its terrain, labels,
 * selected sites, and event markers, with no scene reconstruction. The
 * comparison surface adds `illustrated-local`, which shows the vignette above
 * beside the selected event's details. The value is presentation, not content:
 * both treatments read the same projected chapter, the same controls, and the
 * same time behavior.
 */
export type LocalDetailTreatment = "geographic-symbolic" | "illustrated-local"

/**
 * The contract's `event_types` values, mapped to the scene kind they draw.
 *
 * The mapping is the atlas's own presentation choice and is deliberately total
 * over the contract's vocabulary: every published value either draws a scene or
 * draws the plain one, so a new contract value cannot produce an unknown state.
 */
const SCENE_KIND_BY_EVENT_TYPE: Readonly<Record<string, LocalSceneKind>> = {
  journey: "travel",
  campaign: "campaign",
  mission: "assembly",
  council: "assembly",
  founding: "foundation",
  exchange: "exchange",
  process: "exchange",
  occurrence: "plain",
  other: "plain",
}

/** A shape's visual weight: a distant silhouette, a near one, or the selection cue. */
export type SceneTone = "far" | "near" | "accent"

/**
 * One shape of a vignette, in a 100 x 40 view box with the ground line at 40.
 *
 * `x` and `y` are the shape's left and baseline; `width` and `height` are its
 * extent. The vocabulary is small on purpose: the treatment has to stay a
 * silhouette, and a shape the record does not support cannot be expressed here.
 */
export type SceneShape = {
  readonly shape: "band" | "roof" | "hall" | "gate" | "tree" | "banner" | "marker"
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly tone: SceneTone
}

/** What the illustrated treatment shows for one selected event. */
export type LocalScene = {
  /** The composition drawn; the card does not print this name. */
  readonly kind: LocalSceneKind
  /** The record's published event types, verbatim and in the record's order. */
  readonly eventTypes: readonly string[]
  /** The place the record names, or null when it names none. */
  readonly place: Place | null
  /** The place's published primary name form, or null. */
  readonly placeLabel: string | null
  /**
   * The record's own statement of why the atlas claims no position for the
   * event, or null when the atlas places it.
   */
  readonly positionNote: string | null
  readonly shapes: readonly SceneShape[]
}

/** The scene kind the record's published types draw. */
export function localSceneKind(eventTypes: readonly string[]): LocalSceneKind {
  for (const type of eventTypes) {
    const kind = SCENE_KIND_BY_EVENT_TYPE[type]

    // The record's own order decides, so a record that publishes two types draws
    // the first one the atlas knows rather than a merged or arbitrary scene.
    if (kind !== undefined && kind !== "plain") {
      return kind
    }
  }

  return "plain"
}

/**
 * The scene for a selected event, or null when the record names no place.
 *
 * A record with no place reference has no locality to illustrate, and the
 * treatment draws nothing rather than a scene attached to nowhere.
 */
export function localSceneFor(event: HistoricalEvent, places: readonly Place[]): LocalScene | null {
  const placeId = event.placement.kind === "point" ? event.placement.placeId : event.placeIds[0]
  const place = places.find((candidate) => candidate.id === placeId) ?? null

  if (place === null) {
    return null
  }

  const kind = localSceneKind(event.eventTypes)

  return {
    kind,
    eventTypes: event.eventTypes,
    place,
    placeLabel: place.label,
    positionNote: unplacedNote(event.placement),
    shapes: localSceneShapes(kind),
  }
}

/**
 * The one sentence every surface that shows the scene has to carry.
 *
 * It states the two things a reader could otherwise get wrong: that the drawing
 * is a generic vignette for the event's kind rather than a reconstruction of the
 * place, and that no position, extent, or distance in it is sourced.
 */
export function localSceneNotice(scene: LocalScene): string {
  const types = scene.eventTypes.join(", ")

  return `Illustrative scene, not a reconstruction of ${scene.placeLabel ?? "the place"}: the drawing is one restrained pictogram chosen from the record's published event types (${types}), the same shapes are drawn for every event that publishes them, and no position, extent, or distance in it is sourced.`
}

/**
 * The vignettes themselves.
 *
 * Each kind is a fixed composition. The shapes are silhouettes: a shore or a
 * ground line, a walled compound, a hall, a gate, a tree, a banner, and the
 * marker that stands for the selected event. There is deliberately no vessel and
 * no shoreline: a published `journey` does not say the journey was made by sea,
 * and the pictogram must not decide that. None of the shapes is measured from a
 * source, and none of them moves with a coordinate — a place's scene is the same
 * picture as any other place's scene of that kind.
 */
export function localSceneShapes(kind: LocalSceneKind): readonly SceneShape[] {
  const ground: SceneShape = {
    shape: "band",
    x: 0,
    y: 31,
    width: 100,
    height: 9,
    tone: "far",
  }
  const marker = (x: number, y: number): SceneShape => ({
    shape: "marker",
    x,
    y,
    width: 4,
    height: 6,
    tone: "accent",
  })

  switch (kind) {
    case "travel":
      // A journey record does not say how the journey was made: the pictogram is
      // land and a track, never a vessel or a shore.
      return [
        ground,
        { shape: "band", x: 0, y: 27, width: 100, height: 5, tone: "near" },
        { shape: "tree", x: 16, y: 31, width: 7, height: 9, tone: "near" },
        { shape: "tree", x: 78, y: 31, width: 6, height: 8, tone: "far" },
        marker(50, 15),
      ]
    case "assembly":
      return [
        ground,
        { shape: "tree", x: 12, y: 31, width: 7, height: 9, tone: "near" },
        { shape: "hall", x: 40, y: 31, width: 28, height: 13, tone: "near" },
        { shape: "gate", x: 24, y: 31, width: 14, height: 9, tone: "near" },
        { shape: "banner", x: 72, y: 31, width: 8, height: 14, tone: "far" },
        marker(54, 14),
      ]
    case "campaign":
      return [
        ground,
        { shape: "band", x: 28, y: 24, width: 44, height: 7, tone: "near" },
        { shape: "gate", x: 44, y: 24, width: 12, height: 8, tone: "near" },
        { shape: "banner", x: 18, y: 31, width: 8, height: 14, tone: "far" },
        { shape: "banner", x: 80, y: 31, width: 8, height: 14, tone: "far" },
        marker(50, 13),
      ]
    case "foundation":
      return [
        ground,
        { shape: "hall", x: 34, y: 31, width: 30, height: 15, tone: "near" },
        { shape: "roof", x: 20, y: 31, width: 12, height: 8, tone: "near" },
        { shape: "tree", x: 70, y: 31, width: 7, height: 10, tone: "near" },
        { shape: "tree", x: 80, y: 31, width: 6, height: 8, tone: "far" },
        marker(49, 12),
      ]
    case "exchange":
      return [
        ground,
        { shape: "roof", x: 22, y: 31, width: 18, height: 9, tone: "near" },
        { shape: "roof", x: 46, y: 31, width: 14, height: 7, tone: "near" },
        { shape: "tree", x: 70, y: 31, width: 7, height: 9, tone: "far" },
        { shape: "gate", x: 62, y: 31, width: 12, height: 8, tone: "far" },
        marker(31, 18),
      ]
    case "plain":
      return [
        ground,
        { shape: "tree", x: 44, y: 31, width: 8, height: 11, tone: "near" },
        marker(48, 16),
      ]
  }
}
