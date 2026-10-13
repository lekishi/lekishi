// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte"
import { describe, expect, it } from "vitest"
import { designReferenceEnabled } from "../../scripts/design-reference.mjs"
import { match } from "../params/design"
import DesignReference from "../lib/ui/reference/DesignReference.svelte"

/**
 * The `/design` reference's gate (RFD 5, owner decision of 2026-10-13): built
 * in development and on pull-request previews, never on production. The build
 * invariant checks the artifact; this pins the decision itself, and that the
 * reference renders every section it promises.
 */
describe("designReferenceEnabled", () => {
  it.each([
    ["the development server", { command: "serve" as const, env: {} }, true],
    ["a local production build", { env: {} }, false],
    ["the production deploy from main", { env: { CF_PAGES: "1", CF_PAGES_BRANCH: "main" } }, false],
    ["a pull-request preview", { env: { CF_PAGES: "1", CF_PAGES_BRANCH: "claude/x" } }, true],
    ["a Pages build with no branch", { env: { CF_PAGES: "1" } }, false],
    ["an explicit local opt-in", { env: { LEKISHI_DESIGN_PREVIEW: "1" } }, true],
  ])("is %s: %s", (_, options, expected) => {
    expect(designReferenceEnabled(options)).toBe(expected)
  })
})

describe("the design route", () => {
  it("matches only /design", () => {
    expect(match("design")).toBe(true)
    expect(match("Design")).toBe(false)
    expect(match("designs")).toBe(false)
  })

  it("renders every section from the stylesheet and the primitives", () => {
    const target = document.createElement("div")
    document.body.append(target)
    const component = mount(DesignReference, { target })
    flushSync()
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
    unmount(component)
    target.remove()
  })
})
