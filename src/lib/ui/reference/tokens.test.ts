import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { composite, contrast, contrastGrade, parseColor, parseTokens } from "./tokens"

const stylesheet = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../app.css"),
  "utf8",
)
const tokens = parseTokens(stylesheet)
const value = (list: readonly { name: string; value: string }[], name: string) =>
  list.find((token) => token.name === name)?.value

describe("parseTokens", () => {
  it("reads the stylesheet's own tokens, so the reference cannot drift from it", () => {
    expect(value(tokens.colors, "lacquer")).toBe("#121a20")
    expect(value(tokens.colors, "frame")).toBe("rgb(210 169 79 / 0.35)")
    expect(tokens.text.map((token) => token.name)).toEqual([
      "label",
      "caption",
      "body-sm",
      "body",
      "title-sm",
      "title",
      "display",
    ])
    expect(tokens.text[0]).toMatchObject({ value: "11px", lineHeight: "14px", tracking: "0.16em" })
    expect(tokens.radii.map((token) => token.name)).toEqual(["control", "plate"])
    expect(value(tokens.fonts, "display")).toMatch(/^"Cinzel"/)
  })

  it("keeps the motion durations' values, not their reduced-motion override", () => {
    expect(value(tokens.motion, "fast")).toBe("120ms")
    expect(tokens.layers.map((token) => [token.name, token.value])).toEqual([
      ["scene", "0"],
      ["markers", "10"],
      ["labels", "11"],
      ["chrome", "20"],
      ["sheet", "30"],
      ["alert", "40"],
    ])
  })
})

describe("contrast", () => {
  it("matches RFD 5's measured figures against lacquer", () => {
    expect(contrast("#f3ead7", "#121a20")).toBeCloseTo(14.7, 1)
    expect(contrast("#8f877a", "#121a20")).toBeCloseTo(4.95, 1)
    // The hero's ink-faint, which RFD 5 raised because it fails AA.
    expect(contrastGrade(contrast("#7f786b", "#121a20")!)).toBe("AA large")
  })

  // Every text tier the primitives set on each solid surface they sit on: the
  // placeholder, a selected tab's count and a hovered citation's terms put
  // ink-dim on lacquer-raised. ink-faint belongs on solid lacquer only; glass
  // is checked separately below, because the scene shows through it.
  it.each([
    ["ink", "lacquer"],
    ["ink-dim", "lacquer"],
    ["ink-faint", "lacquer"],
    ["ink", "lacquer-raised"],
    ["ink-dim", "lacquer-raised"],
    ["on-gold", "gold"],
    ["on-gold", "gold-bright"],
  ])("keeps %s text at AA on %s", (foreground, background) => {
    const ratio = contrast(value(tokens.colors, foreground)!, value(tokens.colors, background)!)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it("keeps ink-dim at AA on glass even over the brightest scene", () => {
    const glass = composite(value(tokens.colors, "lacquer-glass")!, "#ffffff")!
    expect(contrast(value(tokens.colors, "ink-dim")!, glass)!).toBeGreaterThanOrEqual(4.5)
  })

  it("composites a translucent colour over the background", () => {
    expect(parseColor("rgb(210 169 79 / 0.35)")).toEqual([210, 169, 79, 0.35])
    expect(contrast("rgb(210 169 79 / 0.35)", "#121a20")!).toBeLessThan(
      contrast("#d2a94f", "#121a20")!,
    )
    expect(contrast("var(--x)", "#121a20")).toBeNull()
    expect(composite("rgb(210 169 79 / 0.14)", "#121a20")).toBe("rgb(45 46 39)")
  })
})
