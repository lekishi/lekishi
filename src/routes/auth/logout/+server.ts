import { redirect } from "@sveltejs/kit"
import { MEMBER_HINT_COOKIE, SESSION_COOKIE } from "$lib/server/session"

export const prerender = false

/** Signs out. A POST, so a link or an image elsewhere cannot sign a reader out. */
export function POST({ cookies }) {
  cookies.delete(SESSION_COOKIE, { path: "/" })
  cookies.delete(MEMBER_HINT_COOKIE, { path: "/" })
  redirect(303, "/")
}
