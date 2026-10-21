// See https://svelte.dev/docs/kit/types#app
declare global {
  /**
   * True when this build carries the `/dev` pages, such as the design
   * reference: development and pull-request previews only
   * (`scripts/dev-pages.mjs`). Vite replaces it at build time, so a production
   * build drops their code.
   */
  const __DEV_PAGES__: boolean

  namespace App {
    // The reader site is prerendered and has no session. Only requests the
    // Pages worker answers (sign-in and drafts, RFD 6) see one.
    interface Locals {
      /** The signed-in member of the lekishi organization, or null. */
      user: import("$lib/server/session").Session | null
    }
  }
}

export {}
