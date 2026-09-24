import { describe, it } from "vitest"
import { sealAll } from "./seal"

/**
 * Maintenance entry point, not a test.
 *
 * `pnpm seal` runs this file with `LEKISHI_SEAL=1` after example content has been
 * edited: it rewrites each source document's `source_hash`, each revision's
 * `revision_hash`, the record's publication mirror, and the publication set's
 * member and source pins from the current content.
 *
 * It is skipped in the normal suite on purpose. The suite must fail when an
 * example is unsealed, never silently reseal it, so that an edit to approved
 * content stays visible as a failed check until it is reviewed and published as
 * a new source document or revision.
 */
describe("resealing the worked examples", () => {
  it.skipIf(process.env.LEKISHI_SEAL !== "1")(
    "rewrites every hash field from the current content",
    () => {
      sealAll()
    },
  )
})
