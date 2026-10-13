import type { ParamMatcher } from "@sveltejs/kit"

/**
 * Matches only `dev`. The `/dev` pages live behind a parameter so their routes
 * can have no prerender entries in a production build (see
 * `scripts/dev-pages.mjs`); a plain `dev/` directory would always be
 * prerendered into the artifact.
 */
export const match = ((param: string): param is "dev" => param === "dev") satisfies ParamMatcher
