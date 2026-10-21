/**
 * The compiled chapters, served by the Vite plugin in
 * `scripts/historical-chapters.mjs`. The plugin compiles the record files at
 * build time; nothing compiled exists on disk.
 */
declare module "virtual:lekishi-chapters" {
  /** One chapter manifest, served or not. */
  export type ChapterEntry = {
    readonly id: string
    readonly title: string
    readonly summary: string
    /** The window the chapter opens on, in astronomical year ordinals (233 BCE is -232). */
    readonly window: { readonly start: number; readonly end: number }
    /**
     * Whether the manifest's approval matches the content: `stale` when it
     * pins other content, `draft` when there is none. Only a build that serves
     * drafts lists a stale chapter; any other build fails on one.
     */
    readonly state: "approved" | "draft" | "stale"
    /** Whether this build serves the chapter: approved, or a draft on a build that serves drafts. */
    readonly served: boolean
    readonly approval: { readonly digest: string; readonly by: string; readonly on: string } | null
  }

  /** Every chapter manifest, in id order. */
  export const CHAPTERS: readonly ChapterEntry[]

  /**
   * Whether this build serves the chapters without a matching approval, as
   * drafts: development and pull-request previews, never production.
   */
  export const DRAFTS: boolean

  /** A served chapter's v0 documents and publication set, or undefined for any other id. */
  export function loadBundle(id: string): Promise<
    | {
        readonly documents: import("../contract/types").JsonObject[]
        readonly sets: import("../contract/types").JsonObject[]
      }
    | undefined
  >
}

/**
 * The chapters a production build leaves out of the public site, as draft
 * previews, for the Pages worker to show signed-in members (RFD 6). Server-only:
 * the plugin refuses to load it for the browser. Empty on a build that serves
 * drafts publicly.
 */
declare module "virtual:lekishi-drafts" {
  import type { ChapterEntry } from "virtual:lekishi-chapters"

  /** Every chapter left out of the public site, in id order. */
  export const DRAFT_CHAPTERS: readonly ChapterEntry[]

  /** A left-out chapter's draft preview documents and set, or undefined. */
  export function loadDraftBundle(id: string):
    | {
        readonly documents: import("../contract/types").JsonObject[]
        readonly sets: import("../contract/types").JsonObject[]
      }
    | undefined
}
