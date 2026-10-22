import { beforeAll, describe, expect, it } from "vitest"
import {
  chapterFacts,
  connectedEvents,
  controlOf,
  distanceKm,
  eventsAtPlace,
  nearbyEvents,
  pennants,
  relationshipsFor,
} from "./card"
import { loadServedChapter } from "./chapter-catalog"
import { TANG_CHAPTER } from "./chapter-registry"
import type { Chapter, HistoricalEvent, Territory } from "./domain"

let tang: Chapter

beforeAll(async () => {
  tang = await loadServedChapter(TANG_CHAPTER)
})

function event(id: string): HistoricalEvent {
  return tang.events.find((candidate) => candidate.id === `lks:event:${id}`)!
}

describe("the selection card's lists", () => {
  it("connects the stops either side on a journey, then events with the same person", () => {
    const connected = connectedEvents(tang, event("akimeya-landfall-753"))

    expect(connected.slice(0, 2).map((row) => [row.event.id, row.reason])).toEqual([
      ["lks:event:yaku-departure-753", "previous stop · 鑒眞's voyage to Japan, 753–754"],
      ["lks:event:dazaifu-entry-753", "next stop · 鑒眞's voyage to Japan, 753–754"],
    ])
    expect(connected.length).toBeLessThanOrEqual(5)
  })

  it("names the shared person when the link is a person", () => {
    const connected = connectedEvents(tang, event("appointment-750"))

    expect(connected[0]?.reason).toMatch(/^with /)
  })

  it("keeps nearby apart from connected, closest first", () => {
    const landfall = event("akimeya-landfall-753")
    const connected = new Set(connectedEvents(tang, landfall).map((row) => row.event.id))
    const nearby = nearbyEvents(tang, landfall, connected)

    expect(nearby.map((row) => row.event.id)).toContain("lks:event:fourth-ship-754")
    expect(nearby.every((row) => !connected.has(row.event.id))).toBe(true)
  })

  it("has no nearby events for an event the map cannot place", () => {
    expect(nearbyEvents(tang, event("kiyokawa-drift-753"))).toEqual([])
  })

  it("lists a place's events chronologically", () => {
    const heijo = eventsAtPlace(tang, "lks:place:heijo-palace")

    expect(heijo.length).toBeGreaterThan(3)
    expect(heijo.map((row) => row.occurrence.startYear)).toEqual(
      [...heijo.map((row) => row.occurrence.startYear)].sort((a, b) => a - b),
    )
  })

  it("lists the relationships a record takes part in, with both ends named", () => {
    const rows = relationshipsFor(tang, new Set(["lks:actor:jianzhen"]))

    expect(rows.map((row) => row.relationship.id)).toContain(
      "lks:relationship:jianzhen-transmission",
    )
    expect(
      rows.find((row) => row.relationship.id === "lks:relationship:jianzhen-transmission"),
    ).toMatchObject({ family: "transmission", fromLabel: "鑒眞", toLabel: "東大寺" })
  })
})

describe("the frame's chapter facts", () => {
  it("shows the people the story names most", () => {
    const people = pennants(tang)

    expect(people.length).toBeGreaterThan(1)
    expect(people.length).toBeLessThanOrEqual(5)
    expect(people.map((person) => person.mark)).toContain("鑒眞")
    expect(people.every((person) => person.events >= 2)).toBe(true)
  })

  it("counts the chapter as the About sheet states it", () => {
    const facts = chapterFacts(tang)

    expect(facts.inWindow + facts.coda).toBe(tang.events.length)
    expect(facts.coda).toBe(tang.events.filter((row) => row.coda).length)
  })

  it("measures great-circle distance", () => {
    expect(distanceKm({ lon: 0, lat: 0 }, { lon: 0, lat: 1 })).toBeCloseTo(111.2, 0)
  })
})

describe("the place card's control rows", () => {
  // Synthetic snapshots over the Tang chapter's places: not historical content.
  const snapshot = (id: string, startYear: number, role: "seat" | "held"): Territory => ({
    id,
    controllerId: "lks:actor:tang-dynasty",
    summary: "A synthetic snapshot.",
    span: {
      startYear,
      endYear: startYear,
      precision: "year",
      mode: "duration",
      sourceExpression: null,
    },
    places: [{ placeId: "lks:place:yangzhou", role, gainedRecordId: null, note: "A note." }],
    dispute: null,
    citations: [],
  })

  it("lists every snapshot that holds the place, in date order, with its role", () => {
    const content: Chapter = {
      ...tang,
      territories: [
        snapshot("lks:territory:test-b", 754, "held"),
        snapshot("lks:territory:test-a", 753, "seat"),
      ],
    }
    const rows = controlOf(content, "lks:place:yangzhou")

    expect(rows.map((row) => [row.territory.id, row.role, row.note])).toEqual([
      ["lks:territory:test-a", "seat", "A note."],
      ["lks:territory:test-b", "held", "A note."],
    ])
    expect(rows[0].controllerLabel).toBe(
      tang.actors.find((a) => a.id === "lks:actor:tang-dynasty")?.label,
    )
    expect(controlOf(content, "lks:place:dazaifu")).toEqual([])
  })
})
