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
