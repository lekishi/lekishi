import { DRAFT_CHAPTERS, loadDraftBundle } from "virtual:lekishi-drafts"
import { projectChapterContent } from "$lib/atlas/chapter-catalog"
import type { ChapterCard, ChapterHeading } from "$lib/atlas/chapters"
import { chapterHref } from "$lib/atlas/chapters"
import type { Chapter } from "$lib/atlas/domain"
import { MEMBER_DRAFT_SCOPE, draftStatement } from "$lib/atlas/release"

/**
 * The drafts a production build leaves out of the public site, for signed-in
 * members of the lekishi organization (RFD 6). This module is server-only: its
 * content is in the worker's bundle and reaches a browser only in a response to
 * a request `locals.user` vouches for. Every caller checks that first.
 *
 * A build that serves drafts publicly (development and previews) has none
 * here, because it already prerenders every chapter.
 */

/** A member's draft: the projected chapter and what its page states about it. */
export type MemberDraft = {
  readonly chapter: Chapter
  readonly heading: ChapterHeading
  readonly scope: string
}

/** The draft for `id`, or undefined when the public site serves it or it does not exist. */
export function memberDraft(id: string): MemberDraft | undefined {
  const manifest = DRAFT_CHAPTERS.find((entry) => entry.id === id)
  const bundle = loadDraftBundle(id)
  if (manifest === undefined || bundle === undefined) return undefined

  const statement = draftStatement(manifest, MEMBER_DRAFT_SCOPE)

  return {
    chapter: projectChapterContent(id, bundle.documents, bundle.sets, {
      defaultWindow: manifest.window,
    }),
    heading: {
      name: manifest.title,
      decision: statement.decision,
      status: statement.status,
      draft: true,
    },
    scope: MEMBER_DRAFT_SCOPE,
  }
}

/** The home page's cards for the drafts, as a member sees them. */
export function memberDraftCards(): ChapterCard[] {
  return DRAFT_CHAPTERS.map((manifest) => ({
    id: manifest.id,
    name: manifest.title,
    summary: manifest.summary,
    window: manifest.window,
    href: chapterHref(manifest.id),
    status: draftStatement(manifest, MEMBER_DRAFT_SCOPE).status,
    draft: true,
  }))
}

/** Every draft, projected, for the members' search index. */
export function memberDraftChapters(): Chapter[] {
  return DRAFT_CHAPTERS.flatMap((manifest) => memberDraft(manifest.id)?.chapter ?? [])
}

/** A draft's display name, its manifest's title, for the members' search index. */
export function memberDraftName(chapter: Chapter): string {
  return DRAFT_CHAPTERS.find((entry) => entry.id === chapter.id)?.title ?? chapter.title
}
