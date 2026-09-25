import { describe, expect, it } from "vitest"
import { chapterDirectory, loadChapter, type ChapterTree } from "../chapter"
import { projectChapter } from "../../atlas/projection"
import { revisionHash, sourceHash } from "./canonical"
import * as Publication from "./publication"
import * as Time from "./time"
import { isObject, listOf, objectOf, type JsonObject, type JsonValue } from "./types"

/**
 * Independent checks for the bounded Qin comparison fixture.
 *
 * The fixture is comparison-only preparation content: it exists for the shared
 * treatment harness, not as a launch chapter, and the publication ledger records
 * it as a preparation snapshot rather than an approved release. Two layers are
 * tested. The first is the contract's own semantics over the chapter tree, plus
 * the seal and publication rules that protect it. The second is this fixture's
 * own coverage model: the 233–226 BCE window, the excluded notices and campaigns,
 * the year-only dates with no invented day, the disputed death with the three
 * accounts kept apart, and the rule that the fixture places exactly one label
 * anchor and asserts no other coordinate.
 *
 * The chapter rules are written as predicates and then exercised against
 * deliberately wrong readings, because the contract alone would accept an
 * approximate point at the modern city of 南陽, a day added to the annexation, a
 * campaign route, or a merged death account.
 */

const CHAPTER = "qin-conquest-han-233-226"

/** The fixture's episode window, inclusive at year granularity (civil BCE). */
const WINDOW = { startYear: 233, endYear: 226 }

/** Years whose Qin–Han notices the fixture excludes: the 246 canal and the 227 assassination attempt. */
const EXCLUDED_YEARS = [246, 227]

/** The one place the fixture places, and the modern anchor coordinate it uses. */
const ANCHORED_PLACE = "lks:place:xinzheng"
const ANCHOR_COORDINATES = [113.7249, 34.39621]

const EVIDENCE_KINDS = ["place", "actor", "event", "relationship"]
const ROUTE_INTERPRETATIONS = ["attested_itinerary", "reconstructed_route", "schematic_link"]
const ROUTE_TYPES = ["LineString", "MultiLineString"]

const EXPECTED_EVENTS = [
  "lks:event:han-submission-233",
  "lks:event:hanfei-death-233",
  "lks:event:han-nanyang-cession-231",
  "lks:event:han-conquest-230",
  "lks:event:xinzheng-revolt-226",
]

/** The event that must stay unplaced, with the reason the atlas must state. */
const UNPLACED_EVENTS: [string, string][] = [
  ["lks:event:han-submission-233", "no-place"],
  ["lks:event:hanfei-death-233", "no-position"],
  ["lks:event:han-nanyang-cession-231", "no-position"],
  ["lks:event:han-conquest-230", "no-position"],
]

function tree(): ChapterTree {
  return loadChapter(CHAPTER)
}

function recordsOfKind(chapter: ChapterTree, kind: string): JsonObject[] {
  return chapter.documents.filter(
    (document) => document["document"] === "record" && document["kind"] === kind,
  )
}

function recordById(chapter: ChapterTree, recordId: string): JsonObject {
  const record = chapter.documents.find((document) => document["record_id"] === recordId)

  if (record === undefined) {
    throw new Error(`${recordId} is not in the chapter tree`)
  }

  return record
}

function setById(chapter: ChapterTree, setId: string): JsonObject {
  const set = chapter.sets.find((candidate) => objectOf(candidate)["set_id"] === setId)

  if (set === undefined) {
    throw new Error(`${setId} is not in the chapter tree`)
  }

  return objectOf(set)
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

function claimsOf(record: JsonObject): JsonObject[] {
  return listOf(publishedRevision(record)["claims"]).map((claim) => objectOf(claim))
}

function citationsOf(record: JsonObject): JsonObject[] {
  return claimsOf(record).flatMap((claim) =>
    listOf(claim["citations"]).map((citation) => objectOf(citation)),
  )
}

function citedSourceIds(record: JsonObject): string[] {
  return [...new Set(citationsOf(record).map((citation) => String(citation["source_id"])))].sort()
}

function geometryEntries(record: JsonObject): JsonObject[] {
  return listOf(contentOf(record)["geometry"]).map((entry) => objectOf(entry))
}

function normalizedTime(record: JsonObject): Time.NormalizedTime {
  const result = Time.normalize(contentOf(record)["time"])

  if (!result.ok) {
    throw new Error(
      `${String(record["record_id"])} has an invalid time: ${result.errors.join(", ")}`,
    )
  }

  return result.value
}

/** The event's civil years, from the normalized endpoints. */
function yearsOf(time: Time.NormalizedTime): number[] {
  const years: number[] = []

  for (const endpoint of [time.start, time.end]) {
    if (endpoint !== null && endpoint.astro <= 0) {
      years.push(1 - endpoint.astro)
    }
  }

  return years
}

/**
 * The fixture's scope: every event lies inside 233–226 BCE, and no event falls
 * in the excluded years whose Qin–Han notices the coverage note names.
 */
function scopeViolations(chapter: ChapterTree): string[] {
  const violations = new Set<string>()

  for (const record of recordsOfKind(chapter, "event")) {
    const recordId = String(record["record_id"])
    const time = normalizedTime(record)
    const years = yearsOf(time)

    if (years.length === 0) {
      violations.add(`${recordId} carries no dated endpoints`)
      continue
    }

    for (const year of years) {
      // Civil BCE years run downwards: 233 is the earliest year in the window
      // and 226 the latest.
      if (year > WINDOW.startYear || year < WINDOW.endYear) {
        violations.add(
          `${recordId} falls in ${year}, outside the ${WINDOW.startYear}–${WINDOW.endYear} BCE window`,
        )
      }

      if (EXCLUDED_YEARS.includes(year)) {
        violations.add(`${recordId} falls in the excluded year ${year}`)
      }
    }
  }

  return [...violations]
}

/** The fixture publishes no coda nodes: every event is in the one episode window. */
function codaViolations(chapter: ChapterTree): string[] {
  const story = recordById(chapter, "lks:story:qin-conquest-han-233-226")

  return listOf(contentOf(story)["steps"])
    .map((step) => objectOf(step))
    .filter((step) => String(step["caption"]).startsWith("Coda — "))
    .map((step) => `${String(step["record_id"])} is labelled as a coda node`)
}

/** No route geometry anywhere: the fixture draws no path or territory. */
function routeViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of chapter.documents.filter((document) => document["document"] === "record")) {
    const recordId = String(record["record_id"])

    for (const entry of geometryEntries(record)) {
      const interpretation = String(entry["interpretation"])
      const type = isObject(entry["geojson"]) ? String(objectOf(entry["geojson"])["type"]) : ""

      if (ROUTE_INTERPRETATIONS.includes(interpretation)) {
        violations.push(`${recordId} uses route interpretation ${interpretation}`)
      }

      if (ROUTE_TYPES.includes(type)) {
        violations.push(`${recordId} carries ${type} geometry`)
      }

      if (entry["waypoints"] !== null && entry["waypoints"] !== undefined) {
        violations.push(`${recordId} carries route waypoints`)
      }
    }
  }

  return violations
}

/**
 * The fixture asserts one label anchor and no other coordinate: every geometry
 * entry is `unknown` without coordinates or the 新鄭 display anchor, and no
 * entry claims locational precision or an approximate point.
 */
function coordinateViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of chapter.documents.filter((document) => document["document"] === "record")) {
    const recordId = String(record["record_id"])

    for (const entry of geometryEntries(record)) {
      const interpretation = String(entry["interpretation"])
      const geojson = entry["geojson"]

      if (interpretation === "unknown") {
        if (geojson !== null) {
          violations.push(`${recordId} gives an unknown placement coordinates`)
        }

        if (entry["precision"] !== "unspecified") {
          violations.push(
            `${recordId} gives an unknown placement the precision ${String(entry["precision"])}`,
          )
        }

        continue
      }

      if (interpretation !== "display_anchor") {
        violations.push(
          `${recordId} asserts ${interpretation} geometry, which this fixture does not publish`,
        )
        continue
      }

      if (entry["precision"] !== "unspecified") {
        violations.push(
          `${recordId} gives its display anchor the precision ${String(entry["precision"])}`,
        )
      }

      if (recordId !== ANCHORED_PLACE) {
        violations.push(
          `${recordId} carries a display anchor, but only ${ANCHORED_PLACE} may be anchored`,
        )
        continue
      }

      const coordinates = isObject(geojson) ? listOf(objectOf(geojson)["coordinates"]) : []

      if (JSON.stringify(coordinates) !== JSON.stringify(ANCHOR_COORDINATES)) {
        violations.push(
          `${recordId} anchors at ${JSON.stringify(coordinates)} instead of the recorded modern coordinate`,
        )
      }
    }
  }

  return violations
}

/** No event publishes day precision: none of the cited entries states a day. */
function dayPrecisionViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of recordsOfKind(chapter, "event")) {
    const time = objectOf(contentOf(record)["time"])
    const interval = objectOf(time["interval"])

    if (time["precision"] === "day") {
      violations.push(`${String(record["record_id"])} publishes day precision`)
    }

    for (const endpoint of ["start", "end"]) {
      const value = interval[endpoint]

      if (isObject(value) && value["day"] !== null && value["day"] !== undefined) {
        violations.push(`${String(record["record_id"])} carries a day in its ${endpoint} endpoint`)
      }
    }
  }

  return violations
}

/** Exactly one disputed account, and no alternative claims outside it. */
function disputeViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of chapter.documents.filter((document) => document["document"] === "record")) {
    const recordId = String(record["record_id"])
    const revision = publishedRevision(record)
    const status = isObject(revision["dispute"])
      ? String(objectOf(revision["dispute"])["status"])
      : "undisputed"
    const challenging = claimsOf(record).filter(
      (claim) => claim["role"] === "alternative" || claim["role"] === "conflicting",
    ).length

    if (recordId === "lks:event:hanfei-death-233") {
      if (status !== "disputed") {
        violations.push(`${recordId} must publish its death accounts as a dispute`)
      }

      if (challenging < 2) {
        violations.push(`${recordId} must keep the other accounts as conflicting claims`)
      }
    } else if (status === "disputed" || challenging > 0) {
      violations.push(`${recordId} carries a dispute the fixture does not publish`)
    }
  }

  return violations
}

/** The two recorded variants stay visible: the 潁州郡 reading and the regnal-year difference. */
function variantViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []
  const commandery = recordById(chapter, "lks:place:yingchuan")
  const submission = recordById(chapter, "lks:event:han-submission-233")

  const hasVariant = claimsOf(commandery).some((claim) =>
    listOf(claim["citations"]).some((citation) =>
      String(objectOf(citation)["quoted_text"] ?? "").includes("潁州郡"),
    ),
  )

  if (!hasVariant) {
    violations.push("the hereditary house's 潁州郡 reading is not recorded")
  }

  const notes = String(contentOf(submission)["editorial_notes"])

  if (!notes.includes("王安五年") || !notes.includes("王安六年")) {
    violations.push("the regnal-year difference for the embassy year is not recorded")
  }

  return violations
}

/** The set publishes every record exactly once and pins every cited source. */
function pinViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []
  const set = setById(chapter, "lks:set:qin-conquest-han-233-226-v1")
  const memberIds = listOf(set["members"]).map((member) => String(objectOf(member)["record_id"]))
  const recordIds = chapter.documents
    .filter((document) => document["document"] === "record")
    .map((record) => String(record["record_id"]))

  if (JSON.stringify([...memberIds].sort()) !== JSON.stringify([...recordIds].sort())) {
    violations.push("the set does not publish every record exactly once")
  }

  const cited = [
    ...new Set(
      chapter.documents
        .filter((document) => document["document"] === "record")
        .flatMap((record) => citedSourceIds(record)),
    ),
  ].sort()
  const pinned = listOf(set["sources"])
    .map((pin) => String(objectOf(pin)["source_id"]))
    .sort()

  if (JSON.stringify(cited) !== JSON.stringify(pinned)) {
    violations.push(
      `the set pins ${JSON.stringify(pinned)} but the records cite ${JSON.stringify(cited)}`,
    )
  }

  return violations
}

function cloneTree(chapter: ChapterTree): ChapterTree {
  return structuredClone(chapter) as ChapterTree
}

function reseal(record: JsonObject): void {
  const revision = publishedRevision(record)
  revision["revision_hash"] = revisionHash(revision)
  objectOf(record["publication"])["published_revision_hash"] = revision["revision_hash"]
}

describe("the Qin comparison fixture", () => {
  it("validates with the contract's own publication semantics", () => {
    const result = Publication.checkAll(tree().documents, tree().sets)

    if (!result.ok) {
      throw new Error(
        result.errors.map((error) => `${error.code} ${error.where}: ${error.detail}`).join("\n"),
      )
    }

    expect(result.ok).toBe(true)
  })

  it("carries the exact inventory the fixture documents", () => {
    const chapter = tree()

    expect(chapter.documents).toHaveLength(23)
    expect(recordsOfKind(chapter, "place")).toHaveLength(4)
    expect(recordsOfKind(chapter, "actor")).toHaveLength(6)
    expect(recordsOfKind(chapter, "event")).toHaveLength(5)
    expect(recordsOfKind(chapter, "relationship")).toHaveLength(4)
    expect(recordsOfKind(chapter, "story")).toHaveLength(1)
    expect(chapter.sets).toHaveLength(1)
    expect(chapter.documents.filter((document) => document["document"] === "source")).toHaveLength(
      3,
    )
    expect(
      recordsOfKind(chapter, "event")
        .map((record) => String(record["record_id"]))
        .sort(),
    ).toEqual([...EXPECTED_EVENTS].sort())
  })

  it("stays inside its 233–226 BCE window and excludes the named notices", () => {
    expect(scopeViolations(tree())).toEqual([])
    expect(codaViolations(tree())).toEqual([])
  })

  it("publishes one set that pins every cited source", () => {
    expect(pinViolations(tree())).toEqual([])
  })

  it("records the two variants rather than resolving them", () => {
    expect(variantViolations(tree())).toEqual([])
  })

  it("keeps the death accounts as one visible dispute and nothing else disputed", () => {
    expect(disputeViolations(tree())).toEqual([])
  })

  it("asserts one label anchor and no other coordinate", () => {
    expect(coordinateViolations(tree())).toEqual([])
    expect(routeViolations(tree())).toEqual([])
  })

  it("publishes no day and no duration the sources do not state", () => {
    expect(dayPrecisionViolations(tree())).toEqual([])

    for (const record of recordsOfKind(tree(), "event")) {
      expect(normalizedTime(record).mode, String(record["record_id"])).not.toBe("duration")
    }
  })

  it("records the preparing editor's self-review and no release decision", () => {
    const set = setById(tree(), "lks:set:qin-conquest-han-233-226-v1")
    const review = objectOf(set["review"])
    const notes = String(review["notes"])

    expect(review["independence"]).toBe("self_review")
    expect(objectOf(review["reviewer"])["name"]).toBe("Lekishi editorial preparation")
    expect(notes).toContain("not owner review")
    expect(notes).toContain("preparation snapshot")
    expect(notes).not.toContain("owner approved")
    expect(Object.values(objectOf(review["checklist"]))).toEqual([true, true, true, true, true])
  })

  it("loads into the atlas domain with one placed event and the rest listable", () => {
    const chapter = tree()
    const projected = projectChapter(CHAPTER, chapter.documents, chapter.sets, {
      defaultWindow: { start: -232, end: -225 },
    })

    if (!projected.ok) {
      throw new Error(projected.errors.join("\n"))
    }

    expect(projected.chapter.id).toBe(CHAPTER)
    expect(projected.chapter.events).toHaveLength(5)
    expect(projected.chapter.places).toHaveLength(4)
    expect(projected.chapter.defaultWindow).toEqual({ start: -232, end: -225 })
    expect(projected.chapter.publication.independence).toBe("self_review")
    expect(projected.chapter.publication.setIds).toEqual(["lks:set:qin-conquest-han-233-226-v1"])

    const placed = projected.chapter.events.filter((event) => event.placement.kind === "point")

    expect(placed.map((event) => event.id)).toEqual(["lks:event:xinzheng-revolt-226"])
    expect(placed[0]?.placement).toMatchObject({
      placeId: ANCHORED_PLACE,
      basis: "display-anchor",
    })

    for (const [eventId, reason] of UNPLACED_EVENTS) {
      expect(
        projected.chapter.events.find((event) => event.id === eventId)?.placement,
        eventId,
      ).toMatchObject({ kind: "none", reason })
    }

    for (const event of projected.chapter.events) {
      expect(event.coda, event.id).toBe(false)
    }
  })
})

describe("adversarial readings of the Qin fixture", () => {
  it("rejects an event for the excluded 246 BCE canal", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:xinzheng-revolt-226")
    const time = objectOf(contentOf(record)["time"])
    const interval = objectOf(time["interval"])

    objectOf(interval["start"])["year"] = 246
    objectOf(interval["end"])["year"] = 246

    expect(scopeViolations(chapter)).not.toEqual([])
  })

  it("rejects an event for the excluded 227 BCE assassination attempt", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:xinzheng-revolt-226")
    const time = objectOf(contentOf(record)["time"])
    const interval = objectOf(time["interval"])

    objectOf(interval["start"])["year"] = 227
    objectOf(interval["end"])["year"] = 227

    expect(scopeViolations(chapter)).not.toEqual([])
  })

  it("rejects a campaign route drawn for the annexation", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:han-conquest-230")
    const content = contentOf(record)

    content["geometry"] = [
      {
        claim_id: "lks:claim:han-conquest-time",
        interpretation: "attested_itinerary",
        geojson: {
          type: "LineString",
          coordinates: [
            [108.8, 34.6],
            [113.7, 34.4],
          ],
        },
        precision: "region",
        notes: "A route the fixture does not publish.",
      },
    ]

    expect(routeViolations(chapter)).not.toEqual([])
  })

  it("rejects placing the ceded 南陽 at the modern city of the same name", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:nanyang")
    const content = contentOf(record)

    content["geometry"] = [
      {
        claim_id: "lks:claim:nanyang-unknown",
        interpretation: "approximate_point",
        geojson: { type: "Point", coordinates: [112.5286, 32.9908] },
        precision: "locality",
        notes: "A modern identification the fixture does not assert.",
      },
    ]

    expect(coordinateViolations(chapter)).not.toEqual([])
  })

  it("rejects promoting the 新鄭 label anchor to an asserted placement", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, ANCHORED_PLACE)
    const entry = geometryEntries(record)[0] as JsonObject

    entry["interpretation"] = "approximate_point"
    entry["precision"] = "locality"

    expect(coordinateViolations(chapter)).not.toEqual([])
  })

  it("rejects anchoring a second place", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:yunyang")
    const content = contentOf(record)

    content["geometry"] = [
      {
        claim_id: "lks:claim:yunyang-unknown",
        interpretation: "display_anchor",
        geojson: { type: "Point", coordinates: [108.80985, 34.6355] },
        precision: "unspecified",
        notes: "A second anchor the fixture does not publish.",
      },
    ]

    expect(coordinateViolations(chapter)).not.toEqual([])
  })

  it("rejects a day added to the annexation the sources date by year", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:han-conquest-230")
    const time = objectOf(contentOf(record)["time"])
    const interval = objectOf(time["interval"])

    time["precision"] = "day"
    objectOf(interval["start"])["day"] = 1
    objectOf(interval["end"])["day"] = 1

    expect(dayPrecisionViolations(chapter)).not.toEqual([])
  })

  it("rejects dropping the dispute while keeping the conflicting accounts", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:hanfei-death-233")
    const revision = publishedRevision(record)

    revision["dispute"] = { status: "undisputed" }
    reseal(record)

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain(
        "undisputed_with_alternative_claim",
      )
    }
  })

  it("rejects a dispute added to a record whose accounts agree", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:han-conquest-230")
    const revision = publishedRevision(record)

    revision["dispute"] = { status: "disputed", summary: "A dispute the sources do not support." }
    reseal(record)

    expect(disputeViolations(chapter)).not.toEqual([])
  })

  it("detects an edit to an approved revision", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:han-conquest-230")
    objectOf(publishedRevision(record)["content"])["summary"] = "Edited after sealing"

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("revision_hash_mismatch")
    }
  })

  it("detects an edit to a pinned source even after resealing it", () => {
    const chapter = cloneTree(tree())
    const source = chapter.documents.find(
      (document) => document["source_id"] === "lks:source:shiji",
    )
    const edited = objectOf(source)

    edited["license"] = {
      ...objectOf(edited["license"]),
      attribution_text: "Edited after sealing",
    }
    edited["source_hash"] = sourceHash(edited)

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      const codes = result.errors.map((error) => error.code)

      expect(codes).toContain("pinned_source_hash_mismatch")
      expect(codes).not.toContain("source_hash_mismatch")
    }
  })

  it("blocks publication when a cited source has no recorded reuse terms", () => {
    const chapter = cloneTree(tree())
    const source = chapter.documents.find(
      (document) => document["source_id"] === "lks:source:wikidata",
    )
    const edited = objectOf(source)

    edited["license"] = { status: "unknown" }
    edited["source_hash"] = sourceHash(edited)

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("unrecorded_source_license")
    }
  })

  it("rejects an event that references an unpublished place", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:xinzheng-revolt-226")
    const reference = objectOf(listOf(contentOf(record)["places"])[0])

    reference["place_id"] = "lks:place:not-published"

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("unresolved_reference")
    }
  })
})

describe("the prepared corrections (unpublished draft revisions)", () => {
  /**
   * The internal review of this milestone found source-fidelity and wording
   * issues in the prepared snapshot. The publication gate does not let the
   * preparing editor supersede a set, so the corrections are prepared as draft
   * revisions that no set publishes: the atlas and the ledger still read the
   * snapshot the owner has seen, and publishing a corrected preparation set is
   * the owner's decision. These tests pin the drafts and the boundary.
   */
  /**
   * Each entry pins the reviewed draft's sealed hash as well as its id: the
   * hashes are the ones the internal review read, so editing a draft's content
   * (or resealing it) fails here until the change is reviewed again. The test
   * also recomputes the hash, so the stored and computed values must agree.
   */
  const CORRECTIONS: [string, string, string][] = [
    [
      "lks:event:hanfei-death-233",
      "lks:rev:hanfei-death-233-2",
      "sha256:f4cdc69cce688d5511cda605816b30e9ad866431ac481f340bdcfea550f9db92",
    ],
    [
      "lks:relationship:qin-han-conflict",
      "lks:rev:qin-han-conflict-2",
      "sha256:31a1d037071c281d5a84373e823b3f6dc88b0a34993b58c8059e8cbfaaca7c06",
    ],
    [
      "lks:event:han-conquest-230",
      "lks:rev:han-conquest-230-2",
      "sha256:d69efbcb496ae9ca05159ea3785b92886a84f0e6255995b31d674c6a060baa46",
    ],
    [
      "lks:event:han-nanyang-cession-231",
      "lks:rev:han-nanyang-cession-231-2",
      "sha256:859171b829f4f84bd075eb188e40b92f3112ae6c9c3d4265afe879108f0018fe",
    ],
    [
      "lks:place:nanyang",
      "lks:rev:nanyang-2",
      "sha256:d02039178cf39cc07913c08debd43cb20f34a9c07e6d4238fa2bd18e764b0e09",
    ],
    [
      "lks:relationship:han-nanyang-cession",
      "lks:rev:han-nanyang-cession-2",
      "sha256:0ba9693ba4099e46ca02cba48a3ced2887c930d031188f70904bf254fb290f2e",
    ],
    [
      "lks:actor:nei-shi-teng",
      "lks:rev:nei-shi-teng-2",
      "sha256:69c87dc8714a231085ecbcaf9f67c982eda9e2724ee6fcb0c4ccbf63ce0a3c9a",
    ],
    [
      "lks:actor:qin-king-zheng",
      "lks:rev:qin-king-zheng-2",
      "sha256:84c87515b6efee89644110c0eea4bf790a94c6af669db20c4ff15ffb00597464",
    ],
    [
      "lks:actor:han-king-an",
      "lks:rev:han-king-an-2",
      "sha256:ab3eef70d0f4ccc57b74ee1a860d514ac5336c190be7baad9fe71bff58c77f61",
    ],
    [
      "lks:story:qin-conquest-han-233-226",
      "lks:rev:qin-conquest-han-story-2",
      "sha256:df7c81d2bd371d214c57883a101d7cd95974ddb10cae774c3051c92dec481991",
    ],
    [
      "lks:actor:han-fei",
      "lks:rev:han-fei-2",
      "sha256:235d77b80da506a039066bb4b9840c633c895a387e1b5af361589cddf6fcfff2",
    ],
    [
      "lks:event:han-submission-233",
      "lks:rev:han-submission-233-2",
      "sha256:de78b5cfe7e2f891fae70ebdb6a10ded24becb21b3a94c4d175c384d8154717f",
    ],
  ]

  function draftRevision(recordId: string, revisionId: string): JsonObject {
    const record = recordById(tree(), recordId)
    const revision = listOf(record["revisions"]).find(
      (candidate) => objectOf(candidate)["revision_id"] === revisionId,
    )

    if (revision === undefined) {
      throw new Error(`${revisionId} is not a revision of ${recordId}`)
    }

    return objectOf(revision)
  }

  function draftContent(recordId: string, revisionId: string): JsonObject {
    return objectOf(draftRevision(recordId, revisionId)["content"])
  }

  function draftClaims(recordId: string, revisionId: string): JsonObject[] {
    return listOf(draftRevision(recordId, revisionId)["claims"]).map((claim) => objectOf(claim))
  }

  function publishedRevisionIds(chapter: ChapterTree): Set<string> {
    return new Set(
      chapter.sets.flatMap((set) =>
        listOf(objectOf(set)["members"]).map((member) => String(objectOf(member)["revision_id"])),
      ),
    )
  }

  it("drafts a corrected revision for every finding and publishes none of them", () => {
    const chapter = tree()
    const published = publishedRevisionIds(chapter)

    for (const [recordId, revisionId, expectedHash] of CORRECTIONS) {
      const revision = draftRevision(recordId, revisionId)

      expect(revision["revision_hash"], revisionId).toBe(expectedHash)
      expect(revision["revision_hash"], revisionId).toBe(revisionHash(revision))
      expect(published.has(revisionId), revisionId).toBe(false)

      // The record still mirrors the snapshot the ledger records.
      const mirror = objectOf(recordById(chapter, recordId)["publication"])

      expect(mirror["published_revision_id"], recordId).toBe(
        String(revisionId).replace(/-2$/, "-1"),
      )
    }
  })

  it("does not claim that the death accounts agree on the year", () => {
    const revision = draftRevision("lks:event:hanfei-death-233", "lks:rev:hanfei-death-233-2")
    const dispute = objectOf(revision["dispute"])
    const summary = String(dispute["summary"])
    const notes = String(objectOf(revision["content"])["editorial_notes"])

    for (const text of [summary, notes]) {
      expect(text).toContain("王安五年")
      expect(text).toContain("王安六年")
      expect(text).not.toContain("agree")
      expect(text).not.toContain("agreement")
    }

    // The hereditary house's fifth year and the six-states table's sixth year
    // are different expressions: the draft records both and never equates them.
    for (const text of [
      summary,
      notes,
      String(objectOf(revision["content"])["summary"]),
      String(objectOf(revision["change_explanation"])),
    ]) {
      expect(text).not.toMatch(/王安五年[^;.。]*aligns?[^;.。]*王安六年/)
      expect(text).not.toContain("aligns the same year")
    }

    const tableClaim = draftClaims("lks:event:hanfei-death-233", "lks:rev:hanfei-death-233-2").find(
      (claim) => claim["claim_id"] === "lks:claim:hanfei-death-table",
    )

    expect(tableClaim).toBeDefined()
    expect(
      listOf(objectOf(tableClaim)["citations"]).map((citation) =>
        String(objectOf(citation)["source_id"]),
      ),
    ).toEqual(["lks:source:shiji"])
  })

  it("attributes 雲陽 to the annals alone, not to the comprehensive mirror", () => {
    const revision = draftRevision("lks:event:hanfei-death-233", "lks:rev:hanfei-death-233-2")
    const content = objectOf(revision["content"])
    const summary = String(content["summary"])
    const notes = String(content["editorial_notes"])
    const dispute = String(objectOf(revision["dispute"])["summary"])

    // Only 史記 names the place of the death; the mirror's account does not.
    expect(summary).toContain("the annals name 雲陽")
    expect(notes).toContain("Only the annals name 雲陽")

    for (const text of [summary, notes, dispute]) {
      expect(text).not.toMatch(/mirror[^;.。]*雲陽/)
    }
  })

  it("keeps each source's own dating of the embassy instead of converting it", () => {
    const death = draftContent("lks:event:hanfei-death-233", "lks:rev:hanfei-death-233-2")
    const conflict = draftContent("lks:relationship:qin-han-conflict", "lks:rev:qin-han-conflict-2")
    const conflictClaim = draftClaims(
      "lks:relationship:qin-han-conflict",
      "lks:rev:qin-han-conflict-2",
    )[0]
    const hanFei = draftContent("lks:actor:han-fei", "lks:rev:han-fei-2")
    const hanFeiClaim = draftClaims("lks:actor:han-fei", "lks:rev:han-fei-2")[0]
    const submission = draftContent("lks:event:han-submission-233", "lks:rev:han-submission-233-2")

    // The attack is the hereditary house's own 王安五年 notice; the 233 BCE
    // dating of the year's events comes from the annals and the table.
    expect(String(conflict["summary"])).toContain(
      "the attack the hereditary house records under 王安五年",
    )
    expect(String(conflictClaim["statement"])).toContain("attacking Han under 王安五年")
    expect(String(conflictClaim["statement"])).not.toMatch(/attacking Han in 233 BCE/)

    // The embassy's 233 BCE dating belongs to the annals and the mirror; the
    // hereditary house's notice keeps its regnal expression.
    expect(String(hanFei["summary"])).toContain("under 王安五年")
    expect(String(hanFei["summary"])).not.toContain("records Han sending to Qin in 233 BCE")
    expect(String(hanFeiClaim["statement"])).toContain("始皇帝十四年 (233 BCE)")
    expect(String(hanFeiClaim["statement"])).toContain("under 王安五年")

    // The submission's notes state the table's own alignment rather than
    // equating the hereditary house's fifth year with the table's sixth.
    expect(String(submission["editorial_notes"])).toContain(
      "韓王安六年, aligned with 秦始皇帝十四年",
    )
    expect(String(submission["editorial_notes"])).not.toContain("aligns the same year")

    // The death's dating is stated per account, and the year's place is the
    // annals' alone.
    expect(String(death["summary"])).toContain(
      "the six-states table records the embassy and the killing under 韓王安六年",
    )
  })

  it("removes the continuous conflict span the sources do not state", () => {
    const content = draftContent("lks:relationship:qin-han-conflict", "lks:rev:qin-han-conflict-2")

    expect(content["validity"]).toBeUndefined()
    expect(String(content["editorial_notes"])).toContain("no validity interval")
  })

  it("prepares no corrected actor or relationship with a duration the sources do not state", () => {
    // Two dated notices are not a continuous span: the corrected drafts must not
    // turn them into `duration` validity, which the contract defines as activity
    // supported across the interval. The published snapshot still carries the
    // spans the review flagged; the drafts are what the owner is being asked to
    // publish in their place.
    const chapter = tree()

    // The actor durations the fixture does state are the two reigns, each
    // attested at both ends: 韓王安's span runs from the six-states table's 元年
    // (238 BCE) to its ninth year (230 BCE), and 秦王政's succession is dated by
    // the comprehensive mirror to 247 BCE with the cited entries naming him king
    // inside the recorded 233–230 BCE span. Every other actor role and
    // relationship validity in a corrected draft must be an occurrence window.
    const supportedDurations = new Set([
      "lks:actor:han-king-an/ruler",
      "lks:actor:qin-king-zheng/ruler",
    ])

    for (const [recordId, revisionId] of CORRECTIONS) {
      const record = recordById(chapter, recordId)

      if (record["kind"] === "relationship") {
        const validity = draftContent(recordId, revisionId)["validity"]

        // A relationship may carry a bounded occurrence window; what it must not
        // carry is a `duration` the sources do not support.
        if (validity !== undefined) {
          expect(objectOf(validity)["mode"], recordId).not.toBe("duration")
        }

        continue
      }

      if (record["kind"] !== "actor") {
        continue
      }

      for (const role of listOf(draftContent(recordId, revisionId)["roles"]).map((entry) =>
        objectOf(entry),
      )) {
        const validity = role["validity"]

        if (validity !== undefined && objectOf(validity)["mode"] === "duration") {
          expect(supportedDurations, `${recordId}/${String(role["role"])}`).toContain(
            `${recordId}/${String(role["role"])}`,
          )
        }
      }
    }

    const officer = draftContent("lks:actor:nei-shi-teng", "lks:rev:nei-shi-teng-2")
    const official = listOf(officer["roles"])
      .map((entry) => objectOf(entry))
      .find((role) => role["role"] === "official")

    expect(official).toBeDefined()
    expect(objectOf(official)["validity"]).toBeUndefined()

    const note = String(objectOf(official)["note"])

    expect(note).toContain("231 BCE")
    expect(note).toContain("230 BCE")
    expect(note).toContain("no continuous tenure")
  })

  it("quotes only unannotated fragments in the corrected citations", () => {
    for (const [recordId, revisionId] of CORRECTIONS) {
      for (const claim of draftClaims(recordId, revisionId)) {
        for (const citation of listOf(claim["citations"]).map((entry) => objectOf(entry))) {
          const quoted = citation["quoted_text"]

          if (typeof quoted !== "string") {
            continue
          }

          for (const marked of ["〔", "〕", "(", ")"]) {
            expect(quoted, `${revisionId} ${String(citation["source_id"])}`).not.toContain(marked)
          }
        }
      }
    }

    const cession = draftClaims(
      "lks:event:han-nanyang-cession-231",
      "lks:rev:han-nanyang-cession-231-2",
    )
    const mirror = cession.find((claim) => claim["claim_id"] === "lks:claim:nanyang-cession-mirror")
    const quotes = listOf(objectOf(mirror)["citations"]).map((citation) =>
      String(objectOf(citation)["quoted_text"]),
    )

    expect(quotes).toEqual(["韓獻南陽地。", "九月，發卒受地於韓。"])

    const succession = draftClaims("lks:actor:qin-king-zheng", "lks:rev:qin-king-zheng-2")
    const role = succession.find((claim) => claim["claim_id"] === "lks:claim:qin-king-zheng-role")
    const successionQuotes = listOf(objectOf(role)["citations"]).map((citation) =>
      String(objectOf(citation)["quoted_text"] ?? ""),
    )

    expect(successionQuotes[0]).toBe("五月，丙午，王薨。太子政立")
  })

  it("attributes the officer's name to the annals, not to the corrected mirror reading", () => {
    const claims = draftClaims("lks:actor:nei-shi-teng", "lks:rev:nei-shi-teng-2")
    const name = claims.find((claim) => claim["claim_id"] === "lks:claim:nei-shi-teng-name")

    expect(
      listOf(objectOf(name)["citations"]).map((citation) =>
        String(objectOf(citation)["source_id"]),
      ),
    ).toEqual(["lks:source:shiji"])
    expect(
      String(draftContent("lks:actor:nei-shi-teng", "lks:rev:nei-shi-teng-2")["editorial_notes"]),
    ).toContain("內史〔騰〕(勝)")

    const conquest = draftClaims("lks:event:han-conquest-230", "lks:rev:han-conquest-230-2")
    const mirror = conquest.find((claim) => claim["claim_id"] === "lks:claim:han-conquest-mirror")

    expect(String(objectOf(mirror)["statement"])).not.toContain("內史騰")
  })

  it("attributes the cession to the annals and the comprehensive mirror", () => {
    const summary = String(draftContent("lks:place:nanyang", "lks:rev:nanyang-2")["summary"])

    expect(summary).toContain("annals")
    expect(summary).toContain("comprehensive mirror")
    expect(summary).not.toContain("hereditary house")
  })

  it("names the 230 BCE notice as the annals give it, without inferring a cause", () => {
    const note = String(
      draftContent("lks:story:qin-conquest-han-233-226", "lks:rev:qin-conquest-han-story-2")[
        "coverage_note"
      ],
    )

    expect(note).toContain("famine")
    expect(note).not.toContain("drought")
  })

  it("describes 韓王安's first numbered regnal year rather than an accession year", () => {
    const content = draftContent("lks:actor:han-king-an", "lks:rev:han-king-an-2")
    const note = String(objectOf(listOf(content["roles"])[0])["note"])

    expect(note).toContain("first numbered regnal year")
    expect(note).toContain("元年")
    expect(note).not.toContain("from the accession")
  })

  it("keeps the published snapshot's flagged wording visible until the owner decides", () => {
    const chapter = tree()

    // These are the published statements the review flagged; the drafts correct
    // them. The test fails if the published snapshot changes without the ledger
    // row being taken again, and it documents what the owner is being asked to
    // replace.
    const conflict = publishedRevision(recordById(chapter, "lks:relationship:qin-han-conflict"))
    const conflictContent = objectOf(conflict["content"])

    expect(objectOf(conflictContent["validity"])["mode"]).toBe("duration")

    // The published officer record carries the same unsupported continuity: a
    // 231–230 BCE office `duration` between two dated notices; the draft drops it.
    const officer = publishedRevision(recordById(chapter, "lks:actor:nei-shi-teng"))
    const official = listOf(objectOf(officer["content"])["roles"])
      .map((entry) => objectOf(entry))
      .find((role) => role["role"] === "official")

    expect(objectOf(objectOf(official)["validity"])["mode"]).toBe("duration")

    // The published conflict summary and claim attribute the 233 BCE attack to
    // the hereditary house, which dates it 王安五年; the draft corrects both.
    expect(String(conflictContent["summary"])).toContain(
      "from the 233 BCE attack the hereditary house records",
    )
    expect(
      String(listOf(conflict["claims"]).map((claim) => objectOf(claim))[0]["statement"]),
    ).toContain("attacking Han in 233 BCE")

    // The published han-fei summary dates the embassy to 233 BCE under the
    // hereditary house's account; the draft moves that dating to the annals
    // and the mirror.
    const hanFei = publishedRevision(recordById(chapter, "lks:actor:han-fei"))

    expect(String(objectOf(hanFei["content"])["summary"])).toContain(
      "the hereditary house records Han sending to Qin in 233 BCE",
    )

    // The published submission notes call the table's sixth year "the same
    // year" as the hereditary house's fifth; the draft states the table's own
    // alignment instead.
    const submission = publishedRevision(recordById(chapter, "lks:event:han-submission-233"))

    expect(String(objectOf(submission["content"])["editorial_notes"])).toContain(
      "aligns the same year with 韓王安六年",
    )

    const death = publishedRevision(recordById(chapter, "lks:event:hanfei-death-233"))
    const deathSummary = String(objectOf(death["dispute"])["summary"])

    expect(deathSummary).toContain("agree")

    const cession = publishedRevision(recordById(chapter, "lks:event:han-nanyang-cession-231"))
    const quoted = listOf(cession["claims"])
      .map((claim) => objectOf(claim))
      .flatMap((claim) => listOf(claim["citations"]).map((citation) => objectOf(citation)))
      .map((citation) => String(citation["quoted_text"] ?? ""))
      .join(" ")

    // The published quote merges the transcription's bracketed editorial
    // addition 秋 into the source's text as if it were the source's own
    // wording; the draft quotes only the unannotated fragments.
    expect(quoted).toContain("韓獻南陽地。秋，九月，發卒受地於韓。")
    expect(quoted).not.toContain("〔秋〕")

    const story = publishedRevision(recordById(chapter, "lks:story:qin-conquest-han-233-226"))

    expect(String(objectOf(story["content"])["coverage_note"])).toContain("drought")
  })
})

describe("the Qin fixture's own review surface", () => {
  it("uses only roles and interpretations the atlas boundary understands", () => {
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

    expect([...roles].sort()).toEqual(["other", "site"])
  })

  it("publishes a cited claim on every evidence record", () => {
    const chapter = tree()

    for (const kind of EVIDENCE_KINDS) {
      for (const record of recordsOfKind(chapter, kind)) {
        expect(claimsOf(record).length, String(record["record_id"])).toBeGreaterThan(0)
        expect(citationsOf(record).length, String(record["record_id"])).toBeGreaterThan(0)
      }
    }
  })

  it("keeps every record's revision sealed and its mirror on the one set", () => {
    const chapter = tree()
    const set = setById(chapter, "lks:set:qin-conquest-han-233-226-v1")

    for (const record of chapter.documents.filter(
      (document) => document["document"] === "record",
    )) {
      const mirror = objectOf(record["publication"])
      const revision = publishedRevision(record)

      expect(revision["revision_hash"]).toBe(revisionHash(revision))
      expect(mirror["published_revision_hash"]).toBe(revision["revision_hash"])
      expect(mirror["set_id"]).toBe(set["set_id"])
    }
  })

  it("loads from the same directory the chapter loader names", () => {
    expect(chapterDirectory(CHAPTER).endsWith(`chapters/${CHAPTER}`)).toBe(true)
  })

  it("is not the production chapter", () => {
    const story = recordById(tree(), "lks:story:qin-conquest-han-233-226")

    expect(String(contentOf(story)["summary"])).toContain("233–226 BCE")
    expect(String(contentOf(story)["coverage_note"])).toContain("Excluded")
  })

  it("keeps the citation locators inside the cited source documents", () => {
    const chapter = tree()
    const sourceIds = chapter.documents
      .filter((document) => document["document"] === "source")
      .map((document) => String(document["source_id"]))
      .sort()

    for (const record of chapter.documents.filter(
      (document) => document["document"] === "record",
    )) {
      for (const sourceId of citedSourceIds(record)) {
        expect(sourceIds, String(record["record_id"])).toContain(sourceId)
      }
    }
  })

  it("records a locator for every citation", () => {
    const chapter = tree()

    for (const record of chapter.documents.filter(
      (document) => document["document"] === "record",
    )) {
      for (const citation of citationsOf(record)) {
        const locator = objectOf(citation["locator"])

        expect(String(locator["value"]).length, String(record["record_id"])).toBeGreaterThan(0)
      }
    }
  })

  it("exposes no research notes or presentation fields", () => {
    const chapter = tree()

    for (const document of chapter.documents.filter(
      (candidate) => candidate["document"] === "record",
    )) {
      for (const revision of listOf(document["revisions"])) {
        expect(objectOf(revision)["research_notes"]).toBeUndefined()
      }
    }

    const serialized = JSON.stringify(chapter)

    for (const forbidden of ['"radius"', '"confidence"', '"probability"', '"color"']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it("carries no production chapter's ids", () => {
    const serialized = JSON.stringify(tree())

    for (const marker of [
      "tang-mission-750-754",
      "lks:set:tang-mission",
      "lks:event:appointment-750",
      "lks:actor:abe-no-nakamaro",
    ]) {
      expect(serialized).not.toContain(marker)
    }
  })

  it("serializes to plain JSON without prototype surprises", () => {
    const chapter = tree()
    const roundTripped = JSON.parse(JSON.stringify(chapter)) as JsonValue

    expect(roundTripped).toEqual(chapter)
  })
})
