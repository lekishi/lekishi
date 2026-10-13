import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import { DESIGN_ROUTE_ID } from "./scripts/design-reference.mjs"

/**
 * The site is a static artifact: every route is prerendered at build time and
 * the output directory is a plain file tree with no server process. Cloudflare
 * Pages (or any static host) serves `build/` directly.
 */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      // No SPA fallback: both routes are prerendered, so a direct request for
      // `/atlas` is served from `atlas.html` and an unknown path is a real 404.
      strict: true,
    }),
    prerender: {
      // A production build gives the `/design` reference no entries, so the
      // crawler never reaches it; that one route is allowed to go unseen.
      // Any other unseen route still fails the build.
      handleUnseenRoutes: ({ routes, message }) => {
        if (routes.some((id) => id !== DESIGN_ROUTE_ID)) throw new Error(message)
      },
    },
  },
}
