#!/usr/bin/env node
// Adds the custom globe follow-up to Cloudflare Pages *preview* builds, so the
// owner can open it on any device from the PR's preview URL:
//
//   https://<branch>.lekishi.pages.dev/spikes/renderer/globe/followup/
//
// It runs at the end of `pnpm build` and does nothing unless the build is a
// Pages preview (CF_PAGES_BRANCH set and not `main`) or LEKISHI_SPIKE_PREVIEW=1
// asks for it locally. Production builds from `main` are unchanged: the spike
// never ships in the published artifact.
//
// The tiles are generated, not committed: build-tiles.py --custom writes the
// bordered heights and imagery (about 13,000 files, 80 MB) from AWS Open Data in a few
// minutes with only numpy and Pillow. If Python or the tiles cannot be had, the
// site preview still deploys and the spike's URL explains what is missing.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../../..")
const build = path.join(repo, "build")
const branch = process.env.CF_PAGES_BRANCH
const wanted = process.env.LEKISHI_SPIKE_PREVIEW === "1" || (process.env.CF_PAGES === "1" && branch && branch !== "main")
if (!wanted) {
  console.log("spike preview: skipped (not a Cloudflare Pages preview build)")
  process.exit(0)
}

const out = path.join(build, "spikes/renderer/globe")
const followupOut = path.join(out, "followup")
rmSync(path.join(build, "spikes"), { recursive: true, force: true })

const run = (cmd, args, opts = {}) => {
  console.log(`spike preview: ${cmd} ${args.join(" ")}`)
  return spawnSync(cmd, args, { stdio: "inherit", ...opts }).status === 0
}
const quiet = (cmd, args) => spawnSync(cmd, args, { stdio: "ignore" }).status === 0

// A page at the spike's URL that says why it is not there, instead of a 404.
function placeholder(reason) {
  mkdirSync(followupOut, { recursive: true })
  writeFileSync(path.join(followupOut, "index.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Globe follow-up unavailable</title>
<body style="background:#0b1016;color:#f3ead7;font:16px/1.5 system-ui;padding:24px;max-width:60ch">
<h1 style="font-size:20px">The globe follow-up is not in this preview</h1>
<p>${reason}</p><p>See the Cloudflare Pages build log, or run it locally as <code>spikes/renderer/globe/README.md</code> describes.</p></body>`)
  console.warn(`spike preview: WARNING ${reason}`)
  process.exit(0)
}

// 1. Python with numpy and Pillow: the system's if it has them, otherwise a
//    private virtual environment (system Pythons may refuse global installs).
let python = "python3"
if (!quiet(python, ["--version"])) placeholder("No python3 in the build image.")
if (!quiet(python, ["-c", "import numpy, PIL"])) {
  const venv = path.join(here, ".cache/venv")
  const venvPython = path.join(venv, "bin/python")
  if (!existsSync(venvPython) && !run(python, ["-m", "venv", venv])) placeholder("Could not create a Python virtual environment.")
  if (!run(venvPython, ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "numpy>=1.26", "pillow>=10"])) placeholder("Could not install numpy and Pillow.")
  python = venvPython
}

// 2. The tiles, unless a previous build in this checkout left them.
const tiles = path.join(here, "tiles")
const haveTiles = ["tileset.json", "heightb/11", "imagery/11"].every(p => existsSync(path.join(tiles, p)))
if (!haveTiles && !run(python, ["-I", path.join(here, "build-tiles.py"), "--custom"])) placeholder("Building the tiles failed.")

// 3. The page, its data and its tiles, at the same relative paths as in the repository.
const copy = (from, to) => cpSync(from, to, { recursive: true })
for (const f of ["main.js", "globe.js", "overlay.js", "tile-worker.js", "followup.json"]) copy(path.join(here, "followup", f), path.join(followupOut, f))
for (const f of ["scene.json", "diorama.json", "flight.js"]) copy(path.join(here, "shared", f), path.join(out, "shared", f))
for (const f of ["tileset.json", "heightb", "imagery"]) copy(path.join(tiles, f), path.join(out, "tiles", f))

// 4. Its libraries. Locally the import map points into /node_modules/, which a
//    Pages upload leaves out, so they are copied under /spikes/vendor/ and the
//    map is rewritten. Only the modules the page reaches are copied.
const nm = path.join(repo, "node_modules"), vendor = path.join(build, "spikes/vendor")
copy(path.join(nm, "three/build/three.module.js"), path.join(vendor, "three/build/three.module.js"))
copy(path.join(nm, "three/examples/jsm/lines"), path.join(vendor, "three/examples/jsm/lines"))
copy(path.join(nm, "three/examples/jsm/utils/BufferGeometryUtils.js"), path.join(vendor, "three/examples/jsm/utils/BufferGeometryUtils.js"))
copy(path.join(nm, "3d-tiles-renderer/src"), path.join(vendor, "3d-tiles-renderer/src"))
const html = readFileSync(path.join(here, "followup/index.html"), "utf8")
if (!html.includes('"/node_modules/')) throw new Error("followup/index.html no longer maps /node_modules/; update preview-build.mjs")
writeFileSync(path.join(followupOut, "index.html"), html.replaceAll('"/node_modules/', '"/spikes/vendor/'))

console.log(`spike preview: added /spikes/renderer/globe/followup/${branch ? ` (branch ${branch})` : ""}`)
