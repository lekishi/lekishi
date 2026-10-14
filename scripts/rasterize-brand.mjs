/**
 * Renders the raster icons from the logo SVGs that `brand.maintenance.test.ts`
 * writes (`pnpm brand` runs both, in that order):
 *
 * - `static/favicon.ico`: 16 px from the 16 px cut, 32 and 48 px from the
 *   32 px cut, for browsers and tools that do not read `favicon.svg`.
 * - `static/apple-touch-icon.png`: 180 px, the full mark on lacquer. iOS rounds
 *   the corners itself, so the tile is square.
 *
 * Chromium draws them, so the rasters match what a browser draws from the SVG.
 * `--check` compares the rendered bytes without rewriting them. Playwright's
 * pinned browser is the canonical renderer; the Nix shell provides that exact
 * browser revision through PLAYWRIGHT_BROWSERS_PATH.
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = (file) => readFileSync(path.join(root, file), "utf8")
const check = process.argv.includes("--check")

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })

async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block}</style>` +
      `<img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`,
  )
  await page.locator("img").evaluate((img) => img.decode())
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
}

/** An ICO whose entries are PNGs, which every current browser and OS reads. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...images.map(({ data }) => data)])
}

const tiny = source("scripts/brand/favicon-16.svg")
const small = source("static/favicon.svg")
const files = {
  "static/favicon.ico": ico([
    { size: 16, data: await png(tiny, 16) },
    { size: 32, data: await png(small, 32) },
    { size: 48, data: await png(small, 48) },
  ]),
  "static/apple-touch-icon.png": await png(source("scripts/brand/touch-icon.svg"), 180),
}
await browser.close()

for (const [file, data] of Object.entries(files)) {
  const target = path.join(root, file)
  if (check) {
    if (!readFileSync(target).equals(data)) throw new Error(`${file} is stale; run pnpm brand`)
  } else {
    writeFileSync(target, data)
  }
}
console.log(
  check
    ? "Checked static/favicon.ico and static/apple-touch-icon.png"
    : "Wrote static/favicon.ico and static/apple-touch-icon.png",
)
