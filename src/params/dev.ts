import type { ParamMatcher } from "@sveltejs/kit"

/**
 * Matches only `dev`. A production build leaves the `/dev` directory out before
 * SvelteKit discovers routes (`scripts/build-app.mjs`). The parameter is the
 * second line: its pages' `entries` are empty unless `__DEV_PAGES__` is true,
 * whereas a plain `dev/` directory would be prerendered whenever it is
 * present.
 */
export const match = ((param: string): param is "dev" => param === "dev") satisfies ParamMatcher
