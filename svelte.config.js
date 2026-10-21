import adapter from "@sveltejs/adapter-cloudflare"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import { BUILD_ROUTES_DIRECTORY } from "./scripts/build-app.mjs"
import { DEV_ROUTE_DIRECTORY } from "./scripts/dev-pages.mjs"

/**
 * The reader site is a static artifact: every public route is prerendered at
 * build time and served by Cloudflare Pages as a plain file. A small Pages
 * worker answers only what cannot be a file (RFD 6, owner's decision of
 * 2026-10-21): sign-in under `/auth/`, and the drafts a signed-in member of the
 * `lekishi` organization may open. `wrangler.jsonc` points the adapter's output
 * at `build/`.
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
      // The worker runs for these paths only, so every other request is a file
      // and costs no invocation. The adapter's default (`/*` with every static
      // file excluded) would need a rule per globe bundle, and past
      // `_routes.json`'s 100 rules it drops exclusions, sending prerendered
      // pages through the worker. Prerendered chapters are excluded by name;
      // `scripts/check-static-build.mjs` fails if any served chapter is not.
      routes: {
        include: ["/chapters/*", "/auth/*", "/drafts.json", "/drafts/*"],
        exclude: ["<prerendered>"],
      },
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
