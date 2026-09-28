#!/usr/bin/env node
/**
 * Build invariant for the static artifact (the replacement for the old
 * `mix lekishi.assets.check`).
 *
 * `pnpm build` runs this after `vite build`: the build fails if the artifact is
 * not deployable as plain static files, or if the Cesium runtime the renderer
 * needs at runtime is missing. It is deliberately narrow — it checks the
 * contract between the build and the deployable artifact, not the app's
 * behavior, which the unit and browser suites own.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const buildDirectory = path.join(repoRoot, "build")

const require = createRequire(import.meta.url)
const { version: cesiumVersion } = JSON.parse(
  readFileSync(require.resolve("cesium/package.json"), "utf8"),
)

const problems = []

function fail(message) {
  problems.push(message)
}

function relative(file) {
  return path.relative(repoRoot, file)
}

/** Path inside the artifact, which is what the checks are about. */
function inBuild(file) {
  return path.relative(buildDirectory, file).split(path.sep).join("/")
}

function requireFile(file, { nonEmpty = true } = {}) {
  if (!existsSync(file)) {
    fail(`missing ${relative(file)}`)
    return false
  }

  if (nonEmpty && statSync(file).size === 0) {
    fail(`${relative(file)} is empty`)
    return false
  }

  return true
}

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

function requireMatching(pattern, description) {
  const matches = files.filter((file) => pattern.test(inBuild(file)))

  if (matches.length === 0) {
    fail(`missing ${description}`)
  }

  return matches
}

function read(file) {
  return readFileSync(file, "utf8")
}

// --- the artifact itself ------------------------------------------------------

if (!existsSync(buildDirectory)) {
  console.error("No build directory. Run `pnpm build` (or `vite build`) first.")
  process.exit(1)
}

const files = walk(buildDirectory)

requireFile(path.join(buildDirectory, "index.html"))
requireFile(path.join(buildDirectory, "404.html"))
requireFile(path.join(buildDirectory, "favicon.ico"))
requireFile(path.join(buildDirectory, "robots.txt"))
requireFile(path.join(buildDirectory, "images", "logo.svg"))
requireFile(path.join(buildDirectory, "_redirects"))

/**
 * The chapters the site serves, as the artifact has to carry them.
 *
 * These are sentinels, not a second source of truth: the chapter registry and the
 * chapter cards own the real values, and a chapter that is renamed, re-windowed,
 * or re-decided fails this check until the invariant is updated with it. Each
 * entry names the chapter's route, the name and window its prerendered shell must
 * state, the decision line the ledger records, and one published record id the
 * built scripts must carry.
 */
const CHAPTERS = [
  {
    id: "tang-mission-750-754",
    name: "The embassy to Tang China",
    window: "750–754",
    decision: "Owner-approved for release, 2026-09-25",
    event: "lks:event:appointment-750",
  },
  {
    id: "qin-conquest-han-233-226",
    name: "The end of the state of Han",
    window: "233 BCE–226 BCE",
    decision: "Owner-approved for release, 2026-09-27",
    event: "lks:event:han-conquest-230",
  },
]

/**
 * The routes that used to serve a chapter and now redirect to it: `/atlas` was
 * the launch chapter's route, and `/compare/qin` the bounded chapter's review
 * route. A redirect page carries no mount point, so a deploy cannot serve a stub
 * as if it were a chapter.
 */
const REDIRECTS = [
  { file: "atlas.html", target: "/chapters/tang-mission-750-754" },
  { file: "compare/qin.html", target: "/chapters/qin-conquest-han-233-226" },
]

const indexHtml = read(path.join(buildDirectory, "index.html"))
const notFoundHtml = read(path.join(buildDirectory, "404.html"))
const chapterHtml = new Map()

// Every chapter is prerendered as real content: the HTML a static host returns
// already names the chapter, its window, and the decision recorded on it, before
// any script runs.
for (const chapter of CHAPTERS) {
  const file = path.join(buildDirectory, "chapters", `${chapter.id}.html`)

  if (!requireFile(file)) {
    continue
  }

  const html = read(file)

  chapterHtml.set(chapter.id, html)

  if ((html.match(/id="atlas-workspace"/g) ?? []).length !== 1) {
    fail(`chapters/${chapter.id}.html must contain exactly one #atlas-workspace mount point`)
  }

  // SvelteKit inlines the bootstrap and imports the client entry from it, so the
  // marker is the entry chunk the page loads rather than a `type="module"` tag.
  if (!html.includes("_app/immutable/entry/start.")) {
    fail(
      `chapters/${chapter.id}.html does not load the client entry, so the workspace would never mount`,
    )
  }

  for (const marker of [chapter.name, chapter.window, chapter.decision]) {
    if (!html.includes(marker)) {
      fail(`chapters/${chapter.id}.html does not state ${marker}`)
    }
  }

  // A reader meets a chapter, not a review category: the page must not carry the
  // framings the owner rejected.
  for (const marker of [
    "Reviewed chapter",
    "Comparison chapter",
    "comparison harness",
    "map treatments",
    "lekishi-historical-contract",
  ]) {
    if (html.includes(marker)) {
      fail(`chapters/${chapter.id}.html carries the project's own framing: ${marker}`)
    }
  }
}

// The legacy routes still resolve, and they resolve to the chapter they served.
for (const redirect of REDIRECTS) {
  const file = path.join(buildDirectory, redirect.file)

  if (!requireFile(file)) {
    continue
  }

  const html = read(file)

  if (!html.includes(redirect.target)) {
    fail(`${redirect.file} does not redirect to ${redirect.target}`)
  }

  if (html.includes('id="atlas-workspace"')) {
    fail(`${redirect.file} is a redirect page but carries a workspace mount point`)
  }
}

if (!indexHtml.includes('href="/atlas"')) {
  fail("index.html does not link to the atlas")
}

// The root page presents the chapters as peers: one card per chapter, each with
// its name, its window, its story summary, and an entry. The artifact must keep
// both entries and the decision recorded on each chapter, and it must not carry
// the exact framings the owner rejected (a review category, the comparison
// harness, the contract id) — a deploy cannot turn a chapter card back into a
// note about the project's own process.
for (const chapter of CHAPTERS) {
  if (!indexHtml.includes(`href="/chapters/${chapter.id}"`)) {
    fail(`index.html does not link to /chapters/${chapter.id}`)
  }
}

for (const chapter of CHAPTERS) {
  if (!indexHtml.includes(chapter.decision)) {
    fail(`index.html does not state the recorded decision for ${chapter.id}`)
  }
}

for (const marker of [
  "Reviewed chapter",
  "Comparison chapter",
  "comparison fixture",
  "comparison harness",
  "map treatments",
  "treatment comparison",
  "lekishi-historical-contract",
]) {
  if (indexHtml.includes(marker)) {
    fail(`index.html carries the project's own framing where a reader meets a chapter: ${marker}`)
  }
}

// --- the treatment comparison's review surface ---------------------------------
//
// The bounded RFD 1/RFD 3 treatment comparison needs a place to look at the
// illustrated-local treatment beside the shipped geographic/symbolic one. That
// surface is an internal page, not a chapter: it states what it is, it is
// `noindex`, and no reader surface links it. A deploy that dropped the surface
// (the comparison could not be reviewed), turned it into a reader page (its
// framing could reach a reader), or linked it from the root page or a chapter
// fails here.

const REVIEW_PAGES = CHAPTERS.map((chapter) => ({
  file: `review/local-treatment/${chapter.id}.html`,
  chapter,
}))

const reviewHtml = new Map()

for (const page of REVIEW_PAGES) {
  const file = path.join(buildDirectory, page.file)

  if (!requireFile(file)) {
    continue
  }

  const html = read(file)

  reviewHtml.set(page.file, html)

  if ((html.match(/id="atlas-workspace"/g) ?? []).length !== 1) {
    fail(`${page.file} must contain exactly one #atlas-workspace mount point`)
  }

  if (!html.includes("_app/immutable/entry/start.")) {
    fail(`${page.file} does not load the client entry, so the workspace would never mount`)
  }

  for (const marker of [
    "Internal comparison surface",
    "noindex",
    page.chapter.name,
    "Geographic/symbolic",
    "Illustrated local",
  ]) {
    if (!html.includes(marker)) {
      fail(`${page.file} does not state ${marker}`)
    }
  }
}

for (const [file, html] of reviewHtml) {
  // The review surface states the chapter's own recorded decision, so a reviewer
  // cannot mistake the comparison for a different revision of the content.
  const chapter = REVIEW_PAGES.find((page) => page.file === file)?.chapter

  if (chapter !== undefined && !html.includes(chapter.decision)) {
    fail(`${file} does not state the chapter's recorded decision`)
  }
}

// A reader meets a chapter, never the comparison: no reader page links the
// review surface, and none carries its framing, its control, or the illustrated
// treatment's own markers. The workspace mounts only in the browser, so a page
// that passed the illustrated treatment to it would still have clean HTML; these
// sentinels catch the copy, the control ids, and the treatment's own surface
// names, and the browser checks mount each chapter and select an event.
const readerPages = [
  ["index.html", indexHtml],
  ...[...chapterHtml].map(([id, html]) => [`chapters/${id}.html`, html]),
]

for (const [file, html] of readerPages) {
  if (html.includes("/review/local-treatment")) {
    fail(`${file} links the internal treatment-comparison surface`)
  }

  for (const marker of [
    "Internal comparison surface",
    "Local scene · illustrative",
    "atlas-local-scene",
    "Illustrated local",
    "Geographic/symbolic",
    "review-treatment",
  ]) {
    if (html.includes(marker)) {
      fail(`${file} carries the treatment comparison's own framing or control: ${marker}`)
    }
  }
}

// --- bundles ------------------------------------------------------------------

requireMatching(/_app\/immutable\/entry\/.*\.js$/, "a client entry bundle under _app/immutable")
const stylesheets = requireMatching(
  /_app\/immutable\/.*\.css$/,
  "a stylesheet under _app/immutable",
)

const stylesheetText = stylesheets.map(read).join("\n")

if (!stylesheetText.includes(".cesium-viewer")) {
  fail("the built stylesheet does not carry the Cesium widget styles")
}

const scripts = files.filter((file) => file.endsWith(".js") && !inBuild(file).startsWith("cesium/"))
const scriptText = scripts.map(read).join("\n")

if (!scriptText.includes("/cesium/")) {
  fail("no built script sets the /cesium/ base URL the renderer needs at runtime")
}

// --- reviewed chapter content --------------------------------------------------

// The chapter pages render chapters, and their load throws when a chapter cannot
// be projected, so a build that got this far has representable chapters. These
// are sentinel checks on what the artifact actually contains — each chapter's own
// id and a published record id — so replacing or renaming a chapter fails this
// check until the invariant is updated with it.
for (const chapter of CHAPTERS) {
  for (const marker of [chapter.id, chapter.event]) {
    if (!scriptText.includes(marker)) {
      fail(`the built scripts do not carry the served chapter: ${marker} is missing`)
    }
  }
}

// The synthetic test fixture (`src/lib/atlas/fixtures.ts`) is imported by unit
// tests only. These sentinels are its own strings; they are a tripwire, not a
// proof that no fixture content could ever reach the artifact, which is what the
// browser checks are for.
const applicationText = `${scriptText}\n${[indexHtml, notFoundHtml, ...chapterHtml.values()].join("\n")}`

for (const marker of [
  "Synthetic foundation fixture",
  "Synthetic test chapter",
  "synthetic-test-chapter",
  "Fixture assembly",
  "Sample harbor",
  "event-harbor-assembly",
]) {
  if (applicationText.includes(marker)) {
    fail(`the artifact still carries synthetic fixture content: ${marker}`)
  }
}

// Each chapter's prerendered shell is about that chapter: it names it and carries
// no other chapter's records. The chapters share one route and one loader, so the
// page's own HTML is what proves the reader is looking at one chapter at a time.
for (const [id, html] of chapterHtml) {
  for (const other of CHAPTERS) {
    if (other.id === id) {
      continue
    }

    if (html.includes(other.name)) {
      fail(`chapters/${id}.html names another chapter: ${other.name}`)
    }
  }
}

// --- Cesium runtime -----------------------------------------------------------

requireFile(path.join(buildDirectory, "cesium", "Workers", "createTaskProcessorWorker.js"))
requireFile(path.join(buildDirectory, "cesium", "Widgets", "widgets.css"))
requireFile(path.join(buildDirectory, "cesium", "ThirdParty", "Workers", "package.json"))
requireFile(
  path.join(
    buildDirectory,
    "cesium",
    "Assets",
    "Textures",
    "NaturalEarthII",
    "tilemapresource.xml",
  ),
)
requireMatching(
  /cesium\/Assets\/Textures\/NaturalEarthII\/\d+\/\d+\/\d+\.jpg$/,
  "Natural Earth II imagery tiles",
)

const marker = path.join(buildDirectory, "cesium", ".lekishi-cesium-version")

if (requireFile(marker) && read(marker) !== cesiumVersion) {
  fail(`the copied Cesium runtime is not ${cesiumVersion}; run \`pnpm sync:cesium\` and rebuild`)
}

// --- no server process --------------------------------------------------------

if (existsSync(path.join(buildDirectory, "server"))) {
  fail("build/server exists: the artifact must not contain a server runtime")
}

const strayScripts = files.filter(
  (file) =>
    file.endsWith(".js") &&
    !inBuild(file).startsWith("cesium/") &&
    !inBuild(file).startsWith("_app/"),
)

if (strayScripts.length > 0) {
  fail(`unexpected scripts outside _app/ and cesium/: ${strayScripts.map(inBuild).join(", ")}`)
}

// --- report -------------------------------------------------------------------

if (problems.length > 0) {
  console.error("The static build is not deployable:")

  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }

  process.exit(1)
}

console.log(
  `Static build verified: ${files.length} files, Cesium ${cesiumVersion} runtime included, no server runtime.`,
)
