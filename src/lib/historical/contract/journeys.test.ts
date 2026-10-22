import { it } from "vitest"
import { load, runBang } from "./vectors"

/**
 * Runs the journey vectors (RFD 2, "Decided: the journey record"): a journey's
 * stops are dated events at their own places, an intended destination and a
 * drift need claims of their own, and a leg is drawn only between located
 * places and ends at their points.
 */

for (const vector of load("journeys")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}
