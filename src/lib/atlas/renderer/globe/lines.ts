import type { GeoPoint } from "../../domain"
import type { RelationshipFamily } from "../../overlays"
import { surfaceDistance, type Vec3 } from "./geo"

/**
 * Pure geometry and styling for the lines the globe draws over its canvas:
 * journeys through dated stops and relationship arcs (RFD 1,
 * "Show, then qualify"; RFD 5, "Evidence and relationship tokens").
 *
 * The lines are an SVG layer re-projected from sample points whenever a frame
 * is drawn, not WebGL geometry: a dash, a double line or a row of chevrons is
 * then a stroke attribute in screen pixels, the stroke reads the design
 * system's colour tokens directly, and the pattern stays the same width at
 * every altitude. Nothing here touches the DOM or Three.js, so the sampling,
 * horizon clipping and per-family styles are unit-tested on their own.
 */

/** A projected point in CSS pixels from the canvas's top-left corner. */
export type ScreenPoint = { readonly x: number; readonly y: number }

/** A geodetic sample with its height above the ellipsoid, in metres. */
export type LineSample = { readonly lon: number; readonly lat: number; readonly height: number }

/**
 * The polar radius squared, slightly under. A point on the surface is in
 * front of the horizon when its dot product with the eye exceeds it; the
 * markers use the same value, so a line and the marker it ends at disappear
 * over the horizon together.
 */
export const HORIZON2 = 6356752 * 6356752 * 0.999

const radians = (value: number) => (value * Math.PI) / 180
const degrees = (value: number) => (value * 180) / Math.PI

function unit(point: GeoPoint): Vec3 {
  const lon = radians(point.lon)
  const lat = radians(point.lat)
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
}

function geodetic(v: Vec3): GeoPoint {
  return {
    lon: degrees(Math.atan2(v[1], v[0])),
    lat: degrees(Math.atan2(v[2], Math.hypot(v[0], v[1]))),
  }
}

/** The angle between two points as seen from the Earth's centre, in degrees. */
export function angularDistance(a: GeoPoint, b: GeoPoint): number {
  const [ax, ay, az] = unit(a)
  const [bx, by, bz] = unit(b)
  return degrees(Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))))
}

/**
 * Points along the great circle from `a` to `b`, both ends included, at most
 * `maxStepDeg` apart. A journey's line follows the surface this way, so a leg
 * across the East China Sea bends with the globe instead of cutting a chord
 * through it.
 */
export function greatCircle(a: GeoPoint, b: GeoPoint, maxStepDeg = 0.5): GeoPoint[] {
  const angle = radians(angularDistance(a, b))
  const steps = Math.max(1, Math.ceil(degrees(angle) / maxStepDeg))

  if (angle < 1e-9) {
    return [a, b]
  }

  const ua = unit(a)
  const ub = unit(b)
  const sin = Math.sin(angle)
  const points: GeoPoint[] = [a]

  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const wa = Math.sin((1 - t) * angle) / sin
    const wb = Math.sin(t * angle) / sin
    points.push(
      geodetic([wa * ua[0] + wb * ub[0], wa * ua[1] + wb * ub[1], wa * ua[2] + wb * ub[2]]),
    )
  }

  points.push(b)
  return points
}

const samePosition = (a: GeoPoint, b: GeoPoint) =>
  Math.abs(a.lon - b.lon) < 1e-9 && Math.abs(a.lat - b.lat) < 1e-9

/**
 * A journey's line through its stops: great-circle samples, and the sample
 * each stop sits at. Two consecutive stops at one place (an arrival and a
 * departure at 益救嶋) are one point of the line, not a zero-length leg.
 */
export function journeyLine(
  stops: readonly GeoPoint[],
  maxStepDeg = 0.5,
): { samples: GeoPoint[]; stopSample: number[] } {
  const samples: GeoPoint[] = []
  const stopSample: number[] = []

  for (const stop of stops) {
    const last = samples.at(-1)

    if (last === undefined) {
      samples.push(stop)
    } else if (!samePosition(last, stop)) {
      samples.push(...greatCircle(last, stop, maxStepDeg).slice(1))
    }

    stopSample.push(samples.length - 1)
  }

  return { samples, stopSample }
}

/** How far an arc bows sideways at its middle, as a fraction of its length. */
const ARC_BOW = 0.12

/**
 * A relationship arc: the great circle between its ends, raised in the middle
 * and bowed to the left of its direction, so it reads as a connection and
 * never as a route over the ground. Seen from straight above a rise alone
 * would lie flat on a journey between the same places (an embassy and its
 * envoys' stops often share both ends); the bow keeps them apart, and keeps
 * A→B and B→A on opposite sides. Rise and bow follow the distance (the rise
 * a parabola peaking at about an eighth of it), so a short arc does not
 * tower and a long one clears the curve of the Earth.
 */
export function raisedArc(from: GeoPoint, to: GeoPoint): LineSample[] {
  const angle = angularDistance(from, to)
  const peak = Math.min(900_000, Math.max(20_000, surfaceDistance(from, to) * 0.12))
  const steps = Math.min(96, Math.max(24, Math.ceil(angle * 3)))
  const ground = greatCircle(from, to, angle / steps || 1)
  const [ax, ay, az] = unit(from)
  const [bx, by, bz] = unit(to)
  // The great circle's pole on the left of travel from `from` to `to`.
  const pole: Vec3 = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
  const poleLength = Math.hypot(...pole)
  const bow = radians(angle) * ARC_BOW

  return ground.map((point, i) => {
    const t = i / (ground.length - 1)
    const bulge = 4 * t * (1 - t)
    const height = peak * bulge

    if (poleLength < 1e-12 || i === 0 || i === ground.length - 1) {
      return { lon: point.lon, lat: point.lat, height }
    }

    const p = unit(point)
    const k = (bow * bulge) / poleLength
    const bowed = geodetic([p[0] + pole[0] * k, p[1] + pole[1] * k, p[2] + pole[2] * k])
    return { lon: bowed.lon, lat: bowed.lat, height }
  })
}

/**
 * Whether the Earth hides a world point from the eye. A point on the surface
 * is hidden past the horizon; a raised point (an arc's crown) stays visible
 * above it until the sightline itself dips into the Earth, so an arc rises
 * over the horizon instead of being cut where its ends are.
 */
export function hiddenByEarth(point: Vec3, eye: Vec3, radius2 = HORIZON2): boolean {
  const d: Vec3 = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]]
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]

  if (dd === 0) {
    return false
  }

  // The closest approach of the sightline to the Earth's centre.
  const t = -(eye[0] * d[0] + eye[1] * d[1] + eye[2] * d[2]) / dd

  if (t >= 1) {
    // The sightline is still closing on the centre when it reaches the point,
    // so nothing lies between them: the point is seen unless it is itself
    // inside the Earth. (For a surface point this is the horizon test.)
    return point[0] * point[0] + point[1] * point[1] + point[2] * point[2] < radius2
  }

  if (t <= 0) {
    return false
  }

  const cx = eye[0] + d[0] * t
  const cy = eye[1] + d[1] * t
  const cz = eye[2] + d[2] * t
  return cx * cx + cy * cy + cz * cz < radius2
}

/**
 * Splits projected samples into the runs that can be drawn: a hidden sample
 * (`null`, behind the horizon or the camera) breaks the line, and a run of
 * one point draws nothing.
 */
export function visibleRuns(points: readonly (ScreenPoint | null)[]): ScreenPoint[][] {
  const runs: ScreenPoint[][] = []
  let run: ScreenPoint[] = []

  for (const point of points) {
    if (point === null) {
      if (run.length > 1) runs.push(run)
      run = []
    } else {
      run.push(point)
    }
  }

  if (run.length > 1) runs.push(run)
  return runs
}

/** SVG path data for a set of runs, to a tenth of a pixel. */
export function pathData(runs: readonly (readonly ScreenPoint[])[]): string {
  return runs
    .map((run) =>
      run.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(""),
    )
    .join("")
}

/**
 * A run moved sideways by `distance` pixels (positive to the right of the
 * direction of travel). Two offsets of one run are the diplomacy arc's double
 * line, which then keeps its gap at every zoom.
 */
export function offsetRun(run: readonly ScreenPoint[], distance: number): ScreenPoint[] {
  return run.map((point, i) => {
    const before = run[Math.max(0, i - 1)]
    const after = run[Math.min(run.length - 1, i + 1)]
    const dx = after.x - before.x
    const dy = after.y - before.y
    const length = Math.hypot(dx, dy) || 1
    return { x: point.x - (dy / length) * distance, y: point.y + (dx / length) * distance }
  })
}

/** The screen length of a run, in pixels. */
export function runLength(run: readonly ScreenPoint[]): number {
  let length = 0

  for (let i = 1; i < run.length; i++) {
    length += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y)
  }

  return length
}

/** A point on a run and the run's direction there, in radians from +x. */
export type RunPoint = ScreenPoint & { readonly angle: number }

/**
 * Points every `spacing` pixels along a run, starting half a step in, with
 * the direction of travel at each: where the conflict arc's chevrons go.
 */
export function pointsAlong(run: readonly ScreenPoint[], spacing: number): RunPoint[] {
  const points: RunPoint[] = []
  let next = spacing / 2
  let walked = 0

  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]
    const b = run[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)

    while (length > 0 && next <= walked + length) {
      const u = (next - walked) / length
      points.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle })
      next += spacing
    }

    walked += length
  }

  return points
}

/** The point a fraction of the way along a run's screen length. */
export function pointAt(run: readonly ScreenPoint[], fraction: number): ScreenPoint {
  const target = runLength(run) * Math.min(1, Math.max(0, fraction))
  let walked = 0

  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1]
    const b = run[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y)

    if (walked + length >= target && length > 0) {
      const u = (target - walked) / length
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }
    }

    walked += length
  }

  return run[run.length - 1]
}

/** The point halfway along a run's length. */
export function midpoint(run: readonly ScreenPoint[]): ScreenPoint {
  return pointAt(run, 0.5)
}

/**
 * Where a line's caption may go, in order of preference: the middle of the
 * run first, then further out on either side, so a caption crowded out of the
 * middle by place names can still sit somewhere along its line.
 */
export const CAPTION_FRACTIONS = [0.5, 0.35, 0.65, 0.2, 0.8] as const

/** A chevron (an open arrow) at a point, pointing along `angle`. */
export function chevronPath(at: RunPoint, size: number): string {
  const back = (side: number) => {
    const a = at.angle + Math.PI + side * 0.6
    return `${(at.x + Math.cos(a) * size).toFixed(1)} ${(at.y + Math.sin(a) * size).toFixed(1)}`
  }

  return `M${back(-1)}L${at.x.toFixed(1)} ${at.y.toFixed(1)}L${back(1)}`
}

/** A filled arrowhead whose tip is the run's last point. */
export function arrowheadPath(run: readonly ScreenPoint[], size: number): string | null {
  const tip = run.at(-1)

  if (tip === undefined) {
    return null
  }

  // Aim from a point a little way back, so the head follows the arc's curve
  // rather than the last few pixels of it.
  let from = run[run.length - 2]

  for (let i = run.length - 2; i >= 0; i--) {
    from = run[i]
    if (Math.hypot(tip.x - from.x, tip.y - from.y) >= size) break
  }

  if (from === undefined || (from.x === tip.x && from.y === tip.y)) {
    return null
  }

  const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
  const corner = (side: number) => {
    const a = angle + Math.PI + side * 0.45
    return `${(tip.x + Math.cos(a) * size).toFixed(1)} ${(tip.y + Math.sin(a) * size).toFixed(1)}`
  }

  return `M${tip.x.toFixed(1)} ${tip.y.toFixed(1)}L${corner(-1)}L${corner(1)}Z`
}

/** How a relationship family is drawn: the cue that is not colour (RFD 5). */
export type ArcForm = "solid" | "double" | "chevrons" | "beaded" | "dashed"

export type LineStyle = {
  readonly form: ArcForm
  /** The Tailwind stroke utility for the family's `rel-*` token. */
  readonly stroke: string
  /** The matching fill utility, for the arrowhead. */
  readonly fill: string
  /** `stroke-dasharray` in pixels, or null for a continuous stroke. */
  readonly dash: string | null
  readonly width: number
  readonly opacity: number
  readonly linecap: "butt" | "round"
}

// Full class names, so Tailwind's scanner finds every one of them.
const FAMILY_STYLES: Record<
  RelationshipFamily,
  Pick<LineStyle, "form" | "stroke" | "fill" | "dash" | "width" | "linecap">
> = {
  transmission: {
    form: "solid",
    stroke: "stroke-rel-transmission",
    fill: "fill-rel-transmission",
    dash: null,
    width: 2,
    linecap: "round",
  },
  diplomacy: {
    form: "double",
    stroke: "stroke-rel-diplomacy",
    fill: "fill-rel-diplomacy",
    dash: null,
    width: 1.25,
    linecap: "round",
  },
  conflict: {
    form: "chevrons",
    stroke: "stroke-rel-conflict",
    fill: "fill-rel-conflict",
    dash: null,
    width: 1.75,
    linecap: "round",
  },
  // A zero-length dash with a round cap is a dot: the beads of a trade arc.
  trade: {
    form: "beaded",
    stroke: "stroke-rel-trade",
    fill: "fill-rel-trade",
    dash: "0 7",
    width: 3.5,
    linecap: "round",
  },
  institution: {
    form: "dashed",
    stroke: "stroke-rel-institution",
    fill: "fill-rel-institution",
    dash: "6 4",
    width: 2,
    linecap: "butt",
  },
}

/**
 * A relationship arc's stroke. The family sets the pattern and the token; an
 * arc drawn because it touches the selection reads stronger than one its
 * layer orb drew, so the selection's relationships stand out of a busy layer.
 */
export function arcStyle(family: RelationshipFamily, emphasis: "selected" | "layer"): LineStyle {
  const base = FAMILY_STYLES[family]
  const selected = emphasis === "selected"
  return {
    ...base,
    width: base.width * (selected ? 1.25 : 1),
    opacity: selected ? 1 : 0.55,
  }
}

/** The journey line's pattern: RFD 5's `evidence-schematic`, a long dash `8 6`. */
export const JOURNEY_DASH = "8 6"
