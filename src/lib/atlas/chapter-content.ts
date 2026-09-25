import { isObject, type JsonObject, type JsonValue } from "../historical/contract/types"
import type { Chapter } from "./domain"
import { projectChapter, type ChapterCoverage } from "./projection"

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
 *
 * This module binds the one chapter the production atlas route renders. Chapters
 * that are not the production chapter (the bounded Qin comparison fixture) load
 * through `chapter-catalog.ts`, which reuses `projectChapterContent` below and is
 * imported by the comparison review route (`/compare/qin`), not by the atlas
 * route. The production page therefore still bundles only the reviewed Tang
 * chapter, and `scripts/check-static-build.mjs` checks that.
 */

/** The reviewed chapter this site ships. Adding a chapter is a content decision, not a code path. */
const CHAPTER_NAME = "tang-mission-750-754"

/**
 * The production chapter's own coverage model: the 750–754 primary mission
 * window its README and contract test define. The projection takes the window
 * from its caller so a comparison chapter can name its own without a chapter
 * branch inside the projection.
 */
export const PRODUCTION_COVERAGE: ChapterCoverage = { defaultWindow: { start: 750, end: 754 } }

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

/**
 * Projects a chapter's documents into the atlas domain, or throws with every
 * representability error. Shared with the comparison catalog so both chapters
 * cross the boundary through exactly one projection path.
 */
export function projectChapterContent(
  name: string,
  documents: JsonValue[],
  sets: JsonValue[],
  coverage: ChapterCoverage,
): Chapter {
  const projected = projectChapter(name, documents, sets, coverage)

  if (!projected.ok) {
    throw new Error(
      [
        `the reviewed chapter ${name} cannot be projected, so the atlas has nothing honest to show:`,
        ...projected.errors.map((error) => `  - ${error}`),
      ].join("\n"),
    )
  }

  return projected.chapter
}

/** The reviewed chapter the atlas renders. */
export const CHAPTER: Chapter = projectChapterContent(
  CHAPTER_NAME,
  documents,
  sets,
  PRODUCTION_COVERAGE,
)
