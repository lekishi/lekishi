/**
 * Where a chapter takes place, as its manifest's `region` names it (RFD 2,
 * "Decided: a chapter's region"). The timeline groups chapters into one row
 * per region, so chapters of the same years line up in one column.
 *
 * Regions are geographic, not political: a region keeps its meaning across
 * three thousand years while the kingdoms and empires inside it rise and fall,
 * so no row is ever renamed or split when a state changes. Continents group
 * them, in the order the timeline draws them. A chapter that crosses regions
 * names the one its story centres on.
 *
 * `historical/schema/chapter.schema.json` lists the same keys as its `region`
 * enum; `regions.test.ts` keeps the two in step.
 */

export type Continent = {
  readonly key: string
  readonly name: string
  readonly regions: readonly Region[]
}

export type Region = {
  readonly key: RegionKey
  readonly name: string
  /** What the region covers, in a few words, for its row label. */
  readonly note: string
}

export type RegionKey =
  | "east-asia"
  | "central-asia"
  | "south-asia"
  | "iran-anatolia"
  | "mesopotamia-levant"
  | "mediterranean"
  | "western-europe"
  | "nile"
  | "north-west-africa"
  | "americas"
  | "remote-oceania"

export const CONTINENTS: readonly Continent[] = [
  {
    key: "eurasia",
    name: "Eurasia",
    regions: [
      { key: "east-asia", name: "East Asia", note: "China, Korea, Japan" },
      {
        key: "central-asia",
        name: "Central Asia & the steppe",
        note: "the oases and the Silk Road",
      },
      { key: "south-asia", name: "South Asia & the Indian Ocean", note: "India and its sea lanes" },
      { key: "iran-anatolia", name: "Iran & Anatolia", note: "the Persian heartland westward" },
      { key: "mesopotamia-levant", name: "Mesopotamia & the Levant", note: "the Fertile Crescent" },
      { key: "mediterranean", name: "Mediterranean", note: "Greece, Italy, the islands" },
      { key: "western-europe", name: "Western Europe", note: "Gaul, the Alps and the north" },
    ],
  },
  {
    key: "africa",
    name: "Africa",
    regions: [
      { key: "nile", name: "The Nile", note: "Egypt and Kush" },
      {
        key: "north-west-africa",
        name: "North & West Africa",
        note: "Carthage to the Atlantic coast",
      },
    ],
  },
  {
    key: "americas",
    name: "The Americas",
    regions: [{ key: "americas", name: "The Americas", note: "from the first peoples" }],
  },
  {
    key: "oceania",
    name: "Oceania",
    regions: [{ key: "remote-oceania", name: "Remote Oceania", note: "the Pacific islands" }],
  },
]

/** Every region in drawing order. */
export const REGIONS: readonly Region[] = CONTINENTS.flatMap((continent) => continent.regions)

/** A region by key, with its continent. */
export function regionOf(key: RegionKey): Region & { readonly continent: Continent } {
  const continent = CONTINENTS.find((c) => c.regions.some((r) => r.key === key))
  const region = continent?.regions.find((r) => r.key === key)

  if (continent === undefined || region === undefined) throw new Error(`unknown region ${key}`)

  return { ...region, continent }
}
