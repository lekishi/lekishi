// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { mount, unmount } from "svelte"
import { CHAPTER } from "../lib/atlas/chapter-content"
import { COMPARISON_REVIEW, COMPARISON_TITLE } from "../lib/atlas/comparison"
import { RELEASE } from "../lib/atlas/release"
import Home from "./+page.svelte"

/**
 * The root page's copy contract.
 *
 * The page is where a reviewer reads what is shipped and what is only under
 * review, so two things must not regress: the comparison review entry point
 * states the fixture's unapproved status in the route's own words, and the
 * reviewed-chapter card states the recorded Tang approval before the set's
 * preparation-time notes, which still describe that approval as pending because
 * the frozen digest means the set cannot be edited to match the later decision.
 * The page reads the chapter through the projection the atlas renders, so these
 * assertions are about the real content, not a hand-written fixture.
 */

const mounted: Array<{ destroy: () => Promise<void> }> = []

function render(): HTMLElement {
  const host = document.createElement("div")
  document.body.append(host)

  const component = mount(Home, { target: host })
  mounted.push({
    destroy: async () => {
      await unmount(component)
      host.remove()
    },
  })

  return host
}

afterEach(async () => {
  for (const handle of mounted.splice(0, mounted.length)) {
    await handle.destroy()
  }
})

describe("the root page", () => {
  it("links the comparison review and labels it unapproved, self-review-only preparation", () => {
    const host = render()
    const card = host.querySelector("#comparison-review-card")

    expect(card).not.toBeNull()

    const link = card?.querySelector('a[href="/compare/qin"]')

    expect(link?.textContent?.trim()).toBe("Open the comparison review")

    const text = card?.textContent ?? ""

    expect(text).toContain(COMPARISON_TITLE)
    expect(text).toContain(COMPARISON_REVIEW.label)
    expect(text).toContain("self-review only")
    expect(text).toContain("no release decision exists")
    expect(text).toContain("not a launch chapter")
    // Discoverability must not imply approval, specialist review, or release.
    expect(text).not.toContain("owner approved")
    expect(text).not.toContain("specialist review recorded")
    expect(text).not.toContain("independent review recorded")
  })

  it("keeps the reviewed atlas the page's first call to action", () => {
    const host = render()
    const links = [...host.querySelectorAll("main a")]
    const atlas = links.findIndex((link) => link.getAttribute("href") === "/atlas")
    const comparison = links.findIndex((link) => link.getAttribute("href") === "/compare/qin")
    const mainText = host.querySelector("main")?.textContent ?? ""

    expect(atlas).toBeGreaterThanOrEqual(0)
    expect(comparison).toBeGreaterThan(atlas)
    // The atlas CTA is still the one the page leads with, and the comparison
    // card sits below the reviewed chapter it is not part of.
    expect(links[atlas]?.textContent).toContain("Open the atlas")
    expect(
      mainText.indexOf(COMPARISON_TITLE),
      "comparison card after the reviewed chapter",
    ).toBeGreaterThan(mainText.indexOf(CHAPTER.title))
  })

  it("states the recorded approval before the set's preparation-time notes", () => {
    const host = render()
    const text = host.textContent ?? ""
    const decision = text.indexOf(RELEASE.decision)
    const lead = text.indexOf(RELEASE.notesLead)
    const notes = text.indexOf(CHAPTER.publication.reviewNotes)

    expect(text).toContain(RELEASE.decidedOn)
    expect(decision).toBeGreaterThanOrEqual(0)
    expect(lead).toBeGreaterThan(decision)
    expect(notes).toBeGreaterThan(lead)
    // The set's notes are quoted as history, so the stale wording is still
    // readable — but only after the framing that says when it was written.
    expect(text).toContain("still pending")
    expect(text).toContain(RELEASE.caveats)
    expect(text).toContain("specialist reviews")
    expect(text).toContain("remain unperformed")
  })
})
