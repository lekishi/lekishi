import { isObject, type JsonObject } from "../historical/contract/types"
import type { Chapter } from "./domain"
import { projectChapter } from "./projection"

/**
 * The browser-safe chapter content boundary.
 *
 * Vite bundles the reviewed chapter's records and publication sets at build
 * time (`import.meta.glob`, eager, JSON), so the browser reads the same files
 * the contract validates: there is no second copy of the content, no Node API
 * in this path, and no request the deployment has to serve. The projection in
 * `projection.ts` then selects the newest published revision per record and
 * builds the atlas domain.
 *
 * A projection failure throws here, at module scope, on purpose. The atlas
 * route is prerendered, so an invalid chapter fails `pnpm build` (and the
 * Cloudflare Pages build) instead of shipping placeholder content, and a
 * deployed page never falls back to synthetic events. `Publication.checkAll`
 * remains the Node-side validator: schemas, revision hashes, and source pins
 * need `node:fs` and `node:crypto`, so `pnpm build` runs
 * `scripts/check-chapter.mjs`, which runs the chapter's contract and projection
 * tests through Vitest before Vite bundles anything. This module is the
 * representability gate; that one is the validation gate.
 */

/** The reviewed chapter this site ships. Adding a chapter is a content decision, not a code path. */
const CHAPTER_NAME = "tang-mission-750-754"

const recordModules: Record<string, unknown> = import.meta.glob(
  "../../../historical/chapters/tang-mission-750-754/records/*.json",
  { eager: true, import: "default" },
)

const setModules: Record<string, unknown> = import.meta.glob(
  "../../../historical/chapters/tang-mission-750-754/publication-sets/*.json",
  { eager: true, import: "default" },
)

function asDocument(value: unknown, source: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`${source} is not a JSON object`)
  }

  return value
}

const documents = Object.entries(recordModules).map(([path, document]) =>
  asDocument(document, path),
)
const sets = Object.entries(setModules).map(([path, document]) => asDocument(document, path))

const projected = projectChapter(CHAPTER_NAME, documents, sets)

if (!projected.ok) {
  throw new Error(
    [
      `the reviewed chapter ${CHAPTER_NAME} cannot be projected, so the atlas has nothing honest to show:`,
      ...projected.errors.map((error) => `  - ${error}`),
    ].join("\n"),
  )
}

/** The reviewed chapter the atlas renders. */
export const CHAPTER: Chapter = projected.chapter
