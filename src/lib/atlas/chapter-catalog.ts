import { loadBundle } from "virtual:lekishi-chapters"
import type { JsonValue } from "../historical/contract/types"
import type { Chapter } from "./domain"
import { SERVED_CHAPTERS, servedChapter, type ServedChapter } from "./chapter-registry"
import { projectStories, type ChapterCoverage } from "./projection"

/**
 * The browser-safe chapter loader.
 *
 * The build compiles the record files into one bundle per chapter
 * (`virtual:lekishi-chapters`, see `scripts/historical-chapters.mjs`), so the
 * browser reads exactly the v0 documents the contract validates: there is no
 * second copy of the content, no Node API in this path, and no request the
 * deployment has to serve beyond the chapter's own chunk. Loading is lazy per
 * chapter, so a page fetches only the chapter it renders.
 *
 * Every served chapter loads through this one module — the chapter route passes
 * the id and coverage model from `chapter-registry.ts`, and the route's `load`
 * runs during prerendering, so a chapter that cannot be projected fails
 * `pnpm build` instead of shipping placeholder content. `Publication.checkAll`
 * remains the Node-side validator: schemas, revision hashes, and source pins
 * need `node:fs` and `node:crypto`, so `pnpm build` runs
 * `scripts/check-chapter.mjs`, which runs the chapters' contract, approval and
 * projection tests through Vitest before Vite bundles anything. This module is
 * the representability gate; that one is the validation gate.
 */

/**
 * Loads a chapter and projects it into the atlas domain. The caller supplies the
 * chapter's coverage model; the projection and the contract stay the same ones
 * every chapter uses.
 */
export async function loadChapterContent(
  chapter: string,
  coverage: ChapterCoverage,
): Promise<Chapter> {
  return (await loadChapterStories(chapter, coverage))[0]
}

/** Loads a chapter and projects every one of its stories, the one it opens on first. */
export async function loadChapterStories(
  chapter: string,
  coverage: ChapterCoverage,
): Promise<Chapter[]> {
  const bundle = await loadBundle(chapter)

  if (bundle === undefined) {
    throw new Error(`${chapter} is not an approved chapter, so there is no content to load`)
  }

  return projectChapterStories(chapter, bundle.documents, bundle.sets, coverage)
}

/**
 * Projects a chapter's documents into the atlas domain, or throws with every
 * representability error. A projection failure throws at the route's load during
 * prerendering, so an unrepresentable chapter fails the build rather than
 * rendering an empty page, and a deployed page never falls back to synthetic
 * events.
 */
export function projectChapterContent(
  name: string,
  documents: JsonValue[],
  sets: JsonValue[],
  coverage: ChapterCoverage,
): Chapter {
  return projectChapterStories(name, documents, sets, coverage)[0]
}

/**
 * Projects every story of a chapter, the one it opens on first, or throws with
 * every representability error. Every story is projected even when a caller
 * shows one, so a story that cannot be shown fails the build too.
 */
export function projectChapterStories(
  name: string,
  documents: JsonValue[],
  sets: JsonValue[],
  coverage: ChapterCoverage,
): Chapter[] {
  const projected = projectStories(name, documents, sets, coverage)

  if (!projected.ok) {
    throw new Error(
      [
        `the chapter ${name} cannot be projected, so the atlas has nothing honest to show:`,
        ...projected.errors.map((error) => `  - ${error}`),
      ].join("\n"),
    )
  }

  return projected.chapters
}

/**
 * Loads a chapter the site serves, by its tree id. An id outside the served list
 * is a programming error rather than a content gap: the chapter route only
 * enumerates served ids, and the route's own load reports a 404 for anything
 * else before this is reached.
 */
export async function loadServedChapter(id: string): Promise<Chapter> {
  return (await loadServedStories(id))[0]
}

/** Every story of a chapter the site serves, the one it opens on first. */
export async function loadServedStories(id: string): Promise<Chapter[]> {
  const served = servedChapter(id)

  if (served === undefined) {
    throw new Error(
      `${id} is not a served chapter; the site serves ${SERVED_CHAPTERS.map((chapter) => chapter.id).join(", ")}`,
    )
  }

  return loadChapterStories(served.id, served.coverage)
}
