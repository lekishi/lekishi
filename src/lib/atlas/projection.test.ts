import { describe, expect, it } from "vitest"
import { loadChapter, type ChapterTree } from "../historical/chapter"
import { revisionHash } from "../historical/contract/canonical"
import * as Publication from "../historical/contract/publication"
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

/** The Tang chapter's own coverage model, as the production boundary passes it. */
const COVERAGE = { defaultWindow: { start: 750, end: 754 } }

function tree(): ChapterTree {
  return loadChapter(CHAPTER)
}

function attempt(chapter: ChapterTree = tree()): ProjectionResult {
  return projectChapter(CHAPTER, chapter.documents, chapter.sets, COVERAGE)
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

/** A record's published revision, as the projection's rules see it. */
function publishedRevisionOf(record: JsonObject): JsonObject {
  const mirror = objectOf(record["publication"])

  return objectOf(
    listOf(record["revisions"]).find(
      (revision) => objectOf(revision)["revision_id"] === mirror["published_revision_id"],
    ),
  )
}

/** Appends a revision that no set publishes, with a valid hash. */
function withDraft(
  chapter: ChapterTree,
  recordId: string,
  change: (content: JsonObject) => void,
): void {
  const record = recordById(chapter, recordId)
  const published = publishedRevisionOf(record)
  const content = JSON.parse(JSON.stringify(published["content"])) as JsonObject

  change(content)

  const draft: JsonObject = {
    revision_id: `${String(published["revision_id"]).replace(/-\d+$/, "")}-99`,
    created_at: "2026-09-25T00:00:00Z",
    author: { name: "Lekishi editorial preparation", role: "preparing editor (owner-instructed)" },
    change_explanation: "Draft correction: prepared but not published by any set.",
    content,
    claims: JSON.parse(JSON.stringify(published["claims"])),
  }
  draft["revision_hash"] = revisionHash(draft)
  ;(record["revisions"] as JsonObject[]).push(draft)
}

/**
 * Publishes a new revision of one record in a second set, newest first in the
 * array so the projection cannot rely on file order. This is the shape the
 * flattened chapter no longer carries, kept as an in-memory case because the
 * ordering rule is the reason the boundary exists.
 */
function withSecondSet(
  chapter: ChapterTree,
  recordId: string,
  change: (content: JsonObject) => void,
): ChapterTree {
  const setId = "lks:set:tang-mission-750-754-in-memory-v2"
  const record = recordById(chapter, recordId)
  const published = publishedRevisionOf(record)
  const content = JSON.parse(JSON.stringify(published["content"])) as JsonObject

  change(content)

  const revision: JsonObject = {
    revision_id: `${String(published["revision_id"]).replace(/-\d+$/, "")}-2`,
    created_at: "2026-09-24T23:50:00Z",
    author: { name: "Lekishi editorial preparation", role: "preparing editor (owner-instructed)" },
    change_explanation: "In-memory correction used to pin the ordering rule.",
    content,
    claims: JSON.parse(JSON.stringify(published["claims"])),
  }
  revision["revision_hash"] = revisionHash(revision)
  ;(record["revisions"] as JsonObject[]).push(revision)
  record["publication"] = {
    published_revision_id: revision["revision_id"],
    published_revision_hash: revision["revision_hash"],
    set_id: setId,
    published_at: "2026-09-25T00:10:00Z",
    published_by: {
      name: "Lekishi editorial preparation",
      role: "preparing editor (owner-instructed)",
    },
  }

  const current = objectOf(chapter.sets[0])
  const set: JsonObject = {
    contract: "lekishi-historical-contract/v0",
    document: "publication_set",
    set_id: setId,
    title: "In-memory correction set",
    change_explanation: "Pins the newest-published-revision rule without adding a real version.",
    members: [
      {
        record_id: recordId,
        revision_id: revision["revision_id"],
        revision_hash: revision["revision_hash"],
      },
    ],
    sources: JSON.parse(JSON.stringify(current["sources"])),
    review: {
      ...objectOf(current["review"]),
      reviewed_at: "2026-09-25T00:05:00Z",
      notes: "In-memory review record for the ordering test.",
    },
    published_at: "2026-09-25T00:10:00Z",
    published_by: {
      name: "Lekishi editorial preparation",
      role: "preparing editor (owner-instructed)",
    },
    supersedes: current["set_id"],
    correction_of_revision: null,
  }

  return { ...chapter, sets: [set, ...chapter.sets] }
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

  it("takes the primary window from the caller rather than a chapter branch", () => {
    const chapter = project()

    expect(chapter.defaultWindow).toEqual(COVERAGE.defaultWindow)

    // The window is the caller's decision: a window the events do not fit in
    // fails the projection instead of being silently replaced.
    const wrongWindow = projectChapter(CHAPTER, tree().documents, tree().sets, {
      defaultWindow: { start: 900, end: 950 },
    })

    expect(wrongWindow.ok).toBe(false)
    expect(errorCodes(wrongWindow).join("\n")).toContain("is not presented as a coda node")
  })

  it("selects the newest published revision per record, not the first revision in the file", () => {
    const chapter = project()
    const original = eventById(chapter, "lks:event:ships-separate-753")

    // The flattened chapter publishes one set, and the projection shows what it
    // names: 多禰島 is a context reference, so the separation stays unplaced.
    expect(chapter.publication.setIds).toEqual(["lks:set:tang-mission-750-754-v1"])
    expect(original.placement).toEqual({
      kind: "none",
      placeId: "lks:place:tane",
      label: "多禰島",
      reason: "context-only",
    })

    // The rule itself, kept as an in-memory case: a newer set publishes a new
    // revision of one record, the sets arrive newest-first (so file order cannot
    // be what decides), and the projection shows the newer content while the
    // tree on disk still shows the old one.
    const corrected = withSecondSet(
      cloneTree(tree()),
      "lks:event:ships-separate-753",
      (content) => {
        content["places"] = []
      },
    )

    const projected = project(corrected)

    expect(projected.publication.setIds[0]).toBe("lks:set:tang-mission-750-754-in-memory-v2")
    expect(eventById(projected, "lks:event:ships-separate-753").placement).toEqual({
      kind: "none",
      placeId: null,
      label: null,
      reason: "no-place",
    })
    expect(eventById(project(), "lks:event:ships-separate-753").placement).toMatchObject({
      placeId: "lks:place:tane",
      reason: "context-only",
    })
  })

  it("ignores an unpublished draft", () => {
    const chapter = cloneTree(tree())

    // A draft revision is prepared but no set publishes it. The contract accepts
    // it, and the projection keeps showing the published revision: the boundary
    // reads set-named revisions only, so preparing content cannot change the
    // atlas before the owner decides to publish it.
    withDraft(chapter, "lks:event:appointment-750", (content) => {
      content["summary"] = "Draft summary that no set publishes."
      content["places"] = []
    })

    expect(Publication.checkAll(chapter.documents, chapter.sets).ok).toBe(true)

    const projected = project(chapter)
    const appointment = eventById(projected, "lks:event:appointment-750")

    expect(appointment.note).not.toContain("Draft summary")
    expect(appointment.placement).toMatchObject({ placeId: "lks:place:heijo-palace" })
    expect(projected.publication.setIds).toEqual(["lks:set:tang-mission-750-754-v1"])
  })

  it("shows nothing when no set publishes the chapter", () => {
    const unpublished = attempt({ ...tree(), sets: [] })

    // The projection reads set-named revisions only. With no set in the tree
    // there is no published revision to project, so it fails instead of falling
    // back to a revision file or to synthetic content.
    expect(unpublished.ok).toBe(false)
    expect(errorCodes(unpublished).join("\n")).toContain(
      "carries a publication mirror that no publication set publishes",
    )
  })

  it("keeps every in-window event, including the ones with no published map position", () => {
    const chapter = project()
    const inWindow = chapter.events.filter((event) => !event.coda)
    const placed = inWindow.filter((event) => event.placement.kind === "point")
    const unplaced = inWindow.filter((event) => event.placement.kind === "none")

    expect(inWindow).toHaveLength(24)
    expect(placed).toHaveLength(22)
    expect(unplaced).toHaveLength(2)

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
    // The two identifications are approximate locality-level placements: the
    // events are on the map, and the basis says the position is an approximation.
    expect(eventById(chapter, "lks:event:kibi-drift-753").placement).toMatchObject({
      kind: "point",
      placeId: "lks:place:murozaki",
      label: "紀伊國牟漏埼",
      basis: "approximate",
      precision: "locality",
    })
    expect(eventById(chapter, "lks:event:fourth-ship-754").placement).toMatchObject({
      kind: "point",
      placeId: "lks:place:ishigaki",
      label: "石籬浦",
      basis: "approximate",
      precision: "locality",
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
    for (const placeId of ["lks:place:huanzhou"]) {
      const place = chapter.places.find((candidate) => candidate.id === placeId)

      expect(place).toEqual({
        id: placeId,
        label: expect.any(String),
        aliases: expect.any(Array),
        placement: "unknown",
        precision: "unspecified",
        position: null,
        placementNote: expect.any(String),
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
      aliases: expect.arrayContaining(["大宰府", "Dazaifu"]),
      placement: "display-anchor",
      precision: "unspecified",
      position: { lon: 130.5151, lat: 33.5145 },
      placementNote: expect.any(String),
    })
    // The court's seat is the same kind of placement: a modern label anchor, not
    // a coordinate the review asserted for any of the ten court acts.
    expect(palace).toEqual({
      id: "lks:place:heijo-palace",
      label: "平城宮",
      aliases: expect.arrayContaining(["平城宮", "Heijō no miya"]),
      placement: "display-anchor",
      precision: "unspecified",
      position: { lon: 135.79555556, lat: 34.69111111 },
      placementNote: expect.any(String),
    })
    // The cited identification keeps its own precision; nothing upgrades it.
    expect(yaku).toEqual({
      id: "lks:place:yaku",
      label: "益救島",
      aliases: expect.arrayContaining(["益救島", "Yakushima"]),
      placement: "approximate",
      precision: "region",
      position: { lon: 130.5286, lat: 30.3586 },
      placementNote: expect.any(String),
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

describe("the projection's source boundary", () => {
  it("shows the sources the published revisions cite, and only those", () => {
    const chapter = project()
    const tree = loadChapter(CHAPTER)
    const cited = new Set<string>()

    // Every claim of every published revision, whatever kind of record it is on:
    // a place's identification cites its source just as an event's account does.
    for (const document of tree.documents) {
      if (!isObject(document) || document["document"] !== "record") {
        continue
      }

      const revision = publishedRevisionOf(document)

      for (const claim of listOf(revision["claims"])) {
        for (const citation of listOf(objectOf(claim)["citations"])) {
          cited.add(String(objectOf(citation)["source_id"]))
        }
      }
    }

    // Every shown source is cited by a published revision, and every cited source
    // is shown: the Sources surface is the chapter's evidence, not its file tree.
    const shown = chapter.sources.map((source) => source.id)

    expect(cited.size).toBeGreaterThan(0)

    for (const sourceId of shown) {
      expect(cited.has(sourceId), `${sourceId} is shown but nothing published cites it`).toBe(true)
    }

    for (const sourceId of cited) {
      expect(shown, `${sourceId} is cited but not shown`).toContain(sourceId)
    }
  })

  it("does not let an uncited source document change the chapter", () => {
    // A source added to the tree that no published revision cites is preparation
    // content: the atlas must not show it, because no decision covers it and the
    // chapter's own digest did not change.
    const chapter = cloneTree(tree())

    chapter.documents.push({
      contract: "lekishi-historical-contract/v0",
      document: "source",
      source_id: "lks:source:unpublished-draft",
      source_hash: `sha256:${"0".repeat(64)}`,
      kind: "reference",
      title: "Draft source nothing cites",
      language: "lzh",
      identifiers: [],
      license: { status: "recorded", license_id: "public-domain" },
    })

    const projected = project(chapter)

    expect(projected.sources.map((source) => source.id)).not.toContain(
      "lks:source:unpublished-draft",
    )
    expect(projected.sources.map((source) => source.id).sort()).toEqual(
      project()
        .sources.map((source) => source.id)
        .sort(),
    )
  })

  it("fails a citation to a source the chapter does not publish", () => {
    const chapter = cloneTree(tree())
    const revision = publishedRevisionOf(recordById(chapter, "lks:event:appointment-750"))

    objectOf(listOf(revision["claims"])[0] as JsonObject)["citations"] = [
      {
        source_id: "lks:source:not-in-the-tree",
        locator: { kind: "entry", value: "Nowhere" },
      },
    ]

    const result = attempt(chapter)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.join("\n")).toContain(
        "cites lks:source:not-in-the-tree, which the chapter does not publish",
      )
    }
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

describe("the projection's dispute rule", () => {
  const QIN = "qin-conquest-han-233-226"
  const QIN_COVERAGE = { defaultWindow: { start: -232, end: -225 } }

  function projectQin(tree: ChapterTree): ProjectionResult {
    return projectChapter(QIN, tree.documents, tree.sets, QIN_COVERAGE)
  }

  it("carries a disputed record's summary and challenging accounts into the event", () => {
    const result = projectQin(loadChapter(QIN))

    if (!result.ok) {
      throw new Error(result.errors.join("\n"))
    }

    const death = result.chapter.events.find((event) => event.id === "lks:event:hanfei-death-233")
    const dispute = death?.dispute

    expect(dispute?.status).toBe("disputed")
    expect(dispute?.summary).toContain("王安五年")
    expect(dispute?.summary).toContain("韓王安六年")
    expect(dispute?.summary).not.toContain("agree")
    expect(dispute?.accounts).toHaveLength(2)
    expect(dispute?.accounts[0]?.statement).toContain("hereditary house")
    expect(dispute?.accounts[0]?.locators.length).toBeGreaterThan(0)

    // The other four events are undisputed, so nothing else gains a panel.
    expect(result.chapter.events.filter((event) => event.dispute !== null)).toHaveLength(1)
  })

  it("fails a disputed record with no summary instead of showing an empty panel", () => {
    const tree = loadChapter(QIN)
    const record = tree.documents.find(
      (document) => isObject(document) && document["record_id"] === "lks:event:hanfei-death-233",
    )
    const revision = publishedRevisionOf(objectOf(record))

    delete objectOf(revision["dispute"])["summary"]

    const result = projectQin(tree)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("is disputed but carries no dispute summary")
    }
  })

  it("fails conflicting claims the record does not present as a dispute", () => {
    const tree = loadChapter(QIN)
    const record = tree.documents.find(
      (document) => isObject(document) && document["record_id"] === "lks:event:hanfei-death-233",
    )
    const revision = publishedRevisionOf(objectOf(record))

    objectOf(revision["dispute"])["status"] = "undisputed"

    const result = projectQin(tree)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.join("\n")).toContain(
        "without a disputed status, and the atlas will not present them as undisputed",
      )
    }
  })
})

describe("published event types in the atlas domain", () => {
  it("carries each event's own types, in the record's order and deduplicated", () => {
    const chapter = project()

    // One type, two types in the record's own order, and a coda node's type: the
    // treatment draws its scene from these and must not reorder or merge them.
    expect(eventById(chapter, "lks:event:appointment-750").eventTypes).toEqual(["mission"])
    expect(eventById(chapter, "lks:event:return-voyage-753").eventTypes).toEqual([
      "journey",
      "mission",
    ])
    expect(eventById(chapter, "lks:event:ordination-754").eventTypes).toEqual([
      "process",
      "exchange",
    ])
    expect(eventById(chapter, "lks:event:daikasho-title-758").eventTypes).toEqual(["other"])
  })

  it("carries the Qin chapter's own types through the same projection", () => {
    const tree = loadChapter("qin-conquest-han-233-226")
    const result = projectChapter("qin-conquest-han-233-226", tree.documents, tree.sets, {
      defaultWindow: { start: -232, end: -225 },
    })

    if (!result.ok) {
      throw new Error(result.errors.join("\n"))
    }

    const types = new Map(result.chapter.events.map((event) => [event.id, event.eventTypes]))

    expect(types.get("lks:event:han-conquest-230")).toEqual(["campaign"])
    expect(types.get("lks:event:hanfei-death-233")).toEqual(["occurrence"])
    expect(types.get("lks:event:han-submission-233")).toEqual(["mission", "exchange"])
  })

  it("refuses an event with no published type instead of inventing one", () => {
    // The contract requires a type, so an empty list is a broken reading of the
    // record rather than an event of unknown kind: the atlas must not guess what
    // kind of thing happened.
    const chapter = tree()

    contentOf(recordById(chapter, "lks:event:appointment-750"))["event_types"] = []

    const result = attempt(chapter)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("publishes no event type")
    }
  })
})
