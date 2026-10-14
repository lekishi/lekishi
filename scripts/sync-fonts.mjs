#!/usr/bin/env node
/**
 * Builds the site's fonts into `static/fonts` when they are missing or stale.
 *
 * RFD 5 ("Typography", owner decision of 2026-10-13): every face is
 * open-licensed, self-hosted, and subset to the characters the site's text
 * uses, so no font provider is contacted and the CJK cost follows the
 * chapters. The faces are pinned in `scripts/fonts/sources.json` by commit and
 * sha256, fetched once into `.cache/fonts/`, and cut by
 * `scripts/fonts/subset.py` (fontTools, beside the globe's Python scripts).
 *
 * The corpus is every character the site can set: the historical records,
 * the interface's own source, and the static not-found page. The output is
 * stamped with a hash of the sources, the subsetter and the corpus: an
 * unchanged corpus leaves the fonts in place; a new character in a record
 * re-cuts them, so a chapter can never ship a glyph its fonts lack
 * (`scripts/check-static-build.mjs` checks that against the built search
 * index too).
 *
 * The subsetter needs Python 3 with fontTools and brotli. When the system
 * Python lacks them, a private virtual environment under `.cache/fonts/venv`
 * gets them from the package index, as the globe's does for numpy.
 *
 * Usage: `pnpm sync:fonts` (also run by `pnpm dev` and `pnpm build`).
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fontsDirectory = path.join(repoRoot, "scripts", "fonts")
const sourcesFile = path.join(fontsDirectory, "sources.json")
const subsetter = path.join(fontsDirectory, "subset.py")
const destination = path.join(repoRoot, "static", "fonts")
const cache = path.join(repoRoot, ".cache", "fonts")
const downloads = path.join(cache, "src")
const STAMP = path.join(cache, "fonts-stamp")

function fail(message) {
  console.error(`fonts: ${message}`)
  process.exit(1)
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex")

/** Every file under a directory with one of the extensions, sorted. */
function filesUnder(directory, extensions) {
  return readdirSync(directory, { recursive: true })
    .map((entry) => path.join(directory, String(entry)))
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .filter((file) => !/\.test\.[jt]s$/.test(file))
    .sort()
}

/** Every character the site can set, sorted, so the stamp is stable. */
function corpus() {
  const characters = new Set()
  const files = [
    ...filesUnder(path.join(repoRoot, "historical"), [".json"]),
    ...filesUnder(path.join(repoRoot, "src"), [".svelte", ".ts"]),
    path.join(repoRoot, "static", "404.html"),
  ]

  for (const file of files) {
    for (const character of readFileSync(file, "utf8")) characters.add(character)
  }

  return [...characters].sort().join("")
}

const sources = JSON.parse(readFileSync(sourcesFile, "utf8"))

/** Fetches a pinned file once, and refuses one whose hash is not the pinned hash. */
async function fetchPinned(relative, expected, name) {
  const file = path.join(downloads, name)

  if (existsSync(file) && sha256(readFileSync(file)) === expected) {
    return
  }

  const url = `${sources.repository}/${relative.split("/").map(encodeURIComponent).join("/")}`
  const response = await fetch(url)

  if (!response.ok) {
    fail(`could not fetch ${url}: ${response.status}`)
  }

  const data = Buffer.from(await response.arrayBuffer())

  if (sha256(data) !== expected) {
    fail(
      `${relative} does not match its pinned sha256; review the font before changing sources.json`,
    )
  }

  writeFileSync(file, data)
}

const text = corpus()
const stamp = sha256(
  Buffer.concat([readFileSync(sourcesFile), readFileSync(subsetter), Buffer.from(text, "utf8")]),
)

if (
  existsSync(STAMP) &&
  readFileSync(STAMP, "utf8") === stamp &&
  existsSync(path.join(destination, "coverage.json"))
) {
  console.log("fonts already subset in static/fonts")
  process.exit(0)
}

mkdirSync(downloads, { recursive: true })

for (const face of sources.faces) {
  await fetchPinned(face.source, face.sha256, path.basename(face.source))
  await fetchPinned(face.license, face.licenseSha256, `${path.dirname(face.license)}-OFL.txt`)
}

const quiet = (command, args) => spawnSync(command, args, { stdio: "ignore" }).status === 0
const run = (command, args) => spawnSync(command, args, { stdio: "inherit" }).status === 0

let python = "python3"

if (!quiet(python, ["--version"])) {
  fail("python3 is needed to subset the fonts (scripts/fonts/subset.py)")
}

if (!quiet(python, ["-c", "import fontTools, brotli"])) {
  const venv = path.join(cache, "venv")
  const venvPython = path.join(venv, "bin", "python")

  if (!existsSync(venvPython) && !run(python, ["-m", "venv", venv])) {
    fail("could not create a Python virtual environment for fontTools")
  }

  if (
    !quiet(venvPython, ["-c", "import fontTools, brotli"]) &&
    !run(venvPython, [
      "-m",
      "pip",
      "install",
      "--quiet",
      "--disable-pip-version-check",
      "fonttools>=4.47",
      "brotli>=1.1",
    ])
  ) {
    fail("could not install fontTools and brotli")
  }

  python = venvPython
}

const corpusFile = path.join(cache, "corpus.txt")
writeFileSync(corpusFile, text)
rmSync(destination, { recursive: true, force: true })

console.log("subsetting fonts into static/fonts")

if (!run(python, ["-I", subsetter, sourcesFile, downloads, corpusFile, destination])) {
  fail("scripts/fonts/subset.py failed")
}

writeFileSync(STAMP, stamp)
