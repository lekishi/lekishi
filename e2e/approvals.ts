import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
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
 * The chapters the atlas under test serves. A static artifact serves the
 * chapters it prerendered: every manifest when it was built with drafts (as CI
 * builds it), the approved ones otherwise. The development server, and a base
 * URL with no local artifact, serve drafts, so every manifest. Read when a test
 * runs, after the web server has built the artifact.
 */
export function servedChapters(): string[] {
  const chapters = fileURLToPath(new URL("../build/chapters/", import.meta.url))
  const ids = [...STATES.keys()]

  if (process.env.LEKISHI_E2E_MODE === "dev" || !existsSync(chapters)) {
    return ids
  }

  return ids.filter((id) => existsSync(`${chapters}${id}.html`))
}
