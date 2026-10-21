import { error, json } from "@sveltejs/kit"
import { memberDraftCards } from "$lib/server/drafts"

/** Answered by the Pages worker per request, never prerendered (RFD 6). */
export const prerender = false

/**
 * The drafts' cards for the home page, for a signed-in member only. Anyone else
 * gets a 404, as if there were no such file.
 */
export function GET({ locals }: { locals: App.Locals }): Response {
  if (locals.user === null) error(404, "Not found")

  return json(memberDraftCards())
}
