import { error } from "@sveltejs/kit"
import type { Chapter } from "$lib/atlas/domain"
import { loadServedChapter } from "$lib/atlas/chapter-catalog"
import { SERVED_CHAPTERS, servedChapter } from "$lib/atlas/chapter-registry"

/**
 * The treatment comparison's review route.
 *
 * This route exists for the bounded RFD 1/RFD 3 comparison of local-detail
 * treatments and for nothing else. It renders a served chapter through the same
 * catalog, the same projection, and the same workspace the chapter route uses,
 * with one extra page-level choice: which of the two local-detail treatments the
 * workspace presents. Content, controls, search, selection, sources, uncertainty
 * cues, and time behavior are the chapter route's own, because it is the same
 * workspace.
 *
 * It is deliberately not a reader surface: nothing links to it, its pages carry
 * `noindex`, and `scripts/check-static-build.mjs` fails the build if a reader
 * page ever links it or if the route stops stating what it is. The chapter route
 * passes no options, so a reader never meets the comparison's vocabulary or its
 * control.
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
