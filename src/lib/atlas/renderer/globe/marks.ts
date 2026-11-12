/**
 * How a place marker looks: RFD 1's evidence grammar in RFD 5's tokens.
 *
 * Every state has a shape as well as a hue, because a colour on its own never
 * carries meaning on the map:
 *
 * - attested: a solid gold ring around a gold dot (a site);
 * - identified: a soft jade halo whose diameter is the stated precision, a
 *   region's wider than a locality's (the size is the precision; no badge
 *   repeats it);
 * - anchor: a small hollow diamond, never a ring, because a display anchor
 *   places the name and asserts no historical coordinate;
 * - possible: the mark goes hollow at 55 % opacity;
 * - disputed: the mark is split, half filled;
 * - tradition (an event here is told as legend): the name is underlined with
 *   dots; the mark keeps the place's own evidence, because a real site is not
 *   a legend;
 * - selected: gold-bright, larger, with a ring that pulses unless the reader
 *   asked for reduced motion; active (at the playhead): a little larger and
 *   brighter;
 * - held (a territory snapshot records a controller holding the place): a
 *   disc in the controller's tint under the mark, ringed for its seat and
 *   split when the holding is disputed. It is never a fill between places.
 *
 * The look is computed here as class lists and pixel sizes, without the DOM,
 * so the grammar is unit-tested; `view.ts` only applies it. Class names are
 * whole literals so Tailwind's scanner generates every one of them.
 */

export type MarkKind = "attested" | "identified" | "anchor"
export type MarkPrecision = "site" | "locality" | "region" | "unspecified"
export type MarkerTone = "definite" | "possible"
export type MarkerEmphasis = "base" | "active" | "selected"

export type GlobeMarker = {
  readonly id: string
  readonly lon: number
  readonly lat: number
  readonly label: string
  readonly mark: MarkKind
  readonly precision: MarkPrecision
  readonly tone: MarkerTone
  readonly emphasis: MarkerEmphasis
  /** The events at the place; more than one shows a count beside the mark. */
  readonly count: number
  readonly disputed: boolean
  readonly tradition: boolean
  /** The controller holding the place in a drawn territory snapshot, or null. */
  readonly control: {
    readonly tint: number
    readonly seat: boolean
    readonly disputed: boolean
  } | null
  /** The `/dev/world` prototype's city banner (`ScenePlace.banner`), or null. */
  readonly banner?: {
    readonly tint: number
    /** A player's story is at the place this turn: the banner is filled in its tint. */
    readonly active: boolean
    readonly unit: string | null
  } | null
}

export type MarkerLook = {
  /** The mark's diameter (a diamond's side), in pixels. */
  readonly size: number
  /** How far from the point a click still hits the marker, before the pointer's own reach. */
  readonly hitRadius: number
  /** The gap between the point and the label's baseline box. */
  readonly labelOffset: number
  /** The label's line height, for decluttering. */
  readonly labelHeight: number
  /** Draw order among markers: selected on top, then active. */
  readonly priority: number
  readonly group: string
  readonly mark: string
  /** The attested ring's centre dot, or null when the ring is hollow or split. */
  readonly core: string | null
  /** The selection's pulsing ring, or null when not selected. */
  readonly pulse: string | null
  readonly label: string
  /** The event count beside the mark, or null for one event. */
  readonly count: string | null
  /** The controller's disc under the mark, or null when no snapshot holds the place. */
  readonly control: string | null
  /** The control disc's diameter, in pixels. */
  readonly controlSize: number
  /** A unit's medal standing on the place (the prototype's banner), or null. */
  readonly unit: string | null
  readonly unitSize: number
  /** The medal's gap above the point, in pixels; 0 centres it on the point. */
  readonly unitOffset: number
}

// One whole literal per tint, so Tailwind's scanner generates each.
const CONTROL_FILL = [
  "bg-control-1/40 border-control-1",
  "bg-control-2/40 border-control-2",
  "bg-control-3/40 border-control-3",
  "bg-control-4/40 border-control-4",
  "bg-control-5/40 border-control-5",
  "bg-control-6/40 border-control-6",
  "bg-control-7/40 border-control-7",
  "bg-control-8/40 border-control-8",
]

const CONTROL_SPLIT = [
  "bg-[linear-gradient(90deg,var(--color-control-1)_50%,transparent_50%)] border-control-1",
  "bg-[linear-gradient(90deg,var(--color-control-2)_50%,transparent_50%)] border-control-2",
  "bg-[linear-gradient(90deg,var(--color-control-3)_50%,transparent_50%)] border-control-3",
  "bg-[linear-gradient(90deg,var(--color-control-4)_50%,transparent_50%)] border-control-4",
  "bg-[linear-gradient(90deg,var(--color-control-5)_50%,transparent_50%)] border-control-5",
  "bg-[linear-gradient(90deg,var(--color-control-6)_50%,transparent_50%)] border-control-6",
  "bg-[linear-gradient(90deg,var(--color-control-7)_50%,transparent_50%)] border-control-7",
  "bg-[linear-gradient(90deg,var(--color-control-8)_50%,transparent_50%)] border-control-8",
]

// The prototype's city banners, as a strategy game draws a city's: a plate
// over the place in the player's tint, filled where its story is this turn and
// lacquer edged in the tint where it was before. On it, left to right: the
// event count in a chip (the game's population), the name, and the place's
// evidence as a small mark in the evidence grammar's shapes, so a banner never
// drops what the round marker said. A unit standing there wears its player's
// emblem above the plate. Under the plate, a dot in the tint marks the point,
// which stays when the name is decluttered away.
const BANNER_FILL = [
  "bg-control-1",
  "bg-control-2",
  "bg-control-3",
  "bg-control-4",
  "bg-control-5",
  "bg-control-6",
  "bg-control-7",
  "bg-control-8",
]
const BANNER_EDGE = [
  "border-control-1",
  "border-control-2",
  "border-control-3",
  "border-control-4",
  "border-control-5",
  "border-control-6",
  "border-control-7",
  "border-control-8",
]
const BANNER_CHIP = [
  "before:bg-control-1",
  "before:bg-control-2",
  "before:bg-control-3",
  "before:bg-control-4",
  "before:bg-control-5",
  "before:bg-control-6",
  "before:bg-control-7",
  "before:bg-control-8",
]
const BANNER_PLATE =
  "absolute flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-control border py-0.5 pr-2 pl-0.5 font-serif text-body-sm shadow-plate"
// The count chip is the plate's ::before, reading the label's `data-count`.
const BANNER_COUNT =
  "before:grid before:h-5 before:min-w-5 before:place-items-center before:rounded-control before:px-1 before:font-interface before:text-caption before:font-semibold before:tabular-nums before:content-[attr(data-count)]"
// The evidence mark is the plate's ::after, drawn in the text's colour.
const BANNER_EVIDENCE: Record<MarkKind, string> = {
  attested:
    "after:size-2.5 after:shrink-0 after:rounded-full after:border-2 after:border-current after:bg-[radial-gradient(circle,currentColor_30%,transparent_36%)]",
  identified:
    "after:size-3 after:shrink-0 after:rounded-full after:bg-[radial-gradient(circle,currentColor_0%,transparent_72%)]",
  anchor: "after:size-2 after:shrink-0 after:rotate-45 after:border-[1.5px] after:border-current",
}
const BANNER_EVIDENCE_HOLLOW: Record<MarkKind, string> = {
  attested: "after:size-2.5 after:shrink-0 after:rounded-full after:border-2 after:border-current",
  identified:
    "after:size-3 after:shrink-0 after:rounded-full after:border after:border-dashed after:border-current",
  anchor: "after:size-2 after:shrink-0 after:rotate-45 after:border-[1.5px] after:border-current",
}
const BANNER_EVIDENCE_SPLIT =
  "after:bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)] after:border after:border-current"
const UNIT_SIZE = 26
const PLATE_HEIGHT = 28

function bannerLook(
  marker: GlobeMarker,
  banner: NonNullable<GlobeMarker["banner"]>,
  base: MarkerLook,
): MarkerLook {
  const tint = banner.tint % BANNER_FILL.length
  const selected = marker.emphasis === "selected"
  const unit = banner.unit !== null
  const labelOffset = 7
  const possible = marker.tone === "possible"
  return {
    ...base,
    // A possible place keeps full strength: its plate is dashed and its mark
    // hollow instead, which a reader sees on a busy board where a fade is lost.
    group: [
      "absolute left-0 top-0 transition-opacity duration-(--motion-fast) ease-ui",
      marker.emphasis === "active" ? "brightness-110" : "",
    ].join(" "),
    size: 6,
    hitRadius: 8,
    // A unit's banner wins room over its neighbours, so its emblem never
    // stands over another place's name; then the selection, then this turn's.
    priority: selected ? 4 : unit ? 3 : banner.active ? 1 : 0,
    labelOffset,
    labelHeight: PLATE_HEIGHT + (unit ? UNIT_SIZE - 6 : 0),
    mark: [SHAPE, "rounded-full border-2 border-abyss", BANNER_FILL[tint]].join(" "),
    core: null,
    pulse: null,
    control: null,
    count: null,
    label: [
      BANNER_PLATE,
      banner.active
        ? ["font-semibold text-on-gold", BANNER_FILL[tint], "border-abyss"].join(" ")
        : ["border-l-4 bg-lacquer text-ink", BANNER_EDGE[tint]].join(" "),
      possible ? "border-[1.5px] border-dashed border-ink" : "",
      selected ? "ring-2 ring-gold-bright ring-offset-1 ring-offset-abyss" : "",
      marker.count > 0
        ? [
            BANNER_COUNT,
            banner.active
              ? "before:bg-abyss before:text-ink"
              : `${BANNER_CHIP[tint]} before:text-on-gold`,
          ].join(" ")
        : "",
      possible ? BANNER_EVIDENCE_HOLLOW[marker.mark] : BANNER_EVIDENCE[marker.mark],
      marker.disputed ? BANNER_EVIDENCE_SPLIT : "",
      marker.tradition ? "underline decoration-dotted decoration-2 underline-offset-4" : "",
    ].join(" "),
    unit: unit
      ? [
          "absolute left-0 grid -translate-x-1/2 place-items-center rounded-full border-2 border-gold font-serif text-body-sm font-semibold text-on-gold shadow-[0_0_0_2px_var(--color-abyss)]",
          BANNER_FILL[tint],
        ].join(" ")
      : null,
    unitSize: UNIT_SIZE,
    unitOffset: labelOffset + PLATE_HEIGHT - 8,
  }
}

function controlClasses(control: NonNullable<GlobeMarker["control"]>): string {
  const tint = control.tint % CONTROL_FILL.length

  return [
    SHAPE,
    "rounded-full",
    control.seat ? "border-[3px] border-double" : "border",
    control.disputed ? CONTROL_SPLIT[tint] : CONTROL_FILL[tint],
  ].join(" ")
}

// A halo's diameter is its precision; a site keeps a small one for the rare
// identified site (the contract only marks sites `attested`).
const HALO_SIZES: Record<MarkPrecision, number> = {
  site: 14,
  locality: 22,
  region: 36,
  unspecified: 22,
}

const BASE_SIZES: Record<MarkKind, number> = { attested: 12, identified: 0, anchor: 9 }

const LABEL =
  "absolute block -translate-x-1/2 whitespace-nowrap font-serif [text-shadow:0_0_2px_var(--color-lacquer),0_0_5px_var(--color-lacquer),0_0_9px_var(--color-lacquer),0_1px_0_var(--color-lacquer)]"
const SHAPE =
  "absolute left-0 top-0 block -translate-x-1/2 -translate-y-1/2 transition-[width,height] duration-(--motion-fast) ease-ui"

function sizeOf(marker: GlobeMarker): number {
  const base = marker.mark === "identified" ? HALO_SIZES[marker.precision] : BASE_SIZES[marker.mark]
  const scale = marker.emphasis === "selected" ? 1.45 : marker.emphasis === "active" ? 1.2 : 1
  return Math.round(base * scale)
}

function markClasses(marker: GlobeMarker): string {
  const selected = marker.emphasis === "selected"
  const hollow = marker.tone === "possible"

  switch (marker.mark) {
    case "attested":
      return [
        SHAPE,
        "rounded-full border-2 shadow-[0_0_0_1px_var(--color-lacquer)]",
        selected ? "border-gold-bright" : "border-evidence-attested",
        // Split: the left half filled, which also stands in for the centre dot.
        marker.disputed
          ? selected
            ? "bg-[linear-gradient(90deg,var(--color-gold-bright)_50%,transparent_50%)]"
            : "bg-[linear-gradient(90deg,var(--color-evidence-attested)_50%,transparent_50%)]"
          : hollow
            ? "bg-transparent"
            : "bg-lacquer/45",
      ].join(" ")
    case "identified":
      return [
        SHAPE,
        "rounded-full",
        selected ? "border-[1.5px] border-gold-bright" : "border border-evidence-identified/70",
        marker.disputed
          ? "bg-[linear-gradient(90deg,var(--color-evidence-identified)_50%,transparent_50%)]"
          : hollow
            ? "bg-transparent"
            : "bg-[radial-gradient(circle,var(--color-evidence-identified)_0%,transparent_72%)]",
      ].join(" ")
    case "anchor":
      return [
        SHAPE,
        "rotate-45 border-[1.5px] shadow-[0_0_0_1px_var(--color-lacquer)]",
        selected ? "border-gold-bright" : "border-ink",
        marker.disputed
          ? selected
            ? "bg-[linear-gradient(90deg,var(--color-gold-bright)_50%,transparent_50%)]"
            : "bg-[linear-gradient(90deg,var(--color-ink)_50%,transparent_50%)]"
          : "bg-transparent",
      ].join(" ")
  }
}

export function markerLook(marker: GlobeMarker): MarkerLook {
  const look = baseLook(marker)
  return marker.banner == null ? look : bannerLook(marker, marker.banner, look)
}

function baseLook(marker: GlobeMarker): MarkerLook {
  const size = sizeOf(marker)
  const selected = marker.emphasis === "selected"
  const active = marker.emphasis === "active"
  // A diamond's corners reach past its side.
  const radius = marker.mark === "anchor" ? (size * Math.SQRT2) / 2 : size / 2
  const showCore = marker.mark === "attested" && marker.tone === "definite" && !marker.disputed

  return {
    size,
    hitRadius: Math.max(6, radius),
    labelOffset: Math.round(radius + (selected ? 7 : 4)),
    labelHeight: selected ? 24 : 20,
    priority: selected ? 2 : active ? 1 : 0,
    group: [
      "absolute left-0 top-0 transition-opacity duration-(--motion-fast) ease-ui",
      marker.tone === "possible" ? "opacity-55" : "opacity-100",
      active ? "brightness-125" : "",
    ].join(" "),
    mark: markClasses(marker),
    core: showCore
      ? [SHAPE, "rounded-full", selected ? "bg-gold-bright" : "bg-evidence-attested"].join(" ")
      : null,
    pulse: selected
      ? [
          SHAPE,
          "rounded-full border-2 border-gold-bright/80 motion-safe:animate-ping motion-reduce:border motion-reduce:border-gold-bright/60",
        ].join(" ")
      : null,
    label: [
      LABEL,
      selected ? "text-body font-semibold text-gold-bright" : "text-body-sm text-ink",
      marker.tradition
        ? "underline decoration-dotted decoration-ink-dim decoration-2 underline-offset-4"
        : "",
    ].join(" "),
    count:
      marker.count > 1
        ? "absolute top-0 block -translate-y-1/2 rounded-full border border-frame bg-lacquer-glass px-1.5 font-interface text-caption tabular-nums text-ink"
        : null,
    control: marker.control === null ? null : controlClasses(marker.control),
    controlSize: Math.round(radius * 2 + (marker.control?.seat ? 14 : 10)),
    unit: null,
    unitSize: 0,
    unitOffset: 0,
  }
}
