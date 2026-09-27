import { redirect } from "@sveltejs/kit"
import { chapterHref } from "$lib/atlas/chapters"
import { QIN_CHAPTER } from "$lib/atlas/chapter-registry"

/**
 * The legacy review route.
 *
 * `/compare/qin` was the bounded chapter's review route before the chapter was
 * approved and the site served it like any other. The URL keeps working as a
 * redirect to the chapter's ordinary route; the page's own unapproved-preparation
 * framing is gone with the decision that made it obsolete.
 */
export function load(): never {
  redirect(308, chapterHref(QIN_CHAPTER))
}
