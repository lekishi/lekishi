import type { SearchIndex } from "../search-index"

// One fetch per page load: the index is a static file, and a reader who opens
// search twice, or the home globe and then search, should not wait twice.
let cached: Promise<SearchIndex> | null = null

/** The prerendered `/search-index.json`, fetched once; a failed fetch is retried next time. */
export function loadSearchIndex(): Promise<SearchIndex> {
  if (cached === null) {
    const request = fetch("/search-index.json").then((response) => {
      if (!response.ok) throw new Error(`search index: ${response.status}`)
      return response.json() as Promise<SearchIndex>
    })
    cached = request
    request.catch(() => {
      if (cached === request) cached = null
    })
  }
  return cached
}
