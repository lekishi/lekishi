import { isObject, type JsonObject } from "../historical/contract/types"
import { projectChapterContent } from "./chapter-content"
import type { Chapter } from "./domain"
import type { ChapterCoverage } from "./projection"

/**
 * The comparison catalog: the browser-safe loader for reviewed chapters that are
 * not the production chapter.
 *
 * The production atlas binds one chapter eagerly in `chapter-content.ts`. The
 * treatment comparison needs to load the bounded Qin fixture through the same
 * projection, so the comparison review route (`/compare/qin`) imports this module
 * and supplies the chapter's own coverage model, as the production boundary does
 * for Tang; the fixture's README records the window it passes. The atlas route
 * does not import this module, so the production page still bundles only the
 * reviewed Tang chapter — `scripts/check-static-build.mjs` checks that, and that
 * the review page states the fixture is unapproved preparation.
 *
 * Loading is lazy per chapter: the modules are fetched only when a harness asks
 * for that chapter, so a catalog with several comparison fixtures never loads
 * them all at once.
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
 * Loads a non-production chapter and projects it into the atlas domain. The
 * caller supplies the chapter's coverage model; the projection and the contract
 * stay the same ones the production chapter uses.
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
