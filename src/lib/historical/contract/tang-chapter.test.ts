import { describe, expect, it } from "vitest"
import { RECORD_FILES_ADOPTED_AT } from "../authoring/compile"
import { chapterBundle, listChapters, loadChapter, type ChapterTree } from "../chapter"
import { encode, revisionHash, sha256, sourceHash } from "./canonical"
import * as Publication from "./publication"
import * as Time from "./time"
import { isObject, listOf, objectOf, type JsonObject, type JsonValue } from "./types"

/**
 * Independent checks for the reviewed Tang chapter fixture.
 *
 * Two layers are tested. The first is the contract's own semantics, run over the
 * compiled chapter with `Publication.checkAll`, plus the hash and publication
 * rules that protect published content. The second is this chapter's coverage model:
 * the primary 750–754 window, the four included coda years, the labelling of
 * coda nodes, the exclusion of the 752 outbound voyage, and the rule that no
 * route geometry is drawn. Those chapter rules are written as predicates and
 * then exercised against deliberately wrong readings, because the contract
 * alone would accept an attested itinerary, a merged event, or an outbound
 * voyage event that this chapter's coverage model excludes.
 */

const CHAPTER = "tang-mission-750-754"

/**
 * The chapter's second story, 鑒眞's attempts to cross (742–750). The coverage
 * model below is the embassy's, the first story's; the second story keeps its
 * own window.
 */
const CROSSINGS = "jianzhen-crossings-742-753"

/** The crossings story's primary window, and the one coda year it reaches. */
const CROSSINGS_WINDOW = { startYear: 742, endYear: 750 }
const CROSSINGS_CODA_YEARS = [753]

/** The coverage model's primary mission window, inclusive at year granularity. */
const PRIMARY_WINDOW = { startYear: 750, endYear: 754 }

/** The coda years the coverage model includes outside the primary window. */
const CODA_YEARS = [758, 759, 763, 779]

/** The excluded outbound voyage of 752, as month keys (year * 100 + month). */
const EXCLUDED_OUTBOUND = { start: 75204, end: 75212 }

/** The marker every coda record's editorial notes must carry. */
const CODA_MARKER = "Coda node (outside the primary 750–754 mission window)"

const EVIDENCE_KINDS = ["place", "actor", "event", "relationship"]
const ROUTE_INTERPRETATIONS = ["attested_itinerary", "reconstructed_route", "schematic_link"]
const ROUTE_TYPES = ["LineString", "MultiLineString"]

function tree(): ChapterTree {
  return loadChapter(CHAPTER)
}

function recordsOfKind(chapter: ChapterTree, kind: string): JsonObject[] {
  return chapter.documents.filter(
    (document) => document["document"] === "record" && document["kind"] === kind,
  )
}

/** The events a story's steps name, in its order. */
function storyEventIds(chapter: ChapterTree, key: string): string[] {
  return listOf(contentOf(recordById(chapter, `lks:story:${key}`))["steps"])
    .map((step) => String(objectOf(step)["record_id"]))
    .filter((recordId) => recordId.startsWith("lks:event:"))
}

/** The events of the embassy, the chapter's first story. */
function embassyEvents(chapter: ChapterTree): JsonObject[] {
  const ids = new Set(storyEventIds(chapter, CHAPTER))

  return recordsOfKind(chapter, "event").filter((record) => ids.has(String(record["record_id"])))
}

function recordById(chapter: ChapterTree, recordId: string): JsonObject {
  const record = chapter.documents.find((document) => document["record_id"] === recordId)

  if (record === undefined) {
    throw new Error(`${recordId} is not in the chapter tree`)
  }

  return record
}

/**
 * The chapter's one publication set: the set its approval stands for, or a
 * draft preview until the owner approves. A chapter compiles to exactly one.
 */
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

function editorialNotes(record: JsonObject): string {
  const notes = contentOf(record)["editorial_notes"]

  return typeof notes === "string" ? notes : ""
}

function isCoda(record: JsonObject): boolean {
  return editorialNotes(record).startsWith(CODA_MARKER)
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

/** A month-aware comparison key: year * 100 + month, with year precision as month 0. */
function spanKeys(time: Time.NormalizedTime): [number, number] {
  const key = (endpoint: Time.NormalizedEndpoint): number =>
    endpoint.astro * 100 + (endpoint.month ?? 0)

  const start = time.start
  const end = time.end ?? time.start

  if (start === null) {
    throw new Error("a dated record must have a start endpoint")
  }

  return [key(start), key(end as Time.NormalizedEndpoint)]
}

/**
 * The embassy's coverage model: every event of the first story is either
 * inside the primary 750–754 window or an included coda node, and none falls
 * in the excluded outbound voyage of 752. The crossings' 750–753 occurrence
 * windows overlap 752 without being about the outbound voyage, so the rule
 * reads the embassy's events only.
 */
function coverageViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of embassyEvents(chapter)) {
    const recordId = String(record["record_id"])
    const time = normalizedTime(record)
    const [start, end] = spanKeys(time)

    if (isCoda(record)) {
      const years = [time.start?.year, time.end?.year].filter(
        (year): year is number => typeof year === "number",
      )

      for (const year of years) {
        if (!CODA_YEARS.includes(year)) {
          violations.push(`${recordId} is labelled a coda node but falls in ${year}`)
        }
      }
    } else if (start < PRIMARY_WINDOW.startYear * 100 || end > PRIMARY_WINDOW.endYear * 100 + 12) {
      violations.push(`${recordId} is outside the primary 750–754 window and is not a coda node`)
    }

    if (start <= EXCLUDED_OUTBOUND.end && end >= EXCLUDED_OUTBOUND.start) {
      violations.push(`${recordId} falls in the excluded outbound-voyage window of 752`)
    }
  }

  return violations
}

/** No route geometry anywhere: the coverage model draws documented landfalls, not lines. */
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

      if (!isNil(entry["waypoints"])) {
        violations.push(`${recordId} carries route waypoints`)
      }
    }
  }

  return violations
}

/** Day precision is only published when the source states the day itself. */
function dayPrecisionViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of recordsOfKind(chapter, "event")) {
    const time = objectOf(contentOf(record)["time"])

    if (time["precision"] !== "day") {
      continue
    }

    const expression =
      typeof time["source_expression"] === "string" ? time["source_expression"] : ""

    // A stated day is a numeral before 日 (十五日, 廿日) or the first-day marker 朔.
    if (!/[一二三四五六七八九十廿卅]+日|朔/.test(expression)) {
      violations.push(`${String(record["record_id"])} publishes day precision without a stated day`)
    }
  }

  return violations
}

/** The two island arrivals keep their own sources and the name variant stays visible. */
function variantViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []
  const biographyArrival = recordById(chapter, "lks:event:yaku-arrival-753")
  const chronicleArrival = recordById(chapter, "lks:event:kibi-yaku-arrival-753")
  const biographyMainClaims = claimsOf(biographyArrival).filter((claim) => claim["role"] === "main")
  const biographyMainSources = [
    ...new Set(
      biographyMainClaims.flatMap((claim) =>
        listOf(claim["citations"]).map((citation) => String(objectOf(citation)["source_id"])),
      ),
    ),
  ].sort()

  if (biographyMainSources.join() !== "lks:source:toseiden") {
    violations.push("the biography's island-arrival facts must cite the biography alone")
  }

  if (citedSourceIds(chronicleArrival).join() !== "lks:source:shoku-nihongi") {
    violations.push("the chronicle's island arrival must cite the chronicle alone")
  }

  const forms = listOf(contentOf(recordById(chapter, "lks:place:yaku"))["names"]).map((name) =>
    String(objectOf(name)["form"]),
  )

  for (const form of ["益救島", "益久嶋"]) {
    if (!forms.includes(form)) {
      violations.push(`the island place record no longer carries the form ${form}`)
    }
  }

  return violations
}

/** The cited chapter evidence does not establish one continuous Nakamaro role through 779. */
function nakamaroRoleViolations(chapter: ChapterTree): string[] {
  const record = recordById(chapter, "lks:actor:abe-no-nakamaro")

  return listOf(contentOf(record)["roles"]).flatMap((roleValue) => {
    const validity = objectOf(objectOf(roleValue)["validity"])
    const interval = objectOf(validity["interval"])
    const start = objectOf(interval["start"])
    const end = objectOf(interval["end"])

    return validity["mode"] === "duration" && start["year"] === 753 && end["year"] === 779
      ? ["Abe no Nakamaro has an unsupported continuous role from 753 through the 779 report"]
      : []
  })
}

/** Coda nodes are labelled in the story as well as in their own records. */
function codaLabelViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []
  const story = recordById(chapter, "lks:story:tang-mission-750-754")
  const steps = listOf(contentOf(story)["steps"]).map((step) => objectOf(step))
  const codaRecords = chapter.documents.filter(
    (document) => document["document"] === "record" && isCoda(document),
  )

  if (codaRecords.length === 0) {
    violations.push("no coda records are marked")
  }

  for (const record of codaRecords) {
    const step = steps.find((candidate) => candidate["record_id"] === record["record_id"])
    const caption = step === undefined ? "" : String(step["caption"] ?? "")

    if (!caption.startsWith("Coda — ")) {
      violations.push(`${String(record["record_id"])} has no story step labelled as a coda`)
    }
  }

  const years = [
    ...new Set(
      recordsOfKind(chapter, "event")
        .filter(isCoda)
        .map((record) => normalizedTime(record).start?.year)
        .filter(Boolean) as number[],
    ),
  ].sort((a, b) => a - b)

  if (years.join() !== CODA_YEARS.join()) {
    violations.push(`coda years are ${years.join()} instead of ${CODA_YEARS.join()}`)
  }

  const coverageNote = String(contentOf(story)["coverage_note"] ?? "")

  for (const year of CODA_YEARS) {
    if (!coverageNote.includes(String(year))) {
      violations.push(`the story coverage note does not name coda year ${year}`)
    }
  }

  if (!coverageNote.includes("outbound voyage of 752 is excluded")) {
    violations.push("the story coverage note does not state the outbound-voyage exclusion")
  }

  return violations
}

/** Uncertainty semantics: placements that assert nothing say so, and cite why. */
function uncertaintyViolations(chapter: ChapterTree): string[] {
  const violations: string[] = []

  for (const record of chapter.documents.filter((document) => document["document"] === "record")) {
    const recordId = String(record["record_id"])
    const claims = claimsOf(record)
    const claimIds = claims.map((claim) => claim["claim_id"])

    if (EVIDENCE_KINDS.includes(String(record["kind"])) && citationsOf(record).length === 0) {
      violations.push(`${recordId} is published without a citation`)
    }

    if (listOf(publishedRevision(record)["research_notes"]).length > 0) {
      violations.push(`${recordId} carries unpublished research notes`)
    }

    for (const claim of claims) {
      if (claim["basis"] === "cited_interpretation" && !claim["attributed_to"]) {
        violations.push(`${recordId} has a cited interpretation without attribution`)
      }
    }

    for (const entry of geometryEntries(record)) {
      if (!claimIds.includes(entry["claim_id"])) {
        violations.push(`${recordId} has geometry without a claim in its revision`)
      }

      if (entry["interpretation"] === "unknown") {
        if (!isNil(entry["geojson"]) || !entry["notes"]) {
          violations.push(`${recordId} has an unknown placement with coordinates or no explanation`)
        }
      }

      if (entry["interpretation"] === "display_anchor") {
        if (entry["precision"] !== "unspecified" || !entry["notes"]) {
          violations.push(`${recordId} has a display anchor with a precision or no explanation`)
        }
      }

      if (entry["interpretation"] === "approximate_point" && entry["precision"] === "unspecified") {
        violations.push(`${recordId} asserts a point without a precision`)
      }
    }
  }

  return violations
}

function isNil(value: JsonValue | undefined): boolean {
  return value === null || value === undefined
}

function cloneTree(chapter: ChapterTree): ChapterTree {
  return structuredClone(chapter) as ChapterTree
}

describe("the Tang chapter fixture", () => {
  it("validates as one content tree with the contract's own semantics", () => {
    const chapter = tree()
    const result = Publication.checkAll(chapter.documents, chapter.sets)

    if (!result.ok) {
      throw new Error(
        [
          "the Tang chapter does not satisfy the contract:",
          ...result.errors.map((error) => `  ${error.code} at ${error.where}: ${error.detail}`),
        ].join("\n"),
      )
    }

    expect(listChapters()).toContain(CHAPTER)
    expect(Object.keys(result.currentPublished)).toHaveLength(140)
  })

  it("keeps the expected inventory and publishes each record once in the first set", () => {
    const chapter = tree()
    const counts = {
      place: recordsOfKind(chapter, "place").length,
      actor: recordsOfKind(chapter, "actor").length,
      event: recordsOfKind(chapter, "event").length,
      relationship: recordsOfKind(chapter, "relationship").length,
      story: recordsOfKind(chapter, "story").length,
    }

    expect(counts).toEqual({ place: 43, actor: 24, event: 62, relationship: 9, story: 2 })
    expect(chapter.documents.filter((document) => document["document"] === "source")).toHaveLength(
      18,
    )

    const first = theSet(chapter)
    const memberIds = listOf(first["members"]).map((member) =>
      String(objectOf(member)["record_id"]),
    )

    expect(memberIds).toHaveLength(140)
    expect(new Set(memberIds).size).toBe(memberIds.length)
    expect(Publication.currentPublished(chapter.documents, chapter.sets).size).toBe(140)
  })

  it("publishes one revision per record in a single set", () => {
    const chapter = tree()
    const set = theSet(chapter)
    const memberIds = listOf(set["members"]).map((member) => String(objectOf(member)["record_id"]))
    const current = Publication.currentPublished(chapter.documents, chapter.sets)
    const history = Publication.history(chapter.documents, chapter.sets)

    // One set, one revision per record, and no superseded set: a revision is
    // generated from its record file, and a record's history is in Git.
    expect(chapter.sets).toHaveLength(1)
    expect(set["supersedes"]).toBeNull()
    expect(memberIds.sort()).toEqual(
      chapter.documents
        .filter((document) => document["document"] === "record")
        .map((document) => String(document["record_id"]))
        .sort(),
    )

    for (const member of listOf(set["members"])) {
      const recordId = String(objectOf(member)["record_id"])
      const entry = objectOf(member)
      const record = recordById(chapter, recordId)
      const revision = listOf(record["revisions"])
        .map((candidate) => objectOf(candidate))
        .find((candidate) => candidate["revision_id"] === entry["revision_id"])

      // The set publishes exactly one revision of each record. A record may also
      // carry an unpublished draft; the draft is not what the chapter publishes,
      // so the published history and the current revision are unchanged by it.
      expect(revision, recordId).toBeDefined()
      expect(revisionHash(objectOf(revision)), recordId).toBe(entry["revision_hash"])
      expect(current.get(recordId)?.revision_id, recordId).toBe(entry["revision_id"])
      expect(
        history[recordId]?.map((historyEntry) => historyEntry.revision_id),
        recordId,
      ).toEqual([entry["revision_id"]])
    }

    // The placements and identifications survive the flattening: the court's
    // seat is placed at the excavated palace site (no longer a display anchor
    // since 2026-10-21), the identifications are approximate locality-level
    // placements, and 驩州 keeps unknown geometry.
    const palace = objectOf(listOf(recordById(chapter, "lks:place:heijo-palace")["revisions"])[0])
    const palaceGeometry = objectOf(listOf(objectOf(palace["content"])["geometry"])[0])

    expect(palaceGeometry["interpretation"]).toBe("approximate_point")
    expect(palaceGeometry["precision"]).toBe("locality")

    for (const recordId of ["lks:event:appointment-750", "lks:event:sekito-752"]) {
      const revision = objectOf(listOf(recordById(chapter, recordId)["revisions"])[0])
      const places = listOf(objectOf(revision["content"])["places"]).map(objectOf)

      expect(places, recordId).toHaveLength(1)
      expect(places[0]?.["place_id"], recordId).toBe("lks:place:heijo-palace")
    }

    for (const [recordId, placeId, basis] of [
      ["lks:place:murozaki", "lks:place:murozaki", "cited_interpretation"],
      ["lks:place:ishigaki", "lks:place:ishigaki", "attested"],
    ]) {
      const revision = objectOf(listOf(recordById(chapter, recordId)["revisions"])[0])
      const geometry = objectOf(listOf(objectOf(revision["content"])["geometry"])[0])
      const claim = listOf(revision["claims"])
        .map(objectOf)
        .find((candidate) => candidate["claim_id"] === geometry["claim_id"])

      expect(geometry["interpretation"], placeId).toBe("approximate_point")
      expect(geometry["precision"], placeId).toBe("locality")
      // The basis says what each identification rests on: the 和歌山県 page
      // reports 紀伊続風土記's identification (an interpretation advanced in a
      // cited work), while the 石垣 account is a bounded modern statement the
      // chapter records as what it reports.
      expect(claim?.["basis"], placeId).toBe(basis)
    }

    const huanzhou = objectOf(listOf(recordById(chapter, "lks:place:huanzhou")["revisions"])[0])
    const huanzhouGeometry = objectOf(listOf(objectOf(huanzhou["content"])["geometry"])[0])

    expect(huanzhouGeometry["interpretation"]).toBe("unknown")
  })

  it("allows an unpublished draft without changing what is published", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:appointment-750")
    const published = publishedRevision(record)
    const content = JSON.parse(JSON.stringify(published["content"])) as JsonObject

    content["summary"] = "Draft summary that no set publishes."

    const draft: JsonObject = {
      revision_id: "lks:rev:appointment-750-99",
      created_at: "2026-10-19T00:00:00Z",
      author: {
        name: "Lekishi contributors",
        role: "record file authors (see Git history)",
      },
      change_explanation: "Draft correction: prepared but not published by any set.",
      content,
      claims: JSON.parse(JSON.stringify(published["claims"])),
    }
    draft["revision_hash"] = revisionHash(draft)
    ;(record["revisions"] as JsonObject[]).push(draft)

    // The contract accepts a prepared draft: it is a revision no set names, so
    // the mirror still points at the published one and the chapter publishes what
    // the owner decided on.
    expect(Publication.checkAll(chapter.documents, chapter.sets).ok).toBe(true)
    expect(
      Publication.currentPublished(chapter.documents, chapter.sets).get(
        record["record_id"] as string,
      )?.revision_id,
    ).toBe(published["revision_id"])
    expect(
      Publication.history(chapter.documents, chapter.sets)[String(record["record_id"])]?.map(
        (historyEntry) => historyEntry.revision_id,
      ),
    ).toEqual([published["revision_id"]])
  })

  it("is sealed, so an edit to approved content is detected", () => {
    const chapter = tree()

    for (const document of chapter.documents) {
      if (document["document"] === "source") {
        expect(sourceHash(document)).toBe(document["source_hash"])
        continue
      }

      if (document["document"] !== "record") {
        continue
      }

      for (const revision of listOf(document["revisions"])) {
        expect(revisionHash(objectOf(revision))).toBe(objectOf(revision)["revision_hash"])
      }
    }

    for (const set of chapter.sets) {
      for (const member of listOf(set["members"])) {
        const entry = objectOf(member)
        const record = recordById(chapter, String(entry["record_id"]))
        const revision = listOf(record["revisions"]).find(
          (candidate) => objectOf(candidate)["revision_id"] === entry["revision_id"],
        )

        expect(revision).toBeDefined()
        expect(revisionHash(objectOf(revision))).toBe(entry["revision_hash"])
      }

      for (const pin of listOf(set["sources"])) {
        const entry = objectOf(pin)
        const source = chapter.documents.find(
          (document) => document["source_id"] === entry["source_id"],
        )

        expect(source).toBeDefined()
        expect(sourceHash(objectOf(source))).toBe(entry["source_hash"])
      }
    }
  })

  it("keeps the primary window, the included coda years, and the outbound exclusion", () => {
    const chapter = tree()

    expect(coverageViolations(chapter)).toEqual([])
    expect(dayPrecisionViolations(chapter)).toEqual([])

    const codaYears = [
      ...new Set(
        embassyEvents(chapter)
          .filter(isCoda)
          .map((record) => normalizedTime(record).start?.year),
      ),
    ].sort((a, b) => Number(a) - Number(b))

    expect(codaYears).toEqual(CODA_YEARS)

    // The excluded window is a real gap in the chronology: no event is dated
    // inside it, the last event before it is the 752 節刀, and the next
    // month/day-dated event is the 753 New Year audience.
    const dated = embassyEvents(chapter)
      .map((record) => ({
        id: String(record["record_id"]),
        keys: spanKeys(normalizedTime(record)),
      }))
      .sort((a, b) => a.keys[0] - b.keys[0])
    const before = dated.filter((event) => event.keys[1] < EXCLUDED_OUTBOUND.start).at(-1)
    const insideGap = dated.filter(
      (event) => event.keys[0] <= EXCLUDED_OUTBOUND.end && event.keys[1] >= EXCLUDED_OUTBOUND.start,
    )
    const firstDatedAfterGap = dated.find(
      (event) => event.keys[0] > EXCLUDED_OUTBOUND.end && event.keys[0] % 100 > 0,
    )

    expect(before?.id).toBe("lks:event:sekito-752")
    expect(insideGap).toEqual([])
    expect(firstDatedAfterGap?.id).toBe("lks:event:tang-new-year-audience-753")
    expect(
      spanKeys(normalizedTime(recordById(chapter, "lks:event:tang-new-year-audience-753"))),
    ).toEqual([75301, 75301])
  })

  it("keeps the crossings to 742–750, with 753 as their only coda year", () => {
    const chapter = tree()
    const captions = new Map(
      listOf(contentOf(recordById(chapter, `lks:story:${CROSSINGS}`))["steps"]).map((step) => [
        String(objectOf(step)["record_id"]),
        String(objectOf(step)["caption"]),
      ]),
    )
    const events = recordsOfKind(chapter, "event").filter((record) =>
      captions.has(String(record["record_id"])),
    )
    // An event is outside the window only when its whole span is: the return
    // to 揚州 is a 750–753 occurrence window, so it stays in the story.
    const outside = events.filter((record) => {
      const time = normalizedTime(record)

      return (
        (time.end?.year ?? 0) < CROSSINGS_WINDOW.startYear ||
        (time.start?.year ?? 0) > CROSSINGS_WINDOW.endYear
      )
    })

    expect(events).toHaveLength(storyEventIds(chapter, CROSSINGS).length)
    expect([...new Set(outside.map((record) => normalizedTime(record).start?.year))]).toEqual(
      CROSSINGS_CODA_YEARS,
    )
    expect(
      outside.filter((record) => !captions.get(String(record["record_id"]))?.startsWith("Coda — ")),
    ).toEqual([])

    // The one event both stories tell is the 753 invitation, where the
    // crossings hand over to the embassy.
    const embassy = new Set(storyEventIds(chapter, CHAPTER))

    expect(
      events.map((record) => record["record_id"]).filter((id) => embassy.has(String(id))),
    ).toEqual(["lks:event:yangzhou-invitation-753"])
  })

  it("labels every coda node in the story and in its own record", () => {
    const chapter = tree()

    expect(codaLabelViolations(chapter)).toEqual([])
  })

  it("draws no route geometry and keeps the voyage as documented landfalls", () => {
    const chapter = tree()

    expect(routeViolations(chapter)).toEqual([])

    const voyage = recordById(chapter, "lks:event:return-voyage-753")
    const geometry = geometryEntries(voyage)

    expect(geometry).toHaveLength(1)
    expect(geometry[0]["interpretation"]).toBe("unknown")
    expect(geometry[0]["geojson"]).toBeNull()
    expect(String(geometry[0]["notes"])).toContain("No route geometry is asserted")

    const places = listOf(contentOf(voyage)["places"]).map((place) => objectOf(place)["place_id"])

    expect(places).toEqual([
      "lks:place:huangsipu",
      "lks:place:ajinawa",
      "lks:place:yaku",
      "lks:place:akimeya",
    ])

    const separation = recordById(chapter, "lks:event:ships-separate-753")

    expect(String(contentOf(separation)["summary"])).toContain("sets out for 多禰島")
    expect(listOf(contentOf(voyage)["places"])).not.toContainEqual(
      expect.objectContaining({ place_id: "lks:place:tane" }),
    )
  })

  it("keeps the island-name variant and the two island arrivals separate", () => {
    const chapter = tree()

    expect(variantViolations(chapter)).toEqual([])

    const biographyArrival = recordById(chapter, "lks:event:yaku-arrival-753")
    const chronicleArrival = recordById(chapter, "lks:event:kibi-yaku-arrival-753")

    expect(biographyArrival["record_id"]).not.toBe(chronicleArrival["record_id"])
    expect(normalizedTime(biographyArrival).start?.year).toBe(753)
    expect(normalizedTime(chronicleArrival).start?.year).toBe(753)
    expect(editorialNotes(biographyArrival)).toContain("two records")
  })

  it("does not publish a day where the sources disagree or give only a sexagenary day", () => {
    const chapter = tree()
    const returnReport = recordById(chapter, "lks:event:return-report-754")
    const time = objectOf(contentOf(returnReport)["time"])

    expect(time["precision"]).toBe("month")
    expect(String(time["source_expression"])).toContain("壬子")
    expect(editorialNotes(returnReport)).toContain("正月十一日丁未")

    for (const recordId of [
      "lks:actor:jianzhen",
      "lks:event:jianzhen-death-763",
      "lks:event:yaku-arrival-753",
    ]) {
      const record = recordById(chapter, recordId)
      const revision = publishedRevision(record)
      const dispute = objectOf(revision["dispute"])
      const competingRoles = claimsOf(record).map((claim) => claim["role"])

      expect(dispute["status"], recordId).toBe("disputed")
      expect(competingRoles, recordId).toEqual(
        expect.arrayContaining([expect.stringMatching(/alternative|conflicting/)]),
      )
    }

    // The chronicle's return notice and the biography's report are not established
    // as one occasion, so the record states both without claiming a dispute over a
    // single day, and the disputed records above stay disputed in the history.
    expect(objectOf(publishedRevision(returnReport)["dispute"])["status"]).toBeUndefined()
    expect(editorialNotes(returnReport)).toContain("same occasion")

    const history = Publication.history(chapter.documents, chapter.sets)

    for (const recordId of [
      "lks:actor:jianzhen",
      "lks:event:jianzhen-death-763",
      "lks:event:yaku-arrival-753",
    ]) {
      expect(history[recordId]?.at(-1)?.dispute_status, recordId).toBe("disputed")
    }
  })

  it("does not turn Nakamaro's 779 death report into continuous role validity", () => {
    const record = recordById(tree(), "lks:actor:abe-no-nakamaro")

    // The cited evidence supports a 753 appearance and a 779 report that he had
    // died, not activity across the interval, so the fixture publishes no
    // structured role for him at all.
    expect(listOf(contentOf(record)["roles"])).toEqual([])
    expect(nakamaroRoleViolations(tree())).toEqual([])
  })

  it("generates every revision from its record file, so no history can be resealed by hand", () => {
    // A revision's id carries a prefix of its content hash and its hash covers
    // the content, so the only way to change a published revision is to change
    // its record file, which changes the chapter's digest and needs a new
    // approval before it is served.
    for (const document of tree().documents.filter((entry) => entry["document"] === "record")) {
      const revisions = listOf(document["revisions"]).map(objectOf)

      expect(revisions, String(document["record_id"])).toHaveLength(1)

      const [revision] = revisions
      const body: JsonObject = { content: revision["content"], claims: revision["claims"] }

      if (revision["dispute"] !== undefined) {
        body["dispute"] = revision["dispute"]
      }

      expect(String(revision["revision_id"]).endsWith(sha256(encode(body)).slice(0, 12))).toBe(true)
      expect(revision["created_at"]).toBe(RECORD_FILES_ADOPTED_AT)
    }
  })

  it("carries citations and explicit uncertainty on every published record", () => {
    const chapter = tree()

    expect(uncertaintyViolations(chapter)).toEqual([])

    const unlocated = recordsOfKind(chapter, "place").filter((record) =>
      geometryEntries(record).some((entry) => entry["interpretation"] === "unknown"),
    )

    // The two identifications the owner asked to chase are published as
    // approximate locality-level placements; 驩州 keeps `unknown` geometry
    // because no source in the set identifies its site. The crossings' coastal
    // anchorages and the three Hainan prefectures stay `unknown` until a cited
    // identification places them.
    expect(unlocated.map((record) => record["record_id"]).sort()).toEqual([
      "lks:place:huanzhou",
      "lks:place:langgou-pu",
      "lks:place:sangshi-shan",
      "lks:place:santa-shan",
      "lks:place:shufeng-shan",
      "lks:place:wananzhou",
      "lks:place:xiayu-shan",
      "lks:place:yazhou",
      "lks:place:zhenzhou",
    ])
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
    expect(notes).not.toContain("independent review is recorded")
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
})

describe("adversarial readings of the Tang chapter", () => {
  it("rejects an event for the excluded outbound voyage of 752", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:sekito-752")
    const revision = publishedRevision(record)
    const content = objectOf(revision["content"])
    const time = objectOf(content["time"])

    time["source_expression"] = "天平勝寶四年七月"
    objectOf(time["interval"])["start"] = { year: 752, era: "ce", month: 7 }
    objectOf(time["interval"])["end"] = { year: 752, era: "ce", month: 7 }

    expect(coverageViolations(chapter)).not.toEqual([])
  })

  it("rejects a route line drawn for the return voyage", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:return-voyage-753")
    const content = objectOf(publishedRevision(record)["content"])
    const geometry = listOf(content["geometry"])[0] as JsonObject

    geometry["interpretation"] = "attested_itinerary"
    geometry["precision"] = "region"
    geometry["geojson"] = {
      type: "LineString",
      coordinates: [
        [120.6194, 31.3],
        [127.95, 26.4833],
        [130.2269, 31.2672],
      ],
    }

    expect(routeViolations(chapter)).not.toEqual([])
  })

  it("rejects treating Nakamaro's death-report year as continuous role validity", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:actor:abe-no-nakamaro")
    const content = objectOf(publishedRevision(record)["content"])

    content["roles"] = [
      {
        role: "scholar",
        validity: {
          source_expression: "753 appearance; 779 death report",
          calendar: "regnal",
          precision: "year",
          mode: "duration",
          interval: {
            bounds: "two_sided",
            boundary: "inclusive",
            start: { year: 753, era: "ce" },
            end: { year: 779, era: "ce" },
          },
        },
      },
    ]

    expect(nakamaroRoleViolations(chapter)).not.toEqual([])
  })

  it("rejects a published day for the return report the sources disagree on", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:return-report-754")
    const time = objectOf(objectOf(publishedRevision(record)["content"])["time"])
    const interval = objectOf(time["interval"])

    time["precision"] = "day"
    objectOf(interval["start"])["day"] = 11
    objectOf(interval["end"])["day"] = 11

    expect(dayPrecisionViolations(chapter)).not.toEqual([])
  })

  it("rejects merging the two island arrivals into one corroborated event", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:kibi-yaku-arrival-753")
    const claims = listOf(publishedRevision(record)["claims"])

    listOf(objectOf(claims[0])["citations"]).push({
      source_id: "lks:source:toseiden",
      locator: { kind: "entry", value: "七日，至益救島" },
    })

    expect(variantViolations(chapter)).not.toEqual([])
  })

  it("rejects moving a coda node into the primary window", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:daikasho-title-758")
    const time = objectOf(objectOf(publishedRevision(record)["content"])["time"])
    const interval = objectOf(time["interval"])

    objectOf(interval["start"])["year"] = 754
    objectOf(interval["end"])["year"] = 754
    objectOf(interval["start"])["month"] = 8
    objectOf(interval["end"])["month"] = 8

    expect(codaLabelViolations(chapter)).not.toEqual([])
    expect(coverageViolations(chapter)).not.toEqual([])
  })

  it("detects an edit to an approved revision", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:event:appointment-750")
    objectOf(publishedRevision(record)["content"])["summary"] = "Edited after approval"

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("revision_hash_mismatch")
    }
  })

  it("detects an edit to an earlier revision that a correction superseded", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:dazaifu")
    const superseded = objectOf(listOf(record["revisions"])[0])

    objectOf(superseded["content"])["summary"] = "Edited after the correction was published"

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      const codes = result.errors.map((error) => error.code)

      // Both the revision's own hash and the first set's pin still describe the
      // content that review approved, so a correction cannot be used to rewrite it.
      expect(codes).toContain("revision_hash_mismatch")
      expect(codes).toContain("member_hash_mismatch")
    }
  })

  it("detects an edit to an approved source even after resealing it", () => {
    const chapter = cloneTree(tree())
    const source = chapter.documents.find(
      (document) => document["source_id"] === "lks:source:chimei-taikei-ata",
    )
    const edited = objectOf(source)

    edited["license"] = {
      ...objectOf(edited["license"]),
      attribution_text: "Edited after approval",
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

  it("detects a publication mirror that disagrees with the set", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:naniwa")
    objectOf(record["publication"])["published_at"] = "2026-09-25T00:00:00Z"

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("publication_mirror_mismatch")
    }
  })

  it("rejects relabelling the self-review as independent review", () => {
    const chapter = cloneTree(tree())
    const set = theSet(chapter)
    objectOf(set["review"])["independence"] = "independent_review"

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("self_review_mislabelled")
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

  it("rejects a geometry entry that no claim asserts", () => {
    const chapter = cloneTree(tree())
    const record = recordById(chapter, "lks:place:akimeya")
    const content = objectOf(publishedRevision(record)["content"])

    listOf(content["geometry"]).push({
      claim_id: "lks:claim:akimeya-name",
      interpretation: "approximate_point",
      geojson: { type: "Point", coordinates: [130.0, 31.0] },
      precision: "locality",
    })

    const result = Publication.checkAll(chapter.documents, chapter.sets)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain("geometry_claim_pointer_mismatch")
    }
  })
})
