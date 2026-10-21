import { readFileSync } from "node:fs"
import { parse } from "yaml"

/**
 * The decision line each chapter states, read from the approval its manifest
 * records rather than written here, so a new approval needs no edit to the
 * browser checks. Chapter pages, cards and the About sheet must all state it.
 */
function decision(chapter: string): string {
  const manifest = parse(
    readFileSync(new URL(`../historical/chapters/${chapter}.yaml`, import.meta.url), "utf8"),
  ) as { approval?: { on?: string } }
  const on = manifest.approval?.on

  if (on === undefined) {
    throw new Error(`${chapter} is not approved, so the site does not serve it`)
  }

  return `Owner-approved for release, ${on}`
}

export const TANG_DECISION = decision("tang-mission-750-754")

export const QIN_DECISION = decision("qin-conquest-han-233-226")

/** The prerendered decision element, stating `line`. */
export function decisionElement(line: string): RegExp {
  return new RegExp(`id="chapter-decision"[^>]*>\\s*${line}`)
}
