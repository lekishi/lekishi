import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "vitest"
import { brandFiles } from "./brand"
import { ROOT, tokenColours } from "./brand-files"

/**
 * Maintenance entry point, not a test.
 *
 * `pnpm brand` runs this file with `LEKISHI_BRAND=1` after the mark, the
 * wordmark or the colour tokens change: it rewrites the logo SVGs from
 * `brand.ts`, then `scripts/rasterize-brand.mjs` renders the PNG and ICO icons
 * from them. It is skipped in the normal suite on purpose, where `brand.test.ts`
 * fails on stale files instead of silently regenerating them.
 */
describe("regenerating the logo files", () => {
  it.skipIf(process.env.LEKISHI_BRAND !== "1")("writes every file from brand.ts", () => {
    for (const [file, content] of Object.entries(brandFiles(tokenColours()))) {
      mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true })
      writeFileSync(path.join(ROOT, file), content)
    }
  })
})
