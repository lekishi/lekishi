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
 * - selected: gold-bright, larger, with a ring that pulses unless the reader
 *   asked for reduced motion; active (at the playhead): a little larger and
 *   brighter.
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
    ].join(" "),
    count:
      marker.count > 1
        ? "absolute top-0 block -translate-y-1/2 rounded-full border border-frame bg-lacquer-glass px-1.5 font-interface text-caption tabular-nums text-ink"
        : null,
  }
}
