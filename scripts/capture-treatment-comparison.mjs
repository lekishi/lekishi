#!/usr/bin/env node
/**
 * Captures the treatment comparison's matched screenshots.
 *
 * The bounded RFD 1/RFD 3 comparison is between two local-detail treatments over
 * the same chapters and the same behavior. This script is what makes the
 * comparison inspectable: for each served chapter, each treatment, and each of
 * the four reviewed viewports, it captures the same three states — the chapter's
 * dense default list, a selected in-window event, and the chapter's disputed
 * event with its accounts — from the comparison's own surface, so the only
 * difference between the two runs is the treatment.
 *
 * It also captures the served reader pages for reference, so a reviewer can see
 * that the shipped surface is the geographic/symbolic treatment.
 *
 * Usage: start a server (`pnpm preview`, or `pnpm dev`), then
 * `node scripts/capture-treatment-comparison.mjs`. Output goes to
 * `.amp/in/artifacts/treatment-comparison/`, which is ignored by Git.
 */
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = path.join(repoRoot, ".amp", "in", "artifacts", "treatment-comparison")
const baseURL = process.env.LEKISHI_E2E_BASE_URL ?? "http://127.0.0.1:4111"

/** Re-capture every state even when its file exists; the default resumes. */
const force = process.env.LEKISHI_CAPTURE_FORCE === "1"

const CHAPTERS = [
  {
    id: "tang-mission-750-754",
    /** A documented voyage event: the illustrated treatment's voyage vignette. */
    selected: "lks:event:return-voyage-753",
    /** The chapter's in-window disputed record: the 七日 reading dispute. */
    disputed: "lks:event:yaku-arrival-753",
  },
  {
    id: "qin-conquest-han-233-226",
    /** An event the atlas does not place: the card must keep the record's own note. */
    selected: "lks:event:han-nanyang-cession-231",
    /** The chapter's disputed death: three accounts, one published place. */
    disputed: "lks:event:hanfei-death-233",
  },
]

const TREATMENTS = ["geographic-symbolic", "illustrated-local"]

const VIEWPORTS = [
  { name: "desktop-1440x900", width: 1440, height: 900, touch: false },
  { name: "tablet-820x634", width: 820, height: 634, touch: true },
  { name: "phone-390x844", width: 390, height: 844, touch: true },
  { name: "phone-320x640", width: 320, height: 640, touch: true },
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

/** Waits until a page has mounted its globe and settled its first tiles. */
async function waitForGlobe(page, settleMs = 2_000) {
  await page
    .locator("#atlas-workspace canvas")
    .first()
    .waitFor({ state: "visible", timeout: 60_000 })
  await page.waitForTimeout(settleMs)
}

/** Opens the exploration panel when it is behind the phone drawer toggle. */
async function openPanel(page) {
  const toggle = page.locator("#atlas-list-toggle")

  await toggle.waitFor({ state: "attached" })

  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click()
  }

  await page.locator('[data-testid="atlas-tab"]').first().waitFor({ state: "visible" })
}

/** Selects an event from the panel's list, opening the drawer when it is closed. */
async function selectEvent(page, eventId) {
  await openPanel(page)

  const row = page.locator(`[data-event-id="${eventId}"]`)

  await row.scrollIntoViewIfNeeded()
  await row.click()
  await page.locator("#atlas-selection").waitFor({ state: "visible" })
  await page.waitForTimeout(1_000)
}

/**
 * Captures one state unless it is already on disk.
 *
 * The capture is long (each screenshot is a software-rendered WebGL frame) and a
 * rebuild of the artifact underneath it, or any other interruption, ends the run;
 * resuming means re-running the command rather than losing every state.
 */
async function capture(page, name) {
  const target = path.join(outputDirectory, `${name}.png`)

  if (!force && existsSync(target)) {
    console.log(`kept ${name}`)
    return
  }

  await page.screenshot({ path: target })
  console.log(`captured ${name}`)
}

/**
 * True when every state of a combination is already on disk.
 *
 * The capture is long and resumable, so a resumed run must not pay for a page
 * load per state it is only going to skip; checking the whole combination first
 * makes the fill-in run seconds long instead of minutes.
 */
function alreadyCaptured(names) {
  return !force && names.every((name) => existsSync(path.join(outputDirectory, `${name}.png`)))
}

for (const viewport of VIEWPORTS) {
  const context = await contextFor(viewport)
  const page = await context.newPage()

  for (const chapter of CHAPTERS) {
    for (const treatment of TREATMENTS) {
      const prefix = `${chapter.id}-${treatment}-${viewport.name}`
      const states = [`${prefix}-default`, `${prefix}-selected`, `${prefix}-dispute`]

      if (alreadyCaptured(states)) {
        console.log(`kept ${prefix}`)
        continue
      }

      try {
        // The comparison's own surface for both treatments, so the page chrome is
        // identical and the treatment is the only difference between the runs.
        await page.goto(`${baseURL}/review/local-treatment/${chapter.id}`, { waitUntil: "load" })
        await waitForGlobe(page)

        if (treatment === "illustrated-local") {
          await page.locator("#review-treatment-illustrated-local").click()
          await waitForGlobe(page)
        }

        await capture(page, states[0])

        await selectEvent(page, chapter.selected)
        await capture(page, states[1])

        await selectEvent(page, chapter.disputed)
        await capture(page, states[2])
      } catch (error) {
        // One failed combination must not end the run: the rest of the matrix is
        // still evidence, and a resumed run picks up the missing states.
        console.error(`failed ${prefix}: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  await context.close()
}

// The served reader pages, for reference: the shipped treatment as a reader meets
// it, dense and with the chapter's disputed event selected, at every reviewed
// size. These are the Gate 2 evidence's rendered states (the same states the
// comparison captures, on the surface a reader actually gets).
for (const viewport of VIEWPORTS) {
  const context = await contextFor(viewport)
  const page = await context.newPage()

  for (const chapter of CHAPTERS) {
    const states = [
      `reader-${chapter.id}-${viewport.name}`,
      `reader-${chapter.id}-${viewport.name}-dispute`,
    ]

    if (alreadyCaptured(states)) {
      console.log(`kept ${states[0]}`)
      continue
    }

    try {
      await page.goto(`${baseURL}/chapters/${chapter.id}`, { waitUntil: "load" })
      await waitForGlobe(page)
      await capture(page, states[0])

      await selectEvent(page, chapter.disputed)
      await capture(page, states[1])
    } catch (error) {
      console.error(
        `failed reader-${chapter.id}-${viewport.name}: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  await context.close()
}

await browser.close()

console.log(`Screenshots written to ${path.relative(repoRoot, outputDirectory)}`)
