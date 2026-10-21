import { error, redirect } from "@sveltejs/kit"
import { env } from "$env/dynamic/private"
import { authorizeURL } from "$lib/server/github"
import { OAUTH_COOKIE, safeNext } from "$lib/server/session"

/** Sign-in runs in the worker, never at build time. */
export const prerender = false

/**
 * Sends the reader to GitHub, remembering where to come back to. Without the
 * OAuth App's credentials and the session key, sign-in is off: previews and an
 * unconfigured production answer 503 and serve no drafts.
 */
export function GET({ url, cookies }) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET) {
    error(503, "Sign-in is not configured")
  }

  const state = crypto.randomUUID()
  cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ state, next: safeNext(url.searchParams.get("next")) }),
    {
      path: "/auth",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
    },
  )

  redirect(
    303,
    authorizeURL({
      clientId: env.GITHUB_CLIENT_ID,
      redirectURI: `${url.origin}/auth/callback`,
      state,
    }),
  )
}
