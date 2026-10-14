import type { GeoPoint } from "../../domain"
import type { RelationshipFamily } from "../../overlays"
import { toEcef, type Vec3 } from "./geo"
import type { LabelBox } from "./labels"
import {
  JOURNEY_DASH,
  arcStyle,
  arrowheadPath,
  chevronPath,
  journeyLine,
  CAPTION_FRACTIONS,
  offsetRun,
  pathData,
  pointAt,
  pointsAlong,
  raisedArc,
  runLength,
  visibleRuns,
  type LineSample,
  type ScreenPoint,
} from "./lines"

/**
 * The SVG layer the globe draws its lines in, under the place markers:
 * journeys, relationship arcs and territory rings, plus the schematic vessel
 * at a journey's current stop and the small captions that qualify them.
 *
 * Lines are kept as world-space samples and re-projected only when the view
 * draws a frame (render-on-dirty), with each sample hidden behind the horizon
 * or the camera breaking the line. The layer is DOM only: the view hands it a
 * projection function, so it never sees a Three.js object, and it is
 * `aria-hidden` with the rest of the overlay because the event list and the
 * card say everything it draws in words.
 */

export type GlobeJourney = {
  readonly id: string
  readonly stops: readonly GeoPoint[]
  /** The stop the vessel or party is at, or null before the journey starts. */
  readonly vessel: { readonly stop: number; readonly kind: "ship" | "party" } | null
  readonly selected: boolean
}

export type GlobeArc = {
  readonly id: string
  readonly family: RelationshipFamily
  readonly from: GeoPoint
  readonly to: GeoPoint
  readonly directed: boolean
  readonly emphasis: "selected" | "layer"
  /** The two ends' names, shown beside an arc the selection touches. */
  readonly caption: string
}

export type GlobeTerritory = {
  readonly id: string
  readonly dateLabel: string
  readonly rings: readonly (readonly GeoPoint[])[]
}

export type GlobeOverlays = {
  readonly journeys: readonly GlobeJourney[]
  readonly arcs: readonly GlobeArc[]
  readonly territories: readonly GlobeTerritory[]
}

/** Projects a world point to the canvas, or null when it is hidden. */
export type Projector = (world: Vec3) => ScreenPoint | null

/** Ground height at a point as the globe draws it (terrain times exaggeration). */
export type HeightAt = (lon: number, lat: number) => number

/**
 * A caption that competes with the place labels for room, which win. It
 * offers several boxes under one id, in order of preference; the view shows
 * it in the first one that fits, or not at all.
 */
export type CaptionCandidate = {
  readonly id: string
  readonly boxes: readonly LabelBox[]
  show(box: LabelBox | null): void
}

/** RFD 1's wording for a journey line. */
export const JOURNEY_CAPTION = "schematic, follows the dated stops"

const SVG = "http://www.w3.org/2000/svg"
const CASING = "fill-none stroke-lacquer"
const CAPTION =
  "absolute left-0 top-0 block whitespace-nowrap [text-shadow:0_0_2px_var(--color-lacquer),0_0_5px_var(--color-lacquer),0_0_9px_var(--color-lacquer)]"
const CAPTION_HEIGHT = 16
const ARC_CAPTION_HEIGHT = 20

// The vessel glyphs are schematic symbols of a kind (RFD 1): a ship for a sea
// stop, a figure with a staff for a party ashore. The lacquer stroke under
// each keeps it legible over sea and terrain alike.
const SHIP_GLYPH = `<svg viewBox="0 0 24 24" width="22" height="22" class="block overflow-visible"><title>Schematic ship</title><g class="fill-current stroke-lacquer" stroke-width="1.25" stroke-linejoin="round" paint-order="stroke"><path d="M2.5 15h19l-3 4.5h-13z"/><path d="M11 3.5h1.25v11.5H11z"/><path d="M12.5 4.5l6 9h-6z"/><path d="M10.5 6l-4.5 7.5h4.5z"/></g></svg>`
const PARTY_GLYPH = `<svg viewBox="0 0 24 24" width="22" height="22" class="block overflow-visible"><title>Schematic travelling party</title><g fill="none" stroke-linecap="round" stroke-linejoin="round"><g class="stroke-lacquer" stroke-width="4"><circle cx="10" cy="5" r="2"/><path d="M10 8.5v6.5l-3 5.5M10 15l3 5.5M10 10.5l-4 3M10 10.5l5-1.5M16 4v17"/></g><g class="stroke-current" stroke-width="1.8"><circle cx="10" cy="5" r="2"/><path d="M10 8.5v6.5l-3 5.5M10 15l3 5.5M10 10.5l-4 3M10 10.5l5-1.5M16 4v17"/></g></g></svg>`

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag)

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }

  return element
}

function setPath(path: SVGPathElement, d: string): void {
  if (path.getAttribute("d") !== d) {
    path.setAttribute("d", d)
  }
}

/** A world-space polyline and the geodetic samples it was built from. */
type Samples = { readonly geo: readonly LineSample[]; world: Vec3[] }

function samplesFrom(points: readonly LineSample[]): Samples {
  return { geo: points, world: points.map((p) => [...toEcef(p.lon, p.lat, p.height)] as Vec3) }
}

type Caption = {
  readonly element: HTMLSpanElement
  readonly height: number
  width: number
  shown: boolean
}

function createCaption(parent: HTMLElement, text: string, className: string, height: number) {
  const element = document.createElement("span")
  element.className = className
  element.textContent = text
  element.style.visibility = "hidden"
  parent.append(element)
  return { element, height, width: 0, shown: false }
}

function showCaption(caption: Caption, box: LabelBox | null): void {
  if (box !== null) {
    caption.element.style.transform = `translate(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px)`
  }

  if ((box !== null) !== caption.shown) {
    caption.shown = box !== null
    caption.element.style.visibility = caption.shown ? "" : "hidden"
  }
}

/**
 * Offers a caption beside its line: centred just above or just below each
 * anchor point, in the anchors' order. No anchors hides it.
 */
function captionAt(
  caption: Caption,
  id: string,
  anchors: readonly ScreenPoint[],
  priority: number,
): CaptionCandidate | null {
  if (anchors.length === 0) {
    showCaption(caption, null)
    return null
  }

  if (caption.width === 0) caption.width = caption.element.offsetWidth
  const { width, height } = caption
  const boxes = anchors.flatMap((at) => [
    { id, priority, left: at.x - width / 2, top: at.y - height - 6, width, height },
    { id, priority, left: at.x - width / 2, top: at.y + 6, width, height },
  ])

  return { id, boxes, show: (box) => showCaption(caption, box) }
}

/** Points along a run where its caption may go, or none when the run is too short to caption. */
function anchorsAlong(run: readonly ScreenPoint[] | null, minLength: number): ScreenPoint[] {
  return run === null || runLength(run) < minLength
    ? []
    : CAPTION_FRACTIONS.map((fraction) => pointAt(run, fraction))
}

function project(samples: Samples, projector: Projector): (ScreenPoint | null)[] {
  return samples.world.map(projector)
}

/** The longest visible run, where a caption reads best. */
function longest(runs: readonly ScreenPoint[][]): ScreenPoint[] | null {
  let best: ScreenPoint[] | null = null
  let bestLength = 0

  for (const run of runs) {
    const length = runLength(run)
    if (length > bestLength) {
      best = run
      bestLength = length
    }
  }

  return best
}

class JourneyLine {
  readonly group = svg("g")
  private readonly casing = svg("path", { class: CASING })
  private readonly rest = svg("path", { class: "fill-none stroke-evidence-schematic" })
  private readonly travelled = svg("path", { class: "fill-none stroke-evidence-schematic" })
  private readonly line: { samples: GeoPoint[]; stopSample: number[] }
  private samples: Samples
  private readonly vessel: HTMLDivElement | null
  private readonly caption: Caption

  constructor(
    private readonly data: GlobeJourney,
    labels: HTMLElement,
  ) {
    const selected = data.selected
    this.line = journeyLine(data.stops)
    this.samples = samplesFrom(this.line.samples.map((p) => ({ ...p, height: 0 })))
    this.casing.setAttribute("stroke-width", selected ? "5" : "4")
    this.casing.setAttribute("stroke-opacity", "0.35")
    this.casing.setAttribute("stroke-linecap", "round")

    // The part already travelled (up to the vessel) reads stronger than the
    // part still ahead; a selected journey is stronger still.
    for (const [path, opacity, width] of [
      [this.rest, selected ? 0.7 : 0.45, selected ? 2 : 1.5],
      [this.travelled, 1, selected ? 2.75 : 2],
    ] as const) {
      path.setAttribute("stroke-dasharray", JOURNEY_DASH)
      path.setAttribute("stroke-opacity", String(opacity))
      path.setAttribute("stroke-width", String(width))
      path.setAttribute("stroke-linecap", "butt")
    }

    this.group.dataset.journeyId = data.id
    this.group.append(this.casing, this.rest, this.travelled)

    if (data.vessel === null) {
      this.vessel = null
    } else {
      this.vessel = document.createElement("div")
      this.vessel.className =
        "absolute left-0 top-0 hidden text-gold drop-shadow-[0_1px_2px_var(--color-lacquer)]"
      this.vessel.dataset.vessel = data.vessel.kind
      // Sized by its attributes rather than a scale utility: the element is
      // placed with an inline transform, which a CSS scale would also scale.
      const size = selected ? "26" : "22"
      this.vessel.innerHTML = (data.vessel.kind === "ship" ? SHIP_GLYPH : PARTY_GLYPH).replace(
        'width="22" height="22"',
        `width="${size}" height="${size}"`,
      )
      labels.append(this.vessel)
    }

    this.caption = createCaption(
      labels,
      JOURNEY_CAPTION,
      `${CAPTION} font-interface text-caption italic text-ink-dim`,
      CAPTION_HEIGHT,
    )
  }

  /** Lays the line on the terrain as it is currently loaded. */
  refresh(heightAt: HeightAt): void {
    this.samples = samplesFrom(
      this.line.samples.map((p) => ({ ...p, height: heightAt(p.lon, p.lat) })),
    )
  }

  place(projector: Projector): CaptionCandidate | null {
    const projected = project(this.samples, projector)
    const vessel = this.data.vessel
    const split = vessel === null ? 0 : (this.line.stopSample[vessel.stop] ?? 0)
    const all = visibleRuns(projected)
    setPath(this.casing, pathData(all))
    setPath(this.travelled, pathData(visibleRuns(projected.slice(0, split + 1))))
    setPath(this.rest, pathData(visibleRuns(projected.slice(split))))

    if (this.vessel !== null) {
      const at = projected[split] ?? null

      if (at === null) {
        this.vessel.classList.add("hidden")
      } else {
        // Beside the stop's marker, below and to the left, so it never covers
        // the mark or its label.
        this.vessel.classList.remove("hidden")
        this.vessel.style.transform = `translate(${(at.x - 44).toFixed(1)}px, ${(at.y - 2).toFixed(1)}px)`
      }
    }

    return captionAt(this.caption, `journey:${this.data.id}`, anchorsAlong(longest(all), 120), -2)
  }

  dispose(): void {
    this.group.remove()
    this.vessel?.remove()
    this.caption.element.remove()
  }
}

class ArcLine {
  readonly group = svg("g")
  private readonly samples: Samples
  private readonly casing = svg("path", { class: CASING })
  private readonly strokes: SVGPathElement[]
  private readonly marks: SVGPathElement | null
  private readonly head: SVGPathElement | null
  private readonly caption: Caption | null

  constructor(
    private readonly data: GlobeArc,
    labels: HTMLElement,
  ) {
    const style = arcStyle(data.family, data.emphasis)
    this.samples = samplesFrom(raisedArc(data.from, data.to))
    this.group.dataset.arcId = data.id
    this.group.dataset.family = data.family
    this.group.setAttribute("opacity", String(style.opacity))
    this.casing.setAttribute(
      "stroke-width",
      String(style.width + (style.form === "double" ? 5 : 3)),
    )
    this.casing.setAttribute("stroke-opacity", "0.3")
    this.casing.setAttribute("stroke-linecap", "round")

    const stroke = (width: number, dash: string | null) => {
      const path = svg("path", { class: `fill-none ${style.stroke}` })
      path.setAttribute("stroke-width", String(width))
      path.setAttribute("stroke-linecap", style.linecap)
      if (dash !== null) path.setAttribute("stroke-dasharray", dash)
      return path
    }

    // The pattern is the cue that is not colour: solid, double, chevrons,
    // beads or dashes (RFD 5).
    switch (style.form) {
      case "double":
        this.strokes = [stroke(style.width, null), stroke(style.width, null)]
        break
      case "chevrons":
        this.strokes = [stroke(style.width * 0.6, null)]
        break
      default:
        this.strokes = [stroke(style.width, style.dash)]
    }

    this.marks = style.form === "chevrons" ? stroke(style.width, null) : null
    this.head = data.directed ? svg("path", { class: `${style.fill} stroke-lacquer` }) : null
    this.head?.setAttribute("stroke-width", "1")
    this.head?.setAttribute("stroke-linejoin", "round")

    this.group.append(
      this.casing,
      ...this.strokes,
      ...(this.marks ? [this.marks] : []),
      ...(this.head ? [this.head] : []),
    )

    this.caption =
      data.emphasis === "selected" && data.caption !== ""
        ? createCaption(
            labels,
            data.caption,
            `${CAPTION} font-serif text-body-sm text-ink-dim`,
            ARC_CAPTION_HEIGHT,
          )
        : null
  }

  place(projector: Projector): CaptionCandidate | null {
    const projected = project(this.samples, projector)
    const runs = visibleRuns(projected)
    const style = arcStyle(this.data.family, this.data.emphasis)
    setPath(this.casing, pathData(runs))

    if (style.form === "double") {
      const gap = style.width + 0.75
      setPath(this.strokes[0], pathData(runs.map((run) => offsetRun(run, gap))))
      setPath(this.strokes[1], pathData(runs.map((run) => offsetRun(run, -gap))))
    } else {
      setPath(this.strokes[0], pathData(runs))
    }

    if (this.marks !== null) {
      setPath(
        this.marks,
        runs
          .flatMap((run) => pointsAlong(run, 18))
          .map((at) => chevronPath(at, 5))
          .join(""),
      )
    }

    if (this.head !== null) {
      // The head is drawn only when the arc's own end is in view, so it
      // never points at a horizon cut as if the arc ended there.
      const last = runs.at(-1)
      const end = projected.at(-1)
      setPath(
        this.head,
        last !== undefined && end !== null && end !== undefined
          ? (arrowheadPath(last, 9) ?? "")
          : "",
      )
    }

    if (this.caption === null) {
      return null
    }

    return captionAt(this.caption, `arc:${this.data.id}`, anchorsAlong(longest(runs), 60), -1)
  }

  dispose(): void {
    this.group.remove()
    this.caption?.element.remove()
  }
}

class TerritoryShape {
  readonly group = svg("g")
  private readonly rings: Samples[]
  private readonly edge = svg("path", { class: "fill-none stroke-ink-dim" })
  private readonly hatch = svg("path", { class: "fill-none stroke-ink-dim" })
  private readonly caption: Caption

  constructor(
    private readonly data: GlobeTerritory,
    labels: HTMLElement,
  ) {
    this.rings = data.rings.map((ring) =>
      samplesFrom(
        ring.flatMap((point, i) =>
          (i === 0 ? [point] : greatCircleTail(ring[i - 1], point)).map((p) => ({
            ...p,
            height: 0,
          })),
        ),
      ),
    )
    this.edge.setAttribute("stroke-width", "1.25")
    this.edge.setAttribute("stroke-opacity", "0.8")
    // Short wide dashes along the edge read as hatching: the snapshot's edge,
    // with no fill that would imply uniform control inside it (RFD 1).
    this.hatch.setAttribute("stroke-width", "6")
    this.hatch.setAttribute("stroke-dasharray", "1 5")
    this.hatch.setAttribute("stroke-opacity", "0.6")
    this.group.dataset.territoryId = data.id
    this.group.append(this.edge, this.hatch)
    this.caption = createCaption(
      labels,
      data.dateLabel,
      `${CAPTION} font-interface text-caption tabular-nums text-ink-dim`,
      CAPTION_HEIGHT,
    )
  }

  place(projector: Projector): CaptionCandidate | null {
    const runs = this.rings.flatMap((ring) => visibleRuns(project(ring, projector)))
    const d = pathData(runs)
    setPath(this.edge, d)
    setPath(this.hatch, d)
    const all = runs.flat()

    // The date always travels with the snapshot: snapshots are never
    // interpolated, so an undated shape would misstate what it is.
    const at =
      all.length === 0
        ? null
        : {
            x: all.reduce((sum, p) => sum + p.x, 0) / all.length,
            y: all.reduce((sum, p) => sum + p.y, 0) / all.length,
          }
    return captionAt(this.caption, `territory:${this.data.id}`, at === null ? [] : [at], 0)
  }

  dispose(): void {
    this.group.remove()
    this.caption.element.remove()
  }
}

function greatCircleTail(a: GeoPoint, b: GeoPoint): GeoPoint[] {
  return journeyLine([a, b]).samples.slice(1)
}

export class LineLayer {
  private readonly root: SVGSVGElement
  private readonly territoryGroup = svg("g")
  private readonly journeyGroup = svg("g")
  private readonly arcGroup = svg("g")
  /** Vessels and captions: HTML, so text is set by the browser in any script. */
  private readonly labels: HTMLDivElement
  private journeys: JourneyLine[] = []
  private arcs: ArcLine[] = []
  private territories: TerritoryShape[] = []
  private key = ""

  constructor(parent: HTMLElement) {
    this.root = svg("svg", { class: "absolute inset-0 h-full w-full overflow-visible" })
    this.root.dataset.globeLines = ""
    this.root.append(this.territoryGroup, this.journeyGroup, this.arcGroup)
    this.labels = document.createElement("div")
    this.labels.className = "absolute inset-0"
    // Under the place markers, which the view appends after this layer.
    parent.prepend(this.root, this.labels)
  }

  /** Replaces the lines; returns false when nothing changed, so no frame is needed. */
  set(overlays: GlobeOverlays, heightAt: HeightAt): boolean {
    // The workspace syncs on every state change (each playback tick among
    // them); rebuilding only on a real change keeps that cheap.
    const key = JSON.stringify(overlays)

    if (key === this.key) {
      return false
    }

    this.key = key
    this.clear()
    this.territories = overlays.territories.map((t) => new TerritoryShape(t, this.labels))
    this.journeys = overlays.journeys.map((j) => new JourneyLine(j, this.labels))
    // Layer arcs first, so the selection's arcs are drawn over them.
    this.arcs = [...overlays.arcs]
      .sort((a, b) => Number(a.emphasis === "selected") - Number(b.emphasis === "selected"))
      .map((a) => new ArcLine(a, this.labels))
    this.territoryGroup.append(...this.territories.map((t) => t.group))
    this.journeyGroup.append(...this.journeys.map((j) => j.group))
    this.arcGroup.append(...this.arcs.map((a) => a.group))
    this.refresh(heightAt)
    return true
  }

  /** Re-lays the journeys on the terrain after tiles arrive. */
  refresh(heightAt: HeightAt): void {
    for (const journey of this.journeys) journey.refresh(heightAt)
  }

  /** Re-projects every line; returns the captions that compete for room. */
  place(projector: Projector): CaptionCandidate[] {
    return [...this.territories, ...this.journeys, ...this.arcs].flatMap((line) => {
      const caption = line.place(projector)
      return caption === null ? [] : [caption]
    })
  }

  private clear(): void {
    for (const line of [...this.territories, ...this.journeys, ...this.arcs]) line.dispose()
    this.territories = []
    this.journeys = []
    this.arcs = []
  }

  dispose(): void {
    this.clear()
    this.root.remove()
    this.labels.remove()
  }
}
