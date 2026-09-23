import { describe, expect, it } from "vitest"
import { mapLabel } from "./names"
import { load, runBang } from "./vectors"

/**
 * Runs the naming vectors. The label derivation and the script checks are the two
 * places where a plausible wrong interpretation (a romanization presented as the
 * local form, or a modern name presented as the historical label) would otherwise
 * pass silently.
 */

for (const vector of load("names")) {
  it(`vector ${String(vector["id"])}`, () => {
    runBang(vector)
  })
}

describe("map labels", () => {
  it("never derives a label from a modern equivalent", () => {
    const label = mapLabel([
      { role: "modern", form: "Xi'an" },
      { role: "primary", form: "長安", romanization: { value: "Chang'an" } },
    ])

    expect(label).toBe("長安 · Chang'an")
  })

  it("returns no label when nothing is primary", () => {
    expect(mapLabel([{ role: "alternate", form: "長安" }])).toBeNull()
    expect(mapLabel("長安")).toBeNull()
  })
})
