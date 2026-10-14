/**
 * Whether this build carries the `/dev` pages: working tools for whoever
 * changes the site, such as the `/dev/design` reference (RFD 5, "A living
 * reference"), never pages for readers. The owner decided on 2026-10-13 that
 * they are built in development and on pull-request previews only, never on
 * production, and that every such page lives under the one `/dev` prefix.
 *
 * One answer, read by the build wrapper (which removes their route directory
 * before a production build), the Vite config (which compiles their lazy code
 * in or out) and the build invariant (which checks the artifact agrees). It
 * mirrors the globe spike's preview gate in
 * `spikes/renderer/globe/preview-build.mjs`: a Cloudflare Pages build of any
 * branch but `main`, or an explicit opt-in.
 *
 * @param {{ command?: "serve" | "build"; env?: NodeJS.ProcessEnv }} [options]
 * @returns {boolean}
 */
export function devPagesEnabled({ command = "build", env = process.env } = {}) {
  if (command === "serve") return true
  if (env.LEKISHI_DEV_PAGES === "1") return true
  const branch = env.CF_PAGES_BRANCH
  return env.CF_PAGES === "1" && Boolean(branch) && branch !== "main"
}

/** The matching source directory, omitted from production route discovery. */
export const DEV_ROUTE_DIRECTORY = "[dev=dev]"
