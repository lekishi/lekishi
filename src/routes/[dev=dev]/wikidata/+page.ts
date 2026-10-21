import type { EntryGenerator, PageLoad } from "./$types"

/**
 * The Wikidata stress page at `/dev/wikidata`, gated like every `/dev` page
 * (see `design/+page.ts`). The snapshot and its projection load lazily behind
 * the constant, so neither reaches a production build.
 */
export const entries: EntryGenerator = () => (__DEV_PAGES__ ? [{ dev: "dev" }] : [])

export const load: PageLoad = async () => {
  if (!__DEV_PAGES__) return { chapter: null }

  const [{ wikidataChapter }, snapshot] = await Promise.all([
    import("$lib/dev/wikidata-chapter"),
    import("$lib/dev/wikidata-ancient.json"),
  ])
  return { chapter: wikidataChapter(snapshot.default as Parameters<typeof wikidataChapter>[0]) }
}
