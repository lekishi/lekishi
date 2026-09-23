/// <reference types="vitest/config" />
import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig, type Plugin } from "vitest/config"
import { cesiumRuntime } from "./vite/cesium-runtime.ts"

const assetsDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(assetsDirectory, "..")

/**
 * LiveView writes colocated hooks and styles into `_build/$MIX_ENV/phoenix-colocated`.
 * The Phoenix esbuild setup found them through `NODE_PATH`; Vite resolves packages
 * instead, so map the specifier onto the build directory of the Mix environment
 * being built. `mix assets.build` compiles before bundling, so the directory exists.
 */
const mixEnvironment = process.env.MIX_ENV ?? "dev"
const colocatedDirectory = path.join(projectRoot, "_build", mixEnvironment, "phoenix-colocated", "lekishi")

// Checked when a bundle is built, not when the config loads: the unit tests do
// not need LiveView's generated assets.
const assertColocatedAssets: Plugin = {
  name: "lekishi:assert-colocated-assets",
  apply: "build",
  buildStart() {
    if (!existsSync(colocatedDirectory)) {
      this.error(
        `Missing LiveView colocated assets at ${colocatedDirectory}. Run "mix compile" for MIX_ENV=${mixEnvironment} before building frontend assets.`,
      )
    }
  },
}

/**
 * Vite never empties `priv/static/assets` because Tailwind writes the stylesheet
 * into the same directory. The JS directory is fully owned by Vite, so a
 * production build clears it first: otherwise stale chunks and development
 * sourcemaps from earlier builds would be digested into the release.
 */
function cleanBundledJs(mode: string): Plugin {
  return {
    name: "lekishi:clean-bundled-js",
    apply: "build",
    buildStart() {
      if (mode === "development") {
        return
      }

      rmSync(path.resolve(projectRoot, "priv/static/assets/js"), { recursive: true, force: true })
    },
  }
}

export default defineConfig(({ mode }) => ({
  root: assetsDirectory,
  plugins: [assertColocatedAssets, svelte(), cesiumRuntime(), cleanBundledJs(mode)],
  resolve: {
    alias: [{ find: "phoenix-colocated/lekishi", replacement: colocatedDirectory }],
    // Vite's client defaults, written out so jsdom component tests resolve the
    // same builds as the bundle (Svelte ships a separate server build).
    conditions: ["browser", "module", "development|production"],
  },
  build: {
    // Phoenix owns `priv/static` and the Tailwind task writes `assets/css/app.css`
    // into the same directory, so Vite must never empty it.
    outDir: "../priv/static/assets",
    emptyOutDir: false,
    target: "es2022",
    minify: mode !== "development",
    sourcemap: mode === "development",
    rollupOptions: {
      // Two entries: the Phoenix bundle (`app`, loaded by every page) and the
      // atlas workspace (`atlas`, loaded only by the atlas page, in addition to
      // `app`). They must stay independent entries instead of one entry
      // dynamically importing the other: Phoenix rewrites a script URL to its
      // digested name in production while Vite's chunk imports reference an entry
      // by its unhashed name, so an entry that a chunk imports would be fetched
      // under two URLs and evaluated twice, mounting two workspaces.
      input: {
        app: path.join(assetsDirectory, "js/app.ts"),
        atlas: path.join(assetsDirectory, "js/atlas/entry.ts"),
      },
      output: {
        entryFileNames: "js/[name].js",
        chunkFileNames: "js/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    environment: "node",
    include: ["js/**/*.test.ts"],
    restoreMocks: true,
    unstubGlobals: true,
    // Svelte's package resolves its server build outside a browser condition, and
    // Vitest imports dependencies through Node by default. Component tests mount
    // the same client build the bundle ships, so Svelte is processed by Vite
    // (`resolve.conditions` above) instead of being externalized.
    server: { deps: { inline: ["svelte"] } },
  },
}))
