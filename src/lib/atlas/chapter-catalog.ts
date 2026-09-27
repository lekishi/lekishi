import { isObject, type JsonObject, type JsonValue } from "../historical/contract/types"
import type { Chapter } from "./domain"
import { SERVED_CHAPTERS, servedChapter, type ServedChapter } from "./chapter-registry"
import { projectChapter, type ChapterCoverage } from "./projection"

/**
 * The browser-safe chapter loader.
 *
 * Vite bundles each chapter's records, sources, and publication sets at build
 * time (`import.meta.glob`, JSON), so the browser reads the same files the
 * contract validates: there is no second copy of the content, no Node API in
 * this path, and no request the deployment has to serve. Loading is lazy per
 * chapter, so a page fetches only the chapter it renders.
 *
 * Every served chapter loads through this one module — the chapter route passes
 * the id and coverage model from `chapter-registry.ts`, and the route's `load`
 * runs during prerendering, so a chapter that cannot be projected fails
 * `pnpm build` instead of shipping placeholder content. `Publication.checkAll`
 * remains the Node-side validator: schemas, revision hashes, and source pins
 * need `node:fs` and `node:crypto`, so `pnpm build` runs
 * `scripts/check-chapter.mjs`, which runs the chapters' contract and projection
 * tests through Vitest before Vite bundles anything. This module is the
 * representability gate; that one is the validation gate.
 */

const recordModules = import.meta.glob("../../../historical/chapters/*/records/*.json", {
  import: "default",
})

const sourceModules = import.meta.glob("../../../historical/chapters/*/sources/*.json", {
  import: "default",
})

const setModules = import.meta.glob("../../../historical/chapters/*/publication-sets/*.json", {
  import: "default",
})

async function loadDirectory(
  modules: Record<string, () => Promise<unknown>>,
  chapter: string,
  subdirectory: string,
): Promise<JsonObject[]> {
  const entries = Object.entries(modules)
    .filter(([path]) => path.includes(`chapters/${chapter}/${subdirectory}/`))
    .sort(([left], [right]) => left.localeCompare(right))

  return Promise.all(
    entries.map(async ([path, load]) => {
      const value = await load()

      if (!isObject(value)) {
        throw new Error(`${path} is not a JSON object`)
      }

      return value
    }),
  )
}

/**
 * Loads a chapter and projects it into the atlas domain. The caller supplies the
 * chapter's coverage model; the projection and the contract stay the same ones
 * every chapter uses.
 */
export async function loadChapterContent(
  chapter: string,
  coverage: ChapterCoverage,
): Promise<Chapter> {
  const [records, sources, sets] = await Promise.all([
    loadDirectory(recordModules, chapter, "records"),
    loadDirectory(sourceModules, chapter, "sources"),
    loadDirectory(setModules, chapter, "publication-sets"),
  ])

  return projectChapterContent(chapter, [...records, ...sources], sets, coverage)
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
  const projected = projectChapter(name, documents, sets, coverage)

  if (!projected.ok) {
    throw new Error(
      [
        `the chapter ${name} cannot be projected, so the atlas has nothing honest to show:`,
        ...projected.errors.map((error) => `  - ${error}`),
      ].join("\n"),
    )
  }

  return projected.chapter
}

/**
 * Loads a chapter the site serves, by its tree id. An id outside the served list
 * is a programming error rather than a content gap: the chapter route only
 * enumerates served ids, and the route's own load reports a 404 for anything
 * else before this is reached.
 */
export async function loadServedChapter(id: string): Promise<Chapter> {
  const served = servedChapter(id)

  if (served === undefined) {
    throw new Error(
      `${id} is not a served chapter; the site serves ${SERVED_CHAPTERS.map((chapter) => chapter.id).join(", ")}`,
    )
  }

  return loadChapterContent(served.id, served.coverage)
}
