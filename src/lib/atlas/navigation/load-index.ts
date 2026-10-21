import { loadDraftSearchIndex } from "../members"
import type { SearchIndex } from "../search-index"

// One fetch per page load: the index is a static file, and a reader who opens
// search twice, or the home globe and then search, should not wait twice.
let cached: Promise<SearchIndex> | null = null

/**
 * The prerendered `/search-index.json`, fetched once; a failed fetch is retried
 * next time. A signed-in member also gets the drafts' entries (RFD 6), merged in
 * after the published ones.
 */
export function loadSearchIndex(): Promise<SearchIndex> {
  if (cached === null) {
    const published = fetch("/search-index.json").then((response) => {
      if (!response.ok) throw new Error(`search index: ${response.status}`)
      return response.json() as Promise<SearchIndex>
    })
    const request = Promise.all([published, loadDraftSearchIndex()]).then(
      ([index, drafts]): SearchIndex =>
        drafts === null
          ? index
          : {
              version: index.version,
              chapters: [...index.chapters, ...drafts.chapters],
              entries: [...index.entries, ...drafts.entries],
            },
    )
    cached = request
    request.catch(() => {
      if (cached === request) cached = null
    })
  }
  return cached
}
