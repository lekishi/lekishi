#!/usr/bin/env node
/**
 * Measures the treatment comparison.
 *
 * The comparison's criteria are defined in the RFD before anything is measured;
 * this script is what produces the numbers for three of them:
 *
 * * payload — the artifact's file count and bytes, the bytes of the chunks that
 *   carry the illustrated treatment, and the review pages' own bytes;
 * * label crowding — the anchors the default window's labels share, the most
 *   labels on one anchor, and the closest pair of distinct anchors. This is a
 *   content-level measure of what the map has to draw, cross-checked against the
 *   event count the served page actually renders;
 * * load and interaction timings — navigation to a mounted globe and selection
 *   to visible details, per chapter and treatment. The renderer is the
 *   container's software WebGL, so these numbers compare the two treatments
 *   against each other on one machine; they are not device evidence.
 *
 * Usage: build (`pnpm build`), serve the artifact, then
 * `node scripts/measure-treatment-comparison.mjs`. Output goes to
 * `.amp/in/artifacts/treatment-comparison/measurements.json`.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const buildDirectory = path.join(repoRoot, "build")
const chaptersDirectory = path.join(repoRoot, "historical", "chapters")
const outputDirectory = path.join(repoRoot, ".amp", "in", "artifacts", "treatment-comparison")
const baseURL = process.env.LEKISHI_E2E_BASE_URL ?? "http://127.0.0.1:4111"

/**
 * The chapters the site serves, with the default window the registry gives each
 * one (the same numbers `src/lib/atlas/chapter-registry.ts` passes the
 * projection). The rendered event count is cross-checked against the profile
 * below, so a window that drifted fails the measurement instead of quietly
 * measuring the wrong set.
 */
const CHAPTERS = [
  { id: "tang-mission-750-754", window: { start: 750, end: 754 } },
  { id: "qin-conquest-han-233-226", window: { start: -232, end: -225 } },
]

mkdirSync(outputDirectory, { recursive: true })

// --- payload -----------------------------------------------------------------

function walk(directory) {
  const entries = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      entries.push(...walk(full))
    } else {
      entries.push(full)
    }
  }

  return entries
}

function relative(file) {
  return path.relative(buildDirectory, file).split(path.sep).join("/")
}

const files = walk(buildDirectory)
const bytes = (subset) => subset.reduce((total, file) => total + statSync(file).size, 0)
const javascript = files.filter(
  (file) => file.endsWith(".js") && !relative(file).startsWith("cesium/"),
)
const stylesheets = files.filter(
  (file) => file.endsWith(".css") && !relative(file).startsWith("cesium/"),
)
const reviewPages = files.filter((file) => relative(file).startsWith("review/local-treatment/"))

/**
 * The bytes a page actually loads.
 *
 * SvelteKit's prerendered HTML lists the chunks the page needs (the client entry
 * and its modulepreload links), so summing those files' sizes is what a reader
 * downloads for that page — the honest payload comparison between the reader
 * surface and the comparison surface.
 */
function loadedBy(pageFile) {
  const html = readFileSync(path.join(buildDirectory, pageFile), "utf8")
  const referenced = new Set(
    [...html.matchAll(/_app\/immutable\/[A-Za-z0-9_./-]+\.js/g)].map((match) => match[0]),
  )

  return {
    page: pageFile,
    htmlBytes: statSync(path.join(buildDirectory, pageFile)).size,
    javascriptFiles: referenced.size,
    javascriptBytes: bytes([...referenced].map((file) => path.join(buildDirectory, file))),
  }
}

const payload = {
  files: files.length,
  bytes: bytes(files),
  javascriptFiles: javascript.length,
  javascriptBytes: bytes(javascript),
  stylesheetBytes: bytes(stylesheets),
  reviewPages: reviewPages.map((file) => ({ file: relative(file), bytes: statSync(file).size })),
  loaded: [
    loadedBy("index.html"),
    loadedBy("chapters/tang-mission-750-754.html"),
    loadedBy("chapters/qin-conquest-han-233-226.html"),
    loadedBy("review/local-treatment/tang-mission-750-754.html"),
    loadedBy("review/local-treatment/qin-conquest-han-233-226.html"),
  ],
}

// --- label crowding ----------------------------------------------------------

/** The published revision's content for a record, as the projection reads it. */
function publishedContent(record) {
  const revisionId = record.publication.published_revision_id
  const revision = record.revisions.find((candidate) => candidate.revision_id === revisionId)

  return revision.content
}

function placePoints(chapterId) {
  const directory = path.join(chaptersDirectory, chapterId, "records")
  const points = new Map()

  for (const file of readdirSync(directory).filter((name) => name.startsWith("place-"))) {
    const record = JSON.parse(readFileSync(path.join(directory, file), "utf8"))
    const content = publishedContent(record)
    const geometry = content.geometry?.find((entry) => entry.geojson?.type === "Point")

    if (geometry !== undefined) {
      points.set(record.record_id, geometry.geojson.coordinates)
    }
  }

  return points
}

/** A contract year endpoint as the astronomical ordinal the atlas computes with. */
function astronomical(endpoint) {
  return endpoint.era === "bce" ? 1 - endpoint.year : endpoint.year
}

/** The distance between two lon/lat points in kilometres, on a spherical earth. */
function distanceKm([lonA, latA], [lonB, latB]) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const dLat = toRadians(latB - latA)
  const dLon = toRadians(lonB - lonA)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(dLon / 2) ** 2

  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

function crowding(chapter) {
  const directory = path.join(chaptersDirectory, chapter.id, "records")
  const points = placePoints(chapter.id)
  const labelsPerAnchor = new Map()
  let inWindow = 0
  let placed = 0

  for (const file of readdirSync(directory).filter((name) => name.startsWith("event-"))) {
    const record = JSON.parse(readFileSync(path.join(directory, file), "utf8"))
    const content = publishedContent(record)
    const interval = content.time.interval
    // The contract's own normalization: a BCE year is the astronomical ordinal
    // (233 BCE is -232), which is what the window and the atlas compute with.
    const start = astronomical(interval.start)
    const end = interval.end === undefined ? start : astronomical(interval.end)

    // The default window is inclusive at both ends, as the projection's is.
    if (start > chapter.window.end || end < chapter.window.start) {
      continue
    }

    inWindow += 1

    // The projection places an event through the first place reference that is
    // not context-only and carries a point; a place named as context never moves
    // a marker, and a place with no sourced position cannot place one.
    const site = content.places?.find(
      (place) => place.role !== "context" && points.has(place.place_id),
    )
    const coordinates = site === undefined ? undefined : points.get(site.place_id)

    if (coordinates === undefined) {
      continue
    }

    placed += 1
    const key = `${coordinates[0]},${coordinates[1]}`
    labelsPerAnchor.set(key, (labelsPerAnchor.get(key) ?? 0) + 1)
  }

  const anchors = [...labelsPerAnchor.entries()].map(([key, count]) => {
    const [lon, lat] = key.split(",").map(Number)

    return { lon, lat, labels: count }
  })

  let closestPairKm = null

  for (let i = 0; i < anchors.length; i += 1) {
    for (let j = i + 1; j < anchors.length; j += 1) {
      const km = distanceKm([anchors[i].lon, anchors[i].lat], [anchors[j].lon, anchors[j].lat])

      closestPairKm = closestPairKm === null ? km : Math.min(closestPairKm, km)
    }
  }

  return {
    inWindowEvents: inWindow,
    placedInWindow: placed,
    distinctAnchors: anchors.length,
    maxLabelsAtOneAnchor: anchors.reduce((max, anchor) => Math.max(max, anchor.labels), 0),
    closestAnchorsKm: closestPairKm === null ? null : Number(closestPairKm.toFixed(1)),
    anchors: anchors.sort((left, right) => right.labels - left.labels),
  }
}

// --- load and interaction timings --------------------------------------------

const REPETITIONS = 2

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const timings = []
const crossChecks = []

/**
 * Waits for a mounted globe and lets it settle.
 *
 * Both treatments are measured after the same settle, because the container's
 * software renderer makes a click's paint cost depend on where the page is in its
 * globe initialization far more than on what the click renders.
 */
async function waitForGlobe() {
  await page
    .locator("#atlas-workspace canvas")
    .first()
    .waitFor({ state: "visible", timeout: 60_000 })
  await page.waitForTimeout(3_000)
}

async function selectFirstEvent() {
  await page.locator('[data-testid="atlas-event-item"]').first().click()
  await page.locator("#atlas-selection").waitFor({ state: "visible" })
}

for (const chapter of CHAPTERS) {
  const samples = {
    readerLoadMs: [],
    readerGlobeVisibleMs: [],
    reviewLoadMs: [],
    reviewGlobeVisibleMs: [],
    geographicSelectMs: [],
    illustratedSelectMs: [],
    toggleRemountMs: [],
  }

  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
    // The served chapter page: what a reader loads and how long the globe takes.
    const readerStart = Date.now()

    await page.goto(`${baseURL}/chapters/${chapter.id}`, { waitUntil: "load" })
    samples.readerLoadMs.push(Date.now() - readerStart)
    await waitForGlobe()
    samples.readerGlobeVisibleMs.push(Date.now() - readerStart)

    // The comparison surface loads the same chapter and the same workspace: its
    // own page cost must be the chapter's, plus its own route chunk.
    const reviewStart = Date.now()

    await page.goto(`${baseURL}/review/local-treatment/${chapter.id}`, { waitUntil: "load" })
    samples.reviewLoadMs.push(Date.now() - reviewStart)
    await waitForGlobe()
    samples.reviewGlobeVisibleMs.push(Date.now() - reviewStart)

    // Selection to visible details, with the shipped treatment, on this page.
    let selected = Date.now()

    await selectFirstEvent()
    samples.geographicSelectMs.push(Date.now() - selected)

    // The illustrated treatment is measured on its own page load, after the
    // toggle and a settle, so the number is the selection and not the re-mount.
    await page.goto(`${baseURL}/review/local-treatment/${chapter.id}`, { waitUntil: "load" })
    await waitForGlobe()

    const toggleStart = Date.now()

    await page.locator("#review-treatment-illustrated-local").click()
    await waitForGlobe()
    samples.toggleRemountMs.push(Date.now() - toggleStart)

    selected = Date.now()
    await selectFirstEvent()
    samples.illustratedSelectMs.push(Date.now() - selected)
  }

  // The event count the served page renders, so the crowding profile above is
  // checked against the product rather than against itself.
  await page.goto(`${baseURL}/chapters/${chapter.id}`, { waitUntil: "load" })
  await waitForGlobe()

  crossChecks.push({
    chapter: chapter.id,
    renderedEvents: await page.locator('[data-testid="atlas-event-item"]').count(),
  })

  // Every sample is reported, not just a summary: this container renders WebGL in
  // software, so the spread across repetitions is part of the measurement, and a
  // single number would hide that the spread can exceed the difference between the
  // treatments.
  timings.push({
    chapter: chapter.id,
    repetitions: REPETITIONS,
    readerLoadMs: { min: Math.min(...samples.readerLoadMs), samples: samples.readerLoadMs },
    readerGlobeVisibleMs: {
      min: Math.min(...samples.readerGlobeVisibleMs),
      samples: samples.readerGlobeVisibleMs,
    },
    reviewLoadMs: { min: Math.min(...samples.reviewLoadMs), samples: samples.reviewLoadMs },
    reviewGlobeVisibleMs: {
      min: Math.min(...samples.reviewGlobeVisibleMs),
      samples: samples.reviewGlobeVisibleMs,
    },
    geographicSelectMs: {
      min: Math.min(...samples.geographicSelectMs),
      samples: samples.geographicSelectMs,
    },
    illustratedSelectMs: {
      min: Math.min(...samples.illustratedSelectMs),
      samples: samples.illustratedSelectMs,
    },
    toggleRemountMs: {
      min: Math.min(...samples.toggleRemountMs),
      samples: samples.toggleRemountMs,
    },
  })
}

await context.close()
await browser.close()

const measurements = {
  measuredAt: new Date().toISOString(),
  target: baseURL,
  note: "Software-rendered WebGL in a container: the timings compare the treatments with each other on one machine, and are not device evidence (RFD 4 AC5 keeps physical-device acceptance separate).",
  payload,
  crowding: Object.fromEntries(CHAPTERS.map((chapter) => [chapter.id, crowding(chapter)])),
  crossChecks,
  timings,
}

writeFileSync(
  path.join(outputDirectory, "measurements.json"),
  `${JSON.stringify(measurements, null, 2)}\n`,
)

console.log(JSON.stringify(measurements, null, 2))
