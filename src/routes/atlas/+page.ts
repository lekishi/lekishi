import { redirect } from "@sveltejs/kit"
import { chapterHref } from "$lib/atlas/chapters"
import { TANG_CHAPTER, servedChapter } from "$lib/atlas/chapter-registry"

/**
 * The legacy atlas entry.
 *
 * `/atlas` was the launch chapter's own route before the site served more than
 * one chapter through one chapter route. It stays as a redirect so the URL a
 * reader or a deployment already has keeps working, and it points at the chapter
 * it always rendered: the 750–754 embassy, or the root page while a production
 * build leaves that chapter out for want of an approval.
 */
export function load(): never {
  // Temporary while the chapter is left out, so no browser keeps it.
  if (servedChapter(TANG_CHAPTER) === undefined) redirect(307, "/")

  redirect(308, chapterHref(TANG_CHAPTER))
}
