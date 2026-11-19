import { DRAFT_CHAPTERS, loadDraftBundle } from "virtual:lekishi-drafts"
import { projectChapterStories } from "$lib/atlas/chapter-catalog"
import { coverageOf } from "$lib/atlas/chapter-registry"
import type { ChapterHeading } from "$lib/atlas/chapters"
import { chapterHref } from "$lib/atlas/chapters"
import type { Chapter } from "$lib/atlas/domain"
import type { HomeChapter } from "$lib/atlas/home"
import { MEMBER_DRAFT_SCOPE, draftStatement } from "$lib/atlas/release"
import { homeChapter } from "./home"

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
  /** Every story of the chapter, `chapter` first. */
  readonly stories: Chapter[]
  readonly heading: ChapterHeading
  readonly scope: string
}

/** The draft for `id`, or undefined when the public site serves it or it does not exist. */
export function memberDraft(id: string): MemberDraft | undefined {
  const manifest = DRAFT_CHAPTERS.find((entry) => entry.id === id)
  const bundle = loadDraftBundle(id)
  if (manifest === undefined || bundle === undefined) return undefined

  const statement = draftStatement(manifest, MEMBER_DRAFT_SCOPE)
  const stories = projectChapterStories(id, bundle.documents, bundle.sets, coverageOf(manifest))

  return {
    chapter: stories[0],
    stories,
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
export function memberDraftCards(): HomeChapter[] {
  return DRAFT_CHAPTERS.flatMap((manifest) => {
    const draft = memberDraft(manifest.id)
    if (draft === undefined) return []
    return [
      homeChapter(
        {
          id: manifest.id,
          name: manifest.title,
          summary: manifest.summary,
          window: manifest.window,
          href: chapterHref(manifest.id),
          status: draft.heading.status,
          draft: true,
        },
        manifest.region,
        draft.stories,
      ),
    ]
  })
}

/** Every draft, projected story by story, for the members' search index. */
export function memberDraftChapters(): Chapter[][] {
  return DRAFT_CHAPTERS.flatMap((manifest) => {
    const draft = memberDraft(manifest.id)
    return draft === undefined ? [] : [draft.stories]
  })
}

/** A draft's display name, its manifest's title, for the members' search index. */
export function memberDraftName(chapter: Chapter): string {
  return DRAFT_CHAPTERS.find((entry) => entry.id === chapter.id)?.title ?? chapter.title
}
