import type { EntryGenerator, PageLoad } from "./$types"

/**
 * The design reference at `/dev/design`, built only where `__DEV_PAGES__` is
 * true (development and pull-request previews; `scripts/dev-pages.mjs`).
 *
 * In a production build the entry list is empty, so nothing is prerendered,
 * and the reference is imported only inside a branch the compiler removes, so
 * its code is not in the artifact either. The build invariant checks both.
 */
export const entries: EntryGenerator = () => (__DEV_PAGES__ ? [{ dev: "dev" }] : [])

export const load: PageLoad = async () => ({
  reference: __DEV_PAGES__
    ? (await import("$lib/ui/reference/DesignReference.svelte")).default
    : null,
})
