import { error, redirect } from "@sveltejs/kit"
import { env } from "$env/dynamic/private"
import { member } from "$lib/server/github"
import {
  MEMBER_HINT_COOKIE,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_SECONDS,
  createSession,
  safeNext,
} from "$lib/server/session"

export const prerender = false

/** The organization whose active members may see drafts. */
const DEFAULT_ORG = "lekishi"

/**
 * GitHub sends the reader back here. Only an active member of the organization
 * gets a session; the state must match the one `/auth/login` set, so a
 * sign-in cannot be started on someone else's behalf.
 */
export async function GET({ url, cookies }) {
  let saved: { state?: unknown; next?: unknown } = {}
  try {
    saved = JSON.parse(cookies.get(OAUTH_COOKIE) ?? "{}")
  } catch {
    // A mangled cookie is the same as none: the state check below fails.
  }
  cookies.delete(OAUTH_COOKIE, { path: "/auth" })

  const code = url.searchParams.get("code")
  if (!code || typeof saved.state !== "string" || url.searchParams.get("state") !== saved.state) {
    error(400, "Sign-in expired. Try again.")
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET) {
    error(503, "Sign-in is not configured")
  }

  const org = env.GITHUB_ORG || DEFAULT_ORG
  let reader
  try {
    reader = await member({
      code,
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      redirectURI: `${url.origin}/auth/callback`,
      org,
    })
  } catch {
    error(502, "GitHub sign-in failed. Try again.")
  }
  if (!reader.member) error(403, `Only members of ${org} can sign in.`)

  // `Secure` always: the session cookie is `__Host-`, which requires it, and
  // browsers accept secure cookies from http://localhost in development.
  cookies.set(SESSION_COOKIE, await createSession(reader.login, env.SESSION_SECRET), {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_SECONDS,
  })
  cookies.set(MEMBER_HINT_COOKIE, "1", {
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_SECONDS,
  })

  redirect(303, safeNext(typeof saved.next === "string" ? saved.next : null))
}
