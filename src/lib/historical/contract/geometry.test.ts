import { it } from "vitest"
import { load, runBang } from "./vectors"

/**
 * Runs the geometry vectors: what the evidence supports, what the atlas asserts,
 * and the refusals to invent a radius, a confidence value, or a coordinate for an
 * unknown placement.
 */

for (const vector of load("geometry")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}
