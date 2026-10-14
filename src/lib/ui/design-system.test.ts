import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

/**
 * Keeps markup on the design system in `docs/design-system.md` (RFD 5).
 *
 * Screens style themselves only through the tokens in `src/app.css`
 * (`bg-lacquer`, `text-ink-dim`, `rounded-plate`, `text-title`). A raw Tailwind
 * palette colour, a hex value, a default type size or an off-scale radius
 * bypasses the system and drifts from it, so this test rejects them.
 *
 * Files written before the tokens are listed in `LEGACY` with the number of
 * violations they still carry. The count must match exactly: it may only go
 * down, and lowering it is part of the change that removes a violation, so the
 * ratchet cannot slip back. A file leaves the list at zero, new files never
 * join it, and once the list is empty `src/app.css` clears Tailwind's defaults
 * and this test's job passes to the build itself.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const LEGACY: Record<string, number> = {
}

/**
 * Deliberate exceptions, matched by exact text, each with the reason it is not
 * a token. They are not counted against a file.
 */
const ALLOWED: Record<string, { readonly matches: readonly string[]; readonly reason: string }> = {
  "lib/atlas/renderer/globe/view.ts": {
    matches: ["#020617", "#9fc4dc", "#b6ccd9", "#5a86ab", "#fff1dc", "#dcecff", "#6b5a3b"],
    reason:
      "The 3D scene's sky, atmosphere and lights are rendering parameters for WebGL, not interface colours.",
  },
}

const PALETTE =
  "slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const UTILITIES =
  "bg|text|border|ring|ring-offset|divide|outline|fill|stroke|from|via|to|decoration|placeholder|caret|accent|shadow|inset-shadow"
const VARIANTS = String.raw`(?:[\w-]+(?:\[[^\]]*\])?:)*`

const RULES: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  {
    name: "raw Tailwind palette colour",
    pattern: new RegExp(
      String.raw`(?<![\w-])${VARIANTS}(?:${UTILITIES})(?:-[trblxyse]{1,2})?-(?:(?:${PALETTE})-\d{2,3}|black|white)(?:\/(?:\d{1,3}|\[[^\]]+\]))?(?![\w-])`,
      "g",
    ),
  },
  {
    name: "hex colour",
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g,
  },
  {
    name: "Tailwind type size instead of the type scale",
    pattern: new RegExp(
      String.raw`(?<![\w-])${VARIANTS}text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/[\w.\[\]-]+)?(?![\w-])`,
      "g",
    ),
  },
  {
    name: "arbitrary text size",
    pattern: new RegExp(
      String.raw`(?<![\w-])${VARIANTS}text-\[(?:\d|\.)[^\]]*(?:px|rem|em)\](?![\w-])`,
      "g",
    ),
  },
  {
    name: "radius outside the radius scale",
    pattern: new RegExp(
      String.raw`(?<![\w-])${VARIANTS}rounded(?:-[trblse]{1,2})?(?:-(?:xs|sm|md|lg|xl|[2-4]xl|\[[^\]]+\]))?(?![\w-])`,
      "g",
    ),
  },
]

/**
 * The source without its comments. Comments are prose ("rounded to the year",
 * "a hex like #fff"), not markup, and the rules only judge what renders.
 */
function withoutComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<![:"'`\w])\/\/.*$/gm, "")
}

/** Every violation in a source text, as "rule: match" strings. */
function violationsIn(text: string, allowed: readonly string[] = []): string[] {
  const found: string[] = []
  const code = withoutComments(text)
  for (const { name, pattern } of RULES) {
    for (const match of code.matchAll(pattern)) {
      const value = match[0]
      if (!allowed.some((allow) => value.endsWith(allow))) found.push(`${name}: ${value}`)
    }
  }
  return found
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.(svelte|ts)$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) return []
    return [full]
  })
}

function violationsByFile(): Map<string, string[]> {
  const byFile = new Map<string, string[]>()
  for (const file of sourceFiles(SRC)) {
    const relative = path.relative(SRC, file).split(path.sep).join("/")
    const found = violationsIn(readFileSync(file, "utf8"), ALLOWED[relative]?.matches ?? [])
    if (found.length > 0) byFile.set(relative, found)
  }
  return byFile
}

describe("the design-system rules", () => {
  test.each([
    "bg-slate-900",
    "hover:border-amber-300/80",
    "focus-visible:outline-amber-300",
    "bg-mauve-500",
    "text-olive-300",
    "border-mist-700",
    "fill-taupe-200",
    "text-white",
    "bg-black/60",
    "bg-[#0b1114]",
    "text-sm",
    "md:text-2xl",
    "text-[0.65rem]",
    "text-[11px]",
    "rounded",
    "rounded-lg",
    "rounded-t-2xl",
    "rounded-[40px]",
  ])("rejects %s", (className) => {
    expect(violationsIn(`<div class="${className}"></div>`)).not.toEqual([])
  })

  test("ignores comments, which are prose rather than markup", () => {
    const source = `
      <!-- the old card was rounded-2xl on bg-slate-900 -->
      /* #fff was the hero's paper */
      // values are rounded to the year
      <a class="text-ink" href="https://example.org/a//b">x</a>
    `
    expect(violationsIn(source)).toEqual([])
  })

  test("accepts the tokens and Svelte's own syntax", () => {
    const markup = `
      {#each items as item (item.id)}
        <div class="bg-lacquer-glass border-frame text-ink-dim rounded-plate text-title-sm"></div>
        <span class="text-label text-caption rounded-control rounded-full focus-visible:outline-gold-bright"></span>
        <a href="#chapters" class="text-on-gold bg-gold hover:bg-gold-bright">x</a>
      {/each}
    `
    expect(violationsIn(markup)).toEqual([])
  })
})

describe("the source tree", () => {
  const byFile = violationsByFile()

  test("files outside the legacy list use only the tokens", () => {
    const offenders = [...byFile].filter(([file]) => !(file in LEGACY))
    expect(
      offenders,
      "Use the tokens in src/app.css (docs/design-system.md); new files never join LEGACY.",
    ).toEqual([])
  })

  test("legacy counts match, so they can only go down", () => {
    const actual = Object.fromEntries(
      Object.keys(LEGACY).map((file) => [file, byFile.get(file)?.length ?? 0]),
    )
    expect(
      actual,
      "A legacy file's count changed. Lower LEGACY to the new count when it went down; remove the file at zero.",
    ).toEqual(LEGACY)
  })

  test("every allowed exception is still present", () => {
    for (const [file, { matches }] of Object.entries(ALLOWED)) {
      const text = readFileSync(path.join(SRC, file), "utf8")
      for (const match of matches)
        expect(text, `${file} no longer contains ${match}`).toContain(match)
    }
  })
})
