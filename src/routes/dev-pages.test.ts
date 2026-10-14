// @vitest-environment jsdom
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { flushSync, mount, unmount, type Component } from "svelte"
import { describe, expect, it } from "vitest"
import { prepareBuildRoutes } from "../../scripts/build-app.mjs"
import { devPagesEnabled } from "../../scripts/dev-pages.mjs"
import { match } from "../params/dev"
import DevIndex from "../lib/dev/DevIndex.svelte"
import { DEV_PAGES } from "../lib/dev/pages"
import DesignReference from "../lib/ui/reference/DesignReference.svelte"

/**
 * The `/dev` pages' gate (RFD 5, owner decisions of 2026-10-13): built in
 * development and on pull-request previews, never on production, all under
 * the one `/dev` prefix. The build invariant checks the artifact; this pins
 * the decision itself, and that the pages render what they promise.
 */
const routes = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "[dev=dev]")

function render(component: Component): { target: HTMLElement; done: () => void } {
  const target = document.createElement("div")
  document.body.append(target)
  const mounted = mount(component, { target })
  flushSync()
  return {
    target,
    done: () => {
      unmount(mounted)
      target.remove()
    },
  }
}

describe("devPagesEnabled", () => {
  it.each([
    ["the development server", { command: "serve" as const, env: {} }, true],
    ["a local production build", { env: {} }, false],
    ["the production deploy from main", { env: { CF_PAGES: "1", CF_PAGES_BRANCH: "main" } }, false],
    ["a pull-request preview", { env: { CF_PAGES: "1", CF_PAGES_BRANCH: "claude/x" } }, true],
    ["a Pages build with no branch", { env: { CF_PAGES: "1" } }, false],
    ["an explicit local opt-in", { env: { LEKISHI_DEV_PAGES: "1" } }, true],
  ])("is %s: %s", (_, options, expected) => {
    expect(devPagesEnabled(options)).toBe(expected)
  })
})

describe("the /dev prefix", () => {
  it("matches only dev", () => {
    expect(match("dev")).toBe(true)
    expect(match("Dev")).toBe(false)
    expect(match("design")).toBe(false)
  })

  it("lists every dev page, and every listed page has its gated route", () => {
    for (const page of DEV_PAGES) {
      expect(existsSync(path.join(routes, page.slug, "+page.ts")), page.slug).toBe(true)
    }
    const { target, done } = render(DevIndex)
    const links = [...target.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(links).toEqual(DEV_PAGES.map((page) => `/dev/${page.slug}`))
    done()
  })

  it.each([
    ["production", false],
    ["preview", true],
  ])("prepares the exact %s route tree before SvelteKit discovers routes", (_, includeDevPages) => {
    const destination = mkdtempSync(path.join(os.tmpdir(), "lekishi-routes-"))
    try {
      prepareBuildRoutes({
        source: path.resolve(routes, ".."),
        destination,
        includeDevPages,
      })
      expect(existsSync(path.join(destination, "+page.svelte"))).toBe(true)
      expect(existsSync(path.join(destination, "[dev=dev]"))).toBe(includeDevPages)
    } finally {
      rmSync(destination, { recursive: true, force: true })
    }
  })
})

describe("the design reference", () => {
  it("renders every section from the stylesheet and the primitives", () => {
    const { target, done } = render(DesignReference)
    const sections = [...target.querySelectorAll("main > section > header > h2")].map((h) => h.id)
    expect(sections).toEqual([
      "colour",
      "evidence",
      "type",
      "shape",
      "motion",
      "components",
      "icons",
    ])
    // Swatches come from `app.css`, not a copy: every colour token is shown.
    expect(target.querySelector('[data-token="lacquer"]')).not.toBeNull()
    expect(target.querySelector('[data-token="danger"]')).not.toBeNull()
    done()
  })
})
