import type { TimeWindow } from "./domain"
import { COMPARISON_CHAPTER, COMPARISON_REVIEW } from "./comparison"
import { RELEASE } from "./release"

/**
 * The chapters a reader can open, as the root page presents them.
 *
 * The name and the summary here are presentation text, not contract records. The
 * published story summary is written for the record's own readers ("from
 * appointment through the return voyage ... with the included coda nodes ...
 * presented after it"), so it describes the chapter's construction rather than
 * the story; a name a visitor reads on a card is a product decision. The content
 * stays the authority for what the atlas can show: `chapters.test.ts` pins every
 * card against the chapter trees — one card per chapter, and each card's window
 * is the window the projection gives that chapter — so a renamed or added
 * chapter fails here instead of leaving the page describing something else.
 *
 * The status line is restrained secondary metadata: it states each chapter's
 * editorial state in the ledger's own terms, and it is deliberately not what the
 * card leads with or what a chapter is for. Qin's set is a `preparation snapshot`
 * with no owner decision, so its card says so; Tang's owner approval is recorded
 * in the RFD 2 ledger, and `release.test.ts` cross-checks the date the card
 * states against the ledger row.
 *
 * A chapter's window is shown in the atlas's own year text (`750–754`,
 * `233 BCE–226 BCE`), never in the astronomical ordinals the domain computes
 * with.
 */
export type ChapterCard = {
  /** The chapter tree's id, which is also the id the contract carries. */
  readonly id: string
  /** The chapter's display name, as a reader sees it on the card and on its page. */
  readonly name: string
  /** The story summary: what a visitor follows when they open the chapter. */
  readonly summary: string
  /** The chapter's own coverage window, in the atlas's year text. */
  readonly window: TimeWindow
  /** Where the chapter opens. */
  readonly href: string
  /** The chapter's editorial state, stated as secondary metadata. */
  readonly status: string
}

export const CHAPTERS: readonly ChapterCard[] = [
  {
    id: "tang-mission-750-754",
    name: "The embassy to Tang China",
    summary:
      "In 750 the Japanese court appointed an embassy to Tang China. Follow 藤原朝臣清河's mission from the appointment and the audiences at court to the invitation to the monk 鑒眞, the return voyage that scattered its ships, and the ordinations of 754 — with the sources' own gaps and disagreements kept visible.",
    window: { start: 750, end: 754 },
    href: "/atlas",
    status: RELEASE.status,
  },
  {
    id: COMPARISON_CHAPTER,
    name: "The end of the state of Han",
    summary:
      "In 233 BCE the king of Han offered his submission to Qin; by 230 BCE Qin had taken the state, and in 226 BCE its former capital 新鄭 revolted. Follow 韓非's embassy and disputed death, the cession of 南陽, and the making of the 潁川 commandery.",
    window: { start: -232, end: -225 },
    href: "/compare/qin",
    status: `${COMPARISON_REVIEW.label} · self-review only`,
  },
]

/**
 * The card for a chapter id, or undefined when the chapter has no card. Callers
 * fall back to the chapter's own published title, so a chapter that is not in
 * this list still renders; `chapters.test.ts` keeps the list covering every
 * chapter tree, so the fallback is a safety net rather than a path the product
 * ships on.
 */
export function chapterPresentation(id: string): ChapterCard | undefined {
  return CHAPTERS.find((chapter) => chapter.id === id)
}
