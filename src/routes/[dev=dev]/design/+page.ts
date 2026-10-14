import type { EntryGenerator, PageLoad } from "./$types"

/**
 * The design reference at `/dev/design`, built only where `__DEV_PAGES__` is
 * true (development and pull-request previews; `scripts/dev-pages.mjs`).
 *
 * A production build excludes this directory before SvelteKit discovers its
 * routes. The constant still protects the lazy import if this module is
 * inspected outside that build path. The build invariant checks both the page
 * implementation and route wrapper are absent from production scripts.
 */
export const entries: EntryGenerator = () => (__DEV_PAGES__ ? [{ dev: "dev" }] : [])

export const load: PageLoad = async () => ({
  reference: __DEV_PAGES__
    ? (await import("$lib/ui/reference/DesignReference.svelte")).default
    : null,
})
