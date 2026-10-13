import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import { DEV_ROUTE_PREFIX } from "./scripts/dev-pages.mjs"

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
      // A production build gives the `/dev` pages no entries, so the crawler
      // never reaches them; routes under that prefix are allowed to go unseen.
      // Any other unseen route still fails the build.
      handleUnseenRoutes: ({ routes, message }) => {
        const outsideDev = routes.filter(
          (id) => id !== DEV_ROUTE_PREFIX && !id.startsWith(`${DEV_ROUTE_PREFIX}/`),
        )
        if (outsideDev.length > 0) throw new Error(message)
      },
    },
  },
}
