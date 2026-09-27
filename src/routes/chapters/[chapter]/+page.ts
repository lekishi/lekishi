import { error } from "@sveltejs/kit"
import type { Chapter } from "$lib/atlas/domain"
import { loadServedChapter } from "$lib/atlas/chapter-catalog"
import { SERVED_CHAPTERS, servedChapter } from "$lib/atlas/chapter-registry"

/**
 * The chapter route's load.
 *
 * One route serves every chapter the site carries: the slug is the chapter tree's
 * own id, and the chapter loads through the browser-safe catalog with the
 * coverage model the registry gives it. Loading in `load` rather than after mount
 * means the page is prerendered with the chapter's real content, and a chapter
 * that cannot be projected fails `pnpm build` instead of rendering an empty page.
 *
 * `entries` is what makes the prerender cover exactly the served chapters: a
 * chapter tree the site does not serve has no page at all, and an unknown slug is
 * a 404 rather than a page that renders nothing.
 */
export const entries = () => SERVED_CHAPTERS.map((chapter) => ({ chapter: chapter.id }))

export async function load({ params }: { params: { chapter: string } }): Promise<{
  chapter: Chapter
}> {
  if (servedChapter(params.chapter) === undefined) {
    error(404, `No chapter is served at /chapters/${params.chapter}`)
  }

  return { chapter: await loadServedChapter(params.chapter) }
}
