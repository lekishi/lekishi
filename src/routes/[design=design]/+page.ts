import type { EntryGenerator, PageLoad } from "./$types"

/**
 * The design reference, built only where `__DESIGN_REFERENCE__` is true
 * (development and pull-request previews; `scripts/design-reference.mjs`).
 *
 * In a production build the entry list is empty, so nothing is prerendered at
 * `/design`, and the reference is imported only inside a branch the compiler
 * removes, so its code is not in the artifact either. The build invariant
 * checks both.
 */
export const entries: EntryGenerator = () => (__DESIGN_REFERENCE__ ? [{ design: "design" }] : [])

export const load: PageLoad = async () => ({
  reference: __DESIGN_REFERENCE__
    ? (await import("$lib/ui/reference/DesignReference.svelte")).default
    : null,
})
