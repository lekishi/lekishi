/**
 * Signing in with GitHub (RFD 6, option A, after renga-dcim/rfd).
 *
 * An OAuth App asks for `read:org`, so the server can tell whether the reader
 * is an active member of the organization even when their membership is
 * private. The access token is used for the two lookups below and then
 * dropped: nothing about the reader is kept but the login in the signed
 * session.
 *
 * This module is the provider boundary. A later provider (OIDC among them)
 * supplies the same two functions, so the routes and the session do not change.
 */

const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "lekishi",
  "X-GitHub-Api-Version": "2022-11-28",
} as const

/** Where to send a reader to sign in. */
export function authorizeURL({
  clientId,
  redirectURI,
  state,
}: {
  clientId: string
  redirectURI: string
  state: string
}): string {
  const url = new URL("https://github.com/login/oauth/authorize")
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectURI,
    scope: "read:org",
    state,
    allow_signup: "false",
  }).toString()
  return url.toString()
}

/** Who signed in, and whether they may see drafts. */
export type Reader = { readonly login: string; readonly member: boolean }

/**
 * Exchanges an OAuth code for the reader's login and reports whether they are
 * an active member of `org`. A pending invitation is not membership.
 */
export async function member({
  code,
  clientId,
  clientSecret,
  redirectURI,
  org,
  fetch = globalThis.fetch,
}: {
  code: string
  clientId: string
  clientSecret: string
  redirectURI: string
  org: string
  fetch?: typeof globalThis.fetch
}): Promise<Reader> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": API_HEADERS["User-Agent"],
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectURI,
    }),
  })
  // GitHub answers a bad or reused code with 200 and an `error` field, not a
  // failing status, so only a token counts as success.
  const body: { access_token?: unknown } = tokenResponse.ok ? await tokenResponse.json() : {}
  const token = typeof body.access_token === "string" ? body.access_token : undefined
  if (token === undefined) throw new Error("GitHub did not return an access token")

  const headers = { ...API_HEADERS, Authorization: `Bearer ${token}` }

  const userResponse = await fetch("https://api.github.com/user", { headers })
  if (!userResponse.ok) throw new Error(`GitHub user lookup failed: ${userResponse.status}`)
  const { login }: { login?: unknown } = await userResponse.json()
  if (typeof login !== "string") throw new Error("GitHub returned no login")

  const membership = await fetch(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(org)}`,
    { headers },
  )
  const state: { state?: unknown } = membership.ok ? await membership.json() : {}

  return { login, member: state.state === "active" }
}
