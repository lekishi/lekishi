import { describe, expect, it } from "vitest"
import { SESSION_SECONDS, createSession, readSession, safeNext } from "./session"

const SECRET = "a-long-random-test-secret"
const NOW = Date.UTC(2026, 9, 21, 12)

describe("sessions", () => {
  it("reads back the login it was made for", async () => {
    const value = await createSession("darwin67", SECRET, NOW)

    expect(await readSession(value, SECRET, NOW)).toEqual({ login: "darwin67" })
  })

  it("expires after twelve hours", async () => {
    const value = await createSession("darwin67", SECRET, NOW)
    const later = NOW + SESSION_SECONDS * 1000

    expect(SESSION_SECONDS).toBe(12 * 60 * 60)
    expect(await readSession(value, SECRET, later - 1000)).not.toBeNull()
    expect(await readSession(value, SECRET, later)).toBeNull()
  })

  it("refuses a session signed with another secret", async () => {
    const value = await createSession("darwin67", "another-secret", NOW)

    expect(await readSession(value, SECRET, NOW)).toBeNull()
  })

  it("refuses a payload changed after signing", async () => {
    const value = await createSession("darwin67", SECRET, NOW)
    const [, signature] = value.split(".")
    const forged = btoa(JSON.stringify({ login: "someone-else", exp: NOW / 1000 + 60 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")

    expect(await readSession(`${forged}.${signature}`, SECRET, NOW)).toBeNull()
  })

  it("treats a missing secret as nobody signed in", async () => {
    // Previews and unconfigured deployments have no SESSION_SECRET; a cookie
    // made anywhere else must not open the drafts there.
    const value = await createSession("darwin67", SECRET, NOW)

    expect(await readSession(value, undefined, NOW)).toBeNull()
    expect(await readSession(value, "", NOW)).toBeNull()
  })

  it.each(["", "garbage", "a.b.c", ".", "not-base64.!!!"])("refuses %j", async (value) => {
    expect(await readSession(value, SECRET, NOW)).toBeNull()
  })
})

describe("safeNext", () => {
  it.each([
    ["/chapters/tang-mission-750-754?event=x", "/chapters/tang-mission-750-754?event=x"],
    ["/", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["https://evil.example", "/"],
    ["", "/"],
    [null, "/"],
  ])("%j returns %j", (next, expected) => {
    expect(safeNext(next)).toBe(expected)
  })
})
