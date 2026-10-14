import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/**
 * The site is a static artifact: every route is prerendered at build time and
 * the output directory is a plain file tree with no server process. Cloudflare
 * Pages (or any static host) serves `build/` directly.
 */
export default {
  preprocess: vitePreprocess(),
  kit: {
    files: {
      // `scripts/build-app.mjs` copies the exact route set for this build. A
      // production copy has no `/dev` directory, so those routes never enter
      // SvelteKit's server or client manifests. Dev and type-checking use the
      // source tree directly.
      routes: process.env.LEKISHI_BUILD_ROUTES === "1" ? ".amp/in/build-routes" : "src/routes",
    },
    adapter: adapter({
      pages: "build",
      assets: "build",
      // No SPA fallback: both routes are prerendered, so a direct request for
      // `/atlas` is served from `atlas.html` and an unknown path is a real 404.
      strict: true,
    }),
  },
}
