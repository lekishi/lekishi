/// <reference types="vitest/config" />
import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { searchForWorkspaceRoot } from "vite"
import { defineConfig } from "vitest/config"

/**
 * One build tool for the whole site. SvelteKit owns routing, prerendering, and
 * the static artifact; Tailwind owns the stylesheet; Vitest runs the unit and
 * contract tests in the same resolution context as the build.
 *
 * The Cesium runtime directories (Workers, Assets, Widgets, ThirdParty) are not
 * bundled: Cesium resolves them at runtime through `window.CESIUM_BASE_URL`.
 * `scripts/sync-cesium-runtime.mjs` copies them into `static/cesium` before the
 * dev server or the build starts, and `scripts/check-static-build.mjs` fails the
 * build if the artifact is missing them.
 */
export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  // The comparison catalog loads a chapter's JSON with lazy `import.meta.glob`,
  // so the dev server serves those files over HTTP instead of bundling them into
  // the importing module the way the eager production glob does. Vite's default
  // serving allow list stops at `src/`, which would 403 the chapter tree in
  // development only, so the workspace root is allowed explicitly. The
  // production build bundles the same files into the artifact and never reads
  // them from disk at runtime.
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
  },
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
  },
})
