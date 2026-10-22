import { beforeAll, describe, expect, it } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, SERVED_CHAPTERS, TANG_CHAPTER } from "./chapter-registry"
import type { Chapter, Occurrence, Territory } from "./domain"
import { CHAPTER_OVERLAYS } from "./overlay-definitions"
import {
  layerOptions,
  relationshipFamily,
  sceneArcs,
  sceneDioramas,
  sceneJourneys,
  sceneTerritories,
} from "./overlays"
import { buildScene } from "./scene"
import { createAtlasState, selectEvent, selectPlace, setLayer, setPlayhead } from "./state"

const chapters = new Map<string, Chapter>()

beforeAll(async () => {
  for (const served of SERVED_CHAPTERS) {
    chapters.set(served.id, await loadServedChapter(served.id))
  }
})

function chapter(id: string): Chapter {
  return chapters.get(id)!
}

describe("the overlay definitions", () => {
  it("name only records the chapters publish, at places the map can show", () => {
    for (const [id, overlays] of Object.entries(CHAPTER_OVERLAYS)) {
      const content = chapter(id)
      const events = new Map(content.events.map((event) => [event.id, event]))
      const places = new Map(content.places.map((place) => [place.id, place]))
      const actors = new Set(content.actors.map((actor) => actor.id))
      const relationships = new Set(content.relationships.map((relationship) => relationship.id))

      for (const journey of overlays.journeys) {
        if (journey.relationshipId !== null) {
          expect(relationships, journey.id).toContain(journey.relationshipId)
        }

        for (const stop of journey.stops) {
          // A stop is a published event at a published point; a journey never
          // invents a waypoint.
          expect(events.get(stop.eventId)?.placement.kind, stop.eventId).toBe("point")
        }
      }

      for (const [actor, place] of Object.entries(overlays.actorAnchors)) {
        expect(actors, actor).toContain(actor)
        expect(places.get(place)?.position, place).not.toBeNull()
      }

      for (const [relationship, ends] of Object.entries(overlays.endAnchors)) {
        expect(relationships, relationship).toContain(relationship)

        for (const place of Object.values(ends)) {
          expect(places.get(place)?.position, place).not.toBeNull()
        }
      }

      for (const diorama of overlays.dioramas) {
        expect(places.get(diorama.placeId)?.position, diorama.placeId).not.toBeNull()
      }
    }
  })

  it("draws travel as a journey and leaves types without an arc form in the card", () => {
    expect(relationshipFamily("travel")).toBeNull()
    expect(relationshipFamily("other")).toBeNull()
    expect(relationshipFamily("contact")).toBe("diplomacy")
    expect(relationshipFamily("changed_boundaries")).toBe("institution")
  })
})

describe("journeys", () => {
  it("draws 鑒眞's journey record through its dated stops with the vessel at the playhead", () => {
    const tang = chapter(TANG_CHAPTER)
    const before = sceneJourneys(setPlayhead(createAtlasState(tang), tang, 752), tang)
    const voyage = before.find((journey) => journey.id === "lks:journey:jianzhen-to-nara-753")

    expect(voyage?.stops.map((stop) => stop.label)).toEqual([
      "揚州",
      "蘇州黃泗浦",
      "阿兒奈波島",
      "益救島",
      "益救島",
      "秋妻屋浦",
      "大宰府",
      "難波",
      "東大寺",
    ])
    // The arrival at and departure from 益救島 are one vertex, so no leg joins them.
    expect(voyage?.legs.map((leg) => [leg.from, leg.to, leg.drift])).toEqual([
      [0, 1, false],
      [1, 2, false],
      [2, 3, false],
      [4, 5, false],
      [5, 6, false],
      [6, 7, false],
      [7, 8, false],
    ])
    // Before 753 the journey has not started, so no vessel is drawn.
    expect(voyage?.vessel).toBeNull()

    const at754 = sceneJourneys(setPlayhead(createAtlasState(tang), tang, 754), tang)

    // How he reached 東大寺 is not stated, so the playhead shows a plain marker.
    expect(
      at754.find((journey) => journey.id === "lks:journey:jianzhen-to-nara-753")?.vessel,
    ).toEqual({
      stop: 8,
      kind: "marker",
    })
  })

  it("draws a drift as a drift, and never draws a leg to an unlocated place", () => {
    const tang = chapter(TANG_CHAPTER)
    const journeys = sceneJourneys(setPlayhead(createAtlasState(tang), tang, 753), tang)
    const kibi = journeys.find((journey) => journey.id === "lks:journey:kibi-no-makibi-753")

    expect(kibi?.stops.map((stop) => stop.label)).toEqual(["蘇州黃泗浦", "益救島", "紀伊國牟漏埼"])
    expect(kibi?.legs).toEqual([
      { from: 0, to: 1, drift: false },
      { from: 1, to: 2, drift: true },
    ])
    // 驩州 asserts no coordinate, so 藤原清河's journey has one placeable stop
    // and nothing to draw; the card still lists it.
    expect(journeys.map((journey) => journey.id)).not.toContain(
      "lks:journey:fujiwara-no-kiyokawa-753",
    )
    expect(tang.overlays.journeys.map((journey) => journey.id)).toContain(
      "lks:journey:fujiwara-no-kiyokawa-753",
    )
  })

  it("moves the vessel to a selected stop, so the year's stops can be read in turn", () => {
    const tang = chapter(TANG_CHAPTER)
    const selected = selectEvent(createAtlasState(tang), tang, "lks:event:akimeya-landfall-753")
    const voyage = sceneJourneys(selected, tang).find(
      (journey) => journey.id === "lks:journey:jianzhen-to-nara-753",
    )

    expect(voyage?.selected).toBe(true)
    expect(voyage?.vessel).toEqual({ stop: 5, kind: "ship" })
  })

  it("hides journeys with the layer off unless the selection is on one", () => {
    const tang = chapter(TANG_CHAPTER)
    const off = setLayer(createAtlasState(tang), "journeys", false)

    expect(sceneJourneys(off, tang)).toEqual([])
    expect(
      sceneJourneys(selectEvent(off, tang, "lks:event:yaku-departure-753"), tang).map(
        (journey) => journey.id,
      ),
    ).toEqual(["lks:journey:jianzhen-to-nara-753"])
  })
})

describe("relationship arcs", () => {
  it("draws nothing until a selection or an orb asks for it", () => {
    const tang = chapter(TANG_CHAPTER)

    expect(sceneArcs(createAtlasState(tang), tang)).toEqual([])
  })

  it("draws the arcs that touch the selection, between the places that stand for the states", () => {
    const tang = chapter(TANG_CHAPTER)
    const selected = selectEvent(
      createAtlasState(tang),
      tang,
      "lks:event:tang-new-year-audience-753",
    )
    const arcs = sceneArcs(selected, tang)

    expect(arcs.map((arc) => [arc.id, arc.family, arc.fromLabel, arc.toLabel])).toEqual([
      ["lks:relationship:japan-tang-embassy", "diplomacy", "日本國", "唐"],
    ])
    expect(arcs[0]?.emphasis).toBe("selected")
  })

  it("draws a family's arcs in the window when its orb is on", () => {
    const tang = chapter(TANG_CHAPTER)
    const arcs = sceneArcs(setLayer(createAtlasState(tang), "transmission", true), tang)

    expect(arcs.map((arc) => [arc.id, arc.emphasis])).toEqual([
      ["lks:relationship:jianzhen-transmission", "layer"],
    ])
  })

  it("draws an undated relationship on selection only", () => {
    const qin = chapter(QIN_CHAPTER)
    const layered = setLayer(createAtlasState(qin), "conflict", true)

    expect(sceneArcs(layered, qin).map((arc) => arc.id)).not.toContain(
      "lks:relationship:qin-han-conflict",
    )
    expect(
      sceneArcs(selectPlace(layered, qin, "lks:place:xinzheng"), qin).map((arc) => arc.id),
    ).toContain("lks:relationship:qin-han-conflict")
  })

  it("offers the orbs the chapter can draw, and shows territory as unavailable without snapshots", () => {
    expect(layerOptions(chapter(TANG_CHAPTER))).toEqual([
      { id: "journeys", available: true },
      { id: "transmission", available: true },
      { id: "diplomacy", available: true },
      { id: "territory", available: false },
    ])
    expect(layerOptions(chapter(QIN_CHAPTER)).map((option) => option.id)).toEqual([
      "journeys",
      "transmission",
      "diplomacy",
      "conflict",
      "institution",
      "territory",
    ])
  })
})

describe("places first", () => {
  it("marks each place once with its count and its evidence form", () => {
    const tang = chapter(TANG_CHAPTER)
    const scene = buildScene(createAtlasState(tang), tang)
    const heijo = scene.places.find((place) => place.id === "lks:place:heijo-palace")
    const hall = scene.places.find((place) => place.id === "lks:place:hanyuan-hall")
    const akimeya = scene.places.find((place) => place.id === "lks:place:akimeya")

    expect(new Set(scene.places.map((place) => place.id)).size).toBe(scene.places.length)
    expect(heijo?.eventCount).toBeGreaterThan(1)
    expect(heijo?.mark).toBe("identified")
    expect(hall?.mark).toBe("anchor")
    expect(akimeya?.mark).toBe("identified")
    // A place with no sourced position is never marked.
    expect(scene.places.map((place) => place.id)).not.toContain("lks:place:huanzhou")
  })

  it("marks the selected event's place as selected", () => {
    const tang = chapter(TANG_CHAPTER)
    const scene = buildScene(
      selectEvent(createAtlasState(tang), tang, "lks:event:akimeya-landfall-753"),
      tang,
    )

    expect(scene.places.filter((place) => place.selected).map((place) => place.id)).toEqual([
      "lks:place:akimeya",
    ])
  })

  it("sets the diorama at 秋妻屋浦's published position", () => {
    const tang = chapter(TANG_CHAPTER)

    expect(sceneDioramas(tang)).toEqual([
      {
        id: "akimeya",
        placeId: "lks:place:akimeya",
        url: "/dioramas/akimeya.json",
        center: { lon: 130.2269, lat: 31.2672 },
        showBelowMeters: 220_000,
      },
    ])
    expect(sceneDioramas(chapter(QIN_CHAPTER))).toEqual([])
  })
})

describe("territory snapshots", () => {
  // Synthetic snapshots over the Han chapter's places, for the drawing rules
  // only: they are not historical content.
  const span = (startYear: number, endYear: number): Occurrence => ({
    startYear,
    endYear,
    precision: "year",
    mode: "duration",
    sourceExpression: null,
  })
  const snapshot = (
    id: string,
    controllerId: string,
    years: Occurrence,
    places: [string, "seat" | "held"][],
  ): Territory => ({
    id,
    controllerId,
    summary: "A synthetic snapshot.",
    span: years,
    places: places.map(([placeId, role]) => ({ placeId, role, gainedRecordId: null, note: null })),
    dispute: null,
    citations: [],
  })
  const held = (): Chapter => ({
    ...chapter(QIN_CHAPTER),
    territories: [
      snapshot("lks:territory:test-han", "lks:actor:han-state", span(-232, -231), [
        ["lks:place:xinzheng", "seat"],
      ]),
      snapshot("lks:territory:test-qin", "lks:actor:qin-state", span(-229, -228), [
        ["lks:place:xinzheng", "held"],
        ["lks:place:yunyang", "held"],
      ]),
    ],
  })
  const at = (content: Chapter, year: number) =>
    setPlayhead(setLayer(createAtlasState(content), "territory", true), content, year)

  it("enables the territory orb for a chapter with snapshots", () => {
    expect(layerOptions(held()).find((option) => option.id === "territory")).toEqual({
      id: "territory",
      available: true,
    })
  })

  it("draws nothing with the orb off", () => {
    const content = held()

    expect(sceneTerritories(createAtlasState(content), content)).toEqual([])
  })

  it("draws a snapshot only while the playhead is inside its own range", () => {
    const content = held()
    const ids = (year: number) => sceneTerritories(at(content, year), content).map((t) => t.id)

    expect(ids(-232)).toEqual(["lks:territory:test-han"])
    expect(ids(-231)).toEqual(["lks:territory:test-han"])
    // The gap between the two snapshots is a gap in the evidence: nothing is
    // carried forward from Han's and nothing borrowed from Qin's.
    expect(ids(-230)).toEqual([])
    expect(ids(-229)).toEqual(["lks:territory:test-qin"])
    expect(ids(-226)).toEqual([])
  })

  it("tints each held place in its controller's colour and marks the seat", () => {
    const content = held()
    const early = buildScene(at(content, -232), content)
    const late = buildScene(at(content, -229), content)
    const place = (scene: typeof early, id: string) => scene.places.find((entry) => entry.id === id)

    expect(early.territories[0]).toMatchObject({ label: "韓", dateLabel: "233 BCE–232 BCE" })
    expect(place(early, "lks:place:xinzheng")?.control).toEqual({
      tint: 0,
      label: "韓",
      seat: true,
      disputed: false,
    })
    // A held place with no event in the window is still marked.
    expect(place(late, "lks:place:yunyang")?.control).toMatchObject({ tint: 1, seat: false })
    expect(place(late, "lks:place:xinzheng")?.control).toMatchObject({ tint: 1, seat: false })
    // No line or area is drawn for a snapshot.
    expect(late.arcs.every((arc) => !arc.id.startsWith("lks:territory:"))).toBe(true)
  })
})
