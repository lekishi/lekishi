import { describe, expect, it } from "vitest"
import * as Publication from "../contract/publication"
import { isObject, type JsonObject } from "../contract/types"
import { compileChapter, RECORD_FILES_ADOPTED_AT } from "./compile"
import { buildTree, readFiles, readTree, type TreeFile } from "./tree"

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

  it("reads a file once, reporting it at each path and keeping later trees unchanged", () => {
    const invalid = EVENT.replace("types: [journey]", "types: [voyage]")

    expect(() => buildTree(files({ "events/example-landing.yaml": invalid }))).toThrow(
      /events\/example-landing\.yaml/,
    )
    expect(() => buildTree(files({ "events/example/deep/example-landing.yaml": invalid }))).toThrow(
      /events\/example\/deep\/example-landing\.yaml/,
    )

    const place = buildTree(files()).records.get("lks:place:example-harbour")?.data as JsonObject

    expect(buildTree(files()).records.get("lks:place:example-harbour")?.data).toBe(place)
    expect(() => {
      place["summary"] = "Changed by a caller."
    }).toThrow(TypeError)
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

  it("lists claims in the order the record file writes them", () => {
    // The card shows an event's first quoted citation, so the order an author
    // writes is the order a reader meets: a whole-record cite written after a
    // field comes after that field's claims.
    const landing = `${EVENT.trimEnd()}
cite:
  id: example-landing-record
  says: The chronicle reports the landing as a whole.
  source: example-chronicle
  at: 卷三
`
    const event = record(
      compileChapter(
        buildTree(files({ "events/example/deep/example-landing.yaml": landing })),
        "example-chapter",
      ).documents,
      "lks:event:example-landing",
    )

    expect((event["claims"] as JsonObject[]).map((claim) => claim["claim_id"])).toEqual([
      "lks:claim:example-landing-time",
      "lks:claim:example-landing-places",
      "lks:claim:example-landing-record",
    ])
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

  it("compiles a Long Count date with its correlation", () => {
    const stela = EVENT.replace("753-12-20", "36 BCE").replace(
      "calendar: chinese_lunisolar",
      "calendar: mesoamerican_long_count\n  correlation: 584283",
    )
    const bundle = compileChapter(
      buildTree(files({ "events/example/deep/example-landing.yaml": stela })),
      "example-chapter",
      { preview: true },
    )

    expect(record(bundle.documents, "lks:event:example-landing")["content"]).toMatchObject({
      time: { calendar: "mesoamerican_long_count", correlation: 584283 },
    })
    expect(Publication.checkAll(bundle.documents, bundle.sets)).toEqual(
      expect.objectContaining({ ok: true }),
    )
  })
})

describe("compiling a chapter with several stories", () => {
  const STORIES = `
title: An example chapter
summary: A chapter that exists only to test the compiler.
window: 750..754
stories:
  - key: example-chapter
    title: The landing
    summary: The example story.
    span: 750..779
    steps:
      - example-landing: The envoy lands
  - key: example-arrival-story
    title: The arrival
    summary: A second example story.
    span: 740..760
    window: 745..755
    coverage: The arrival only.
    steps:
      - example-arrival: The envoy arrives
      - example-landing: "The landing, again"
`

  function compiled(text = STORIES, overrides: Record<string, string | null> = {}) {
    return compileChapter(
      buildTree(files({ "chapters/example-chapter.yaml": text, ...overrides })),
      "example-chapter",
      { preview: true },
    )
  }

  it("publishes one story record per story, keyed by the story", () => {
    const bundle = compiled()
    const ids = bundle.documents.map((document) => document["record_id"] ?? document["source_id"])

    expect(ids).toContain("lks:story:example-chapter")
    expect(ids).toContain("lks:story:example-arrival-story")
    expect(ids).toContain("lks:relationship:example-arrival")
    expect(record(bundle.documents, "lks:story:example-arrival-story")["content"]).toMatchObject({
      coverage_note: "The arrival only.",
      steps: [
        { record_id: "lks:relationship:example-arrival", role: "start" },
        { record_id: "lks:event:example-landing", role: "step", caption: "The landing, again" },
      ],
    })
    expect(Publication.checkAll(bundle.documents, bundle.sets)).toEqual(
      expect.objectContaining({ ok: true }),
    )
  })

  it("lists the stories for the switcher, the first opening on the chapter's window", () => {
    expect(compiled().stories).toEqual([
      {
        key: "example-chapter",
        title: "The landing",
        window: { start: 750, end: 754 },
        span: { start: 750, end: 779 },
      },
      {
        key: "example-arrival-story",
        title: "The arrival",
        window: { start: 745, end: 755 },
        span: { start: 740, end: 760 },
      },
    ])
  })

  it("defaults a later story's window to its span", () => {
    const bundle = compiled(STORIES.replace("    window: 745..755\n", ""))

    expect(bundle.stories[1].window).toEqual({ start: 740, end: 760 })
  })

  it("gives a one-story chapter one story under the chapter's id and title", () => {
    const bundle = compileChapter(buildTree(files()), "example-chapter")

    expect(bundle.stories).toEqual([
      {
        key: "example-chapter",
        title: "An example chapter",
        window: { start: 750, end: 754 },
        span: { start: 750, end: 779 },
      },
    ])
  })

  it("refuses a window on the first story, which opens on the chapter's", () => {
    const text = STORIES.replace(
      "    span: 750..779\n",
      "    span: 750..779\n    window: 751..752\n",
    )

    expect(() => compiled(text)).toThrow(/stories\[0\] opens on the chapter's window/)
  })

  it("refuses a story key another story already has", () => {
    expect(() =>
      compiled(STORIES.replace("key: example-arrival-story", "key: example-chapter")),
    ).toThrow(/two stories have the key example-chapter/)
    expect(() =>
      compiled(STORIES, {
        "chapters/example-other.yaml": manifest().replace("An example chapter", "Another"),
      }),
    ).not.toThrow()
    expect(() =>
      compiled(STORIES.replace("key: example-arrival-story", "key: example-other"), {
        "chapters/example-other.yaml": manifest(),
      }),
    ).toThrow(/the story key example-other is already a story in chapters\/example-other.yaml/)
  })

  it("refuses a manifest that writes both one story and several", () => {
    expect(() => compiled(`${manifest()}\n${STORIES.split("\n").slice(4).join("\n")}`)).toThrow(
      /chapters\/example-chapter.yaml: \/ oneOf/,
    )
  })

  it("names the story when a step names nothing", () => {
    expect(() => compiled(STORIES.replace("- example-arrival:", "- example-missing:"))).toThrow(
      /stories\[1\]\.steps\[0\]: no event or relationship record is named example-missing/,
    )
  })

  it("moves the digest when a story is added", () => {
    const one = compileChapter(buildTree(files()), "example-chapter").digest

    expect(compiled().digest).not.toBe(one)
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

  it("ignores comments, formatting and key order that does not affect claim order", () => {
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

  it("invalidates an approval when YAML field order changes the claims readers see", () => {
    const placesCite = `cites:
  places:
    says: The chronicle names the harbour as the landing place.
    source: example-chronicle
    at: 卷一
`
    const reordered = EVENT.replace(placesCite, "").replace("date:\n", `${placesCite}date:\n`)
    const changed = approved(
      `approval:\n  digest: ${digest}\n  by: Example Owner\n  on: 2026-10-19`,
      { "events/example/deep/example-landing.yaml": reordered },
    )
    const event = record(changed.documents, "lks:event:example-landing")

    expect((event["claims"] as JsonObject[]).map((claim) => claim["claim_id"])).toEqual([
      "lks:claim:example-landing-places",
      "lks:claim:example-landing-time",
    ])
    expect(changed.digest).not.toBe(digest)
    expect(changed.state).toBe("stale")
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

  it("previews a draft for checks without naming an owner or reading as approved", () => {
    const preview = compileChapter(buildTree(files()), "example-chapter", { preview: true })

    expect(preview.state).toBe("draft")
    expect(preview.sets).toHaveLength(1)
    expect(String(preview.sets[0]["set_id"])).toContain("-draft-")
    expect(preview.sets[0]["published_by"]).toEqual({
      name: "Lekishi contributors",
      role: "draft preview, not approved",
    })
    expect(Publication.checkAll(preview.documents, preview.sets)).toEqual(
      expect.objectContaining({ ok: true }),
    )
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

describe("compiling a conventional date", () => {
  const conventional = (cite: string) =>
    EVENT.replace(
      "  cite:\n    says: The chronicle dates the landing.\n    source: example-chronicle\n    at: 卷一\n",
      cite,
    )
  const CITE = `  cite:
    says: The chronicle places the landing after the crossing; the standard chronology dates it.
    basis: conventional
    convention: Example voyage seasons, standard chronology
    sources:
      - source: example-chronicle
        at: 卷一
      - source: example-chronicle
        at: 卷二
`

  it("compiles the basis and its convention under contract v0", () => {
    const bundle = compileChapter(
      buildTree(files({ "events/example/deep/example-landing.yaml": conventional(CITE) })),
      "example-chapter",
      { preview: true },
    )
    const claims = record(bundle.documents, "lks:event:example-landing")["claims"] as JsonObject[]

    expect(claims.find((claim) => claim["asserts"] === "/time")).toMatchObject({
      basis: "conventional",
      convention: "Example voyage seasons, standard chronology",
    })
    expect(
      new Set([...bundle.documents, ...bundle.sets].map((document) => document["contract"])),
    ).toEqual(new Set(["lekishi-historical-contract/v0"]))
    expect(Publication.checkAll(bundle.documents, bundle.sets)).toEqual(
      expect.objectContaining({ ok: true }),
    )
  })

  it("needs a convention and two sources", () => {
    for (const cite of [
      CITE.replace("    convention: Example voyage seasons, standard chronology\n", ""),
      "  cite:\n    says: The chronicle dates the landing.\n    basis: conventional\n    convention: Example voyage seasons\n    source: example-chronicle\n    at: 卷一\n",
    ]) {
      expect(() =>
        buildTree(files({ "events/example/deep/example-landing.yaml": conventional(cite) })),
      ).toThrow(/example-landing\.yaml/)
    }
  })

  it("refuses a convention on any other basis", () => {
    const cite =
      "  cite:\n    says: The chronicle dates the landing.\n    convention: Example voyage seasons\n    source: example-chronicle\n    at: 卷一\n"

    expect(() =>
      buildTree(files({ "events/example/deep/example-landing.yaml": conventional(cite) })),
    ).toThrow(/example-landing\.yaml/)
  })
})

describe("compiling a tradition", () => {
  const told = (cite: string) =>
    EVENT.replace(
      "  cite:\n    says: The chronicle dates the landing.\n    source: example-chronicle\n    at: 卷一\n",
      cite,
    )

  it("compiles the basis unchanged and needs no attribution", () => {
    const bundle = compileChapter(
      buildTree(
        files({
          "events/example/deep/example-landing.yaml": told(
            "  cite:\n    says: The chronicle tells the landing as the founders' story.\n    basis: tradition\n    source: example-chronicle\n    at: 卷一\n",
          ),
        }),
      ),
      "example-chapter",
      { preview: true },
    )
    const claims = record(bundle.documents, "lks:event:example-landing")["claims"] as JsonObject[]
    const time = claims.find((claim) => claim["asserts"] === "/time")

    expect(time).toMatchObject({ basis: "tradition" })
    expect(time).not.toHaveProperty("attributed_to")
    expect(Publication.checkAll(bundle.documents, bundle.sets)).toEqual(
      expect.objectContaining({ ok: true }),
    )
  })

  it("refuses an unknown basis by name", () => {
    expect(() =>
      buildTree(
        files({
          "events/example/deep/example-landing.yaml": told(
            "  cite:\n    says: The chronicle dates the landing.\n    basis: legend\n    source: example-chronicle\n    at: 卷一\n",
          ),
        }),
      ),
    ).toThrow(/example-landing\.yaml/)
  })
})

describe("compiling a territory snapshot", () => {
  const STATE = `
summary: An example state.
types: [state]
names:
  - form: 例國
    lang: lzh
    script: Hani
    cite:
      says: The chronicle names the state.
      source: example-chronicle
      at: 卷一
`
  const TERRITORY = `
summary: The places the example state held after the landing.
controller: example-state
date:
  value: 753..754
  mode: duration
  calendar: chinese_lunisolar
places:
  - place: example-harbour
    role: seat
    gained: example-landing
    note: Taken with the landing.
  - example-unused
cite:
  says: The chronicle records the state holding the harbour and the coast.
  source: example-chronicle
  at: 卷二
`
  const tree = (territory: string = TERRITORY) =>
    buildTree(
      files({
        "actors/example-state.yaml": STATE,
        "territories/example/example-coast-753.yaml": territory,
        "chapters/example-chapter.yaml": manifest("include: [example-coast-753]"),
      }),
    )

  it("compiles the controller, the bounded window and each held place", () => {
    const bundle = compileChapter(tree(), "example-chapter", { preview: true })
    const snapshot = record(bundle.documents, "lks:territory:example-coast-753")

    expect(snapshot["content"]).toEqual({
      summary: "The places the example state held after the landing.",
      controller_id: "lks:actor:example-state",
      time: expect.objectContaining({
        mode: "duration",
        interval: expect.objectContaining({
          bounds: "two_sided",
          start: { year: 753, era: "ce" },
          end: { year: 754, era: "ce" },
        }),
      }),
      places: [
        {
          place_id: "lks:place:example-harbour",
          role: "seat",
          gained_record_id: "lks:event:example-landing",
          note: "Taken with the landing.",
        },
        { place_id: "lks:place:example-unused", role: "held" },
      ],
    })
    expect(Publication.checkAll(bundle.documents, bundle.sets)).toEqual(
      expect.objectContaining({ ok: true }),
    )
  })

  it("reaches the controller and every held place, which the chapter then publishes", () => {
    const bundle = compileChapter(tree(), "example-chapter")
    const ids = bundle.documents.map((document) => document["record_id"] ?? document["source_id"])

    expect(ids).toEqual(
      expect.arrayContaining([
        "lks:actor:example-state",
        "lks:place:example-unused",
        "lks:territory:example-coast-753",
      ]),
    )
  })

  it("refuses a place gained by anything but an event or relationship", () => {
    expect(() =>
      compileChapter(
        tree(TERRITORY.replace("gained: example-landing", "gained: example-unused")),
        "example-chapter",
      ),
    ).toThrow(/example-coast-753\.yaml: places\[0\]\.gained: no event or relationship/)
  })

  it("refuses a controller that is not an actor", () => {
    expect(() =>
      compileChapter(
        tree(TERRITORY.replace("controller: example-state", "controller: example-harbour")),
        "example-chapter",
      ),
    ).toThrow(/controller: no actor record is named example-harbour/)
  })
})

describe("compiling a journey", () => {
  // Two located places and the anchored harbour: a leg is drawn between the
  // located ones and the line breaks at the anchor.
  const located = (name: string, point: string) => `
summary: An example ${name}.
types: [port]
names:
  - form: 例${name}
    lang: lzh
    script: Hani
    cite:
      says: The chronicle names the ${name}.
      source: example-chronicle
      at: 卷一
at:
  interpretation: approximate_point
  precision: locality
  point: ${point}
  notes: Placed at the locality the chronicle names.
  cite:
    says: The chronicle places the ${name} in this locality.
    source: example-chronicle
    at: 卷一
`
  const stopEvent = (place: string, date: string, extra = "") => `
summary: The envoy is at the ${place}.
types: [journey]
date:
  value: ${date}
  calendar: chinese_lunisolar
  cite:
    says: The chronicle dates the stop.
    source: example-chronicle
    at: 卷一
places:
  - place: ${place}
    role: site
${extra}`
  const JOURNEY = `
title: The envoy's example voyage
summary: The envoy sails from the cape by the isle to the harbour.
travellers:
  - actor: example-envoy
    role: leader
stops:
  - example-departure
  - event: example-call
    by: sea
  - event: example-landing
    by: sea
    driven: true
    toward: example-cape
    cite:
      says: The chronicle says the ship was driven to the harbour on its way back to the cape.
      source: example-chronicle
      at: 卷二
cite:
  id: example-voyage-sequence
  says: The chronicle narrates the departure, the call and the landing in this order.
  source: example-chronicle
  at: 卷一至卷二
`
  const steps = (...names: string[]) =>
    `${manifest("include: [example-voyage]").replace(
      "    - example-landing: The envoy lands\n",
      names.map((name) => `    - ${name}: A stop\n`).join(""),
    )}`

  function voyage(overrides: Record<string, string | null> = {}) {
    return files({
      "places/example-cape.yaml": located("cape", "[121.0, 31.0]"),
      "places/example-isle.yaml": located("isle", "[130.5, 30.4]"),
      "events/example-departure.yaml": stopEvent("example-cape", "753-11-15"),
      "events/example-call.yaml": stopEvent("example-isle", "753-12-07"),
      "journeys/example/example-voyage.yaml": JOURNEY,
      "chapters/example-chapter.yaml": steps(
        "example-departure",
        "example-call",
        "example-landing",
      ),
      ...overrides,
    })
  }

  it("compiles stops at their events' places, and draws a leg only between located places", () => {
    const bundle = compileChapter(buildTree(voyage()), "example-chapter", { preview: true })
    const revision = record(bundle.documents, "lks:journey:example-voyage")
    const stops = (revision["content"] as JsonObject)["stops"] as JsonObject[]

    expect(stops.map((stop) => [stop["event_id"], stop["place_id"]])).toEqual([
      ["lks:event:example-departure", "lks:place:example-cape"],
      ["lks:event:example-call", "lks:place:example-isle"],
      ["lks:event:example-landing", "lks:place:example-harbour"],
    ])
    expect(stops[1]).toMatchObject({
      mode: "sea",
      geometry: [
        {
          claim_id: "lks:claim:example-voyage-sequence",
          interpretation: "schematic_link",
          geojson: {
            type: "LineString",
            coordinates: [
              [121.0, 31.0],
              [130.5, 30.4],
            ],
          },
          waypoints: [
            { place_id: "lks:place:example-cape" },
            { place_id: "lks:place:example-isle" },
          ],
        },
      ],
    })
    // The harbour is a display anchor, so the line breaks there; the drift and
    // the intended destination stay on the stop.
    expect(stops[2]).toEqual({
      event_id: "lks:event:example-landing",
      place_id: "lks:place:example-harbour",
      mode: "sea",
      driven: true,
      toward_place_id: "lks:place:example-cape",
    })
    expect(Publication.checkAll(bundle.documents, bundle.sets)).toEqual(
      expect.objectContaining({ ok: true }),
    )
  })

  it("names contract v0 throughout a bundle that publishes a journey", () => {
    const bundle = compileChapter(buildTree(voyage()), "example-chapter", { preview: true })
    const contracts = new Set(
      [...bundle.documents, ...bundle.sets].map((document) => document["contract"]),
    )

    expect(contracts).toEqual(new Set(["lekishi-historical-contract/v0"]))
  })

  it("fails a chapter that includes a journey without reaching every stop", () => {
    expect(() =>
      compileChapter(
        buildTree(
          voyage({
            "chapters/example-chapter.yaml": steps("example-departure", "example-landing"),
          }),
        ),
        "example-chapter",
      ),
    ).toThrow(/lks:journey:example-voyage stops at lks:event:example-call/)
  })

  it("refuses a stop at a context place, and asks which place when an event has several", () => {
    const context = voyage({
      "events/example-call.yaml": stopEvent("example-isle", "753-12-07").replace(
        "role: site",
        "role: context",
      ),
    })
    const several = voyage({
      "events/example-call.yaml": stopEvent(
        "example-isle",
        "753-12-07",
        "  - place: example-cape\n    role: waypoint\n",
      ),
    })

    expect(() => compileChapter(buildTree(context), "example-chapter")).toThrow(
      /puts the party at no place/,
    )
    expect(() => compileChapter(buildTree(several), "example-chapter")).toThrow(
      /write which one with place:/,
    )
    expect(() =>
      compileChapter(
        buildTree(
          voyage({
            "events/example-call.yaml": stopEvent(
              "example-isle",
              "753-12-07",
              "  - place: example-cape\n    role: waypoint\n",
            ),
            "journeys/example/example-voyage.yaml": JOURNEY.replace(
              "  - event: example-call\n",
              "  - event: example-call\n    place: example-isle\n",
            ),
          }),
        ),
        "example-chapter",
      ),
    ).not.toThrow()
  })

  it("needs a cite of its own for a drift or an intended destination", () => {
    const uncited = JOURNEY.replace(
      /    cite:\n      says: The chronicle says[^\n]*\n[^\n]*\n[^\n]*\n/,
      "",
    )

    expect(() =>
      compileChapter(
        buildTree(voyage({ "journeys/example/example-voyage.yaml": uncited })),
        "example-chapter",
      ),
    ).toThrow(/needs a cite of its own/)
  })
})

describe("the journeys in the record tree", () => {
  const tree = readTree()

  // A journey no chapter includes yet is still checked: each compiles in a
  // chapter of its own that steps through its stops, and that bundle must
  // pass the contract, so a journey is valid before a chapter publishes it.
  for (const [id, file] of tree.records) {
    if (file.kind !== "journey") {
      continue
    }

    it(`${file.path} compiles and passes the contract`, () => {
      const stops = (file.data["stops"] as (string | JsonObject)[]).map((stop) =>
        typeof stop === "string" ? stop : String(stop["event"]),
      )
      const chapter: TreeFile = {
        path: "chapters/journey-check.yaml",
        text: [
          "title: Journey check",
          "summary: Compiles one journey.",
          "window: 1..2",
          `include: [journey:${id.slice("lks:journey:".length)}]`,
          "story:",
          "  summary: Every stop of the journey.",
          "  span: 1..2",
          "  steps:",
          ...[...new Set(stops)].map((stop) => `    - ${stop}: A stop`),
        ].join("\n"),
      }
      const bundle = compileChapter(buildTree([...readFiles(), chapter]), "journey-check", {
        preview: true,
      })

      expect(Publication.checkAll(bundle.documents, bundle.sets)).toEqual(
        expect.objectContaining({ ok: true }),
      )
    })
  }
})
