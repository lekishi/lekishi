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
    readonly state: "approved" | "draft"
    readonly approval: { readonly digest: string; readonly by: string; readonly on: string } | null
  }

  /** Every chapter manifest, in id order. */
  export const CHAPTERS: readonly ChapterEntry[]

  /** A served chapter's v0 documents and publication set, or undefined for any other id. */
  export function loadBundle(id: string): Promise<
    | {
        readonly documents: import("../contract/types").JsonObject[]
        readonly sets: import("../contract/types").JsonObject[]
      }
    | undefined
  >
}
