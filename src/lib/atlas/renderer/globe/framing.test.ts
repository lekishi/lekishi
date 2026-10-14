import { describe, expect, it } from "vitest"
import { principalOffset, ViewThrottle } from "./framing"

describe("the clear zone's centre", () => {
  it("is the canvas centre without insets", () => {
    expect(principalOffset(1440, 900, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it("moves the axis between the rails and above the timeline", () => {
    // RFD 5's desktop frame: a 288 px left rail, a 384 px right rail, the
    // date bar on top and the timeline strip at the bottom.
    const offset = principalOffset(1440, 900, { top: 56, right: 384, bottom: 120, left: 288 })
    const axisX = 1440 / 2 - offset.x
    const axisY = 900 / 2 - offset.y

    expect(axisX).toBe(288 + (1440 - 288 - 384) / 2)
    expect(axisY).toBe(56 + (900 - 56 - 120) / 2)
  })

  it("keeps a clear zone when the chrome reports more than the canvas", () => {
    const offset = principalOffset(390, 844, { top: 0, right: 0, bottom: 2000, left: 0 })
    const axisY = 844 / 2 - offset.y

    // The bottom sheet cannot push the axis off the screen: at least 30 % of
    // the height stays clear above it.
    expect(axisY).toBeCloseTo((844 * 0.3) / 2)
    expect(offset.x).toBe(0)
  })

  it("ignores negative and non-finite insets", () => {
    expect(principalOffset(800, 600, { top: -20, right: Number.NaN, bottom: 0, left: 0 })).toEqual({
      x: 0,
      y: 0,
    })
  })
})

describe("view reports", () => {
  it("reports at most once per interval while moving, and once on settling", () => {
    const throttle = new ViewThrottle(250)
    const reports: number[] = []
    const frame = (now: number, moved: boolean) => {
      if (throttle.frame(now, moved)) reports.push(now)
    }

    for (let now = 0; now <= 600; now += 16) frame(now, true)
    frame(616, false)
    frame(632, false)

    expect(reports.slice(0, -1)).toEqual([0, 256, 512])
    // The settled position is always the last report, once.
    expect(reports.at(-1)).toBe(616)
  })

  it("stays quiet while nothing moves", () => {
    const throttle = new ViewThrottle(250)

    expect(throttle.frame(0, false)).toBe(false)
    expect(throttle.frame(1000, false)).toBe(false)
  })
})
