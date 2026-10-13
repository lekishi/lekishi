/**
 * Whether this build carries the `/design` reference (RFD 5, "A living
 * reference"). The owner decided on 2026-10-13 that it is built in development
 * and on pull-request previews only, never on production: it is a working tool
 * for whoever changes the interface, not a page for readers.
 *
 * One answer, read by the Vite config (which compiles the page in or out), the
 * SvelteKit config (which lets the route go unprerendered when it is out) and
 * the build invariant (which checks the artifact agrees). It mirrors the
 * globe spike's preview gate in `spikes/renderer/globe/preview-build.mjs`:
 * a Cloudflare Pages build of any branch but `main`, or an explicit opt-in.
 *
 * @param {{ command?: "serve" | "build"; env?: NodeJS.ProcessEnv }} [options]
 * @returns {boolean}
 */
export function designReferenceEnabled({ command = "build", env = process.env } = {}) {
  if (command === "serve") return true
  if (env.LEKISHI_DESIGN_PREVIEW === "1") return true
  const branch = env.CF_PAGES_BRANCH
  return env.CF_PAGES === "1" && Boolean(branch) && branch !== "main"
}

/** The route that holds the reference, as SvelteKit names it. */
export const DESIGN_ROUTE_ID = "/[design=design]"
