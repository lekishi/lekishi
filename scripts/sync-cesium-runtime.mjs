#!/usr/bin/env node
/**
 * Copies the Cesium runtime directories into `static/cesium`.
 *
 * Cesium loads workers, textures, terrain fixtures, and widget styles at runtime
 * by resolving paths against `window.CESIUM_BASE_URL`; Vite bundles the Cesium
 * JavaScript library but cannot know about those files. SvelteKit copies
 * everything under `static/` into the build output unchanged, so the runtime
 * lives beside the bundles in the artifact and the same paths work in
 * development and in production.
 *
 * The copy is version-marked: an unchanged Cesium version is left in place, so a
 * rebuild or a dev-server start does not rewrite 7 MB of files.
 *
 * Usage: `pnpm sync:cesium` (also run by `pnpm dev` and `pnpm build`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const RUNTIME_DIRECTORIES = ["Workers", "Assets", "Widgets", "ThirdParty"]

/** Written inside the copied tree so repeated runs can skip an unchanged copy. */
const VERSION_MARKER = ".lekishi-cesium-version"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const destination = path.join(repoRoot, "static", "cesium")

const require = createRequire(import.meta.url)
const packageJsonPath = require.resolve("cesium/package.json")
const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"))
const buildDirectory = path.join(path.dirname(packageJsonPath), "Build", "Cesium")
const marker = path.join(destination, VERSION_MARKER)

if (existsSync(marker) && readFileSync(marker, "utf8") === version) {
  console.log(`Cesium ${version} runtime already present in static/cesium`)
  process.exit(0)
}

rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })

for (const directory of RUNTIME_DIRECTORIES) {
  cpSync(path.join(buildDirectory, directory), path.join(destination, directory), {
    recursive: true,
  })
}

writeFileSync(marker, version)
console.log(`copied the Cesium ${version} runtime to static/cesium`)
