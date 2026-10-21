import { error } from "@sveltejs/kit"
import type { Chapter } from "$lib/atlas/domain"
import type { ChapterHeading } from "$lib/atlas/chapters"
import { loadServedChapter } from "$lib/atlas/chapter-catalog"
import { SERVED_CHAPTERS, servedChapter } from "$lib/atlas/chapter-registry"
import { memberDraft } from "$lib/server/drafts"

/**
 * The chapter route's load.
 *
 * One route serves every chapter the site carries: the slug is the chapter tree's
 * own id. Loading in `load` rather than after mount means the page is
 * prerendered with the chapter's real content, and a chapter that cannot be
 * projected fails `pnpm build` instead of rendering an empty page.
 *
 * `entries` is what makes the prerender cover exactly the served chapters, and
 * `prerender = "auto"` lets any other id reach the Pages worker (RFD 6). There a
 * signed-in member of the lekishi organization gets the draft at the address it
 * will keep once approved, and everyone else the same 404 as an id that does
 * not exist, so a draft's existence is not confirmed to them.
 *
 * The load runs on the server so a draft's content never becomes a client
 * chunk: a prerendered chapter's data is written beside its page as
 * `__data.json`, and a draft's is answered by the worker.
 */
export const prerender = "auto"

export const entries = () => SERVED_CHAPTERS.map((chapter) => ({ chapter: chapter.id }))

export async function load({
  params,
  locals,
}: {
  params: { chapter: string }
  locals: App.Locals
}): Promise<{
  chapter: Chapter
  /** A member's draft states its own heading; a served chapter's comes from its card. */
  heading: ChapterHeading | null
  /** Who can see a draft, for its banner. */
  scope: string | null
}> {
  if (servedChapter(params.chapter) !== undefined) {
    return { chapter: await loadServedChapter(params.chapter), heading: null, scope: null }
  }

  const draft = locals.user === null ? undefined : memberDraft(params.chapter)

  if (draft === undefined) {
    error(404, `No chapter is served at /chapters/${params.chapter}`)
  }

  return draft
}
