/**
 * Reads the design tokens out of `src/app.css` for the `/dev/design` reference.
 *
 * The reference shows what the stylesheet defines rather than a copy of it, so
 * a token changed in `app.css` changes on the page with it and the two cannot
 * drift. Contrast is computed here, against `lacquer` as RFD 5 measures it,
 * so a value that falls below AA shows up on the page beside its swatch.
 */

export type Token = { readonly name: string; readonly value: string }

export type Tokens = {
  readonly colors: readonly Token[]
  readonly text: readonly (Token & { readonly lineHeight?: string; readonly tracking?: string })[]
  readonly fonts: readonly Token[]
  readonly radii: readonly Token[]
  readonly shadows: readonly Token[]
  readonly easing: readonly Token[]
  /** The non-theme custom properties: motion durations and the z-order ladder. */
  readonly motion: readonly Token[]
  readonly layers: readonly Token[]
}

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")

/** The declarations inside the first block that `opener` starts. */
function block(css: string, opener: RegExp): Map<string, string> {
  const start = css.search(opener)
  if (start < 0) return new Map()
  let depth = 0
  let open = -1
  let end = -1
  for (let index = start; index < css.length; index++) {
    if (css[index] === "{") {
      if (depth === 0) open = index
      depth++
    } else if (css[index] === "}") {
      depth--
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  const body = css.slice(open + 1, end)
  const declarations = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    // The first declaration wins: a later one inside the same block is a
    // media-query override (reduced motion), not the token's value.
    if (!declarations.has(name)) declarations.set(name, value.replace(/\s+/g, " ").trim())
  }
  return declarations
}

function prefixed(declarations: Map<string, string>, prefix: string): Token[] {
  return [...declarations]
    .filter(([name]) => name.startsWith(prefix) && !name.includes("--"))
    .map(([name, value]) => ({ name: name.slice(prefix.length), value }))
}

export function parseTokens(stylesheet: string): Tokens {
  const css = withoutComments(stylesheet)
  const theme = block(css, /@theme\b[^{]*\{/)
  const root = block(css, /:root\s*\{/)
  return {
    colors: prefixed(theme, "color-"),
    text: prefixed(theme, "text-").map((token) => ({
      ...token,
      lineHeight: theme.get(`text-${token.name}--line-height`),
      tracking: theme.get(`text-${token.name}--letter-spacing`),
    })),
    fonts: prefixed(theme, "font-"),
    radii: prefixed(theme, "radius-"),
    shadows: prefixed(theme, "shadow-"),
    easing: prefixed(theme, "ease-"),
    motion: prefixed(root, "motion-"),
    layers: prefixed(root, "z-"),
  }
}

type Rgba = readonly [number, number, number, number]

/** A token's colour as RGBA, for the two forms the stylesheet uses. */
export function parseColor(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const n = Number.parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i.exec(value.trim())
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1)
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha]
  }
  return null
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (i: 0 | 1 | 2) => top[i] * top[3] + bottom[i] * (1 - top[3])
  return [mix(0), mix(1), mix(2), 1]
}

function luminance([r, g, b]: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * A translucent colour flattened onto an opaque background, as `rgb()`, so a
 * tint can itself be measured as the surface text sits on.
 */
export function composite(value: string, background: string): string | null {
  const top = parseColor(value)
  const bottom = parseColor(background)
  if (!top || !bottom) return null
  const [r, g, b] = over(top, bottom).map(Math.round)
  return `rgb(${r} ${g} ${b})`
}

/**
 * WCAG contrast of `foreground` on `background`, compositing a translucent
 * foreground over the background first. Null when either is not a colour the
 * parser reads.
 */
export function contrast(foreground: string, background: string): number | null {
  const bg = parseColor(background)
  const fg = parseColor(foreground)
  if (!bg || !fg || bg[3] !== 1) return null
  const [lighter, darker] = [luminance(over(fg, bg)), luminance(bg)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

/** "AA", "AA large" or "below AA" for body text at a contrast ratio. */
export function contrastGrade(ratio: number): "AAA" | "AA" | "AA large" | "below AA" {
  if (ratio >= 7) return "AAA"
  if (ratio >= 4.5) return "AA"
  if (ratio >= 3) return "AA large"
  return "below AA"
}
