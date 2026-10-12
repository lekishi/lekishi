#!/usr/bin/env node
/**
 * Captures the rendered chapter states a reviewer needs to see.
 *
 * The screenshots are evidence for the shared chapter experience (RFD 4 RC1/RC4):
 * both chapters at the four reviewed viewports — desktop, 820x634, 390x844, and
 * 320x640 — with the exploration panel's surfaces (events with a search, story,
 * sources) and a selected disputed event whose details carry the dispute and its
 * citations.
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

const TANG = "/chapters/tang-mission-750-754"
const QIN = "/chapters/qin-conquest-han-233-226"

const viewports = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "820", width: 820, height: 634, touch: true },
  { name: "phone-390", width: 390, height: 844, touch: true },
  { name: "phone-320", width: 320, height: 640, touch: true },
]

mkdirSync(outputDirectory, { recursive: true })

const browser = await chromium.launch()

async function contextFor(viewport) {
  return browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    hasTouch: viewport.touch,
    isMobile: viewport.touch,
  })
}

/** Opens the exploration panel when it is behind the phone drawer toggle. */
async function openPanel(page) {
  const toggle = page.locator("#atlas-list-toggle")

  await toggle.waitFor({ state: "attached" })

  if (await toggle.isVisible()) {
    await toggle.click()
  }

  await page.locator('[data-testid="atlas-tab"]').first().waitFor({ state: "visible" })
}

/** Waits for a chapter to have mounted its globe. */
async function openChapter(page, route) {
  await page.goto(`${baseURL}${route}`, { waitUntil: "load" })
  await page
    .locator("#atlas-workspace canvas")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
  // Let the globe load its first tiles so the globe is not captured mid-load.
  await page.waitForTimeout(4_000)
}

for (const viewport of viewports) {
  const context = await contextFor(viewport)
  const page = await context.newPage()
  const shot = (state) =>
    page.screenshot({ path: path.join(outputDirectory, `chapter-${viewport.name}-${state}.png`) })

  await openChapter(page, TANG)
  await shot("tang-default")

  // A search that finds events by a participant's published romanization.
  await openPanel(page)
  await page.locator("#atlas-search").fill("Fujiwara no Kiyokawa")
  await page.locator('[data-testid="atlas-search-results"]').waitFor({ state: "visible" })
  await page.waitForTimeout(1_000)
  await shot("tang-search")

  await openChapter(page, QIN)
  await shot("qin-default")

  await openPanel(page)
  await page.locator("#atlas-tab-story").click()
  await page.locator('[data-testid="atlas-story"]').waitFor({ state: "visible" })
  await page.waitForTimeout(1_000)
  await shot("qin-story")

  await page.locator("#atlas-tab-sources").click()
  await page.locator('[data-testid="atlas-sources"]').waitFor({ state: "visible" })
  await page.waitForTimeout(1_000)
  await shot("qin-sources")

  // The disputed death: the badge in the list and the details panel with the
  // dispute, its accounts, and the event's citations.
  await page.locator("#atlas-tab-events").click()

  const row = page.locator('[data-event-id="lks:event:hanfei-death-233"]')

  await row.scrollIntoViewIfNeeded()
  await row.click()
  await page.locator('[data-testid="atlas-dispute"]').waitFor({ state: "visible" })
  await page.waitForTimeout(2_000)
  await shot("qin-selected")

  console.log(`captured ${viewport.name} (${viewport.width}x${viewport.height})`)

  await context.close()
}

// The root page is the chapters' entry point: one card per chapter, with the
// decision each ledger row records.
const overviewContext = await contextFor({ width: 390, height: 844, touch: false })
const overviewPage = await overviewContext.newPage()

await overviewPage.goto(`${baseURL}/`, { waitUntil: "load" })
await overviewPage.waitForTimeout(1_000)
await overviewPage.screenshot({ path: path.join(outputDirectory, "chapter-root-phone-390.png") })
console.log("captured the root page at 390x844")

await overviewContext.close()
await browser.close()

console.log(`Screenshots written to ${path.relative(repoRoot, outputDirectory)}`)
