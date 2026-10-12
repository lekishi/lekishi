import { describe, expect, it } from "vitest"
import { eyeFor, fromEcef, interpolatePose, poseOf, surfaceDistance, toEcef, WGS84 } from "./geo"

describe("geodesy", () => {
  it("puts the axes where the globe expects them", () => {
    expect(toEcef(0, 0)[0]).toBeCloseTo(WGS84.a, 3)
    expect(toEcef(90, 0)[1]).toBeCloseTo(WGS84.a, 3)
    expect(toEcef(0, 90)[2]).toBeCloseTo(WGS84.b, 3)
  })

  it("round-trips geodetic points to the centimetre", () => {
    for (const [lon, lat, height] of [
      [108.9594, 34.2914, 400],
      [135.8397, 34.6892, 0],
      [-70, -33, 5000],
    ]) {
      const back = fromEcef(...toEcef(lon, lat, height))
      expect(back.lon).toBeCloseTo(lon, 7)
      expect(back.lat).toBeCloseTo(lat, 7)
      expect(back.height).toBeCloseTo(height, 2)
    }
  })

  it("reads back the pose a camera was placed with", () => {
    const pose = { lon: 130.2, lat: 31.3, rangeM: 250_000, headingDeg: 30, pitchDeg: -45 }
    const { eye, target } = eyeFor(pose)
    const direction = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]] as const
    const back = poseOf(eye, direction)

    // The pose is read against the mean sphere, so the target is a few
    // kilometres off the ellipsoid's at this latitude.
    expect(back.lon).toBeCloseTo(pose.lon, 1)
    expect(back.lat).toBeCloseTo(pose.lat, 1)
    expect(back.headingDeg).toBeCloseTo(pose.headingDeg, 0)
    expect(back.pitchDeg).toBeCloseTo(pose.pitchDeg, 0)
    expect(Math.abs(back.rangeM - pose.rangeM)).toBeLessThan(15_000)
  })

  it("reads a camera looking past the Earth as one looking straight down", () => {
    const pose = poseOf([0, 0, 2e7], [1, 0, 0])

    expect(pose.lat).toBeCloseTo(90, 5)
    expect(pose.pitchDeg).toBe(-90)
  })

  it("flies the short way round and arrives exactly", () => {
    const from = { lon: 170, lat: 10, rangeM: 1e6, headingDeg: 0, pitchDeg: -90 }
    const to = { lon: -170, lat: 20, rangeM: 4e6, headingDeg: 0, pitchDeg: -90 }

    expect(interpolatePose(from, to, 0)).toMatchObject(from)
    expect(interpolatePose(from, to, 1)).toMatchObject(to)
    expect(interpolatePose(from, to, 0.5).lon).toBeCloseTo(180, 6)
  })

  it("climbs through the arc mid-flight and only then", () => {
    const from = { lon: 109, lat: 34, rangeM: 1.6e6, headingDeg: 0, pitchDeg: -90 }
    const to = { lon: 136, lat: 35, rangeM: 1.6e6, headingDeg: 0, pitchDeg: -90 }

    expect(interpolatePose(from, to, 0.5, 6e6).rangeM).toBeCloseTo(6e6, -3)
    expect(interpolatePose(from, to, 1, 6e6).rangeM).toBeCloseTo(1.6e6, 0)
    // No climb when the arc is lower than the flight already is.
    expect(interpolatePose(from, to, 0.5, 1e6).rangeM).toBeCloseTo(1.6e6, 0)
  })

  it("measures surface distance on the mean sphere", () => {
    // 長安 to 平城京, about 2,500 km.
    const d = surfaceDistance({ lon: 108.96, lat: 34.29 }, { lon: 135.84, lat: 34.69 })
    expect(d).toBeGreaterThan(2_400_000)
    expect(d).toBeLessThan(2_600_000)
  })
})
