import type { Chapter, DatePrecision, HistoricalEvent, Occurrence, Place } from "$lib/atlas/domain"

/**
 * The `/dev/wikidata` stress chapter: a CC0 snapshot of every Wikidata item
 * dated before 100 CE that has a coordinate
 * (`scripts/dev/fetch-wikidata-ancient.mjs`), projected straight into the
 * atlas's domain so the workspace can be tried with hundreds of events across
 * the globe long before reviewed chapters reach that size.
 *
 * It is not content. Nothing here was reviewed, RFD 2 treats Wikidata as a lead
 * list and gazetteer rather than the source of an event, and the page that shows
 * it is built on the dev server and previews only. Its id is not a chapter id,
 * so it never enters the catalog, the search index or the chapter switcher.
 */

export type WikidataItem = {
  readonly id: string
  readonly label: string
  /** Astronomical year (1 BCE is 0), as Wikidata stores it and the atlas counts. */
  readonly start: number
  readonly startPrecision: DatePrecision | "millennium"
  readonly end: number | null
  readonly endPrecision: DatePrecision | "millennium" | null
  readonly lon: number
  readonly lat: number
  readonly classes: readonly string[]
}

export type WikidataSnapshot = {
  readonly retrieved: string
  readonly license: string
  readonly items: readonly WikidataItem[]
}

export const WIKIDATA_CHAPTER_ID = "dev-wikidata-before-100"

// How many years a coarse Wikidata date can mean. A decade, century or
// millennium value is one occurrence somewhere inside that span, never a
// duration and never its first year.
const SPAN: Record<WikidataItem["startPrecision"], number> = {
  day: 0,
  month: 0,
  year: 0,
  decade: 9,
  century: 99,
  millennium: 999,
}

function precisionOf(value: WikidataItem["startPrecision"]): DatePrecision {
  // The atlas's vocabulary stops at a century; a millennium keeps its whole
  // span in the years, so only the label is coarser than the data.
  return value === "millennium" ? "century" : value
}

export function occurrenceOf(item: WikidataItem): Occurrence {
  if (item.end !== null && item.end >= item.start) {
    return {
      startYear: item.start,
      endYear: item.end,
      precision: precisionOf(item.startPrecision),
      mode: "duration",
      sourceExpression: null,
    }
  }

  const span = SPAN[item.startPrecision]
  return {
    startYear: item.start,
    endYear: item.start + span,
    precision: precisionOf(item.startPrecision),
    mode: span === 0 ? "instant" : "occurrence_window",
    sourceExpression: null,
  }
}

// Items that share a coordinate share a place, the way the atlas draws one
// marker with a count for a place with many events (RFD 1, "Places first").
// Wikidata repeats coordinates exactly, so four decimals (about 10 m) only
// merges what is already the same point.
function placeKey(item: WikidataItem): string {
  return `${item.lon.toFixed(4)},${item.lat.toFixed(4)}`
}

export function wikidataChapter(snapshot: WikidataSnapshot): Chapter {
  const groups = new Map<string, WikidataItem[]>()
  for (const item of snapshot.items) {
    const key = placeKey(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  const placeIdByKey = new Map<string, string>()
  const places: Place[] = [...groups.values()].map((items) => {
    const [first] = items
    const id = `wd-place-${first.id}`
    placeIdByKey.set(placeKey(first), id)
    return {
      id,
      label: items.length === 1 ? first.label : `${first.label} +${items.length - 1}`,
      aliases: items.map((item) => item.label),
      romanization: null,
      lang: "en",
      placement: "approximate",
      precision: "locality",
      position: { lon: first.lon, lat: first.lat },
      placementNote: `Wikidata's coordinate for ${first.id}, unreviewed.`,
    }
  })

  const events: HistoricalEvent[] = snapshot.items.map((item) => {
    const placeId = placeIdByKey.get(placeKey(item)) as string
    return {
      id: `wd-${item.id}`,
      title: item.label,
      placement: {
        kind: "point",
        placeId,
        label: item.label,
        basis: "approximate",
        precision: "locality",
        position: { lon: item.lon, lat: item.lat },
      },
      placeIds: [placeId],
      occurrence: occurrenceOf(item),
      note: item.classes.length > 0 ? item.classes.join(", ") : "No class on Wikidata.",
      dispute: null,
      coda: false,
      participants: [],
      citations: [
        { sourceId: "wikidata", locatorKind: "item", locator: item.id, quotedText: null },
      ],
    }
  })

  return {
    id: WIKIDATA_CHAPTER_ID,
    title: "Wikidata before 100 CE",
    summary: `${events.length} unreviewed Wikidata items dated before 100 CE, for stress-testing the atlas.`,
    defaultWindow: { start: -499, end: 100 },
    homeView: { lon: 20, lat: 38 },
    places,
    actors: [],
    events,
    relationships: [],
    sources: [
      {
        id: "wikidata",
        title: "Wikidata",
        kind: "dataset",
        edition: `Snapshot of ${snapshot.retrieved}`,
        attribution: "Wikidata, CC0",
        licenseId: snapshot.license,
        url: "https://www.wikidata.org/",
      },
    ],
    story: [],
    publication: {
      setIds: [],
      publishedAt: snapshot.retrieved,
      independence: "unreviewed",
      reviewer: "",
      coverageNote:
        "Every Wikidata item dated before 100 CE with a coordinate, except eclipses. Not reviewed, and not content.",
      reviewNotes: "A development fixture; never published.",
    },
  }
}
