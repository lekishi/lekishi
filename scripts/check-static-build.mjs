#!/usr/bin/env node
/**
 * Build invariant for the static artifact (the replacement for the old
 * `mix lekishi.assets.check`).
 *
 * `pnpm build` runs this after `vite build`: the build fails if the artifact is
 * not deployable as plain static files, or if the globe tiles and tile worker
 * the renderer needs at runtime are missing. It is deliberately narrow — it checks the
 * contract between the build and the deployable artifact, not the app's
 * behavior, which the unit and browser suites own.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { devPagesEnabled } from "./dev-pages.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const buildDirectory = path.join(repoRoot, "build")

/**
 * Cloudflare Pages refuses a deployment of more than 20,000 files. The globe's
 * tiles are bundled four to a file to stay far under it; this keeps a change to
 * the tile coverage from silently crossing it.
 */
const MAX_FILES = 20_000

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
requireFile(path.join(buildDirectory, "favicon.svg"))
requireFile(path.join(buildDirectory, "apple-touch-icon.png"))
requireFile(path.join(buildDirectory, "robots.txt"))
requireFile(path.join(buildDirectory, "images", "logo.svg"))
requireFile(path.join(buildDirectory, "images", "wordmark.svg"))
requireFile(path.join(buildDirectory, "images", "wordmark-caps.svg"))
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

// The home page leads with search and links each chapter directly (RFD 5,
// "Home"); `/atlas` survives only as a redirect for old links, so the page no
// longer has to carry it.

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

// --- bundles ------------------------------------------------------------------

requireMatching(/_app\/immutable\/entry\/.*\.js$/, "a client entry bundle under _app/immutable")
const stylesheets = requireMatching(
  /_app\/immutable\/.*\.css$/,
  "a stylesheet under _app/immutable",
)

if (stylesheets.length > 1) {
  fail(`the site ships one stylesheet, found ${stylesheets.length}`)
}

const scripts = files.filter((file) => file.endsWith(".js"))
const scriptText = scripts.map(read).join("\n")

// The globe decodes and meshes its tiles in a module worker, which Vite emits
// as its own chunk; the renderer fetches the tiles from /globe/.
requireMatching(/_app\/immutable\/workers\/tile-worker-.*\.js$/, "the globe's tile worker bundle")

// The minifier may quote the literal with any of the three quote characters.
if (!/["'`]\/globe\/["'`]/.test(scriptText)) {
  fail("no built script points the renderer at the /globe/ tiles")
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

// --- search index ---------------------------------------------------------------

// Search is client-side over one prerendered file (RFD 5, "Search"). It must
// exist and cover every served chapter, or the search dialog would silently
// find nothing in a chapter the site serves.
const searchIndexFile = path.join(buildDirectory, "search-index.json")
requireFile(searchIndexFile)

try {
  const index = JSON.parse(read(searchIndexFile))

  if (index.version !== 1) {
    fail(`search-index.json has version ${index.version}, expected 1`)
  }

  for (const chapter of CHAPTERS) {
    if (!index.chapters?.some((entry) => entry.id === chapter.id)) {
      fail(`search-index.json does not list the chapter ${chapter.id}`)
    }

    if (!index.entries?.some((entry) => entry.chapterId === chapter.id && entry.id === chapter.event)) {
      fail(`search-index.json does not carry ${chapter.event}`)
    }
  }
} catch (error) {
  fail(`search-index.json is not valid JSON: ${error.message}`)
}

// --- globe tiles ----------------------------------------------------------------

// The tiles are built by `pnpm sync:globe` (scripts/globe/build-tiles.py) into
// static/globe and copied here. The layout of a bundle is
// src/lib/atlas/renderer/globe/bundle.ts's; reading the root bundle's header
// back here pins the builder's side of it.
const globeDirectory = path.join(buildDirectory, "globe")
const tilesetFile = path.join(globeDirectory, "tileset.json")

if (requireFile(tilesetFile)) {
  const tileset = JSON.parse(read(tilesetFile))

  if (tileset.format !== "lekishi-globe-bundles" || tileset.version !== 1) {
    fail(
      `globe/tileset.json is ${tileset.format} version ${tileset.version}, not lekishi-globe-bundles 1`,
    )
  }

  const bundles = files.filter((file) => /^globe\/b\/.*\.bin$/.test(inBuild(file)))

  if (bundles.length !== tileset.bundles) {
    fail(
      `globe/tileset.json lists ${tileset.bundles} bundles, the artifact carries ${bundles.length}`,
    )
  }

  const rootBundle = path.join(globeDirectory, "b", "root.bin")

  if (requireFile(rootBundle)) {
    const bytes = readFileSync(rootBundle)
    const count = bytes.readUInt16LE(6)
    const levels = Array.from({ length: count }, (_, i) => bytes.readUInt8(8 + i * 20))

    if (bytes.toString("latin1", 0, 4) !== "LKGB" || bytes.readUInt16LE(4) !== 1) {
      fail("globe/b/root.bin is not a version 1 Lekishi globe bundle")
    } else if (count !== 2 || levels.some((z) => z !== 0)) {
      fail(`globe/b/root.bin must hold the two level-0 tiles, holds ${count} at levels ${levels}`)
    }
  }
}

// The Terrain Tiles require their attribution block wherever the elevation is used.
const attributionFile = path.join(globeDirectory, "ATTRIBUTION.txt")

if (requireFile(attributionFile)) {
  const attribution = read(attributionFile)

  for (const marker of [
    "Terrain Tiles on AWS Open Data",
    "U.S. Geological Survey",
    "Natural Earth II",
  ]) {
    if (!attribution.includes(marker)) {
      fail(`globe/ATTRIBUTION.txt does not carry ${marker}`)
    }
  }
}

if (files.length > MAX_FILES) {
  fail(`the artifact has ${files.length} files; Cloudflare Pages accepts at most ${MAX_FILES}`)
}

// --- no server process --------------------------------------------------------

if (existsSync(path.join(buildDirectory, "server"))) {
  fail("build/server exists: the artifact must not contain a server runtime")
}

const strayScripts = files.filter(
  (file) => file.endsWith(".js") && !inBuild(file).startsWith("_app/"),
)

if (strayScripts.length > 0) {
  fail(`unexpected scripts outside _app/: ${strayScripts.map(inBuild).join(", ")}`)
}

// --- the /dev pages ----------------------------------------------------------

// The `/dev` pages (the design reference among them) are built in development
// and on pull-request previews only (RFD 5, owner decisions of 2026-10-13). A
// production artifact must carry neither their pages, route wrappers nor their
// code; a preview must carry them, or the reviewers have nothing to open. The
// two markers distinguish the route entries from the page implementations.
// They catch rendering code only: a helper such as the token parser imported
// from a production page would pass, so the guarantee is the route copy in
// `scripts/build-app.mjs`, and this is its check.
const devPageMarker = "data-dev-page"
const devRouteMarker = "data-dev-route"
const devPages = [
  { file: "dev.html", page: "index" },
  { file: "dev/design.html", page: "design" },
]

if (devPagesEnabled()) {
  for (const { file, page } of devPages) {
    const html = path.join(buildDirectory, file)
    if (
      !existsSync(html) ||
      !read(html).includes(`${devPageMarker}="${page}"`) ||
      !read(html).includes(`${devRouteMarker}="${page}"`)
    ) {
      fail(`this is a preview build but ${file} does not carry the ${page} dev page`)
    }
  }
} else {
  const shipped = [path.join(buildDirectory, "dev.html"), path.join(buildDirectory, "dev")]
    .filter((file) => existsSync(file))
    .map(inBuild)

  if (shipped.length > 0) {
    fail(`the /dev pages are in a production build: ${shipped.join(", ")}`)
  }

  const devScripts = files.filter((file) => {
    if (!file.endsWith(".js")) return false
    const script = readFileSync(file, "utf8")
    return script.includes(devPageMarker) || script.includes(devRouteMarker)
  })

  if (devScripts.length > 0) {
    fail(`the /dev pages' code is in a production build: ${devScripts.map(inBuild).join(", ")}`)
  }
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
  `Static build verified: ${files.length} files, globe tiles and tile worker included, no server runtime.`,
)
