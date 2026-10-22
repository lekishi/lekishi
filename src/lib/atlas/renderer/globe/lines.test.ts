import { describe, expect, it } from "vitest"
import { RELATIONSHIP_FAMILIES } from "../../overlays"
import { surfaceDistance, toEcef, type Vec3 } from "./geo"
import {
  JOURNEY_DASH,
  angularDistance,
  arcStyle,
  arrowheadPath,
  greatCircle,
  hiddenByEarth,
  journeyLine,
  legStyles,
  midpoint,
  offsetRun,
  pathData,
  pointsAlong,
  raisedArc,
  runLength,
  styledRuns,
  visibleRuns,
} from "./lines"

const yangzhou = { lon: 119.43, lat: 32.39 }
const akimeya = { lon: 130.2269, lat: 31.2672 }
const nara = { lon: 135.8, lat: 34.69 }

describe("great-circle sampling", () => {
  it("keeps both ends exactly and steps no wider than asked", () => {
    const points = greatCircle(yangzhou, akimeya, 0.5)

    expect(points[0]).toBe(yangzhou)
    expect(points.at(-1)).toBe(akimeya)

    for (let i = 1; i < points.length; i++) {
      expect(angularDistance(points[i - 1], points[i])).toBeLessThanOrEqual(0.5 + 1e-9)
    }
  })

  it("follows the surface, not a rhumb line: the middle bows toward the pole", () => {
    const points = greatCircle({ lon: 100, lat: 40 }, { lon: 140, lat: 40 }, 1)
    const northmost = points.reduce((a, b) => (b.lat > a.lat ? b : a))

    expect(northmost.lat).toBeGreaterThan(41)
    expect(Math.abs(northmost.lon - 120)).toBeLessThan(1)
  })
})

describe("journey lines", () => {
  it("joins consecutive stops at one place into one point of the line", () => {
    const yaku = { lon: 130.53, lat: 30.36 }
    const { samples, stopSample } = journeyLine([yangzhou, yaku, yaku, akimeya])

    // The arrival and departure at 益救嶋 sit at the same sample.
    expect(stopSample[1]).toBe(stopSample[2])
    expect(samples[stopSample[1]]).toEqual(yaku)
    expect(samples[stopSample[0]]).toEqual(yangzhou)
    expect(samples[stopSample[3]]).toEqual(akimeya)
    expect(stopSample).toEqual([...stopSample].sort((a, b) => a - b))

    // No zero-length leg anywhere.
    for (let i = 1; i < samples.length; i++) {
      expect(angularDistance(samples[i - 1], samples[i])).toBeGreaterThan(0)
    }
  })

  it("draws a single stop as a single point", () => {
    expect(journeyLine([nara]).samples).toEqual([nara])
  })
})

describe("relationship arcs", () => {
  it("rises from the ground at both ends to a crown in the middle", () => {
    const samples = raisedArc(yangzhou, nara)
    const crown = samples[Math.floor(samples.length / 2)]

    expect(samples[0].height).toBe(0)
    expect(samples.at(-1)?.height).toBe(0)
    expect(crown.height).toBeGreaterThan(100_000)
    expect(crown.height).toBeLessThan(surfaceDistance(yangzhou, nara) * 0.13)
    expect(samples[0]).toMatchObject(yangzhou)
    expect(samples.at(-1)).toMatchObject(nara)
  })

  it("keeps a short arc low and a long arc bounded", () => {
    const short = raisedArc({ lon: 135.8, lat: 34.69 }, { lon: 135.84, lat: 34.69 })
    const long = raisedArc({ lon: 0, lat: 0 }, { lon: 120, lat: 30 })
    const peak = (samples: { height: number }[]) => Math.max(...samples.map((s) => s.height))

    expect(peak(short)).toBeLessThanOrEqual(20_000)
    expect(peak(long)).toBeLessThanOrEqual(900_000)
  })

  it("bows to the left of its direction, so an arc and its reverse do not overlap", () => {
    // Along the equator, eastward: left of travel is north.
    const east = raisedArc({ lon: 100, lat: 0 }, { lon: 120, lat: 0 })
    const west = raisedArc({ lon: 120, lat: 0 }, { lon: 100, lat: 0 })
    const middle = (samples: { lat: number }[]) => samples[Math.floor(samples.length / 2)]

    expect(middle(east).lat).toBeGreaterThan(1)
    expect(middle(west).lat).toBeLessThan(-1)
    // The bow is modest: a connection, not a detour.
    expect(Math.abs(middle(east).lat)).toBeLessThan(20 * 0.15)
  })
})

describe("horizon clipping", () => {
  const eye: Vec3 = toEcef(130, 31, 2_000_000)

  it("shows the ground under the camera and hides the far side of the Earth", () => {
    expect(hiddenByEarth(toEcef(130, 31, 0), eye)).toBe(false)
    expect(hiddenByEarth(toEcef(132, 33, 0), eye)).toBe(false)
    expect(hiddenByEarth(toEcef(-50, -31, 0), eye)).toBe(true)
  })

  it("agrees with the markers' surface test on the ground", () => {
    const horizon2 = 6356752 * 6356752 * 0.999

    for (const lon of [100, 110, 120, 140, 150, 160, 170]) {
      const point = toEcef(lon, 31, 0)
      const markerVisible = point[0] * eye[0] + point[1] * eye[1] + point[2] * eye[2] > horizon2
      expect(hiddenByEarth(point, eye), `lon ${lon}`).toBe(!markerVisible)
    }
  })

  it("keeps a raised point visible above the horizon that hides the ground beneath it", () => {
    // Past the horizon on the ground, but high enough to be seen over it.
    const ground = toEcef(-170, 31, 0)
    const raised = toEcef(-170, 31, 900_000)

    expect(hiddenByEarth(ground, eye)).toBe(true)
    expect(hiddenByEarth(raised, eye)).toBe(false)
  })
})

describe("screen runs", () => {
  it("breaks a line at every hidden sample and drops single points", () => {
    const p = (x: number) => ({ x, y: 0 })
    const runs = visibleRuns([p(0), p(1), null, p(2), null, p(3), p(4), p(5)])

    expect(runs).toEqual([
      [p(0), p(1)],
      [p(3), p(4), p(5)],
    ])
    expect(pathData(runs)).toBe("M0.0 0.0L1.0 0.0M3.0 0.0L4.0 0.0L5.0 0.0")
  })

  it("offsets a run sideways for the diplomacy arc's double line", () => {
    const run = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]

    expect(offsetRun(run, 2).map((point) => point.y)).toEqual([2, 2, 2])
    expect(offsetRun(run, -2).map((point) => point.y)).toEqual([-2, -2, -2])
  })

  it("spaces chevrons evenly along a run, pointing the way it travels", () => {
    const run = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]
    const points = pointsAlong(run, 20)

    expect(runLength(run)).toBe(100)
    expect(points.map((point) => [point.x, point.y])).toEqual([
      [10, 0],
      [30, 0],
      [50, 0],
      [50, 20],
      [50, 40],
    ])
    expect(points[0].angle).toBe(0)
    expect(points.at(-1)?.angle).toBeCloseTo(Math.PI / 2)
    expect(midpoint(run)).toEqual({ x: 50, y: 0 })
  })

  it("puts the arrowhead's tip on the arc's end", () => {
    const head = arrowheadPath(
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
      ],
      9,
    )

    expect(head).toMatch(/^M30\.0 0\.0L/)
    expect(head?.endsWith("Z")).toBe(true)
    expect(arrowheadPath([{ x: 1, y: 1 }], 9)).toBeNull()
  })
})

describe("line styles", () => {
  it("gives every relationship family its own pattern and token (RFD 5)", () => {
    const forms = RELATIONSHIP_FAMILIES.map((family) => arcStyle(family, "selected").form)

    expect(forms).toEqual(["solid", "double", "chevrons", "beaded", "dashed"])
    expect(new Set(forms).size).toBe(RELATIONSHIP_FAMILIES.length)

    for (const family of RELATIONSHIP_FAMILIES) {
      expect(arcStyle(family, "selected").stroke).toBe(`stroke-rel-${family}`)
      expect(arcStyle(family, "selected").fill).toBe(`fill-rel-${family}`)
    }
  })

  it("draws trade as beads, institution as dashes, and the rest unbroken", () => {
    expect(arcStyle("trade", "layer")).toMatchObject({ dash: "0 7", linecap: "round" })
    expect(arcStyle("institution", "layer").dash).toBe("6 4")
    expect(arcStyle("transmission", "layer").dash).toBeNull()
    expect(arcStyle("diplomacy", "layer").dash).toBeNull()
    expect(arcStyle("conflict", "layer").dash).toBeNull()
  })

  it("draws an arc its layer drew lighter than one the selection touches", () => {
    for (const family of RELATIONSHIP_FAMILIES) {
      const layer = arcStyle(family, "layer")
      const selected = arcStyle(family, "selected")
      expect(layer.opacity).toBeLessThan(selected.opacity)
      expect(layer.width).toBeLessThan(selected.width)
    }
  })

  it("dashes journeys with RFD 5's schematic pattern", () => {
    expect(JOURNEY_DASH).toBe("8 6")
  })
})

describe("journey legs", () => {
  const p = (x: number) => ({ x, y: 0 })

  it("styles only the drawn legs, so an undrawn leg is a gap in the line", () => {
    // Stops at samples 0, 2, 4 and 5: legs 0→1 drawn, 1→2 not, 2→3 a drift.
    const styles = legStyles(
      [0, 2, 4, 5],
      [
        { from: 0, to: 1, drift: false },
        { from: 2, to: 3, drift: true },
      ],
      6,
    )

    expect(styles).toEqual(["none", "line", "line", "none", "none", "drift"])

    const points = [0, 1, 2, 3, 4, 5].map(p)

    expect(styledRuns(points, styles, (style) => style === "line")).toEqual([[p(0), p(1), p(2)]])
    expect(styledRuns(points, styles, (style) => style === "drift")).toEqual([[p(4), p(5)]])
    expect(styledRuns(points, styles, (style) => style !== "none")).toEqual([
      [p(0), p(1), p(2)],
      [p(4), p(5)],
    ])
  })

  it("breaks a run at a hidden sample and splits at the vessel", () => {
    const styles = legStyles([0, 4], [{ from: 0, to: 1, drift: false }], 5)
    const points = [p(0), p(1), null, p(3), p(4)]

    expect(styledRuns(points, styles, (style) => style === "line")).toEqual([
      [p(0), p(1)],
      [p(3), p(4)],
    ])
    expect(styledRuns([0, 1, 2, 3, 4].map(p), styles, () => true, 0, 2)).toEqual([
      [p(0), p(1), p(2)],
    ])
  })
})
