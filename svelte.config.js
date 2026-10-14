import adapter from "@sveltejs/adapter-static"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import { BUILD_ROUTES_DIRECTORY } from "./scripts/build-app.mjs"
import { DEV_ROUTE_DIRECTORY } from "./scripts/dev-pages.mjs"

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
      routes: process.env.LEKISHI_BUILD_ROUTES === "1" ? BUILD_ROUTES_DIRECTORY : "src/routes",
    },
    adapter: adapter({
      pages: "build",
      assets: "build",
      // No SPA fallback: both routes are prerendered, so a direct request for
      // `/atlas` is served from `atlas.html` and an unknown path is a real 404.
      strict: true,
    }),
    prerender: {
      // Unseen routes still fail the build, as by default. A `vite build` run
      // without `scripts/build-app.mjs` keeps the `/dev` routes, whose entries
      // are empty in production, so it says how to build instead.
      handleUnseenRoutes: ({ routes, message }) => {
        const devRoute = `/${DEV_ROUTE_DIRECTORY}`
        if (routes.some((id) => id === devRoute || id.startsWith(`${devRoute}/`))) {
          throw new Error(
            `${message}\nThe /dev routes are left out by scripts/build-app.mjs: build the site with \`pnpm build\`, not \`vite build\`.`,
          )
        }
        throw new Error(message)
      },
    },
  },
}
