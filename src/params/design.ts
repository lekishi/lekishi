import type { ParamMatcher } from "@sveltejs/kit"

/**
 * Matches only `/design`. The reference lives behind a parameter so its route
 * can have no prerender entries in a production build (see
 * `scripts/design-reference.mjs`); a plain `design/` route would always be
 * prerendered into the artifact.
 */
export const match = ((param: string): param is "design" =>
  param === "design") satisfies ParamMatcher
