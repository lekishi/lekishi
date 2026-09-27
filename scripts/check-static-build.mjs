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
requireFile(path.join(buildDirectory, "atlas.html"))
requireFile(path.join(buildDirectory, "404.html"))
requireFile(path.join(buildDirectory, "favicon.ico"))
requireFile(path.join(buildDirectory, "robots.txt"))
requireFile(path.join(buildDirectory, "images", "logo.svg"))
requireFile(path.join(buildDirectory, "_redirects"))

// Every route is prerendered, so the HTML is real content, not a shell that
// needs a server to fill in.
const atlasHtml = read(path.join(buildDirectory, "atlas.html"))

if ((atlasHtml.match(/id="atlas-workspace"/g) ?? []).length !== 1) {
  fail("atlas.html must contain exactly one #atlas-workspace mount point")
}

// SvelteKit inlines the bootstrap and imports the client entry from it, so the
// marker is the entry chunk the page loads rather than a `type="module"` tag.
if (!atlasHtml.includes("_app/immutable/entry/start.")) {
  fail("atlas.html does not load the client entry, so the workspace would never mount")
}

const indexHtml = read(path.join(buildDirectory, "index.html"))
const notFoundHtml = read(path.join(buildDirectory, "404.html"))

if (!indexHtml.includes('href="/atlas"')) {
  fail("index.html does not link to the atlas")
}

// The root page presents the chapters as peers: one card per chapter, each with
// its name, its window, its story summary, and an entry. The artifact must keep
// both entries, the Qin chapter's unapproved state, and the Tang chapter's
// recorded owner approval, and it must not carry the exact framings the owner
// rejected (a review category, the comparison harness, the contract id) — a
// deploy cannot turn a chapter card back into a note about the project's own
// process.
for (const route of ['href="/atlas"', 'href="/compare/qin"']) {
  if (!indexHtml.includes(route)) {
    fail(`index.html does not link to ${route}`)
  }
}

if (!indexHtml.includes("Unapproved preparation")) {
  fail("index.html does not state that the Qin chapter is unapproved preparation")
}

if (!indexHtml.includes("Owner-approved for release") || !indexHtml.includes("2026-09-25")) {
  fail("index.html does not state the recorded owner approval for the Tang chapter")
}

for (const marker of [
  "Reviewed chapter",
  "Comparison chapter",
  "comparison harness",
  "map treatments",
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

// The atlas renders the reviewed chapter, and its content boundary throws at
// module scope when the chapter cannot be projected, so a build that got this
// far has a representable chapter. These are sentinel checks on what the
// artifact actually contains — the chapter's own id and a published record id,
// and the chapter title a reader sees in the prerendered shell — so replacing or
// renaming the chapter fails this check until the invariant is updated with it.
for (const marker of ["tang-mission-750-754", "lks:event:appointment-750"]) {
  if (!scriptText.includes(marker)) {
    fail(`the built scripts do not carry the reviewed chapter: ${marker} is missing`)
  }
}

// The synthetic test fixture (`src/lib/atlas/fixtures.ts`) is imported by unit
// tests only. These sentinels are its own strings; they are a tripwire, not a
// proof that no fixture content could ever reach the artifact, which is what the
// browser checks are for.
const applicationText = `${scriptText}\n${[indexHtml, atlasHtml, notFoundHtml].join("\n")}`

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

// The prerendered shell names the chapter it renders, so a direct request for
// /atlas is already about the chapter before any script runs, and it carries no
// review category and no unapproved-content label.
if (!atlasHtml.includes("The embassy to Tang China")) {
  fail("atlas.html does not name the chapter the atlas renders")
}

for (const marker of ["Reviewed chapter", "Unapproved preparation"]) {
  if (atlasHtml.includes(marker)) {
    fail(`atlas.html carries a review category or status label: ${marker}`)
  }
}

// The bounded Qin chapter is rendered by its own page (`/compare/qin`), which
// loads it through the comparison catalog (`src/lib/atlas/chapter-catalog.ts`).
// The chapter ships on purpose so the owner can inspect it, but it is unapproved
// preparation, not a second launch chapter: the page must exist, state its
// status, and the production atlas page must not render the chapter.
const comparisonHtml = path.join(buildDirectory, "compare", "qin.html")

if (requireFile(comparisonHtml)) {
  const comparisonText = read(comparisonHtml)

  if ((comparisonText.match(/id="atlas-workspace"/g) ?? []).length !== 1) {
    fail("compare/qin.html must contain exactly one #atlas-workspace mount point")
  }

  if (!comparisonText.includes("_app/immutable/entry/start.")) {
    fail("compare/qin.html does not load the client entry, so the workspace would never mount")
  }

  if (!comparisonText.includes("Unapproved preparation")) {
    fail("compare/qin.html does not state that the comparison fixture is unapproved preparation")
  }

  // The shell is prerendered from the route's load, so the chapter's window and
  // name are real content before any script runs. The chapter's records are
  // bundled in the route's client chunks rather than inlined here, so the
  // scripts carry the chapter's own ids.
  for (const marker of ["233 BCE–226 BCE", "The end of the state of Han"]) {
    if (!comparisonText.includes(marker)) {
      fail(`compare/qin.html does not carry the chapter: ${marker} is missing`)
    }
  }

  if (comparisonText.includes("Comparison fixture")) {
    fail("compare/qin.html still labels the chapter as a comparison fixture")
  }

  for (const marker of ["qin-conquest-han-233-226", "lks:event:han-conquest-230"]) {
    if (!scriptText.includes(marker)) {
      fail(`the built scripts do not carry the comparison fixture: ${marker} is missing`)
    }

    if (atlasHtml.includes(marker)) {
      fail(`the production atlas page renders the comparison fixture: ${marker} is present`)
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
