import type { Chapter } from "./domain"

/**
 * Synthetic foundation fixture.
 *
 * This is placeholder geometry and placeholder events used only to exercise the
 * workspace, the renderer boundary, and the production asset pipeline while the
 * RFD 2 content and time contracts are still being written. Nothing here is a
 * historical claim: the names are invented, the dates are arbitrary, and the UI
 * labels the chapter as synthetic. Replace it wholesale with reviewed content;
 * do not grow it into a dataset.
 */
export const FIXTURE_CHAPTER: Chapter = {
  id: "synthetic-foundation-fixture",
  title: "Synthetic foundation fixture",
  synthetic: true,
  defaultWindow: { start: 1200, end: 1250 },
  homeView: { lon: 128.5, lat: 32.5 },
  places: [
    {
      id: "place-north-harbor",
      label: "Sample harbor",
      position: { lon: 129.9, lat: 32.8 },
      locationPrecision: "approximate",
    },
    {
      id: "place-inland-plain",
      label: "Sample plain",
      position: { lon: 120.6, lat: 34.3 },
      locationPrecision: "display-anchor",
    },
    {
      id: "place-southern-bay",
      label: "Sample bay",
      position: { lon: 122.1, lat: 24.9 },
      locationPrecision: "approximate",
    },
    {
      id: "place-island-stop",
      label: "Sample island",
      position: { lon: 135.5, lat: 34.2 },
      locationPrecision: "approximate",
    },
  ],
  events: [
    {
      id: "event-harbor-assembly",
      title: "Fixture assembly",
      placeId: "place-north-harbor",
      occurrence: { startYear: 1204, endYear: 1204, precision: "year" },
      note: "Synthetic event used to check selection, details, and camera following.",
      synthetic: true,
    },
    {
      id: "event-coastal-crossing",
      title: "Fixture crossing",
      placeId: "place-southern-bay",
      occurrence: { startYear: 1218, endYear: 1220, precision: "year" },
      note: "Synthetic multi-year occurrence used to check bounded spans and playhead activity.",
      synthetic: true,
    },
    {
      id: "event-plain-workshop",
      title: "Fixture workshop",
      placeId: "place-inland-plain",
      occurrence: { startYear: 1228, endYear: 1236, precision: "decade" },
      note: "Synthetic uncertain occurrence used to check possible-match filtering.",
      synthetic: true,
    },
    {
      id: "event-island-landfall",
      title: "Fixture landfall",
      placeId: "place-island-stop",
      occurrence: { startYear: 1244, endYear: 1244, precision: "year" },
      note: "Synthetic event used to check chronological stepping across the window.",
      synthetic: true,
    },
    {
      id: "event-archive-transfer",
      title: "Fixture transfer",
      placeId: "place-inland-plain",
      occurrence: { startYear: 1249, endYear: 1251, precision: "year" },
      note: "Synthetic occurrence that starts inside the default window and ends beyond it.",
      synthetic: true,
    },
  ],
}
