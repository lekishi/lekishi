import { describe, expect, it } from "vitest"
import { placeLabels } from "./labels"

const box = (id: string, left: number, top: number, priority = 0) => ({
  id,
  priority,
  left,
  top,
  width: 100,
  height: 20,
})

describe("label placement", () => {
  it("shows every label that fits", () => {
    expect(placeLabels([box("a", 0, 0), box("b", 200, 0), box("c", 0, 100)])).toEqual(
      new Set(["a", "b", "c"]),
    )
  })

  it("hides a label that would overprint an earlier one", () => {
    // Several events at one place: their labels stack, and only the first shows.
    expect(placeLabels([box("a", 0, 0), box("b", 0, 0), box("c", 10, 5)])).toEqual(new Set(["a"]))
  })

  it("places the selected label, then the ones at the playhead, before the rest", () => {
    const shown = placeLabels([
      box("plain", 0, 0),
      box("playhead", 0, 0, 1),
      box("selected", 50, 0, 2),
    ])

    expect(shown).toEqual(new Set(["selected"]))
    expect(placeLabels([box("plain", 0, 0), box("playhead", 0, 0, 1)])).toEqual(
      new Set(["playhead"]),
    )
  })

  it("keeps a small gap between labels", () => {
    expect(placeLabels([box("a", 0, 0), box("b", 101, 0)]).size).toBe(1)
    expect(placeLabels([box("a", 0, 0), box("b", 103, 0)]).size).toBe(2)
  })
})
