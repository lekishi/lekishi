import type { Chapter } from "./domain"

/**
 * Synthetic test chapter.
 *
 * Focused unit tests use this instead of the reviewed chapter when they need
 * spans the real content does not contain — a decade-precision occurrence, an
 * event that starts inside the window and ends beyond it, a place with no
 * position. Nothing in the app imports it: the atlas renders served
 * chapters through `chapter-catalog.ts`, and `check-static-build.mjs` fails the
 * build if any of these strings reach the artifact.
 *
 * Nothing here is a historical claim: the names are invented and the dates are
 * arbitrary.
 */
export const FIXTURE_CHAPTER: Chapter = {
  id: "synthetic-test-chapter",
  title: "Synthetic test chapter",
  summary: "Invented spans used to exercise the atlas behavior, not historical content.",
  defaultWindow: { start: 1200, end: 1250 },
  homeView: { lon: 128.5, lat: 32.5 },
  places: [
    {
      id: "place-north-harbor",
      label: "Sample harbor",
      aliases: ["Sample harbor", "Sample Harbour"],
      placement: "approximate",
      precision: "locality",
      position: { lon: 129.9, lat: 32.8 },
      placementNote: "Synthetic approximate locality placement.",
    },
    {
      id: "place-inland-plain",
      label: "Sample plain",
      aliases: ["Sample plain"],
      placement: "display-anchor",
      precision: "unspecified",
      position: { lon: 120.6, lat: 34.3 },
      placementNote: "Synthetic label anchor; no historical coordinate is asserted.",
    },
    {
      id: "place-southern-bay",
      label: "Sample bay",
      aliases: ["Sample bay", "Sample Bay"],
      placement: "approximate",
      precision: "region",
      position: { lon: 122.1, lat: 24.9 },
      placementNote: null,
    },
    {
      id: "place-island-stop",
      label: "Sample island",
      aliases: ["Sample island"],
      placement: "unknown",
      precision: "unspecified",
      position: null,
      placementNote: "Synthetic place with no sourced position.",
    },
  ],
  events: [
    {
      id: "event-harbor-assembly",
      title: "Fixture assembly",
      eventTypes: ["journey"],
      placement: {
        kind: "point",
        placeId: "place-north-harbor",
        label: "Sample harbor",
        basis: "approximate",
        precision: "locality",
        position: { lon: 129.9, lat: 32.8 },
      },
      placeIds: ["place-north-harbor"],
      occurrence: {
        startYear: 1204,
        endYear: 1204,
        precision: "year",
        mode: "instant",
        sourceExpression: null,
      },
      note: "Synthetic event used to check selection, details, and camera following.",
      dispute: null,
      coda: false,
      participants: [{ actorId: "actor-fixture-envoy", role: "leader" }],
      citations: [
        {
          sourceId: "source-fixture-chronicle",
          locatorKind: "entry",
          locator: "Fixture entry 1",
          quotedText: null,
        },
      ],
    },
    {
      id: "event-coastal-crossing",
      title: "Fixture crossing",
      eventTypes: ["journey"],
      placement: {
        kind: "point",
        placeId: "place-southern-bay",
        label: "Sample bay",
        basis: "approximate",
        precision: "region",
        position: { lon: 122.1, lat: 24.9 },
      },
      placeIds: ["place-southern-bay"],
      occurrence: {
        startYear: 1218,
        endYear: 1220,
        precision: "year",
        mode: "occurrence_window",
        sourceExpression: null,
      },
      note: "Synthetic uncertain occurrence used to check bounded spans and playhead activity.",
      dispute: null,
      coda: false,
      participants: [],
      citations: [],
    },
    {
      id: "event-plain-workshop",
      title: "Fixture workshop",
      eventTypes: ["process"],
      placement: {
        kind: "point",
        placeId: "place-inland-plain",
        label: "Sample plain",
        basis: "display-anchor",
        precision: "unspecified",
        position: { lon: 120.6, lat: 34.3 },
      },
      placeIds: ["place-inland-plain"],
      occurrence: {
        startYear: 1228,
        endYear: 1236,
        precision: "decade",
        mode: "duration",
        sourceExpression: null,
      },
      note: "Synthetic decade-precision span used to check possible-match filtering.",
      dispute: null,
      coda: false,
      participants: [{ actorId: "actor-fixture-envoy", role: "participant" }],
      citations: [],
    },
    {
      id: "event-island-landfall",
      title: "Fixture landfall",
      eventTypes: ["occurrence"],
      placement: {
        kind: "none",
        placeId: "place-island-stop",
        label: "Sample island",
        reason: "no-position",
      },
      placeIds: ["place-island-stop"],
      occurrence: {
        startYear: 1244,
        endYear: 1244,
        precision: "year",
        mode: "instant",
        sourceExpression: null,
      },
      note: "Synthetic event with no published position, used to check list-only events.",
      dispute: null,
      coda: false,
      participants: [],
      citations: [],
    },
    {
      id: "event-archive-transfer",
      title: "Fixture transfer",
      eventTypes: ["exchange"],
      placement: {
        kind: "point",
        placeId: "place-inland-plain",
        label: "Sample plain",
        basis: "display-anchor",
        precision: "unspecified",
        position: { lon: 120.6, lat: 34.3 },
      },
      placeIds: ["place-inland-plain"],
      occurrence: {
        startYear: 1249,
        endYear: 1251,
        precision: "year",
        mode: "duration",
        sourceExpression: null,
      },
      note: "Synthetic occurrence that starts inside the default window and ends beyond it.",
      dispute: null,
      coda: false,
      participants: [],
      citations: [],
    },
  ],
  actors: [
    {
      id: "actor-fixture-envoy",
      label: "Sample envoy",
      aliases: ["Sample envoy", "Sample Envoy"],
      types: ["person"],
    },
  ],
  sources: [
    {
      id: "source-fixture-chronicle",
      title: "Synthetic chronicle",
      kind: "primary",
      edition: null,
      attribution: "Synthetic test source, not historical content.",
      licenseId: "public-domain",
      url: null,
    },
  ],
  story: [
    { recordId: "event-harbor-assembly", caption: "Fixture assembly", kind: "event" },
    { recordId: "event-coastal-crossing", caption: "Fixture crossing", kind: "event" },
    { recordId: "event-plain-workshop", caption: "Fixture workshop", kind: "event" },
    { recordId: "event-island-landfall", caption: "Fixture landfall", kind: "event" },
    { recordId: "event-archive-transfer", caption: "Fixture transfer", kind: "event" },
  ],
  publication: {
    setIds: ["lks:set:synthetic-test"],
    publishedAt: "2026-09-24T00:00:00Z",
    independence: "self_review",
    reviewer: "Synthetic test fixture",
    coverageNote: "Synthetic test content, not historical content.",
    reviewNotes: "Synthetic test content, not historical content.",
  },
}
