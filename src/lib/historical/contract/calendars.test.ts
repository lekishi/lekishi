import { it } from "vitest"
import { load, runBang } from "./vectors"

/**
 * Runs the calendar vectors: a converted Mesoamerican Long Count date carries
 * the correlation its source uses, or null when the source states none, and no
 * other calendar carries one.
 */

for (const vector of load("calendars")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}
