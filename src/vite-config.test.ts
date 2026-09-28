import { describe, expect, it } from "vitest"
import config from "../vite.config"

/**
 * The development server's host allowance.
 *
 * Amp exposes the development server through a generated `<id>.onamp.dev` portal
 * hostname, and Vite's host check answers a host it does not know with 403 before
 * the app sees the request — so the portal failed with "Blocked request" until
 * the domain was allowed. These assertions keep the allowance exactly that: a
 * suffix entry for the portal domain rather than one ephemeral hostname, an array
 * rather than Vite's `true` (which allows every host), and nothing on the preview
 * server, which the deployable artifact never runs behind.
 */

describe("the development server's allowed hosts", () => {
  it("allows the Amp portal domain as a suffix entry and nothing broader", () => {
    const allowedHosts = config.server?.allowedHosts

    expect(Array.isArray(allowedHosts), "allowedHosts must be an array, not `true`").toBe(true)
    expect(allowedHosts).toContain(".onamp.dev")

    // Vite reads a leading dot as "this domain and its subdomains", so the portal
    // hostname does not have to be named; every other entry would be a specific
    // host, and nothing may allow the world.
    for (const host of allowedHosts as string[]) {
      expect(host, "an entry that allows every host").not.toBe(true)
      expect(host, "an entry that allows every host").not.toBe("*")
      expect(host, "an entry outside the portal domain").toMatch(
        /^(\.onamp\.dev|[a-z0-9][a-z0-9.-]*)$/,
      )
    }
  })

  it("leaves the preview server's host handling at its default", () => {
    // The allowance is development-only: `pnpm preview` and the static host that
    // serves the artifact keep Vite's default (no host is allowed unless it is
    // the address the server was started on).
    expect(config.preview?.allowedHosts).toBeUndefined()
  })
})
