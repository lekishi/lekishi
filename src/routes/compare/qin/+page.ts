import { redirect } from "@sveltejs/kit"
import { chapterHref } from "$lib/atlas/chapters"
import { QIN_CHAPTER, servedChapter } from "$lib/atlas/chapter-registry"

/**
 * The legacy review route.
 *
 * `/compare/qin` was the bounded chapter's review route before the chapter was
 * approved and the site served it like any other. The URL keeps working as a
 * redirect to the chapter's ordinary route; the page's own unapproved-preparation
 * framing is gone with the decision that made it obsolete. While a production
 * build leaves the chapter out for want of an approval, it redirects to the
 * root page.
 */
export function load(): never {
  // Temporary while the chapter is left out, so no browser keeps it.
  if (servedChapter(QIN_CHAPTER) === undefined) redirect(307, "/")

  redirect(308, chapterHref(QIN_CHAPTER))
}
