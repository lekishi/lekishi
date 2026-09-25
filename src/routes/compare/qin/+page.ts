import type { Chapter } from "$lib/atlas/domain"
import { loadChapterContent } from "$lib/atlas/chapter-catalog"
import { COMPARISON_CHAPTER, COMPARISON_COVERAGE } from "$lib/atlas/comparison"

/**
 * The comparison review route's load.
 *
 * The fixture loads through the comparison catalog, which crosses the same
 * browser-safe projection as the production chapter and supplies the fixture's
 * own coverage model. Loading in `load` rather than after mount means the page
 * is prerendered with the fixture's real content and a fixture that cannot be
 * projected fails `pnpm build` instead of rendering an empty review page.
 */
export async function load(): Promise<{ chapter: Chapter }> {
  return { chapter: await loadChapterContent(COMPARISON_CHAPTER, COMPARISON_COVERAGE) }
}
