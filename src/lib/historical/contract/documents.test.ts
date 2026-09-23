import { it } from "vitest"
import { load, runBang } from "./vectors"

/**
 * Runs the record-document vectors, which cover renderer independence, claim
 * evidence and pointers, attestation versus cited interpretation, visible
 * disputes, reference resolution, and draft-only research notes.
 */

for (const vector of load("documents")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}
