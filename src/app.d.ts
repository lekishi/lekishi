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
    // No server-side or session state exists: the site is a static artifact.
  }
}

export {}
