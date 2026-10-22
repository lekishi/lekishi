import { json } from "@sveltejs/kit"
import { loadServedStories } from "$lib/atlas/chapter-catalog"
import { SERVED_CHAPTERS } from "$lib/atlas/chapter-registry"
import { buildSearchIndex } from "$lib/atlas/search-index"

/**
 * The site's search index, prerendered to `/search-index.json` (RFD 5,
 * "Search"). It is built from the same projected chapters the pages render,
 * so it covers exactly what a reader can open; the search dialog fetches it
 * the first time it opens, and nothing is searched on a server.
 */
export const prerender = true

export async function GET(): Promise<Response> {
  const chapters = await Promise.all(SERVED_CHAPTERS.map((served) => loadServedStories(served.id)))

  return json(buildSearchIndex(chapters))
}
