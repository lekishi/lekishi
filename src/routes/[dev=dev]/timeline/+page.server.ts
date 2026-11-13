import type { Thread, TimelineChapter } from "$lib/dev/region-timeline"
import type { EntryGenerator } from "./$types"

/**
 * The regions-in-time timeline at `/dev/timeline`, gated like every `/dev`
 * page (see `../design/+page.ts`).
 *
 * The chapters load on the server, as the chapter route's do, and only a
 * summary of each reaches the browser in this page's `__data.json`: its
 * window, region, counts and place names, plus the threads between chapters.
 */
export const entries: EntryGenerator = () => (__DEV_PAGES__ ? [{ dev: "dev" }] : [])

export async function load(): Promise<{ chapters: TimelineChapter[]; threads: Thread[] }> {
  if (!__DEV_PAGES__) return { chapters: [], threads: [] }

  const [{ CHAPTER_MANIFESTS, SERVED_CHAPTERS }, { loadServedStories }, { reachOf, threadsOf }] =
    await Promise.all([
      import("$lib/atlas/chapter-registry"),
      import("$lib/atlas/chapter-catalog"),
      import("$lib/dev/region-timeline"),
    ])

  const reaches = await Promise.all(
    SERVED_CHAPTERS.map(async ({ id }) => {
      const manifest = CHAPTER_MANIFESTS.find((entry) => entry.id === id)
      if (manifest === undefined) throw new Error(`${id} is served but has no manifest`)
      return reachOf(await loadServedStories(id), manifest)
    }),
  )

  return { chapters: reaches.map((reach) => reach.chapter), threads: threadsOf(reaches) }
}
