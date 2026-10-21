/**
 * Signed session cookies (RFD 6, "Sessions"). A session is the reader's GitHub
 * login and its expiry, signed with HMAC-SHA-256 under `SESSION_SECRET`; the
 * server keeps no session state, so changing the secret signs everyone out.
 *
 * Organization membership is checked at sign-in only, so a reader removed from
 * the organization keeps access until their session expires. Twelve hours keeps
 * that to the same day; renga-dcim/rfd, which this follows, uses a week.
 */

/** The credential: `HttpOnly`, so page scripts never see it. */
export const SESSION_COOKIE = "__Host-lekishi_session"

/**
 * The readable hint that a session exists. It holds no credential; it only
 * tells the prerendered pages to ask the worker for drafts, so a reader who is
 * not signed in never makes that request.
 */
export const MEMBER_HINT_COOKIE = "lekishi_member"

/** The one-use state of a sign-in in flight, kept for ten minutes under `/auth`. */
export const OAUTH_COOKIE = "lekishi_oauth"

export const SESSION_SECONDS = 12 * 60 * 60

/** A verified session. */
export type Session = { readonly login: string }

const encoder = new TextEncoder()

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=")
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

/** A cookie value for `login` that expires `SESSION_SECONDS` from `now`. */
export async function createSession(
  login: string,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const payload = base64url(
    encoder.encode(JSON.stringify({ login, exp: Math.floor(now / 1000) + SESSION_SECONDS })),
  )
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload))
  return `${payload}.${base64url(signature)}`
}

/**
 * The session in a cookie value, or null when it is missing, forged, expired,
 * or there is no secret to check it against. Without a secret nobody is
 * signed in, which is how previews and unconfigured deployments stay closed.
 */
export async function readSession(
  value: string | undefined,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<Session | null> {
  if (!value || !secret) return null
  const [payload, signature, extra] = value.split(".")
  if (!payload || !signature || extra !== undefined) return null

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(secret),
      fromBase64url(signature),
      encoder.encode(payload),
    )
    if (!valid) return null

    const session: { login?: unknown; exp?: unknown } = JSON.parse(
      new TextDecoder().decode(fromBase64url(payload)),
    )
    if (typeof session.login !== "string" || typeof session.exp !== "number") return null
    if (session.exp * 1000 <= now) return null

    return { login: session.login }
  } catch {
    return null
  }
}

/**
 * A same-site path to return to after signing in. Anything else, a
 * protocol-relative `//host` or `/\host` among them, goes home, so the sign-in
 * cannot be used to redirect a reader off the site. Control characters are
 * refused outright: a browser strips a tab or newline from a `Location`, so
 * `/<tab>/host` would arrive as `//host`.
 */
export function safeNext(next: string | null | undefined): string {
  return typeof next === "string" &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !/[\u0000-\u001f\u007f]/.test(next)
    ? next
    : "/"
}
