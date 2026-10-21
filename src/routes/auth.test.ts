import { beforeEach, describe, expect, it, vi } from "vitest"
import { isHttpError, isRedirect } from "@sveltejs/kit"
import {
  MEMBER_HINT_COOKIE,
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_SECONDS,
  createSession,
  readSession,
} from "../lib/server/session"

/**
 * Sign-in from request to response (RFD 6): the OAuth state binds a callback to
 * the browser that started it, nothing is signed in without the secrets, a
 * member leaves with a `__Host-` session, and every answer the worker gives
 * depends on the reader, so none may be cached or shared. GitHub is replaced
 * with a stub; `github.test.ts` covers the requests to it.
 */

const env: Record<string, string | undefined> = {}
vi.mock("$env/dynamic/private", () => ({ env }))

const member = vi.fn()
vi.mock("$lib/server/github", () => ({
  member: (...args: unknown[]) => member(...args),
  authorizeURL: ({ state }: { state: string }) =>
    `https://github.com/login/oauth/authorize?state=${state}`,
}))

const login = await import("./auth/login/+server")
const callback = await import("./auth/callback/+server")
const { handle } = await import("../hooks.server")

const SECRET = "a-long-random-test-secret"

type Set = { value: string; options: Record<string, unknown> }

/** A cookie jar that records what a handler set and deleted. */
function jar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const set = new Map<string, Set>()
  const deleted: string[] = []

  return {
    set,
    deleted,
    cookies: {
      get: (name: string) => values.get(name),
      set: (name: string, value: string, options: Record<string, unknown>) => {
        values.set(name, value)
        set.set(name, { value, options })
      },
      delete: (name: string) => {
        values.delete(name)
        deleted.push(name)
      },
    },
  }
}

/** The status and location a handler answered with. */
async function answer(run: () => unknown): Promise<{ status: number; location?: string }> {
  try {
    await run()
  } catch (thrown) {
    if (isRedirect(thrown)) return { status: thrown.status, location: thrown.location }
    if (isHttpError(thrown)) return { status: thrown.status }
    throw thrown
  }
  return { status: 200 }
}

function configure() {
  env.GITHUB_CLIENT_ID = "client"
  env.GITHUB_CLIENT_SECRET = "client-secret"
  env.SESSION_SECRET = SECRET
}

beforeEach(() => {
  for (const name of Object.keys(env)) delete env[name]
  member.mockReset()
})

describe("/auth/login", () => {
  it("is off without the secrets", async () => {
    const { cookies, set } = jar()
    const url = new URL("https://lekishi.example/auth/login")

    expect(await answer(() => login.GET({ url, cookies } as never))).toEqual({ status: 503 })
    expect(set.size).toBe(0)
  })

  it("remembers a fresh state and a local return path, and goes to GitHub", async () => {
    configure()
    const { cookies, set } = jar()
    const url = new URL("https://lekishi.example/auth/login?next=%2F%09%2Fevil.example")

    const result = await answer(() => login.GET({ url, cookies } as never))
    const saved = set.get(OAUTH_COOKIE)!
    const { state, next } = JSON.parse(saved.value)

    expect(result.status).toBe(303)
    expect(result.location).toBe(`https://github.com/login/oauth/authorize?state=${state}`)
    expect(next).toBe("/")
    expect(saved.options).toMatchObject({ path: "/auth", httpOnly: true, secure: true })
  })
})

describe("/auth/callback", () => {
  const url = (state: string) =>
    new URL(`https://lekishi.example/auth/callback?code=c0de&state=${state}`)
  const started = (state: string, next = "/chapters/a-draft?event=x") =>
    jar({ [OAUTH_COOKIE]: JSON.stringify({ state, next }) })

  it("refuses a callback this browser did not start, before asking GitHub", async () => {
    configure()

    for (const { cookies } of [jar(), started("theirs"), jar({ [OAUTH_COOKIE]: "{not json" })]) {
      expect(await answer(() => callback.GET({ url: url("mine"), cookies } as never))).toEqual({
        status: 400,
      })
    }
    expect(member).not.toHaveBeenCalled()
  })

  it("uses the state once", async () => {
    configure()
    member.mockResolvedValue({ member: false, login: "someone" })
    const { cookies, deleted } = started("s1")

    await answer(() => callback.GET({ url: url("s1"), cookies } as never))

    expect(deleted).toContain(OAUTH_COOKIE)
    expect(await answer(() => callback.GET({ url: url("s1"), cookies } as never))).toEqual({
      status: 400,
    })
  })

  it("is off without the secrets", async () => {
    const { cookies } = started("s1")

    expect(await answer(() => callback.GET({ url: url("s1"), cookies } as never))).toEqual({
      status: 503,
    })
    expect(member).not.toHaveBeenCalled()
  })

  it("signs in no one who is not an active member", async () => {
    configure()
    member.mockResolvedValue({ member: false, login: "someone" })
    const { cookies, set } = started("s1")

    expect(await answer(() => callback.GET({ url: url("s1"), cookies } as never))).toEqual({
      status: 403,
    })
    expect(set.has(SESSION_COOKIE)).toBe(false)
  })

  it("gives a member a host-only session and returns them where they started", async () => {
    configure()
    member.mockResolvedValue({ member: true, login: "darwin67" })
    const { cookies, set } = started("s1")

    const result = await answer(() => callback.GET({ url: url("s1"), cookies } as never))
    const session = set.get(SESSION_COOKIE)!

    expect(result).toEqual({ status: 303, location: "/chapters/a-draft?event=x" })
    expect(SESSION_COOKIE.startsWith("__Host-")).toBe(true)
    expect(session.options).toEqual({
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_SECONDS,
    })
    expect(await readSession(session.value, SECRET)).toEqual({ login: "darwin67" })
    expect(set.get(MEMBER_HINT_COOKIE)?.options).toMatchObject({ httpOnly: false, path: "/" })
  })
})

describe("the worker's hook", () => {
  async function through(session: string | undefined) {
    let user: App.Locals["user"] | undefined
    const event = {
      cookies: jar(session === undefined ? {} : { [SESSION_COOKIE]: session }).cookies,
      locals: {} as App.Locals,
    }
    const response = await handle({
      event: event as never,
      resolve: async (resolved) => {
        user = resolved.locals.user
        return new Response("draft", { headers: { Vary: "Accept-Encoding" } })
      },
    })
    return { user, response }
  }

  it("signs in only a session signed with the secret and still current", async () => {
    env.SESSION_SECRET = SECRET
    const now = Date.now()

    expect((await through(await createSession("darwin67", SECRET, now))).user).toEqual({
      login: "darwin67",
    })
    expect((await through(await createSession("darwin67", "another-secret", now))).user).toBe(null)
    expect(
      (await through(await createSession("darwin67", SECRET, now - SESSION_SECONDS * 1000))).user,
    ).toBe(null)
    expect((await through(undefined)).user).toBe(null)
  })

  it("signs in no one without the secret", async () => {
    expect((await through(await createSession("darwin67", SECRET))).user).toBe(null)
  })

  it("lets no cache keep or share an answer", async () => {
    env.SESSION_SECRET = SECRET
    const { response } = await through(await createSession("darwin67", SECRET))

    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Cookie")
  })
})
