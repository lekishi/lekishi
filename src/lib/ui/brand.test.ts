import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { brandFiles, cutFor, markDrawing, PLAYHEAD_ANGLE, TILT } from "./brand"
import { ROOT, tokenColours } from "./brand-files"

/**
 * The shipped logo files are generated from `brand.ts` with the colours in
 * `src/app.css` (`pnpm brand`). This fails when either changes without them, so
 * the header, the favicon and the design reference cannot drift apart.
 */

describe("the mark's construction", () => {
  it("leans by the Earth's axial tilt and puts the playhead on the axis", () => {
    expect(TILT).toBe(23.4)
    expect(PLAYHEAD_ANGLE).toBeCloseTo(-66.6)
  })

  it("has exactly one gold shape in every cut", () => {
    for (const cut of ["full", "small", "tiny"] as const) {
      const accents = markDrawing(cut).shapes.filter((shape) => shape.paint === "accent")
      expect(accents, cut).toHaveLength(1)
    }
  })

  it("changes cut at 32 and 16 px", () => {
    expect([64, 33, 32, 24, 17, 16, 12].map(cutFor)).toEqual([
      "full",
      "full",
      "small",
      "small",
      "small",
      "tiny",
      "tiny",
    ])
  })
})

describe("the shipped logo files", () => {
  for (const [file, content] of Object.entries(brandFiles(tokenColours()))) {
    it(`${file} matches brand.ts (run pnpm brand after changing either)`, () => {
      expect(readFileSync(path.join(ROOT, file), "utf8")).toBe(content)
    })
  }
})
