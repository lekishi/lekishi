/**
 * Regenerates `src/lib/dev/wikidata-ancient.json`: every Wikidata item with a
 * point in time or start time before 100 CE and a coordinate, for the
 * `/dev/wikidata` stress page.
 *
 * This is test data for the engine, never chapter content. Wikidata is CC0, so
 * the snapshot can be checked in. It is not reviewed, though, and RFD 2 treats
 * Wikidata as a lead list and gazetteer, never as the source of an event. Run it
 * by hand when the snapshot should be refreshed:
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/dev/fetch-wikidata-ancient.mjs
 *
 * (`NODE_USE_ENV_PROXY` is only needed behind an HTTPS proxy.)
 */
import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { format, resolveConfig } from "prettier"

const endpoint = "https://query.wikidata.org/sparql"
const output = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/lib/dev/wikidata-ancient.json",
)

// Before 100 CE and after the last glaciation: the query also matches geological
// epochs, which carry a start time and a type-locality coordinate.
const query = `
SELECT ?item ?label ?time ?precision ?end ?endPrecision ?coord
       (GROUP_CONCAT(DISTINCT ?classLabel; separator="|") AS ?classes)
WHERE {
  ?item p:P585|p:P580 ?statement.
  ?statement psv:P585|psv:P580 ?value.
  ?value wikibase:timeValue ?time; wikibase:timePrecision ?precision.
  FILTER(?time < "0101-01-01T00:00:00Z"^^xsd:dateTime && ?time >= "-10000-01-01T00:00:00Z"^^xsd:dateTime)
  ?item wdt:P625 ?coord.
  ?item rdfs:label ?label. FILTER(LANG(?label) = "en")
  OPTIONAL { ?item p:P582/psv:P582 ?endValue. ?endValue wikibase:timeValue ?end; wikibase:timePrecision ?endPrecision. }
  OPTIONAL { ?item wdt:P31 ?class. ?class rdfs:label ?classLabel. FILTER(LANG(?classLabel) = "en") }
}
GROUP BY ?item ?label ?time ?precision ?end ?endPrecision ?coord
`

const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}`, {
  headers: {
    Accept: "application/sparql-results+json",
    // Wikidata refuses anonymous clients and rate-limits generic ones.
    "User-Agent": "lekishi-dev-fixture/0.1 (https://github.com/lekishi/lekishi)",
  },
})
if (!response.ok) {
  throw new Error(`Wikidata answered ${response.status}: ${await response.text()}`)
}
const { results } = await response.json()

/** Wikidata's astronomical year (`-0217` is 218 BCE), which is the atlas's own ordinal. */
function year(time) {
  return Number(/^([+-]?\d+)-/.exec(time)[1])
}

/** Wikidata precision 11 is a day, 10 a month, 9 a year, 8 a decade, 7 a century, 6 a millennium. */
function precision(value) {
  const code = Number(value)
  if (code >= 11) return "day"
  if (code === 10) return "month"
  if (code === 9) return "year"
  if (code === 8) return "decade"
  return code === 7 ? "century" : "millennium"
}

const items = new Map()
for (const row of results.bindings) {
  const id = row.item.value.split("/").pop()
  const classes = row.classes.value ? row.classes.value.split("|").sort() : []
  // Eclipses are a third of the matches and are computed, not recorded events.
  if (classes.some((name) => name.includes("eclipse")) || /eclipse/i.test(row.label.value)) continue
  const point = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/.exec(row.coord.value)
  if (point === null) continue
  // An item with several dates or coordinates keeps its first; the page is a
  // density test, and a second statement is usually a variant of the first.
  if (items.has(id)) continue
  items.set(id, {
    id,
    label: row.label.value,
    start: year(row.time.value),
    startPrecision: precision(row.precision.value),
    end: row.end ? year(row.end.value) : null,
    endPrecision: row.endPrecision ? precision(row.endPrecision.value) : null,
    lon: Number(point[1]),
    lat: Number(point[2]),
    classes,
  })
}

const sorted = [...items.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
// Written through Prettier so the checked-in snapshot passes `pnpm lint` as it is.
const json = JSON.stringify({
  retrieved: new Date().toISOString().slice(0, 10),
  license: "CC0-1.0",
  items: sorted,
})
writeFileSync(output, await format(json, { ...(await resolveConfig(output)), filepath: output }))
console.log(`wrote ${sorted.length} items to ${path.relative(process.cwd(), output)}`)
