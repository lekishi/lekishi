import { env } from "$env/dynamic/private"
import type { Handle } from "@sveltejs/kit"
import { SESSION_COOKIE, readSession } from "$lib/server/session"

/**
 * Who is asking, for the requests the Pages worker answers (RFD 6). Prerendered
 * pages are plain files and never reach this hook, so it decides only sign-in
 * and drafts. Without `SESSION_SECRET` nobody is signed in, which is how
 * previews and an unconfigured production stay closed.
 */
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = await readSession(event.cookies.get(SESSION_COOKIE), env.SESSION_SECRET)

  const response = await resolve(event)

  // What the worker answers depends on the reader, so no cache may share it:
  // a draft served to a member must never be served from cache to anyone else.
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.append("Vary", "Cookie")
  response.headers.set("X-Robots-Tag", "noindex")

  return response
}
