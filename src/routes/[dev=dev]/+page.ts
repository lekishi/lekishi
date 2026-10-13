import type { EntryGenerator, PageLoad } from "./$types"

/**
 * The `/dev` index: the list of development pages, gated exactly like the
 * pages themselves (see `design/+page.ts`).
 */
export const entries: EntryGenerator = () => (__DEV_PAGES__ ? [{ dev: "dev" }] : [])

export const load: PageLoad = async () => ({
  index: __DEV_PAGES__ ? (await import("$lib/dev/DevIndex.svelte")).default : null,
})
