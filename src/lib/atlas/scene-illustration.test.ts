import { describe, expect, it } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { TANG_CHAPTER } from "./chapter-registry"
import type { HistoricalEvent, Place } from "./domain"
import {
  localSceneFor,
  localSceneKind,
  localSceneNotice,
  localSceneShapes,
  type LocalSceneKind,
} from "./scene-illustration"

/**
 * The illustrated-local treatment's content rules.
 *
 * These are the checks that decide whether the treatment is honest: the scene
 * kind comes from the record's published event types, the drawing is the same
 * pictogram for every place of a kind, a record with no place draws nothing, and
 * an event the atlas does not place keeps the record's own statement of why. A
 * treatment that broke any of them would be drawing something the sources do not
 * support, which is exactly the failure the comparison has to be able to see.
 */

const PLACE: Place = {
  id: "lks:place:test-harbor",
  label: "Test harbor",
  aliases: ["Test harbor", "テスト港"],
  placement: "display-anchor",
  precision: "locality",
  position: { lon: 130, lat: 33 },
  placementNote: "Label anchor only; no historical coordinate is asserted.",
}

const OTHER_PLACE: Place = {
  id: "lks:place:test-court",
  label: "Test court",
  aliases: ["Test court"],
  placement: "approximate",
  precision: "region",
  position: { lon: 135, lat: 34 },
  placementNote: null,
}

// The treatment runs over reviewed content, so the cases that matter most are the
// records the chapters actually publish; these tests load the served chapter the
// same way the browser does.
const CHAPTER = await loadServedChapter(TANG_CHAPTER)

const NOWHERE: Place = {
  id: "lks:place:test-unknown",
  label: "Test unknown",
  aliases: ["Test unknown"],
  placement: "unknown",
  precision: "unspecified",
  position: null,
  placementNote: "No identification is sourced.",
}

function event(overrides: Partial<HistoricalEvent> = {}): HistoricalEvent {
  return {
    id: "lks:event:test",
    title: "A test event",
    eventTypes: ["occurrence"],
    placement: {
      kind: "point",
      placeId: PLACE.id,
      label: PLACE.label,
      basis: "display-anchor",
      precision: "locality",
      position: { lon: 130, lat: 33 },
    },
    occurrence: {
      startYear: 750,
      endYear: 750,
      precision: "year",
      mode: "instant",
      sourceExpression: null,
    },
    note: "A synthetic event for the treatment's own tests.",
    dispute: null,
    coda: false,
    placeIds: [PLACE.id],
    participants: [],
    citations: [],
    ...overrides,
  }
}

describe("the scene kind follows the record's published event types", () => {
  it("maps every value of the contract's vocabulary", () => {
    // The contract's own vocabulary, and the scene each value draws. `occurrence`
    // and `other` draw the plain scene; every value has to draw something.
    const expected: Record<string, LocalSceneKind> = {
      occurrence: "plain",
      process: "exchange",
      journey: "travel",
      campaign: "campaign",
      mission: "assembly",
      council: "assembly",
      founding: "foundation",
      exchange: "exchange",
      other: "plain",
    }

    for (const [type, kind] of Object.entries(expected)) {
      expect(localSceneKind([type]), type).toBe(kind)
    }
  })

  it("draws the first type the atlas knows, in the record's own order", () => {
    expect(localSceneKind(["mission", "journey"])).toBe("assembly")
    expect(localSceneKind(["journey", "mission"])).toBe("travel")
    // A type the atlas does not know never outranks one it does.
    expect(localSceneKind(["unknown-type", "founding"])).toBe("foundation")
  })

  it("draws the plain scene rather than a wrong one for an unknown type", () => {
    expect(localSceneKind(["something-new"])).toBe("plain")
    expect(localSceneKind([])).toBe("plain")
  })
})

describe("the scene is a pictogram of a kind, not a portrait of a place", () => {
  it("draws the same shapes for two different places of the same kind", () => {
    const harbor = localSceneFor(event({ eventTypes: ["journey"] }), [PLACE])
    const court = localSceneFor(
      event({
        eventTypes: ["journey"],
        placement: {
          kind: "point",
          placeId: OTHER_PLACE.id,
          label: OTHER_PLACE.label,
          basis: "approximate",
          precision: "region",
          position: { lon: 135, lat: 34 },
        },
        placeIds: [OTHER_PLACE.id],
      }),
      [PLACE, OTHER_PLACE],
    )

    expect(harbor?.shapes).toEqual(court?.shapes)
    expect(harbor?.placeLabel).toBe("Test harbor")
    expect(court?.placeLabel).toBe("Test court")
  })

  it("keeps every shape inside the scene's own view box", () => {
    for (const kind of [
      "travel",
      "assembly",
      "campaign",
      "foundation",
      "exchange",
      "plain",
    ] as const) {
      const shapes = localSceneShapes(kind)

      expect(shapes.length, kind).toBeGreaterThan(0)
      // The selection cue is part of every composition: the scene always shows
      // which event it belongs to.
      expect(
        shapes.filter((shape) => shape.shape === "marker").length,
        `${kind} has a selection marker`,
      ).toBe(1)

      for (const shape of shapes) {
        expect(shape.x, `${kind} ${shape.shape} x`).toBeGreaterThanOrEqual(0)
        expect(shape.y, `${kind} ${shape.shape} y`).toBeLessThanOrEqual(40)
        expect(shape.width, `${kind} ${shape.shape} width`).toBeGreaterThan(0)
        expect(shape.height, `${kind} ${shape.shape} height`).toBeGreaterThan(0)
        expect(shape.x + shape.width, `${kind} ${shape.shape} right edge`).toBeLessThanOrEqual(100)
        expect(shape.y - shape.height, `${kind} ${shape.shape} top edge`).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe("the scene never supplies a place or a position", () => {
  it("draws nothing for a record that names no place", () => {
    const scene = localSceneFor(
      event({
        eventTypes: ["occurrence"],
        placement: { kind: "none", placeId: null, label: null, reason: "no-place" },
        placeIds: [],
      }),
      [PLACE],
    )

    expect(scene).toBeNull()
  })

  it("keeps the record's own statement when the atlas does not place the event", () => {
    const scene = localSceneFor(
      event({
        eventTypes: ["journey"],
        placement: {
          kind: "none",
          placeId: NOWHERE.id,
          label: NOWHERE.label,
          reason: "no-position",
        },
        placeIds: [NOWHERE.id],
      }),
      [PLACE, NOWHERE],
    )

    expect(scene?.placeLabel).toBe("Test unknown")
    expect(scene?.positionNote).toContain("no identification is sourced for it")
  })

  it("states no position claim when the atlas does place the event", () => {
    const scene = localSceneFor(event({ eventTypes: ["journey"] }), [PLACE])

    expect(scene?.positionNote).toBeNull()
    expect(scene?.place?.position).not.toBeNull()
  })
})

describe("the notice says what the drawing is and is not", () => {
  it("names the place, the record's own types, and the missing sourcing", () => {
    const scene = localSceneFor(event({ eventTypes: ["journey", "mission"] }), [PLACE])
    const notice = localSceneNotice(scene!)

    expect(notice).toContain("not a reconstruction of Test harbor")
    expect(notice).toContain("(journey, mission)")
    expect(notice).toContain("same shapes are drawn for every event that publishes them")
    expect(notice).toContain("no position, extent, or distance")
  })

  it("reads for every kind the atlas can draw", () => {
    for (const type of ["occurrence", "process", "journey", "campaign", "mission", "founding"]) {
      const scene = localSceneFor(event({ eventTypes: [type] }), [PLACE])

      expect(scene, type).not.toBeNull()
      expect(localSceneNotice(scene!), type).toContain("not a reconstruction of Test harbor")
      // The card prints the record's own type, never a classification of its own.
      expect(scene?.eventTypes, type).toEqual([type])
    }
  })
})

describe("the published types of real chapter records", () => {
  function sceneFor(eventId: string) {
    const record = CHAPTER.events.find((candidate) => candidate.id === eventId)

    if (record === undefined) {
      throw new Error(`${eventId} is not in the chapter`)
    }

    const scene = localSceneFor(record, CHAPTER.places)

    if (scene === null) {
      throw new Error(`${eventId} draws no scene`)
    }

    return scene
  }

  it("does not turn a journey record into a sea voyage", () => {
    // 東大寺 installation: published as `journey`, and the record describes the
    // capital and the temple, not a sea passage.
    const scene = sceneFor("lks:event:todaiji-installation-754")

    expect(scene.eventTypes).toEqual(["journey"])
    expect(scene.kind).toBe("travel")
    expect(scene.shapes.map((shape) => shape.shape)).not.toContain("hull")
    expect(localSceneNotice(scene)).not.toContain("voyage")
  })

  it("prints a record's own types rather than a classification of the atlas's", () => {
    // 揚州 invitation: published as `mission, exchange`, and the record describes
    // an invitation at a temple.
    const scene = sceneFor("lks:event:yangzhou-invitation-753")

    expect(scene.eventTypes).toEqual(["mission", "exchange"])
    expect(localSceneNotice(scene)).toContain("(mission, exchange)")
    expect(localSceneNotice(scene)).not.toContain("court act")
  })
})
