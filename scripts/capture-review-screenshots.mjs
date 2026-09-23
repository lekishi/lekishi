#!/usr/bin/env node
/**
 * Captures the rendered atlas states a reviewer needs to see.
 *
 * The screenshots are evidence for the responsive-layout review (RFD 4 AC5):
 * desktop, tablet-class touch emulation, and the two phone widths the layout has
 * to hold at, each in the default, event-list-open, and selected states.
 *
 * Usage: start a server (`pnpm preview`, or `LEKISHI_E2E_MODE=dev pnpm dev`) and
 * run `node scripts/capture-review-screenshots.mjs`. Output goes to
 * `.amp/in/artifacts/`, which is ignored by Git.
 */
import { mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = path.join(repoRoot, ".amp", "in", "artifacts")
const baseURL = process.env.LEKISHI_E2E_BASE_URL ?? "http://127.0.0.1:4111"

const viewports = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "tablet-touch", width: 1024, height: 768, touch: true },
  { name: "phone-390", width: 390, height: 664, touch: true },
  { name: "phone-320", width: 320, height: 568, touch: true },
]

mkdirSync(outputDirectory, { recursive: true })

const browser = await chromium.launch()

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    hasTouch: viewport.touch,
    isMobile: viewport.touch,
  })
  const page = await context.newPage()

  await page.goto(`${baseURL}/atlas`, { waitUntil: "load" })
  await page
    .locator("#atlas-workspace canvas")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
  // Let Cesium finish its first tiles so the globe is not captured mid-load.
  await page.waitForTimeout(4_000)

  const shot = (state) =>
    page.screenshot({ path: path.join(outputDirectory, `atlas-${viewport.name}-${state}.png`) })

  await shot("default")

  const listToggle = page.locator("#atlas-list-toggle")

  if (await listToggle.isVisible()) {
    await listToggle.click()
  }

  await page.locator('[data-testid="atlas-event-item"]').first().waitFor({ state: "visible" })
  await shot("list")

  await page.locator('[data-testid="atlas-event-item"]').first().click()
  await page.locator('[data-testid="atlas-selection"]').waitFor({ state: "visible" })
  await page.waitForTimeout(2_000)
  await shot("selected")

  console.log(`captured ${viewport.name} (${viewport.width}x${viewport.height})`)

  await context.close()
}

// The overview page is the site's entry point, so capture it at the phone width
// where the atlas footer attribution is not shown. It runs in its own browser:
// the atlas contexts above hold WebGL surfaces, and a screenshot request after
// them can fail in the headless renderer.
const overviewBrowser = await chromium.launch()
const overview = await overviewBrowser.newContext({
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 2,
})
const overviewPage = await overview.newPage()

await overviewPage.goto(`${baseURL}/`, { waitUntil: "load" })
await overviewPage.waitForTimeout(1_000)
await overviewPage.screenshot({ path: path.join(outputDirectory, "overview-phone-390.png") })
console.log("captured overview at 390x664")

await overviewBrowser.close()
await browser.close()

console.log(`Screenshots written to ${path.relative(repoRoot, outputDirectory)}`)
