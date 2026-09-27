import type { Chapter } from "./domain"

/**
 * Synthetic test chapter.
 *
 * Focused unit tests use this instead of the reviewed chapter when they need
 * spans the real content does not contain — a decade-precision occurrence, an
 * event that starts inside the window and ends beyond it, a place with no
 * position. Nothing in the app imports it: the atlas renders the reviewed
 * chapter through `chapter-content.ts`, and `check-static-build.mjs` fails the
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
      placement: "approximate",
      precision: "locality",
      position: { lon: 129.9, lat: 32.8 },
    },
    {
      id: "place-inland-plain",
      label: "Sample plain",
      placement: "display-anchor",
      precision: "unspecified",
      position: { lon: 120.6, lat: 34.3 },
    },
    {
      id: "place-southern-bay",
      label: "Sample bay",
      placement: "approximate",
      precision: "region",
      position: { lon: 122.1, lat: 24.9 },
    },
    {
      id: "place-island-stop",
      label: "Sample island",
      placement: "unknown",
      precision: "unspecified",
      position: null,
    },
  ],
  events: [
    {
      id: "event-harbor-assembly",
      title: "Fixture assembly",
      placement: {
        kind: "point",
        placeId: "place-north-harbor",
        label: "Sample harbor",
        basis: "approximate",
        precision: "locality",
        position: { lon: 129.9, lat: 32.8 },
      },
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
    },
    {
      id: "event-coastal-crossing",
      title: "Fixture crossing",
      placement: {
        kind: "point",
        placeId: "place-southern-bay",
        label: "Sample bay",
        basis: "approximate",
        precision: "region",
        position: { lon: 122.1, lat: 24.9 },
      },
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
    },
    {
      id: "event-plain-workshop",
      title: "Fixture workshop",
      placement: {
        kind: "point",
        placeId: "place-inland-plain",
        label: "Sample plain",
        basis: "display-anchor",
        precision: "unspecified",
        position: { lon: 120.6, lat: 34.3 },
      },
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
    },
    {
      id: "event-island-landfall",
      title: "Fixture landfall",
      placement: {
        kind: "none",
        placeId: "place-island-stop",
        label: "Sample island",
        reason: "no-position",
      },
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
    },
    {
      id: "event-archive-transfer",
      title: "Fixture transfer",
      placement: {
        kind: "point",
        placeId: "place-inland-plain",
        label: "Sample plain",
        basis: "display-anchor",
        precision: "unspecified",
        position: { lon: 120.6, lat: 34.3 },
      },
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
    },
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
