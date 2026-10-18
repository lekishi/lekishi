import { beforeAll, describe, expect, it } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, SERVED_CHAPTERS, TANG_CHAPTER } from "./chapter-registry"
import type { Chapter } from "./domain"
import {
  CHAPTER_OVERLAYS,
  layerOptions,
  relationshipFamily,
  sceneArcs,
  sceneDioramas,
  sceneJourneys,
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
  it("draws 鑒眞's voyage through its dated stops with the vessel at the playhead", () => {
    const tang = chapter(TANG_CHAPTER)
    const before = sceneJourneys(setPlayhead(createAtlasState(tang), tang, 752), tang)
    const voyage = before.find((journey) => journey.id === "jianzhen-voyage")

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
    // Before 753 the journey has not started, so no vessel is drawn.
    expect(voyage?.vessel).toBeNull()

    const at754 = sceneJourneys(setPlayhead(createAtlasState(tang), tang, 754), tang)

    expect(at754.find((journey) => journey.id === "jianzhen-voyage")?.vessel).toEqual({
      stop: 8,
      kind: "party",
    })
  })

  it("moves the vessel to a selected stop, so the year's stops can be read in turn", () => {
    const tang = chapter(TANG_CHAPTER)
    const selected = selectEvent(createAtlasState(tang), tang, "lks:event:akimeya-landfall-753")
    const voyage = sceneJourneys(selected, tang).find((journey) => journey.id === "jianzhen-voyage")

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
    ).toEqual(["jianzhen-voyage"])
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

  it("offers the orbs the chapter can draw, and shows territory as unavailable", () => {
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
    const akimeya = scene.places.find((place) => place.id === "lks:place:akimeya")

    expect(new Set(scene.places.map((place) => place.id)).size).toBe(scene.places.length)
    expect(heijo?.eventCount).toBeGreaterThan(1)
    expect(heijo?.mark).toBe("anchor")
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
