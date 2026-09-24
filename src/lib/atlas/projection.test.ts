import { describe, expect, it } from "vitest"
import { loadChapter, type ChapterTree } from "../historical/chapter"
import { isObject, listOf, objectOf, type JsonObject } from "../historical/contract/types"
import type { Chapter, EventPlacement, HistoricalEvent } from "./domain"
import { projectChapter, type ProjectionResult } from "./projection"

/**
 * The projection is the boundary where reviewed content becomes atlas content.
 *
 * These tests run it over the real chapter tree (the same documents Vite
 * bundles for the browser) and over deliberately wrong readings of it. The
 * wrong readings are the failures this integration must not allow: a retained
 * v1 revision reaching the atlas, an event dropped only because it has no map
 * position, a display anchor promoted to an asserted placement, a coda node
 * folded into the primary mission window, or route geometry flattened into
 * points.
 */

const CHAPTER = "tang-mission-750-754"

function tree(): ChapterTree {
  return loadChapter(CHAPTER)
}

function attempt(chapter: ChapterTree = tree()): ProjectionResult {
  return projectChapter(CHAPTER, chapter.documents, chapter.sets)
}

function project(chapter: ChapterTree = tree()): Chapter {
  const result = attempt(chapter)

  if (!result.ok) {
    throw new Error(`the chapter did not project:\n${result.errors.join("\n")}`)
  }

  return result.chapter
}

function cloneTree(chapter: ChapterTree): ChapterTree {
  return structuredClone(chapter) as ChapterTree
}

function recordById(chapter: ChapterTree, recordId: string): JsonObject {
  const record = chapter.documents.find((document) => document["record_id"] === recordId)

  if (record === undefined) {
    throw new Error(`${recordId} is not in the chapter tree`)
  }

  return record
}

function publishedRevision(record: JsonObject): JsonObject {
  const mirror = objectOf(record["publication"])
  const revision = listOf(record["revisions"]).find(
    (candidate) => objectOf(candidate)["revision_id"] === mirror["published_revision_id"],
  )

  if (revision === undefined) {
    throw new Error(`${String(record["record_id"])} has no published revision`)
  }

  return objectOf(revision)
}

function contentOf(record: JsonObject): JsonObject {
  return objectOf(publishedRevision(record)["content"])
}

function eventById(chapter: Chapter, eventId: string): HistoricalEvent {
  const event = chapter.events.find((candidate) => candidate.id === eventId)

  if (event === undefined) {
    throw new Error(`${eventId} is not in the projected chapter`)
  }

  return event
}

function errorCodes(result: ProjectionResult): string[] {
  return result.ok ? [] : result.errors
}

/**
 * Rebuilds the tree as if only one publication set had ever existed: every
 * mirror is rewritten to that set's member, so "the newest published revision"
 * is unambiguous and the other set's corrections are unpublished.
 */
function withOnlySet(chapter: ChapterTree, setId: string): ChapterTree {
  const only = objectOf(chapter.sets.find((set) => objectOf(set)["set_id"] === setId))
  const publishedAt = only["published_at"]

  for (const document of chapter.documents) {
    if (!isObject(document) || document["document"] !== "record") {
      continue
    }

    const member = listOf(only["members"])
      .map(objectOf)
      .find((candidate) => candidate["record_id"] === document["record_id"])

    document["publication"] =
      member === undefined
        ? null
        : {
            published_revision_id: member["revision_id"],
            published_revision_hash: member["revision_hash"],
            set_id: only["set_id"],
            published_at: publishedAt,
            published_by: objectOf(only["published_by"]),
          }
  }

  return { name: chapter.name, documents: chapter.documents, sets: [only] }
}

describe("projecting the reviewed Tang chapter", () => {
  it("projects the published chapter with its real title, places, and events", () => {
    const chapter = project()

    expect(chapter.id).toBe(CHAPTER)
    expect(chapter.title).toBe("The 750–754 embassy of 藤原朝臣清河")
    expect(chapter.summary).toContain("coda nodes of 758, 759, 763, and 779")
    expect(chapter.places).toHaveLength(15)
    expect(chapter.events).toHaveLength(29)
    expect(chapter.events.filter((event) => event.coda)).toHaveLength(5)
    expect(chapter.defaultWindow).toEqual({ start: 750, end: 754 })
    expect(chapter.publication.independence).toBe("self_review")
    expect(chapter.publication.reviewer).toBe("Lekishi editorial preparation")
    expect(chapter.publication.coverageNote).toContain("outbound voyage of 752 is excluded")
    expect(chapter.publication.reviewNotes).toContain(
      "owner's editorial approval under RFD 2 is still pending",
    )
  })

  it("selects the newest published revision per record, not the first revision in the file", () => {
    const chapter = project()

    // The placement set is newest, then the correction set, then the first set;
    // every shown revision is published by one of them, and the newest set
    // decides the review statement.
    expect(chapter.publication.setIds).toEqual([
      "lks:set:tang-mission-750-754-court-anchors",
      "lks:set:tang-mission-750-754-v2",
      "lks:set:tang-mission-750-754-v1",
    ])

    // The corrections this projection can show are visible: v1 attached no place
    // to the ships' separation, and v2 added 多禰島 as a context reference.
    const separation = eventById(chapter, "lks:event:ships-separate-753")

    expect(separation.placement).toEqual({
      kind: "none",
      placeId: "lks:place:tane",
      label: "多禰島",
      reason: "context-only",
    })
  })

  it("projects the v1-era content when only the first set had been published", () => {
    const stale = project(withOnlySet(cloneTree(tree()), "lks:set:tang-mission-750-754-v1"))
    const separation = eventById(stale, "lks:event:ships-separate-753")

    // Under v1 alone the separation names no place at all. Projecting v2's
    // context reference here would mean the projection read a revision the
    // publication sets do not publish.
    expect(separation.placement).toEqual({
      kind: "none",
      placeId: null,
      label: null,
      reason: "no-place",
    })
    expect(stale.publication.setIds).toEqual(["lks:set:tang-mission-750-754-v1"])
  })

  it("keeps every in-window event, including the ones with no published map position", () => {
    const chapter = project()
    const inWindow = chapter.events.filter((event) => !event.coda)
    const placed = inWindow.filter((event) => event.placement.kind === "point")
    const unplaced = inWindow.filter((event) => event.placement.kind === "none")

    expect(inWindow).toHaveLength(24)
    expect(placed).toHaveLength(20)
    expect(unplaced).toHaveLength(4)

    // A court act whose entry names no place is anchored at the court's seat as
    // a display anchor: the record asserts no coordinate and the basis stays
    // visible to the surfaces.
    expect(eventById(chapter, "lks:event:appointment-750").placement).toMatchObject({
      kind: "point",
      placeId: "lks:place:heijo-palace",
      label: "平城宮",
      basis: "display-anchor",
      precision: "unspecified",
    })

    // The entries that name a place the chapter cannot identify, and the one that
    // names a place only as context, stay in the list with no coordinate.
    expect(eventById(chapter, "lks:event:kiyokawa-drift-753").placement).toEqual({
      kind: "none",
      placeId: "lks:place:huanzhou",
      label: "驩州",
      reason: "no-position",
    })
    expect(eventById(chapter, "lks:event:fourth-ship-754").placement).toEqual({
      kind: "none",
      placeId: "lks:place:ishigaki",
      label: "石籬浦",
      reason: "no-position",
    })
    expect(eventById(chapter, "lks:event:kibi-drift-753").placement).toEqual({
      kind: "none",
      placeId: "lks:place:murozaki",
      label: "紀伊國牟漏埼",
      reason: "no-position",
    })
    expect(eventById(chapter, "lks:event:ships-separate-753").placement).toEqual({
      kind: "none",
      placeId: "lks:place:tane",
      label: "多禰島",
      reason: "context-only",
    })

    for (const event of unplaced) {
      expect(JSON.stringify(event.placement)).not.toContain("lon")
    }

    // The places with unknown geometry stay nameable, with no coordinate.
    for (const placeId of ["lks:place:huanzhou", "lks:place:ishigaki", "lks:place:murozaki"]) {
      const place = chapter.places.find((candidate) => candidate.id === placeId)

      expect(place).toEqual({
        id: placeId,
        label: expect.any(String),
        placement: "unknown",
        precision: "unspecified",
        position: null,
      })
    }
  })

  it("keeps a display anchor a display anchor instead of an asserted position", () => {
    const chapter = project()
    const dazaifu = chapter.places.find((place) => place.id === "lks:place:dazaifu")
    const yaku = chapter.places.find((place) => place.id === "lks:place:yaku")
    const palace = chapter.places.find((place) => place.id === "lks:place:heijo-palace")

    expect(dazaifu).toEqual({
      id: "lks:place:dazaifu",
      label: "大宰府",
      placement: "display-anchor",
      precision: "unspecified",
      position: { lon: 130.5151, lat: 33.5145 },
    })
    // The court's seat is the same kind of placement: a modern label anchor, not
    // a coordinate the review asserted for any of the ten court acts.
    expect(palace).toEqual({
      id: "lks:place:heijo-palace",
      label: "平城宮",
      placement: "display-anchor",
      precision: "unspecified",
      position: { lon: 135.79555556, lat: 34.69111111 },
    })
    // The cited identification keeps its own precision; nothing upgrades it.
    expect(yaku).toEqual({
      id: "lks:place:yaku",
      label: "益救島",
      placement: "approximate",
      precision: "region",
      position: { lon: 130.5286, lat: 30.3586 },
    })
    expect(eventById(chapter, "lks:event:dazaifu-entry-753").placement).toMatchObject({
      kind: "point",
      placeId: "lks:place:dazaifu",
      basis: "display-anchor",
      precision: "unspecified",
    })
  })

  it("keeps the coda nodes outside the primary window and labelled", () => {
    const chapter = project()
    const coda = chapter.events.filter((event) => event.coda)

    expect(coda.map((event) => event.occurrence.startYear).sort((a, b) => a - b)).toEqual([
      758, 759, 763, 779, 779,
    ])
    expect(coda.map((event) => event.id).sort()).toEqual([
      "lks:event:daikasho-title-758",
      "lks:event:jianzhen-death-763",
      "lks:event:kiyokawa-honours-779",
      "lks:event:nakamaro-death-779",
      "lks:event:toshodaiji-founding-759",
    ])

    for (const event of coda) {
      expect(event.title.startsWith("Coda — ")).toBe(true)
      expect(event.occurrence.startYear > chapter.defaultWindow.end).toBe(true)
    }
  })

  it("keeps date precision and the source's own expression", () => {
    const chapter = project()
    const audience = eventById(chapter, "lks:event:tang-new-year-audience-753")
    const appointment = eventById(chapter, "lks:event:appointment-750")
    const drift = eventById(chapter, "lks:event:kiyokawa-drift-753")

    expect(audience.occurrence).toEqual({
      startYear: 753,
      endYear: 753,
      precision: "day",
      mode: "instant",
      sourceExpression: "大唐天寶十二載正月朔癸夘",
    })
    expect(appointment.occurrence.precision).toBe("month")
    expect(appointment.occurrence.sourceExpression).toBe("天平勝寶二年九月己酉")
    // A bounded uncertain occurrence keeps its whole support interval.
    expect(drift.occurrence).toEqual({
      startYear: 753,
      endYear: 754,
      precision: "year",
      mode: "occurrence_window",
      sourceExpression: expect.any(String),
    })
  })

  it("is plain data with no renderer objects", () => {
    const chapter = project()
    const roundTripped = JSON.parse(JSON.stringify(chapter))

    expect(roundTripped).toEqual(chapter)
    expect(Object.getPrototypeOf(roundTripped)).toBe(Object.prototype)
  })
})

describe("adversarial readings of the chapter", () => {
  it("rejects route geometry instead of flattening it into points", () => {
    const chapter = cloneTree(tree())
    const content = contentOf(recordById(chapter, "lks:event:return-voyage-753"))
    const geometry = listOf(content["geometry"])[0] as JsonObject

    geometry["interpretation"] = "attested_itinerary"
    geometry["precision"] = "region"
    geometry["geojson"] = {
      type: "LineString",
      coordinates: [
        [120.6194, 31.3],
        [127.95, 26.4833],
      ],
    }

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("route geometry")
  })

  it("rejects a display anchor that claims a placement precision", () => {
    const chapter = cloneTree(tree())
    const geometry = listOf(contentOf(recordById(chapter, "lks:place:dazaifu"))["geometry"])[0]

    objectOf(geometry)["precision"] = "locality"

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("display anchor asserts no placement precision")
  })

  it("rejects a coda node moved into the primary window", () => {
    const chapter = cloneTree(tree())
    const time = objectOf(contentOf(recordById(chapter, "lks:event:daikasho-title-758"))["time"])
    const interval = objectOf(time["interval"])

    objectOf(interval["start"])["year"] = 754
    objectOf(interval["end"])["year"] = 754
    objectOf(interval["start"])["month"] = 8
    objectOf(interval["end"])["month"] = 8

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("coda node but its published date falls inside")
  })

  it("rejects a mission event pushed outside the primary window without a coda label", () => {
    const chapter = cloneTree(tree())
    const time = objectOf(contentOf(recordById(chapter, "lks:event:rewards-754"))["time"])
    const interval = objectOf(time["interval"])

    objectOf(interval["start"])["year"] = 756
    objectOf(interval["end"])["year"] = 756

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("is not presented as a coda node")
  })

  it("rejects a publication mirror that disagrees with the newest set", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:naniwa")

    // naniwa is published by the first set; claiming the correction set would
    // mean the atlas reads a revision that set never approved.
    objectOf(record["publication"])["set_id"] = "lks:set:tang-mission-750-754-v2"

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("publication mirror disagrees")
  })

  it("rejects a record published at a revision it does not carry", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:naniwa")
    const mirror = objectOf(record["publication"])
    const member = listOf(
      objectOf(
        chapter.sets.find((set) => objectOf(set)["set_id"] === "lks:set:tang-mission-750-754-v1"),
      )["members"],
    )
      .map(objectOf)
      .find((candidate) => candidate["record_id"] === "lks:place:naniwa")

    if (member === undefined) {
      throw new Error("naniwa is not a member of the first set")
    }

    member["revision_id"] = "lks:rev:naniwa-9"
    mirror["published_revision_id"] = "lks:rev:naniwa-9"

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("which is not one of its revisions")
  })

  it("rejects an event without a story caption instead of inventing a title", () => {
    const chapter = cloneTree(tree())
    const story = recordById(chapter, "lks:story:tang-mission-750-779")
    const content = contentOf(story)

    content["steps"] = listOf(content["steps"]).filter(
      (step) => objectOf(step)["record_id"] !== "lks:event:rewards-754",
    )

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("has no story caption")
  })

  it("rejects an undated event instead of guessing a year", () => {
    const chapter = cloneTree(tree())
    const time = objectOf(contentOf(recordById(chapter, "lks:event:rewards-754"))["time"])

    time["mode"] = "unknown"
    time["precision"] = "unspecified"
    time["interval"] = null

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("is undated")
  })

  it("rejects an open-ended occurrence instead of inventing the missing end", () => {
    const chapter = cloneTree(tree())
    const time = objectOf(contentOf(recordById(chapter, "lks:event:ordination-754"))["time"])
    const interval = objectOf(time["interval"])

    interval["bounds"] = "lower_only"
    interval["end"] = null

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("open-ended occurrence")
  })

  it("rejects an event that references an unpublished place", () => {
    const chapter = cloneTree(tree())
    const places = listOf(
      contentOf(recordById(chapter, "lks:event:longxing-departure-753"))["places"],
    )
    const reference = objectOf(places[0])

    reference["place_id"] = "lks:place:not-published"

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("which is not a published place")
  })

  it("rejects a chapter whose events would leave the map empty", () => {
    const chapter = cloneTree(tree())

    for (const document of chapter.documents) {
      if (isObject(document) && document["document"] === "record" && document["kind"] === "event") {
        document["publication"] = null
      }
    }

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("publishes no events")
  })

  it("rejects a chapter whose story is not published", () => {
    const chapter = cloneTree(tree())

    for (const document of chapter.documents) {
      if (isObject(document) && document["document"] === "record" && document["kind"] === "story") {
        document["publication"] = null
      }
    }

    const result = attempt(chapter)

    expect(result.ok).toBe(false)
    expect(errorCodes(result).join("\n")).toContain("publishes no story record")
  })

  it("reports every problem at once instead of stopping at the first", () => {
    const chapter = cloneTree(tree())

    objectOf(
      listOf(contentOf(recordById(chapter, "lks:place:dazaifu"))["geometry"])[0] as JsonObject,
    )["precision"] = "region"

    const time = objectOf(contentOf(recordById(chapter, "lks:event:rewards-754"))["time"])

    time["mode"] = "unknown"
    time["precision"] = "unspecified"
    time["interval"] = null

    const result = attempt(chapter)
    const report = errorCodes(result).join("\n")

    expect(result.ok).toBe(false)
    expect(report).toContain("display anchor asserts no placement precision")
    expect(report).toContain("is undated")
  })
})

/** Guards the fixture-shape assumption the projection makes about `places`. */
describe("the chapter's place references", () => {
  it("uses only roles the projection understands", () => {
    const chapter = tree()
    const roles = new Set<string>()

    for (const document of chapter.documents) {
      if (
        !isObject(document) ||
        document["document"] !== "record" ||
        document["kind"] !== "event"
      ) {
        continue
      }

      for (const reference of listOf(contentOf(document)["places"])) {
        roles.add(String(objectOf(reference)["role"]))
      }
    }

    expect([...roles].sort()).toEqual(["context", "end", "site", "start", "waypoint"])
  })

  it("publishes no route or area geometry the atlas would have to reject", () => {
    const result = attempt()

    expect(result.ok).toBe(true)
  })
})
