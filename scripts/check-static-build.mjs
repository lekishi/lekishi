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

if (!indexHtml.includes('href="/atlas"')) {
  fail("index.html does not link to the atlas")
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
