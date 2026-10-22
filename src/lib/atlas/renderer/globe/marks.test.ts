import { describe, expect, it } from "vitest"
import { markerLook, type GlobeMarker } from "./marks"

const marker = (overrides: Partial<GlobeMarker> = {}): GlobeMarker => ({
  id: "lks:place:akimeya",
  lon: 130.2269,
  lat: 31.2672,
  label: "秋妻屋浦",
  mark: "attested",
  precision: "site",
  tone: "definite",
  emphasis: "base",
  count: 1,
  disputed: false,
  control: null,
  ...overrides,
})

const classes = (value: string | null) => new Set((value ?? "").split(/\s+/).filter(Boolean))

describe("place marks", () => {
  it("draws an attested site as a solid gold ring around a gold dot", () => {
    const look = markerLook(marker())

    expect(classes(look.mark)).toContain("rounded-full")
    expect(classes(look.mark)).toContain("border-evidence-attested")
    expect(classes(look.core)).toContain("bg-evidence-attested")
  })

  it("sizes an identified halo by its precision, a region wider than a locality", () => {
    const locality = markerLook(marker({ mark: "identified", precision: "locality" }))
    const region = markerLook(marker({ mark: "identified", precision: "region" }))

    expect(region.size).toBeGreaterThan(locality.size)
    expect(locality.mark).toContain("var(--color-evidence-identified)")
    expect(locality.core).toBeNull()
  })

  it("draws a display anchor as a small hollow diamond, never a ring", () => {
    const look = markerLook(marker({ mark: "anchor", precision: "unspecified" }))

    expect(classes(look.mark)).toContain("rotate-45")
    expect(classes(look.mark)).toContain("bg-transparent")
    expect(classes(look.mark)).not.toContain("rounded-full")
    expect(look.size).toBeLessThan(markerLook(marker()).size)
  })

  it("makes a possible mark hollow at 55 % opacity", () => {
    const look = markerLook(marker({ tone: "possible" }))

    expect(classes(look.group)).toContain("opacity-55")
    expect(look.core).toBeNull()
    expect(classes(look.mark)).toContain("bg-transparent")
  })

  it("splits a disputed mark, half filled, whatever its form", () => {
    for (const mark of ["attested", "identified", "anchor"] as const) {
      const look = markerLook(marker({ mark, precision: "locality", disputed: true }))
      expect(look.mark, mark).toMatch(/linear-gradient\(90deg,.*_50%,transparent_50%\)/)
    }
  })

  it("shows the selection gold-bright and larger, with a pulse that respects reduced motion", () => {
    const base = markerLook(marker())
    const selected = markerLook(marker({ emphasis: "selected" }))

    expect(selected.size).toBeGreaterThan(base.size)
    expect(classes(selected.mark)).toContain("border-gold-bright")
    expect(classes(selected.pulse)).toContain("motion-safe:animate-ping")
    expect(base.pulse).toBeNull()
    expect(selected.priority).toBeGreaterThan(base.priority)
  })

  it("makes a place at the playhead a little larger and brighter", () => {
    const base = markerLook(marker())
    const active = markerLook(marker({ emphasis: "active" }))

    expect(active.size).toBeGreaterThan(base.size)
    expect(active.size).toBeLessThan(markerLook(marker({ emphasis: "selected" })).size)
    expect(classes(active.group)).toContain("brightness-125")
  })

  it("counts the events at a place when there is more than one", () => {
    expect(markerLook(marker()).count).toBeNull()
    expect(markerLook(marker({ count: 10 })).count).toContain("tabular-nums")
  })
})

describe("place labels", () => {
  it("set the name in the serif, ink on a lacquer halo, never below 13 px", () => {
    const look = markerLook(marker())

    expect(classes(look.label)).toContain("font-serif")
    expect(classes(look.label)).toContain("text-ink")
    expect(classes(look.label)).toContain("text-body-sm")
    expect(look.label).toContain("var(--color-lacquer)")
  })

  it("set the selected name larger, in gold-bright", () => {
    const look = markerLook(marker({ emphasis: "selected" }))

    expect(classes(look.label)).toContain("text-body")
    expect(classes(look.label)).toContain("text-gold-bright")
  })

  it("sit clear of the mark, however large it is", () => {
    for (const mark of ["attested", "identified", "anchor"] as const) {
      for (const precision of ["locality", "region"] as const) {
        const look = markerLook(marker({ mark, precision, emphasis: "selected" }))
        expect(look.labelOffset).toBeGreaterThanOrEqual(look.hitRadius)
      }
    }
  })

  it("puts a held place on a disc in its controller's tint, ringed for a seat", () => {
    const held = markerLook(marker({ control: { tint: 1, seat: false, disputed: false } }))
    const seat = markerLook(marker({ control: { tint: 1, seat: true, disputed: false } }))

    expect(markerLook(marker()).control).toBeNull()
    expect(classes(held.control)).toContain("bg-control-2/40")
    expect(classes(held.control)).not.toContain("border-double")
    expect(classes(seat.control)).toContain("border-double")
    expect(seat.controlSize).toBeGreaterThan(held.controlSize)
    expect(held.controlSize).toBeGreaterThan(held.size)
  })

  it("splits the disc when the holding is disputed, and reuses tints past the eighth", () => {
    const disputed = markerLook(marker({ control: { tint: 9, seat: false, disputed: true } }))

    expect(disputed.control).toContain("var(--color-control-2)_50%")
  })
})
