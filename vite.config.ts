/// <reference types="vitest/config" />
import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vitest/config"
import { devPagesEnabled } from "./scripts/dev-pages.mjs"
import { historicalChapters } from "./scripts/historical-chapters.mjs"

/**
 * One build tool for the whole site. SvelteKit owns routing, prerendering, and
 * the static artifact; Tailwind owns the stylesheet; Vitest runs the unit and
 * contract tests in the same resolution context as the build.
 *
 * The globe's tiles are not bundled either: `scripts/sync-globe-tiles.mjs`
 * builds them into `static/globe` before the dev server or the build starts,
 * SvelteKit copies them into the artifact, and the renderer fetches them from
 * `/globe/`. `scripts/check-static-build.mjs` fails the build if they are
 * missing.
 *
 * Historical content is compiled from the record files under `historical/` by
 * the `historicalChapters` plugin and served as virtual modules, one chunk per
 * chapter; nothing compiled is written to disk.
 */
export default defineConfig(({ command }) => ({
  plugins: [historicalChapters(), sveltekit(), tailwindcss()],
  // The `/dev` pages (the design reference among them) are compiled in for
  // development and pull-request previews and out of production builds.
  define: {
    __DEV_PAGES__: JSON.stringify(devPagesEnabled({ command })),
  },
  // The globe's tile worker imports the bundle reader and the mesh builder; ES
  // module workers keep those imports instead of an IIFE wrapper, and every
  // browser the atlas targets runs them.
  worker: { format: "es" },
  // Vitest resolves modules in Node, where Svelte would resolve its server build;
  // the component tests must mount the same client build the bundle ships. This
  // only applies while Vitest runs, so the production build keeps SvelteKit's
  // own client/server conditions.
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    unstubGlobals: true,
    // Svelte's package resolves its server build outside a browser condition, and
    // Vitest imports dependencies through Node by default. Component tests mount
    // the same client build the bundle ships, so Svelte is processed by Vite
    // instead of being externalized.
    server: { deps: { inline: ["svelte"] } },
    // Vitest stubs stylesheets as empty strings. The design reference reads its
    // tokens from `app.css?raw`, so that one import keeps its real text.
    css: { include: [/app\.css/] },
  },
}))
