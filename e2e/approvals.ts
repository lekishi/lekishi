import { expect, type APIRequestContext, type Locator } from "@playwright/test"
import type { SearchIndex } from "../src/lib/atlas/search-index"
import { compileAll } from "../src/lib/historical/authoring/compile"
import { readTree } from "../src/lib/historical/authoring/tree"

/**
 * Every chapter's approval state, compiled from the record files as the build
 * compiles them. CI builds the artifact with drafts served, and a missing
 * approval fails nothing (the owner's decision of 2026-10-21), so a chapter
 * awaiting approval is served as a draft and the checks expect its draft line.
 */
const STATES = new Map(compileAll(readTree()).map((bundle) => [bundle.id, bundle]))

/**
 * The decision line each chapter states, read from the approval its manifest
 * records rather than written here, so a new approval needs no edit to the
 * browser checks. Chapter pages, cards and the About sheet must all state it.
 * It is the same line `scripts/check-static-build.mjs` requires.
 */
function decision(chapter: string): string {
  const bundle = STATES.get(chapter)

  if (bundle === undefined) {
    throw new Error(`${chapter} has no manifest`)
  }

  if (bundle.state === "approved") {
    return `Owner-approved for release, ${bundle.approval?.on}`
  }

  return bundle.state === "stale"
    ? `Draft: changed since the owner's approval of ${bundle.approval?.on}, not approved for release`
    : "Draft, not approved for release"
}

export const TANG_DECISION = decision("tang-mission-750-754")

export const QIN_DECISION = decision("qin-conquest-han-233-226")

/** Whether `chapter` is approved at its current content, and so served as published. */
export function approved(chapter: string): boolean {
  return STATES.get(chapter)?.state === "approved"
}

/** The prerendered decision element, stating `line`. */
export function decisionElement(line: string): RegExp {
  return new RegExp(`id="chapter-decision"[^>]*>\\s*${line}`)
}

/**
 * The ids of the chapters the server under test serves, sorted, read from its
 * own `/search-index.json`. Which chapters a server serves depends on how it
 * was built or started (drafts on CI's artifact, the development server and
 * previews; approved chapters only in production), so the expectation comes
 * from the server itself rather than from this checkout. The build invariant
 * requires the index to cover every served chapter.
 */
export async function servedChapters(request: APIRequestContext): Promise<string[]> {
  const response = await request.get("/search-index.json")

  expect(response.status()).toBe(200)

  const index = (await response.json()) as SearchIndex

  return index.chapters.map((chapter) => chapter.id).sort()
}

/**
 * The sorted values of `name` on every element `locator` matches, to compare
 * a list of chapters with the served ones by identity: a count alone passes
 * when one chapter is missing and another is listed twice.
 */
export function sortedAttribute(locator: Locator, name: string): Promise<(string | null)[]> {
  return locator.evaluateAll(
    (elements, name) => elements.map((element) => element.getAttribute(name)).sort(),
    name,
  )
}
