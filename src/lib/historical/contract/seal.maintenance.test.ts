import { describe, it } from "vitest"
import { sealAll } from "./seal"

/**
 * Maintenance entry point, not a test.
 *
 * `pnpm seal` runs this file with `LEKISHI_SEAL=1` after synthetic example
 * content has been edited: it rewrites each source document's `source_hash`,
 * each revision's `revision_hash`, the record's publication mirror, and the
 * publication set's member and source pins from the current content.
 *
 * It is skipped in the normal suite on purpose. The suite must fail when content
 * is unsealed, never silently reseal it. Reviewed chapter content is excluded
 * deliberately: corrections require a new source or revision and publication
 * set rather than rewriting the hashes that an existing review approved.
 */
describe("resealing the synthetic worked examples", () => {
  it.skipIf(process.env.LEKISHI_SEAL !== "1")(
    "rewrites every hash field from the current content",
    () => {
      sealAll()
    },
  )
})
