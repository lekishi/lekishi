#!/usr/bin/env node
/**
 * Builds the globe's tiles into `static/globe` when they are missing or stale.
 *
 * The tiles are generated, not committed: `scripts/globe/build-tiles.py` paints
 * them from open elevation (fetched once into `.cache/globe/`) and the vendored
 * Natural Earth II hue, and packs the four children of each tile into one
 * bundle so the artifact carries about 810 tile files. SvelteKit copies
 * `static/` into the build unchanged, so the same `/globe/` paths work in
 * development and in the deployed artifact.
 *
 * The output is stamped with a hash of the builder and its vendored inputs
 * (kept in `.cache/globe/`, so the stamp is not served): an unchanged builder
 * leaves the tiles in place, so a dev-server start or a rebuild does not
 * repaint them. A changed builder repaints them all.
 *
 * Cloudflare Pages cannot cache arbitrary paths. Its SvelteKit build cache does
 * preserve `node_modules/.cache/imagetools`, so Pages builds keep a stamped copy
 * there and restore it before applying the same freshness check. Other builds
 * never read or write that bridge.
 *
 * The builder needs Python 3 with numpy and Pillow. When the system Python
 * lacks them (system Pythons may refuse global installs), a private virtual
 * environment under `.cache/globe/venv` gets them from the package index. A
 * failure stops the build: an artifact without its globe tiles is not a
 * working atlas, and `scripts/check-static-build.mjs` would refuse it anyway.
 *
 * Usage: `pnpm sync:globe` (also run by `pnpm dev` and `pnpm build`).
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const builderDirectory = path.join(repoRoot, "scripts", "globe")
const builder = path.join(builderDirectory, "build-tiles.py")
const destination = path.join(repoRoot, "static", "globe")
const cache = path.join(repoRoot, ".cache", "globe")
// Pages has no custom cache-path setting, but its SvelteKit cache preserves
// `node_modules/.cache/imagetools`. Keep our generated output in a namespaced
// child so Git-connected builds can restore it without owning imagetools' data.
const pagesCache = path.join(repoRoot, "node_modules", ".cache", "imagetools", "lekishi-globe")
const pagesDestination = path.join(pagesCache, "tiles")

// Retire the generated runtime in already-used checkouts before SvelteKit
// copies static/. Otherwise the invariant rejects the obsolete worker scripts.
rmSync(path.join(repoRoot, "static", "cesium"), { recursive: true, force: true })

/** Written beside the elevation cache so repeated runs can skip an unchanged build. */
const STAMP = "tiles-stamp"

/** Every file under a directory, sorted, so the stamp does not depend on readdir order. */
function filesUnder(directory) {
  return readdirSync(directory, { recursive: true })
    .map((entry) => path.join(directory, String(entry)))
    .filter((file) => statSync(file).isFile())
    .sort()
}

function inputsHash() {
  const hash = createHash("sha256")

  for (const file of filesUnder(builderDirectory)) {
    hash.update(path.relative(builderDirectory, file))
    hash.update(readFileSync(file))
  }

  return hash.digest("hex")
}

const stamp = inputsHash()
const stampFile = path.join(cache, STAMP)
const pagesStampFile = path.join(pagesCache, STAMP)

function tilesAreCurrent(stampPath, tiles) {
  return (
    existsSync(stampPath) &&
    readFileSync(stampPath, "utf8") === stamp &&
    existsSync(path.join(tiles, "tileset.json"))
  )
}

function cacheForPages() {
  if (process.env.CF_PAGES !== "1" || tilesAreCurrent(pagesStampFile, pagesDestination)) return

  rmSync(pagesCache, { recursive: true, force: true })
  mkdirSync(pagesCache, { recursive: true })
  cpSync(destination, pagesDestination, { recursive: true })
  // Write the stamp last: an interrupted copy must never look restorable.
  writeFileSync(pagesStampFile, stamp)
  console.log("globe tiles saved in the Cloudflare Pages build cache")
}

if (
  process.env.CF_PAGES === "1" &&
  !tilesAreCurrent(stampFile, destination) &&
  tilesAreCurrent(pagesStampFile, pagesDestination)
) {
  rmSync(destination, { recursive: true, force: true })
  cpSync(pagesDestination, destination, { recursive: true })
  mkdirSync(cache, { recursive: true })
  writeFileSync(stampFile, stamp)
  console.log("globe tiles restored from the Cloudflare Pages build cache")
}

if (tilesAreCurrent(stampFile, destination)) {
  cacheForPages()
  console.log("globe tiles already built in static/globe")
  process.exit(0)
}

const quiet = (command, args) => spawnSync(command, args, { stdio: "ignore" }).status === 0
const run = (command, args) => spawnSync(command, args, { stdio: "inherit" }).status === 0

function fail(message) {
  console.error(`globe tiles: ${message}`)
  process.exit(1)
}

let python = "python3"

if (!quiet(python, ["--version"])) {
  fail("python3 is needed to build the globe tiles (scripts/globe/build-tiles.py)")
}

if (!quiet(python, ["-c", "import numpy, PIL"])) {
  const venv = path.join(cache, "venv")
  const venvPython = path.join(venv, "bin", "python")

  if (!existsSync(venvPython) && !run(python, ["-m", "venv", venv])) {
    fail("could not create a Python virtual environment for numpy and Pillow")
  }

  if (
    !quiet(venvPython, ["-c", "import numpy, PIL"]) &&
    !run(venvPython, [
      "-m",
      "pip",
      "install",
      "--quiet",
      "--disable-pip-version-check",
      "numpy>=1.26",
      "pillow>=10",
    ])
  ) {
    fail("could not install numpy and Pillow")
  }

  python = venvPython
}

if (!run(python, ["-I", builder])) {
  fail("scripts/globe/build-tiles.py failed")
}

mkdirSync(cache, { recursive: true })
writeFileSync(stampFile, stamp)
cacheForPages()
