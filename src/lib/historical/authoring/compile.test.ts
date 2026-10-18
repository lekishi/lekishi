import { describe, expect, it } from "vitest"
import * as Publication from "../contract/publication"
import { isObject, type JsonObject } from "../contract/types"
import { compileChapter, RECORD_FILES_ADOPTED_AT } from "./compile"
import { buildTree, type TreeFile } from "./tree"

/**
 * The record-file compiler against a small synthetic tree.
 *
 * Every id here contains `example-`: this is a fixture for the compiler, not
 * historical content, and none of it may be cited as evidence. The real
 * chapters' migration is pinned by their own tests; this suite pins the rules:
 * ids come from file names, citations become claims on the field they are
 * attached to, a chapter reaches exactly what its story and `include` name, and
 * the digest an approval pins moves with content and nothing else.
 */

const SOURCE = `
locator: entry
kind: primary
title: An example chronicle
license:
  status: recorded
  license_id: public-domain
  attribution_text: An example chronicle
  redistribution: permitted
  quotation_permitted: true
  reviewed_by: Example reviewer
  reviewed_at: 2026-10-01T00:00:00Z
`

const PLACE = `
summary: An example harbour.
types: [port]
names:
  - form: 例港
    lang: lzh
    script: Hani
    roman: Lì gǎng
    scheme: pinyin
    cite:
      id: example-harbour-name
      says: The chronicle names the harbour.
      source: example-chronicle
      at: 卷一
  - form: 例浦
    lang: lzh
    script: Hani
    claim: example-harbour-name
at:
  interpretation: display_anchor
  precision: unspecified
  point: [130.1, 31.2]
  notes: A display position for the example, not an asserted coordinate.
  cite:
    says: The anchor is a display position only.
    source: example-chronicle
    at: 卷一
    locator: section
`

const ACTOR = `
summary: An example envoy.
types: [person]
names:
  - form: 例使
    lang: lzh
    script: Hani
    cite:
      says: The chronicle names the envoy.
      source: example-chronicle
      at: 卷一
`

const EVENT = `
summary: The envoy lands at the harbour.
types: [journey]
date:
  value: 753-12-20
  calendar: chinese_lunisolar
  as_written: 廿日
  cite:
    says: The chronicle dates the landing.
    source: example-chronicle
    at: 卷一
places:
  - place: example-harbour
    role: site
participants:
  - actor: example-envoy
    role: leader
cites:
  places:
    says: The chronicle names the harbour as the landing place.
    source: example-chronicle
    at: 卷一
`

const RELATIONSHIP = `
summary: The envoy's arrival at the harbour.
types: [travel]
from: example-envoy
to: example-harbour
cite:
  says: The chronicle reports the arrival.
  sources:
    - source: example-chronicle
      at: 卷一
    - source: example-chronicle
      at: 卷二
      quote: 至
`

function manifest(extra = ""): string {
  return `
title: An example chapter
summary: A chapter that exists only to test the compiler.
window: 750..754
story:
  summary: The example story.
  span: 750..779
  steps:
    - example-landing: The envoy lands
${extra}`
}

function files(overrides: Record<string, string | null> = {}): TreeFile[] {
  const base: Record<string, string> = {
    "sources/example-chronicle.yaml": SOURCE,
    "places/example/example-harbour.yaml": PLACE,
    "actors/example-envoy.yaml": ACTOR,
    "events/example/deep/example-landing.yaml": EVENT,
    "relationships/example-arrival.yaml": RELATIONSHIP,
    "places/example-unused.yaml": PLACE,
    "chapters/example-chapter.yaml": manifest(),
  }

  return Object.entries({ ...base, ...overrides })
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([path, text]) => ({ path, text }))
}

function record(documents: JsonObject[], id: string): JsonObject {
  const found = documents.find((document) => document["record_id"] === id)

  if (found === undefined) {
    throw new Error(`no ${id}`)
  }

  return (found["revisions"] as JsonObject[])[0]
}

describe("the record-file tree", () => {
  it("takes each id from its file name, whatever subfolder holds it", () => {
    const tree = buildTree(files())

    expect([...tree.records.keys()].sort()).toEqual([
      "lks:actor:example-envoy",
      "lks:event:example-landing",
      "lks:place:example-harbour",
      "lks:place:example-unused",
      "lks:relationship:example-arrival",
    ])
    expect(tree.records.get("lks:event:example-landing")?.path).toBe(
      "events/example/deep/example-landing.yaml",
    )
  })

  it("fails on two files with one name under one kind", () => {
    expect(() => buildTree(files({ "places/other/example-harbour.yaml": PLACE }))).toThrow(
      /already defines example-harbour/,
    )
  })

  it("lets two kinds share a name, which a reference then disambiguates", () => {
    const tree = buildTree(files({ "actors/example-harbour.yaml": ACTOR }))

    expect(tree.records.has("lks:actor:example-harbour")).toBe(true)
    expect(() =>
      compileChapter(
        buildTree(
          files({
            "actors/example-harbour.yaml": ACTOR,
            "relationships/example-arrival.yaml": RELATIONSHIP.replace(
              "to: example-harbour",
              "to: example-harbour",
            ),
            "chapters/example-chapter.yaml": manifest("include: [example-arrival]"),
          }),
        ),
        "example-chapter",
      ),
    ).toThrow(/write the kind/)

    const resolved = compileChapter(
      buildTree(
        files({
          "actors/example-harbour.yaml": ACTOR,
          "relationships/example-arrival.yaml": RELATIONSHIP.replace(
            "to: example-harbour",
            "to: place:example-harbour",
          ),
          "chapters/example-chapter.yaml": manifest("include: [example-arrival]"),
        }),
      ),
      "example-chapter",
    )

    expect(record(resolved.documents, "lks:relationship:example-arrival")["content"]).toMatchObject(
      {
        to: "lks:place:example-harbour",
      },
    )
  })

  it("reports a schema violation against the file the author wrote", () => {
    expect(() =>
      buildTree(
        files({
          "events/example/deep/example-landing.yaml": EVENT.replace(
            "types: [journey]",
            "types: [voyage]",
          ),
        }),
      ),
    ).toThrow(/events\/example\/deep\/example-landing\.yaml/)
    expect(() => buildTree(files({ "places/Example.yaml": PLACE }))).toThrow(/file name is the id/)
  })
})

describe("compiling a record file", () => {
  const bundle = compileChapter(buildTree(files()), "example-chapter")

  it("turns each cite into a claim on the field it is attached to", () => {
    const event = record(bundle.documents, "lks:event:example-landing")
    const claims = event["claims"] as JsonObject[]

    expect(claims.map((claim) => [claim["claim_id"], claim["asserts"]])).toEqual([
      ["lks:claim:example-landing-time", "/time"],
      ["lks:claim:example-landing-places", "/places"],
    ])
    expect(claims[0]).toMatchObject({
      basis: "attested",
      role: "main",
      statement: "The chronicle dates the landing.",
    })
    expect(event["content"]).toMatchObject({
      places: [{ place_id: "lks:place:example-harbour", role: "site" }],
      participants: [{ actor_id: "lks:actor:example-envoy", role: "leader" }],
      time: { source_expression: "廿日", precision: "day" },
    })
  })

  it("links a name to its own main claim, or to the one it names", () => {
    const place = record(bundle.documents, "lks:place:example-harbour")
    const content = place["content"] as JsonObject
    const names = content["names"] as JsonObject[]

    expect(names[0]).toMatchObject({
      role: "primary",
      claim_id: "lks:claim:example-harbour-name",
      romanization: { value: "Lì gǎng", origin: "editorial", pronunciation_claim: false },
    })
    expect(names[1]).toMatchObject({
      role: "alternate",
      claim_id: "lks:claim:example-harbour-name",
    })
    expect((content["geometry"] as JsonObject[])[0]).toMatchObject({
      claim_id: "lks:claim:example-harbour-geometry-0",
      geojson: { type: "Point", coordinates: [130.1, 31.2] },
    })
  })

  it("uses the source's locator kind unless a citation names another", () => {
    const claims = record(bundle.documents, "lks:place:example-harbour")["claims"] as JsonObject[]

    expect(claims.map((claim) => (claim["citations"] as JsonObject[])[0]["locator"])).toEqual([
      { kind: "entry", value: "卷一" },
      { kind: "section", value: "卷一" },
    ])

    const source = bundle.documents.find(
      (document) => document["source_id"] === "lks:source:example-chronicle",
    )

    expect(source).toBeDefined()
    expect(source).not.toHaveProperty("locator")
  })

  it("defaults a relationship to directed with no causal claim", () => {
    const included = compileChapter(
      buildTree(files({ "chapters/example-chapter.yaml": manifest("include: [example-arrival]") })),
      "example-chapter",
    )
    const relationship = record(included.documents, "lks:relationship:example-arrival")

    expect(relationship["content"]).toMatchObject({
      directionality: "directed",
      causality: "not_asserted",
    })
    expect((relationship["claims"] as JsonObject[])[0]).toMatchObject({
      asserts: "",
      citations: [
        { source_id: "lks:source:example-chronicle", locator: { kind: "entry", value: "卷一" } },
        {
          source_id: "lks:source:example-chronicle",
          locator: { kind: "entry", value: "卷二" },
          quoted_text: "至",
        },
      ],
    })
  })

  it("refuses a link to a claim the record does not carry", () => {
    expect(() =>
      compileChapter(
        buildTree(
          files({
            "places/example/example-harbour.yaml": PLACE.replace(
              "claim: example-harbour-name",
              "claim: example-missing",
            ),
          }),
        ),
        "example-chapter",
      ),
    ).toThrow(/claim example-missing is not one of this record's claims/)
  })
})

describe("compiling a chapter", () => {
  it("reaches exactly the story, what it refers to, what it includes, and the sources cited", () => {
    const bundle = compileChapter(buildTree(files()), "example-chapter")
    const ids = bundle.documents.map((document) => document["record_id"] ?? document["source_id"])

    expect(ids).toEqual([
      "lks:actor:example-envoy",
      "lks:event:example-landing",
      "lks:place:example-harbour",
      "lks:story:example-chapter",
      "lks:source:example-chronicle",
    ])
    expect(bundle.window).toEqual({ start: 750, end: 754 })

    const story = record(bundle.documents, "lks:story:example-chapter")

    expect(story["content"]).toMatchObject({
      window: {
        start: { year: 750, era: "ce" },
        end: { year: 779, era: "ce" },
        boundary: "inclusive",
      },
      steps: [
        { record_id: "lks:event:example-landing", role: "start", caption: "The envoy lands" },
      ],
    })
  })

  it("generates revisions from content alone", () => {
    const first = compileChapter(buildTree(files()), "example-chapter")
    const again = compileChapter(
      buildTree(files({ "chapters/example-chapter.yaml": manifest("include: [example-arrival]") })),
      "example-chapter",
    )
    const revision = record(first.documents, "lks:place:example-harbour")

    expect(revision["created_at"]).toBe(RECORD_FILES_ADOPTED_AT)
    expect(String(revision["revision_id"])).toMatch(/^lks:rev:example-harbour-[0-9a-f]{12}$/)
    expect(record(again.documents, "lks:place:example-harbour")).toEqual(revision)
  })

  it("leaves a chapter without an approval as an unpublished draft", () => {
    const bundle = compileChapter(buildTree(files()), "example-chapter")

    expect(bundle.state).toBe("draft")
    expect(bundle.sets).toEqual([])
    expect(
      bundle.documents
        .filter((document) => document["document"] === "record")
        .every((document) => document["publication"] === null),
    ).toBe(true)
  })
})

describe("the digest an approval pins", () => {
  const digest = compileChapter(buildTree(files()), "example-chapter").digest

  function approved(approval: string, overrides: Record<string, string | null> = {}) {
    return compileChapter(
      buildTree(files({ "chapters/example-chapter.yaml": manifest(approval), ...overrides })),
      "example-chapter",
    )
  }

  it("ignores comments, formatting and key order", () => {
    const reformatted = PLACE.replace("types: [port]", "# a comment\ntypes:\n  - port").replace(
      "summary: An example harbour.",
      "summary: >-\n  An example\n  harbour.",
    )

    expect(
      compileChapter(
        buildTree(files({ "places/example/example-harbour.yaml": reformatted })),
        "example-chapter",
      ).digest,
    ).toBe(digest)
  })

  it("moves when a record the chapter reaches changes, and not when an unreached one does", () => {
    const shared = PLACE.replace("point: [130.1, 31.2]", "point: [130.1, 31.3]")

    expect(
      compileChapter(
        buildTree(files({ "places/example/example-harbour.yaml": shared })),
        "example-chapter",
      ).digest,
    ).not.toBe(digest)
    expect(
      compileChapter(buildTree(files({ "places/example-unused.yaml": shared })), "example-chapter")
        .digest,
    ).toBe(digest)
    expect(
      compileChapter(
        buildTree(
          files({
            "sources/example-chronicle.yaml": SOURCE.replace(
              "An example chronicle\n",
              "An edited chronicle\n",
            ),
          }),
        ),
        "example-chapter",
      ).digest,
    ).not.toBe(digest)
  })

  it("does not change when the approval is written, so an approval can match", () => {
    const bundle = approved(`approval:\n  digest: ${digest}\n  by: Example Owner\n  on: 2026-10-19`)

    expect(bundle.digest).toBe(digest)
    expect(bundle.state).toBe("approved")
  })

  it("publishes an approved chapter as one set the contract accepts", () => {
    const bundle = approved(`approval:\n  digest: ${digest}\n  by: Example Owner\n  on: 2026-10-19`)

    expect(bundle.sets).toHaveLength(1)
    expect(bundle.sets[0]).toMatchObject({
      published_at: "2026-10-19T00:00:00Z",
      published_by: { name: "Example Owner", role: "owner" },
      review: { independence: "self_review" },
    })
    expect(Publication.checkAll(bundle.documents, bundle.sets)).toEqual(
      expect.objectContaining({ ok: true }),
    )

    for (const document of bundle.documents.filter((entry) => entry["document"] === "record")) {
      expect(isObject(document["publication"]), String(document["record_id"])).toBe(true)
    }
  })

  it("marks an approval of other content stale and publishes nothing", () => {
    const bundle = approved(
      `approval:\n  digest: ${digest}\n  by: Example Owner\n  on: 2026-10-19`,
      {
        "actors/example-envoy.yaml": ACTOR.replace("An example envoy.", "An edited envoy."),
      },
    )

    expect(bundle.state).toBe("stale")
    expect(bundle.sets).toEqual([])
  })
})
