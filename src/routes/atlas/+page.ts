import { redirect } from "@sveltejs/kit"
import { chapterHref } from "$lib/atlas/chapters"
import { TANG_CHAPTER } from "$lib/atlas/chapter-registry"

/**
 * The legacy atlas entry.
 *
 * `/atlas` was the launch chapter's own route before the site served more than
 * one chapter through one chapter route. It stays as a redirect so the URL a
 * reader or a deployment already has keeps working, and it points at the chapter
 * it always rendered: the 750–754 embassy.
 */
export function load(): never {
  redirect(308, chapterHref(TANG_CHAPTER))
}
