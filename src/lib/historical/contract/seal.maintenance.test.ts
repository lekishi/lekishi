import { describe, it } from "vitest"
import { chapterDirectory } from "../chapter"
import { sealAll } from "./seal"

/**
 * Maintenance entry point, not a test.
 *
 * `pnpm seal` runs this file with `LEKISHI_SEAL=1` after example or chapter
 * content has been edited: it rewrites each source document's `source_hash`,
 * each revision's `revision_hash`, the record's publication mirror, and the
 * publication set's member and source pins from the current content. Both trees
 * are sealed: the synthetic worked examples and the reviewed Tang chapter.
 *
 * It is skipped in the normal suite on purpose. The suite must fail when content
 * is unsealed, never silently reseal it, so that an edit to approved content
 * stays visible as a failed check until it is reviewed and published as a new
 * source document or revision.
 */
describe("resealing the worked examples and the reviewed chapter", () => {
  it.skipIf(process.env.LEKISHI_SEAL !== "1")(
    "rewrites every hash field from the current content",
    () => {
      sealAll()
      sealAll(chapterDirectory("tang-mission-750-754"))
    },
  )
})
