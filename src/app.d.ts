// See https://svelte.dev/docs/kit/types#app
declare global {
  /**
   * True when this build carries the `/design` reference: development and
   * pull-request previews only (`scripts/design-reference.mjs`). Vite replaces
   * it at build time, so a production build drops the reference's code.
   */
  const __DESIGN_REFERENCE__: boolean

  namespace App {
    // No server-side or session state exists: the site is a static artifact.
  }
}

export {}
