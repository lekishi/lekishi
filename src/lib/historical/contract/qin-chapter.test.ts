import { describe, expect, it } from "vitest"
import { chapterBundle, listChapters, loadChapter, type ChapterTree } from "../chapter"
import { projectChapter } from "../../atlas/projection"
import { revisionHash, sourceHash } from "./canonical"
import * as Publication from "./publication"
import * as Time from "./time"
import { isObject, listOf, objectOf, type JsonObject, type JsonValue } from "./types"

/**
 * Independent checks for the bounded Qin comparison fixture.
 *
 * The fixture is comparison-only preparation content: it exists for the shared
 * treatment harness. It is authored as record files and compiled (RFD 2), and it
 * is served only while the owner's approval in its manifest matches the content
 * it compiles to. Two layers are
 * tested. The first is the contract's own semantics over the chapter tree, plus
 * the seal and publication rules that protect it. The second is this fixture's
 * own coverage model: the 233–226 BCE window, the excluded notices and campaigns,
 * the year-only dates with no invented day, the disputed death with the three
 * accounts kept apart, and the rule that every map position is a label anchor
 * resting on a cited identification, while the one place without one asserts no
 * coordinate.
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

/** The historical geography the fixture cites for the identifications its anchors stand on. */
const IDENTIFICATION_SOURCE = "lks:source:dushi-fangyu-jiyao"

/**
 * The label anchors the fixture publishes: the place record, the modern
 * coordinate Wikidata records for it, the item the anchor cites, and the source
 * that identifies the place the anchor stands for. A label anchor asserts no
 * historical coordinate, so every entry is a `display_anchor` with `unspecified`
 * precision — and because a modern namesake is not evidence, every anchor's area
 * association has to be cited as well as its coordinate.
 */
const ANCHORS: [string, [number, number], string, string][] = [
  ["lks:place:xinzheng", [113.7249, 34.39621], "Q1024662", IDENTIFICATION_SOURCE],
  ["lks:place:yunyang", [108.80985, 34.6355], "Q10881340", IDENTIFICATION_SOURCE],
  ["lks:place:yingchuan", [113.47334, 34.15113], "Q1344848", IDENTIFICATION_SOURCE],
]

/**
 * The events the fixture leaves off the map, and why: the cited entries name
 * their place but state no extent or seat, and the name covers two regions the
 * historical geography records, so the atlas claims no position.
 */
const UNPLACED_EVENTS: [string, string][] = [["lks:event:han-nanyang-cession-231", "no-position"]]

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

/**
 * A record's one current revision. Record files compile each record to a single
 * revision generated from its file, so the reviewed history of a correction is
 * its Git history rather than earlier revisions kept in the record.
 */
function currentRevision(recordId: string): JsonObject {
  return publishedRevision(recordById(tree(), recordId))
}

function currentContent(recordId: string): JsonObject {
  return objectOf(currentRevision(recordId)["content"])
}

function currentClaims(recordId: string): JsonObject[] {
  return listOf(currentRevision(recordId)["claims"]).map((claim) => objectOf(claim))
}

/**
 * The records the label positions changed after the corrections: the
 * submission's display placement, and the label positions added after the
 * owner's report that locations were missing where the records name them.
 */
const ADDITIONS = [
  "lks:event:han-submission-233",
  "lks:place:xinzheng",
  "lks:place:yunyang",
  "lks:place:yingchuan",
  "lks:place:nanyang",
  "lks:event:han-nanyang-cession-231",
  "lks:event:han-conquest-230",
  "lks:story:qin-conquest-han-233-226",
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

/** The chapter's one publication set: approved, or a draft preview. */
function theSet(chapter: ChapterTree): JsonObject {
  expect(chapter.sets).toHaveLength(1)

  return objectOf(chapter.sets[0])
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

/**
 * The event's civil years, from the normalized endpoints. Both endpoints must be
 * bounded BCE values: an open or CE endpoint would put the event outside a
 * window the fixture claims to check, so it is a violation rather than a value
 * this function quietly drops.
 */
function yearsOf(recordId: string, time: Time.NormalizedTime, violations: Set<string>): number[] {
  const years: number[] = []

  for (const endpoint of [time.start, time.end]) {
    if (endpoint === null) {
      violations.add(`${recordId} has an open endpoint the fixture's BCE window cannot check`)
      continue
    }

    if (endpoint.astro > 0) {
      violations.add(`${recordId} has a CE endpoint, outside the fixture's BCE window`)
      continue
    }

    years.push(1 - endpoint.astro)
  }

  return years
}

/**
 * The fixture's scope: every event's whole inclusive span lies inside 233–226
 * BCE, and no span covers an excluded year whose Qin–Han notice the coverage
 * note names.
 */
function scopeViolations(chapter: ChapterTree): string[] {
  const violations = new Set<string>()

  for (const record of recordsOfKind(chapter, "event")) {
    const recordId = String(record["record_id"])
    const years = yearsOf(recordId, normalizedTime(record), violations)

    if (years.length === 0) {
      violations.add(`${recordId} carries no dated endpoints`)
      continue
    }

    // Civil BCE years run downwards: 233 is the earliest year in the window
    // and 226 the latest.
    const earliest = Math.max(...years)
    const latest = Math.min(...years)

    if (earliest > WINDOW.startYear || latest < WINDOW.endYear) {
      violations.add(
        `${recordId} spans ${earliest}–${latest} BCE, outside the ${WINDOW.startYear}–${WINDOW.endYear} BCE window`,
      )
    }

    for (const year of EXCLUDED_YEARS) {
      if (year <= earliest && year >= latest) {
        violations.add(`${recordId} spans the excluded year ${year}`)
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
 * The fixture asserts label anchors and no historical coordinate: every geometry
 * entry is `unknown` without coordinates, or a `display_anchor` at one of the
 * recorded modern coordinates that cites the dataset it comes from. No entry
 * claims locational precision or an approximate point.
 */
function coordinateViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of chapter.documents.filter((document) => document["document"] === "record")) {
    const recordId = String(record["record_id"])

    for (const [index, entry] of geometryEntries(record).entries()) {
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

      const anchor = ANCHORS.find(([placeId]) => placeId === recordId)
      const identificationSource = anchor === undefined ? "" : anchor[3]

      if (anchor === undefined) {
        violations.push(
          `${recordId} carries a display anchor, but the fixture anchors only ${ANCHORS.map(([placeId]) => placeId).join(", ")}`,
        )
        continue
      }

      const coordinates = isObject(geojson) ? listOf(objectOf(geojson)["coordinates"]) : []

      if (JSON.stringify(coordinates) !== JSON.stringify(anchor[1])) {
        violations.push(
          `${recordId} anchors at ${JSON.stringify(coordinates)} instead of the recorded modern coordinate`,
        )
      }

      // An anchor has to say where its coordinate comes from and what place it
      // stands for: the main claim asserting it cites the dataset the coordinate
      // comes from, and the record cites, with a locator, the source that
      // identifies the place. A modern namesake is not evidence, so an anchor
      // with no identification citation is a violation and not a detail.
      const anchorClaim = claimsOf(record).find(
        (claim) => claim["asserts"] === `/geometry/${index}` && claim["role"] === "main",
      )
      const citesCoordinateSource =
        anchorClaim !== undefined &&
        listOf(anchorClaim["citations"]).some(
          (citation) => String(objectOf(citation)["source_id"]) === "lks:source:wikidata",
        )

      if (!citesCoordinateSource) {
        violations.push(`${recordId} anchors without citing the coordinate source`)
      }

      const citesIdentification = claimsOf(record).some((claim) => {
        if (String(claim["asserts"]) !== `/geometry/${index}`) {
          return false
        }

        return listOf(claim["citations"]).some((citation) => {
          const entry = objectOf(citation)
          const locator = objectOf(entry["locator"])["value"]

          return (
            String(entry["source_id"]) === identificationSource &&
            typeof locator === "string" &&
            locator.trim() !== ""
          )
        })
      })

      if (!citesIdentification) {
        violations.push(
          `${recordId} anchors without citing the source that identifies the place the anchor stands for`,
        )
      }
    }
  }

  return violations
}

/**
 * Every dated value in a record's published content, wherever the shape carries
 * one: an event's `time`, an actor's role `validity`, and any future field with
 * the same time shape. Walking the content means a new dated field cannot escape
 * the day and duration rules by living somewhere the tests did not look.
 */
function timeValues(content: JsonObject): JsonObject[] {
  const values: JsonObject[] = []

  const visit = (value: JsonValue | undefined): void => {
    if (isObject(value)) {
      if (isObject(value["interval"]) && typeof value["mode"] === "string") {
        values.push(value)
      }

      for (const entry of Object.values(value)) {
        visit(entry)
      }

      return
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry)
      }
    }
  }

  visit(content)

  return values
}

/** No dated value publishes day precision: none of the cited entries states a day. */
function dayPrecisionViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of chapter.documents.filter((document) => document["document"] === "record")) {
    const recordId = String(record["record_id"])

    for (const time of timeValues(contentOf(record))) {
      if (time["precision"] === "day") {
        violations.push(`${recordId} publishes day precision`)
      }

      const interval = objectOf(time["interval"])

      for (const endpoint of ["start", "end"]) {
        const value = interval[endpoint]

        if (isObject(value) && value["day"] !== null && value["day"] !== undefined) {
          violations.push(`${recordId} carries a day in its ${endpoint} endpoint`)
        }
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
  const set = theSet(chapter)
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

/** The locator values of a claim's citations, in order. */
function locatorValues(claim: JsonObject | undefined): string[] {
  return listOf(objectOf(claim)["citations"]).map((citation) =>
    String(objectOf(objectOf(citation)["locator"])["value"]),
  )
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
    const idsOfKind = (kind: string) =>
      recordsOfKind(chapter, kind)
        .map((record) => String(record["record_id"]))
        .sort()

    // Counts and identities together: a record that is added or swapped has to
    // be reviewed here, not only counted.
    expect(chapter.documents).toHaveLength(24)
    expect(idsOfKind("place")).toEqual([
      "lks:place:nanyang",
      "lks:place:xinzheng",
      "lks:place:yingchuan",
      "lks:place:yunyang",
    ])
    expect(idsOfKind("actor")).toEqual([
      "lks:actor:han-fei",
      "lks:actor:han-king-an",
      "lks:actor:han-state",
      "lks:actor:nei-shi-teng",
      "lks:actor:qin-king-zheng",
      "lks:actor:qin-state",
    ])
    expect(idsOfKind("event")).toEqual([...EXPECTED_EVENTS].sort())
    expect(idsOfKind("relationship")).toEqual([
      "lks:relationship:han-annexation-yingchuan",
      "lks:relationship:han-nanyang-cession",
      "lks:relationship:han-qin-submission",
      "lks:relationship:qin-han-conflict",
    ])
    expect(idsOfKind("story")).toEqual(["lks:story:qin-conquest-han-233-226"])
    expect(
      chapter.documents
        .filter((document) => document["document"] === "source")
        .map((document) => String(document["source_id"]))
        .sort(),
    ).toEqual([
      "lks:source:dushi-fangyu-jiyao",
      "lks:source:shiji",
      "lks:source:wikidata",
      "lks:source:zizhi-tongjian",
    ])
    // One set, named for the content it publishes: approved sets carry the
    // digest, draft previews say they are drafts.
    expect(chapter.sets.map((set) => String(objectOf(set)["set_id"]))).toEqual([
      expect.stringMatching(/^lks:set:qin-conquest-han-233-226-(draft-)?[0-9a-f]{12}$/),
    ])
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

  it("asserts label anchors and no asserted historical coordinate", () => {
    expect(coordinateViolations(tree())).toEqual([])
    expect(routeViolations(tree())).toEqual([])

    const chapter = tree()
    const anchored = recordsOfKind(chapter, "place")
      .filter((record) =>
        geometryEntries(record).some((entry) => entry["interpretation"] === "display_anchor"),
      )
      .map((record) => String(record["record_id"]))
      .sort()

    expect(anchored).toEqual(ANCHORS.map(([placeId]) => placeId).sort())
  })

  it("publishes no day and no duration the sources do not state", () => {
    const chapter = tree()

    expect(dayPrecisionViolations(chapter)).toEqual([])

    const durations = new Map<string, number>()

    for (const record of chapter.documents.filter(
      (document) => document["document"] === "record",
    )) {
      const recordId = String(record["record_id"])
      const count = timeValues(contentOf(record)).filter(
        (time) => time["mode"] === "duration",
      ).length

      if (count > 0) {
        durations.set(recordId, count)
      }
    }

    // The two reigns are the only spans the sources attest at both ends, one
    // each; every other dated value is an instant or an uncertain occurrence
    // window. The counts are compared too, so a second duration inside one of
    // the two records cannot pass as the same allowance.
    expect([...durations.entries()].sort(([left], [right]) => left.localeCompare(right))).toEqual([
      ["lks:actor:han-king-an", 1],
      ["lks:actor:qin-king-zheng", 1],
    ])

    for (const record of recordsOfKind(chapter, "event")) {
      expect(normalizedTime(record).mode, String(record["record_id"])).not.toBe("duration")
    }
  })

  it("records the contributors' self-review, never independent or specialist review", () => {
    const bundle = chapterBundle(CHAPTER)
    const set = theSet(tree())
    const review = objectOf(set["review"])
    const notes = String(review["notes"])
    const publishedBy = objectOf(set["published_by"])

    expect(review["independence"]).toBe("self_review")
    expect(objectOf(review["reviewer"])["name"]).toBe("Lekishi contributors")
    expect(notes).toContain("Self-review by the contributors")
    expect(Object.values(objectOf(review["checklist"]))).toEqual([true, true, true, true, true])

    // An approved chapter names the owner who approved it, as an owner decision
    // rather than a review; an unapproved one says it is a preview.
    if (bundle.state === "approved") {
      expect(publishedBy).toEqual({ name: bundle.approval?.by, role: "owner" })
      expect(notes).toContain("an owner decision, not independent or specialist review")
    } else {
      expect(publishedBy["role"]).toBe("draft preview, not approved")
      expect(notes).toContain("has not approved")
    }
  })

  it("loads into the atlas domain with the sourced label positions on the map", () => {
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
    expect(projected.chapter.publication.setIds).toEqual([String(theSet(chapter)["set_id"])])

    const placed = projected.chapter.events.filter((event) => event.placement.kind === "point")

    expect(placed.map((event) => event.id).sort()).toEqual([
      "lks:event:han-conquest-230",
      "lks:event:han-submission-233",
      "lks:event:hanfei-death-233",
      "lks:event:xinzheng-revolt-226",
    ])

    // Every placement is a label position: the domain keeps them out of the
    // asserted-placement vocabulary, so none reads as a site claim. The cession
    // stays off the map because its place has no sourced identification.
    const expectedPlace = new Map([
      ["lks:event:han-submission-233", "lks:place:xinzheng"],
      ["lks:event:hanfei-death-233", "lks:place:yunyang"],
      ["lks:event:han-conquest-230", "lks:place:yingchuan"],
      ["lks:event:xinzheng-revolt-226", "lks:place:xinzheng"],
    ])

    for (const event of placed) {
      expect(event.placement, event.id).toMatchObject({
        placeId: expectedPlace.get(event.id),
        basis: "display-anchor",
      })

      // The projected point is the recorded label-anchor coordinate, not just
      // the right place id: a wrong position must not pass.
      const anchor = ANCHORS.find(([placeId]) => placeId === event.placement.placeId)

      expect(anchor, event.id).toBeDefined()
      expect(event.placement.kind === "point" ? event.placement.position : null, event.id).toEqual({
        lon: anchor?.[1][0],
        lat: anchor?.[1][1],
      })
    }

    for (const [eventId, reason] of UNPLACED_EVENTS) {
      expect(
        projected.chapter.events.find((event) => event.id === eventId)?.placement,
        eventId,
      ).toMatchObject({ kind: "none", reason })
    }

    expect(
      projected.chapter.places.filter((place) => place.placement === "display-anchor"),
    ).toHaveLength(ANCHORS.length)
    expect(
      projected.chapter.places.filter((place) => place.placement === "approximate"),
    ).toHaveLength(0)

    for (const event of projected.chapter.events) {
      expect(event.coda, event.id).toBe(false)
    }
  })

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

  it("rejects an event whose dated endpoint is left open", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:han-conquest-230")
    const interval = objectOf(objectOf(contentOf(record)["time"])["interval"])

    // An open endpoint would put the event outside a window the fixture claims
    // to check, so the scope predicate rejects it rather than skipping it.
    interval["end"] = null
    interval["bounds"] = "lower_only"

    expect(scopeViolations(chapter)).not.toEqual([])
  })

  it("rejects an event whose span covers an excluded year", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:xinzheng-revolt-226")
    const interval = objectOf(objectOf(contentOf(record)["time"])["interval"])

    // Both endpoints stay inside 233–226 BCE, but the span now claims the
    // excluded 227 BCE year, which the fixture must not do.
    objectOf(interval["start"])["year"] = 229
    objectOf(interval["end"])["year"] = 226

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
    const record = recordById(chapter, "lks:place:xinzheng")
    const entry = geometryEntries(record)[0] as JsonObject

    // Only the interpretation changes, so the rejection cannot be satisfied by
    // the precision rule instead of the promotion rule.
    entry["interpretation"] = "approximate_point"

    const violations = coordinateViolations(chapter)

    expect(violations).not.toEqual([])
    expect(violations.join("\n")).toContain("asserts approximate_point geometry")
  })

  it("rejects a display anchor for 南陽, which the fixture leaves unlocated", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:nanyang")
    const content = contentOf(record)

    content["geometry"] = [
      {
        claim_id: "lks:claim:nanyang-unknown",
        interpretation: "display_anchor",
        geojson: { type: "Point", coordinates: [112.5286, 32.9908] },
        precision: "unspecified",
        notes: "A modern namesake the fixture does not anchor.",
      },
    ]

    const violations = coordinateViolations(chapter)

    expect(violations).not.toEqual([])
    expect(violations.join("\n")).toContain("the fixture anchors only")
  })

  it("rejects an anchor whose coordinate is not the recorded one", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:yunyang")
    const entry = geometryEntries(record)[0] as JsonObject

    objectOf(entry["geojson"])["coordinates"] = [110.0, 35.0]

    expect(coordinateViolations(chapter)).not.toEqual([])
  })

  it("rejects an anchor that does not cite the coordinate source", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:yingchuan")
    const claim = claimsOf(record).find(
      (candidate) => candidate["claim_id"] === "lks:claim:yingchuan-anchor",
    )

    // The anchor is asserted, but by the annals rather than by the dataset the
    // coordinate comes from.
    claim!["citations"] = [
      {
        source_id: "lks:source:shiji",
        locator: { kind: "entry", value: "卷六 秦始皇本紀 十七年（命曰潁川）" },
      },
    ]

    expect(coordinateViolations(chapter)).not.toEqual([])
  })

  it("rejects an anchor with no identification for the place it stands for", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:yunyang")
    const claim = claimsOf(record).find(
      (candidate) => candidate["claim_id"] === "lks:claim:yunyang-identification",
    )

    // A coordinate for a modern namesake is not evidence: the claim stays, but
    // with no identification citation the anchor stands on nothing.
    objectOf(claim)["citations"] = [
      {
        source_id: "lks:source:wikidata",
        locator: { kind: "dataset_row", value: "Q10881340 (P625)" },
      },
    ]

    const violations = coordinateViolations(chapter)

    expect(violations).not.toEqual([])
    expect(violations.join("\n")).toContain("without citing the source that identifies")
  })

  it("rejects an anchor whose identification citation has no locator", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:yingchuan")
    const claim = claimsOf(record).find(
      (candidate) => candidate["claim_id"] === "lks:claim:yingchuan-seat",
    )

    objectOf(claim)["citations"] = [
      {
        source_id: "lks:source:dushi-fangyu-jiyao",
        locator: { kind: "entry", value: "" },
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

  it("detects an edit to a sealed published revision", () => {
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

  it("rejects an event that references a place the fixture does not publish", () => {
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

describe("the label positions the owner asked for", () => {
  /**
   * The owner reported that locations were missing where the records name them.
   * The fixture now places what its sources support and says so where it cannot:
   * the death at 雲陽 and the annexation at the 潁川 commandery carry label
   * anchors whose area association is cited, the submission is shown at the Han
   * capital the hereditary house records, and 南陽 keeps unknown geometry because
   * the entries state no extent or seat and the name covers two regions the cited
   * historical geography records. A position cannot drift without review: the
   * chapter's approval covers the digest of its record files, so any edit makes
   * the approval stale until the owner approves again.
   */

  it("publishes every reviewed addition as the record's one current revision", () => {
    const chapter = tree()

    for (const recordId of ADDITIONS) {
      const record = recordById(chapter, recordId)
      const revision = publishedRevision(record)

      expect(listOf(record["revisions"]), recordId).toHaveLength(1)
      expect(revision["revision_hash"], recordId).toBe(revisionHash(revision))
    }
  })

  it("rests every anchor on a cited identification and the recorded coordinate", () => {
    const chapter = tree()

    for (const [placeId, coordinates, item, identificationSource] of ANCHORS) {
      const record = recordById(chapter, placeId)
      const entry = geometryEntries(record)[0]
      const anchorClaim = claimsOf(record).find(
        (claim) => claim["claim_id"] === String(entry["claim_id"]),
      )

      expect(entry["interpretation"], placeId).toBe("display_anchor")
      expect(entry["precision"], placeId).toBe("unspecified")
      expect(String(entry["notes"]), placeId).not.toBe("")
      expect(objectOf(entry["geojson"])["coordinates"], placeId).toEqual(coordinates)

      // The coordinate comes from the dataset, and the item is the locator.
      const anchorCitations = listOf(objectOf(anchorClaim)["citations"]).map(objectOf)

      expect(
        anchorCitations.map((citation) => String(citation["source_id"])),
        placeId,
      ).toContain("lks:source:wikidata")
      expect(
        anchorCitations
          .filter((citation) => String(citation["source_id"]) === "lks:source:wikidata")
          .map((citation) => String(objectOf(citation["locator"])["value"])),
        placeId,
      ).toEqual([expect.stringMatching(new RegExp(`^${item} \\(P625\\), revision [0-9]+$`))])

      // And the place the anchor stands for is identified by a cited source, not
      // by the modern name alone.
      const identification = claimsOf(record).find((claim) =>
        listOf(claim["citations"]).some(
          (citation) => String(objectOf(citation)["source_id"]) === identificationSource,
        ),
      )

      expect(identification, placeId).toBeDefined()

      for (const citation of listOf(objectOf(identification)["citations"]).map(objectOf)) {
        if (String(citation["source_id"]) === identificationSource) {
          expect(String(objectOf(citation["locator"])["value"]), placeId).not.toBe("")
        }
      }
    }
  })

  it("records the identifications the two new anchors stand on, with their locators", () => {
    const chapter = tree()
    const yunyang = claimsOf(recordById(chapter, "lks:place:yunyang")).find(
      (claim) => claim["claim_id"] === "lks:claim:yunyang-identification",
    )
    const yingchuan = claimsOf(recordById(chapter, "lks:place:yingchuan")).find(
      (claim) => claim["claim_id"] === "lks:claim:yingchuan-seat",
    )

    expect(String(objectOf(yunyang)["statement"])).toContain("雲陽城")
    expect(locatorValues(yunyang)).toEqual(["卷五十三 陝西二 西安府 涇陽縣（雲陽城）"])
    expect(String(objectOf(yingchuan)["statement"])).toContain("陽翟")
    expect(locatorValues(yingchuan)).toEqual([
      "卷四十七 河南二 開封府 禹州",
      "卷四十七 河南二 開封府 禹州（陽翟城）",
    ])

    // The quoted fragments are the transcription's own text.
    expect(
      listOf(objectOf(yunyang)["citations"]).map((citation) =>
        String(objectOf(citation)["quoted_text"]),
      ),
    ).toEqual(["秦縣。始皇二十五年使蒙恬通直道，自九原至雲陽。"])
    expect(
      listOf(objectOf(yingchuan)["citations"]).map((citation) =>
        String(objectOf(citation)["quoted_text"]),
      ),
    ).toEqual(["秦始皇十七年滅韓，置潁川郡", "秦置陽翟縣，爲潁川郡治。"])
  })

  it("shows the submission at the Han capital, with the disclosure in the summary", () => {
    const chapter = tree()
    const submission = recordById(chapter, "lks:event:han-submission-233")
    const reference = objectOf(listOf(contentOf(submission)["places"])[0])
    const summary = String(contentOf(submission)["summary"])

    expect(reference["place_id"]).toBe("lks:place:xinzheng")
    expect(reference["role"]).toBe("other")
    expect(String(reference["note"])).toContain("asserts no site")
    expect(String(contentOf(submission)["editorial_notes"])).toContain("display placement")

    // The summary is what the details surface renders, so the disclosure has to
    // be there and not only in the editorial notes.
    expect(summary).toContain("The entries name no place for the submission or the embassy")
    expect(summary).toContain("display placement")
  })

  it("keeps 南陽 unlocated and records the two regions the name covers", () => {
    const chapter = tree()
    const nanyang = recordById(chapter, "lks:place:nanyang")
    const entry = geometryEntries(nanyang)[0]
    const claims = claimsOf(nanyang).map((claim) => String(claim["claim_id"]))

    expect(entry["interpretation"]).toBe("unknown")
    expect(entry["geojson"]).toBeNull()
    expect(String(entry["notes"])).toContain("修武縣")
    expect(String(contentOf(nanyang)["summary"])).toContain("宛")
    expect(String(contentOf(nanyang)["editorial_notes"])).toContain("河內")

    // Both regions are recorded as the historical geography's statements, so the
    // record can say why it chooses neither.
    expect(claims).toContain("lks:claim:nanyang-henei")
    expect(claims).toContain("lks:claim:nanyang-commandery")
    expect(
      locatorValues(
        claimsOf(nanyang).find((claim) => claim["claim_id"] === "lks:claim:nanyang-henei"),
      ),
    ).toEqual([
      "卷四十九 河南四 懷慶府 衛輝府 彰德府 修武縣（南陽城）",
      "卷四十九 河南四 懷慶府 衛輝府 彰德府 修武縣（南陽城）",
    ])
    expect(
      locatorValues(
        claimsOf(nanyang).find((claim) => claim["claim_id"] === "lks:claim:nanyang-commandery"),
      ),
    ).toEqual(["卷五十一 河南六 南陽府"])

    // The cession's summary, which the details surface renders, says in words
    // that the event has no position — the atlas claims none for it.
    const cession = contentOf(recordById(chapter, "lks:event:han-nanyang-cession-231"))

    expect(String(cession["summary"])).toContain("no position")
    expect(String(cession["summary"])).toContain("河內 南陽")

    // Only Qin's receipt of the land is dated to the ninth month; the
    // presentation is dated to the year, and the summary must not merge them.
    expect(String(cession["summary"])).toContain(
      "In 231 BCE Han presented 南陽, and in the ninth month Qin sent troops to receive the land",
    )

    // The annexation's anchor is a modern label position, not a seat location.
    const conquest = contentOf(recordById(chapter, "lks:event:han-conquest-230"))

    expect(String(conquest["summary"])).toContain(
      "not at an established historical seat coordinate",
    )
    expect(String(conquest["editorial_notes"])).toContain(
      "not an established historical seat coordinate",
    )
    expect(String(conquest["editorial_notes"])).not.toContain("anchor sits at the seat")
  })

  it("publishes no position the sources do not support", () => {
    const chapter = tree()
    const anchored: string[] = []
    const unlocated: string[] = []

    // Every anchored place is in the pinned list, and no other place carries
    // coordinates: an anchor the fixture has not reviewed cannot appear, and a
    // place the fixture has not placed cannot quietly gain a position.
    for (const record of recordsOfKind(chapter, "place")) {
      const recordId = String(record["record_id"])
      const entry = geometryEntries(record)[0]

      if (entry["interpretation"] === "display_anchor") {
        anchored.push(recordId)
      } else {
        unlocated.push(recordId)
        expect(entry["interpretation"], recordId).toBe("unknown")
        expect(entry["geojson"], recordId).toBeNull()
      }
    }

    expect(anchored.sort()).toEqual(ANCHORS.map(([placeId]) => placeId).sort())
    expect(unlocated).toEqual(["lks:place:nanyang"])
  })
})

describe("the corrections the owner asked to review", () => {
  /**
   * The internal review of this milestone found source-fidelity and wording
   * issues in the prepared snapshot. The owner then asked to review the
   * corrected content before deciding ("wire it up first, and let me review
   * again before approval"), so the corrected revisions are what the fixture's
   * single preparation set publishes and what the comparison review route
   * renders; each corrected record also keeps the superseded revision it
   * replaced, unpublished. No approval is recorded: the decision stays
   * `preparation snapshot`. These tests pin the corrected content, its reviewed
   * hashes, and the boundary.
   */
  /**
   * The records the corrections changed, each with the revision the internal
   * review read. Record files keep one current revision per record, so the
   * corrected content is that revision and the replaced reading is in Git.
   */
  const CORRECTIONS: [string, string][] = [
    ["lks:event:hanfei-death-233", "lks:rev:hanfei-death-233-2"],
    ["lks:relationship:qin-han-conflict", "lks:rev:qin-han-conflict-2"],
    ["lks:event:han-conquest-230", "lks:rev:han-conquest-230-2"],
    ["lks:event:han-nanyang-cession-231", "lks:rev:han-nanyang-cession-231-2"],
    ["lks:place:nanyang", "lks:rev:nanyang-2"],
    ["lks:relationship:han-nanyang-cession", "lks:rev:han-nanyang-cession-2"],
    ["lks:actor:nei-shi-teng", "lks:rev:nei-shi-teng-2"],
    ["lks:actor:qin-king-zheng", "lks:rev:qin-king-zheng-2"],
    ["lks:actor:han-king-an", "lks:rev:han-king-an-2"],
    ["lks:story:qin-conquest-han-233-226", "lks:rev:qin-conquest-han-story-2"],
    ["lks:actor:han-fei", "lks:rev:han-fei-2"],
    ["lks:event:han-submission-233", "lks:rev:han-submission-233-2"],
  ]

  it("publishes every reviewed correction as the record's one current revision", () => {
    const chapter = tree()

    for (const [recordId] of CORRECTIONS) {
      const record = recordById(chapter, recordId)
      const revision = publishedRevision(record)

      expect(listOf(record["revisions"]), recordId).toHaveLength(1)
      expect(revision["revision_hash"], recordId).toBe(revisionHash(revision))
    }
  })

  it("publishes no superseded wording and no approval in the records", () => {
    const chapter = tree()
    // The published content, not the revisions' `change_explanation` fields:
    // those legitimately quote the flagged reading as the thing the correction
    // replaces, and the atlas never renders them.
    const published = JSON.stringify(
      chapter.documents
        .filter((document) => document["document"] === "record")
        .map((record) => {
          const revision = publishedRevision(record)

          return {
            content: revision["content"],
            claims: revision["claims"],
            dispute: revision["dispute"] ?? null,
          }
        }),
    )

    // The readings the internal review flagged are the ones the superseded
    // revisions carry; the published revisions must not still carry them.
    for (const flagged of [
      "The three accounts agree that 韓非 died in Qin custody in 233 BCE",
      "from the 233 BCE attack the hereditary house records",
      "the hereditary house records Han sending to Qin in 233 BCE",
      "aligns the same year with 韓王安六年",
      "韓獻南陽地。秋，九月，發卒受地於韓。",
      "drought",
    ]) {
      expect(published, flagged).not.toContain(flagged)
    }

    // The content records no approval of its own: an approval is the owner's
    // line in the chapter manifest, never a field of a record.
    const set = theSet(chapter)

    expect(String(objectOf(set["review"])["independence"])).toBe("self_review")
    expect(JSON.stringify(chapter.documents)).not.toContain("owner approved")
  })

  it("does not claim that the death accounts agree on the year", () => {
    const revision = currentRevision("lks:event:hanfei-death-233")
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
    for (const text of [summary, notes, String(objectOf(revision["content"])["summary"])]) {
      expect(text).not.toMatch(/王安五年[^;.。]*aligns?[^;.。]*王安六年/)
      expect(text).not.toContain("aligns the same year")
    }

    const tableClaim = currentClaims("lks:event:hanfei-death-233").find(
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
    const revision = currentRevision("lks:event:hanfei-death-233")
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
    const death = currentContent("lks:event:hanfei-death-233")
    const conflict = currentContent("lks:relationship:qin-han-conflict")
    const conflictClaim = currentClaims("lks:relationship:qin-han-conflict")[0]
    const hanFei = currentContent("lks:actor:han-fei")
    const hanFeiClaim = currentClaims("lks:actor:han-fei")[0]
    const submission = currentContent("lks:event:han-submission-233")

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
    const content = currentContent("lks:relationship:qin-han-conflict")

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
        const validity = currentContent(recordId)["validity"]

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

      for (const role of listOf(currentContent(recordId)["roles"]).map((entry) =>
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

    const officer = currentContent("lks:actor:nei-shi-teng")
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
      for (const claim of currentClaims(recordId)) {
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

    const cession = currentClaims("lks:event:han-nanyang-cession-231")
    const mirror = cession.find((claim) => claim["claim_id"] === "lks:claim:nanyang-cession-mirror")
    const quotes = listOf(objectOf(mirror)["citations"]).map((citation) =>
      String(objectOf(citation)["quoted_text"]),
    )

    expect(quotes).toEqual(["韓獻南陽地。", "九月，發卒受地於韓。"])

    const succession = currentClaims("lks:actor:qin-king-zheng")
    const role = succession.find((claim) => claim["claim_id"] === "lks:claim:qin-king-zheng-role")
    const successionQuotes = listOf(objectOf(role)["citations"]).map((citation) =>
      String(objectOf(citation)["quoted_text"] ?? ""),
    )

    expect(successionQuotes[0]).toBe("五月，丙午，王薨。太子政立")
  })

  it("attributes the officer's name to the annals, not to the corrected mirror reading", () => {
    const claims = currentClaims("lks:actor:nei-shi-teng")
    const name = claims.find((claim) => claim["claim_id"] === "lks:claim:nei-shi-teng-name")

    expect(
      listOf(objectOf(name)["citations"]).map((citation) =>
        String(objectOf(citation)["source_id"]),
      ),
    ).toEqual(["lks:source:shiji"])
    expect(String(currentContent("lks:actor:nei-shi-teng")["editorial_notes"])).toContain(
      "內史〔騰〕(勝)",
    )

    const conquest = currentClaims("lks:event:han-conquest-230")
    const mirror = conquest.find((claim) => claim["claim_id"] === "lks:claim:han-conquest-mirror")

    expect(String(objectOf(mirror)["statement"])).not.toContain("內史騰")
  })

  it("attributes the cession to the annals and the comprehensive mirror", () => {
    const summary = String(currentContent("lks:place:nanyang")["summary"])

    expect(summary).toContain("annals")
    expect(summary).toContain("comprehensive mirror")
    expect(summary).not.toContain("hereditary house")
  })

  it("names the 230 BCE notice as the annals give it, without inferring a cause", () => {
    const note = String(
      contentOf(recordById(tree(), "lks:story:qin-conquest-han-233-226"))["coverage_note"],
    )

    expect(note).toContain("famine")
    expect(note).not.toContain("drought")
  })

  it("states the exclusions the fixture's scope depends on", () => {
    const note = String(
      contentOf(recordById(tree(), "lks:story:qin-conquest-han-233-226"))["coverage_note"],
    )

    // The window's edges are only meaningful if the note says what it leaves
    // out: the other notices of the cited years, the 246 BCE canal, the
    // 227–226 BCE Yan campaign and 荊軻's attempt, and every earlier and later
    // Qin–Han war.
    expect(note).toContain("Excluded")
    expect(note).toContain("233 BCE Zhao campaign")
    expect(note).toContain("earthquake")
    expect(note).toContain("華陽太后")
    expect(note).toContain("famine notices")
    expect(note).toContain("246 BCE")
    expect(note).toContain("鄭國 canal")
    expect(note).toContain("227–226 BCE Yan campaign")
    expect(note).toContain("荊軻")
    expect(note).toContain("昌平君")
    expect(note).toContain("earlier Qin–Han wars")
    expect(note).toContain("every later Qin conquest")
    expect(note).toContain("No route")
  })

  it("describes 韓王安's first numbered regnal year rather than an accession year", () => {
    const content = currentContent("lks:actor:han-king-an")
    const note = String(objectOf(listOf(content["roles"])[0])["note"])

    expect(note).toContain("first numbered regnal year")
    expect(note).toContain("元年")
    expect(note).not.toContain("from the accession")
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
    const set = theSet(chapter)

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

  it("is a chapter manifest the loader lists", () => {
    expect(listChapters()).toContain(CHAPTER)
  })

  it("is not the production chapter", () => {
    const story = recordById(tree(), "lks:story:qin-conquest-han-233-226")

    expect(String(contentOf(story)["summary"])).toContain("233–226 BCE")
    expect(String(contentOf(story)["coverage_note"])).toContain("Excluded")
  })

  it("resolves every citation to a source document in the fixture", () => {
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
        const locator = objectOf(citation["locator"])["value"]

        expect(typeof locator, String(record["record_id"])).toBe("string")
        expect(
          typeof locator === "string" ? locator.trim() : "",
          String(record["record_id"]),
        ).not.toBe("")
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
