/**
 * LiveView generates colocated hooks and styles into
 * `_build/$MIX_ENV/phoenix-colocated`, and Vite resolves the specifier through an
 * alias (see `vite.config.ts`). The generated module is plain JavaScript, so its
 * shape is declared here for the type check instead of depending on the build
 * directory being present.
 */
declare module "phoenix-colocated/lekishi" {
  import type { HooksOptions } from "phoenix_live_view"

  export const hooks: HooksOptions
  export default hooks
}
