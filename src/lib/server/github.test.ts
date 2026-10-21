import { describe, expect, it, vi } from "vitest"
import { authorizeURL, member } from "./github"

const OPTIONS = {
  code: "the-code",
  clientId: "client",
  clientSecret: "secret",
  redirectURI: "https://lekishi.pages.dev/auth/callback",
  org: "lekishi",
}

/** A fetch that answers GitHub's three calls from a table, in any order. */
function github(responses: { token?: unknown; user?: unknown; membership?: [number, unknown] }) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input)

    if (url === "https://github.com/login/oauth/access_token") {
      return Response.json(responses.token ?? {})
    }

    if (url === "https://api.github.com/user") {
      return Response.json(responses.user ?? {})
    }

    if (url === "https://api.github.com/user/memberships/orgs/lekishi") {
      const [status, body] = responses.membership ?? [404, {}]
      return Response.json(body, { status })
    }

    throw new Error(`unexpected request to ${url}`)
  })
}

describe("authorizeURL", () => {
  it("asks for read:org and returns to the callback with the state", () => {
    const url = new URL(
      authorizeURL({ clientId: "client", redirectURI: OPTIONS.redirectURI, state: "s1" }),
    )

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client",
      redirect_uri: OPTIONS.redirectURI,
      scope: "read:org",
      state: "s1",
      allow_signup: "false",
    })
  })
})

describe("member", () => {
  it("admits an active member", async () => {
    const fetch = github({
      token: { access_token: "t" },
      user: { login: "darwin67" },
      membership: [200, { state: "active" }],
    })

    expect(await member({ ...OPTIONS, fetch })).toEqual({ login: "darwin67", member: true })
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: "Bearer t" })
  })

  it("does not admit a pending invitation", async () => {
    const fetch = github({
      token: { access_token: "t" },
      user: { login: "invited" },
      membership: [200, { state: "pending" }],
    })

    expect(await member({ ...OPTIONS, fetch })).toEqual({ login: "invited", member: false })
  })

  it("does not admit someone outside the organization", async () => {
    const fetch = github({
      token: { access_token: "t" },
      user: { login: "stranger" },
      membership: [404, { message: "Not Found" }],
    })

    expect(await member({ ...OPTIONS, fetch })).toEqual({ login: "stranger", member: false })
  })

  it("fails when GitHub returns no token", async () => {
    // GitHub answers a bad or reused code with 200 and an error field.
    const fetch = github({ token: { error: "bad_verification_code" } })

    await expect(member({ ...OPTIONS, fetch })).rejects.toThrow("access token")
  })
})
