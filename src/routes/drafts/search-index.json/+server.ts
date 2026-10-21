import { error, json } from "@sveltejs/kit"
import { buildSearchIndex } from "$lib/atlas/search-index"
import { memberDraftChapters, memberDraftName } from "$lib/server/drafts"

/** Answered by the Pages worker per request, never prerendered (RFD 6). */
export const prerender = false

/**
 * The drafts' search index, which the search dialog merges with
 * `/search-index.json` for a signed-in member. Anyone else gets a 404.
 */
export function GET({ locals }: { locals: App.Locals }): Response {
  if (locals.user === null) error(404, "Not found")

  return json(buildSearchIndex(memberDraftChapters(), memberDraftName))
}
