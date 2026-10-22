import { isList, isObject, type JsonObject, type JsonValue } from "../contract/types"
import { compileTime } from "./dates"

/**
 * One record file compiled into the contract's v0 content and claims.
 *
 * A record file is flat YAML with each citation attached to the field it
 * supports (RFD 2, "Decided: the record file"). The compiler turns every `cite`
 * into a v0 claim whose `asserts` pointer names that field, so an author never
 * writes a JSON pointer, and it expands short ids (`place: akimeya`) into the
 * contract's full ids. Nothing here interprets history: every value is carried
 * into the contract unchanged, and the contract's own validator then judges the
 * result exactly as it judged hand-written v0 documents.
 *
 * Claim ids and statements are content. A statement is what the reader is told
 * the source says, and a name or geometry links to its supporting claim by id,
 * so an author may name a claim (`id:`) and the compiler keeps it; an unnamed
 * claim gets an id from its record and field.
 */

export type RecordKind = "place" | "actor" | "event" | "relationship" | "territory"

export const RECORD_KINDS: readonly RecordKind[] = [
  "place",
  "actor",
  "event",
  "relationship",
  "territory",
]

/** What a record file may refer to outside itself. */
export type Lookup = {
  /** The full id of a record named `name`, among the kinds a field allows. */
  readonly record: (name: string, kinds: readonly string[], where: string) => string
  /** The locator kind a source declares for its citations. */
  readonly locator: (source: string, where: string) => string
}

export type CompiledRecord = {
  readonly content: JsonObject
  readonly claims: JsonObject[]
  readonly dispute?: JsonObject
}

/**
 * The author's spelling of a claim basis; `interpretation` is v0's
 * `cited_interpretation`, and `conventional` and `tradition` keep their names.
 */
const BASES: Record<string, string> = {
  attested: "attested",
  interpretation: "cited_interpretation",
  conventional: "conventional",
  tradition: "tradition",
}

/** Fields that compile to a differently named v0 field (`types` is per kind). */
const RENAMED: Record<string, string> = {
  notes: "editorial_notes",
  modern: "modern_equivalents",
  at: "geometry",
  date: "time",
}

function list(value: JsonValue | undefined): JsonValue[] {
  if (value === undefined) {
    return []
  }

  return isList(value) ? value : [value]
}

function entries(value: JsonValue | undefined): JsonObject[] {
  return list(value).filter(isObject)
}

/** Copies the listed optional fields that are present, under their v0 names. */
function copy(from: JsonObject, fields: Record<string, string>): JsonObject {
  const result: JsonObject = {}

  for (const [written, compiled] of Object.entries(fields)) {
    if (from[written] !== undefined) {
      result[compiled] = from[written]
    }
  }

  return result
}

class Claims {
  private readonly claims: { readonly key: string; readonly claim: JsonObject }[] = []
  private readonly counts = new Map<string, number>()

  constructor(
    private readonly record: string,
    private readonly lookup: Lookup,
  ) {}

  /**
   * The claims in the order the record file writes them: by the position of the
   * top-level field each cite sits under, and in written order within a field.
   * The card shows a record's first quoted claim, so this order is what a reader
   * meets first, and an author sets it by where a cite is written.
   */
  ordered(data: JsonObject): JsonObject[] {
    const keys = Object.keys(data)
    const position = (key: string) => {
      const index = keys.indexOf(key)

      return index === -1 ? keys.length : index
    }

    return this.claims
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => position(a.key) - position(b.key) || a.index - b.index)
      .map((entry) => entry.claim)
  }

  /** Compiles the `cite` of one field into claims asserting `pointer`; returns their ids. */
  add(pointer: string, cite: JsonValue | undefined, where: string): string[] {
    return entries(cite).map((entry, index) =>
      this.claim(pointer, entry, `${where}.cite[${index}]`),
    )
  }

  /** The id an unnamed claim gets: the record, the field it supports, and a count. */
  private generatedId(pointer: string): string {
    const field =
      pointer === "" ? "record" : pointer.slice(1).replaceAll("/", "-").replaceAll("_", "-")
    const seen = (this.counts.get(field) ?? 0) + 1

    this.counts.set(field, seen)

    return `${this.record}-${field}${seen === 1 ? "" : `-${seen}`}`
  }

  private claim(pointer: string, entry: JsonObject, where: string): string {
    const name = entry["id"] === undefined ? this.generatedId(pointer) : String(entry["id"])
    const basis = BASES[String(entry["basis"] ?? "attested")]

    if (basis === undefined) {
      throw new Error(
        `${where}: basis is attested, interpretation, conventional or tradition, not ${String(entry["basis"])}`,
      )
    }

    const sources = entry["sources"] === undefined ? [entry] : entries(entry["sources"])
    const claim: JsonObject = {
      claim_id: `lks:claim:${name}`,
      statement: entry["says"] as string,
      asserts: pointer,
      basis,
      role: (entry["role"] as string | undefined) ?? "main",
      citations: sources.map((source, index) =>
        this.citation(source, `${where}.sources[${index}]`),
      ),
    }

    if (entry["attributed_to"] !== undefined) {
      claim["attributed_to"] = entry["attributed_to"]
    }

    if (entry["convention"] !== undefined) {
      claim["convention"] = entry["convention"]
    }

    // `where` starts with the top-level field the cite is written under.
    this.claims.push({ key: /^[a-z_]+/.exec(where)?.[0] ?? "", claim })

    return String(claim["claim_id"])
  }

  private citation(entry: JsonObject, where: string): JsonObject {
    const source = String(entry["source"])
    const citation: JsonObject = {
      source_id: `lks:source:${source}`,
      locator: {
        kind: (entry["locator"] as string | undefined) ?? this.lookup.locator(source, where),
        value: String(entry["at"]),
      },
    }

    if (entry["quote"] !== undefined) {
      citation["quoted_text"] = entry["quote"]
    }

    return citation
  }

  /** The full id of a claim this record names, which must be one it carries. */
  named(name: string, where: string): string {
    const id = `lks:claim:${name}`

    if (!this.claims.some((entry) => entry.claim["claim_id"] === id)) {
      throw new Error(`${where}: claim ${name} is not one of this record's claims`)
    }

    return id
  }
}

/**
 * The claim a name or geometry links to: the one it names with `claim:`, or else
 * its own first main claim, or else its own first claim.
 */
function linkedClaim(
  claims: Claims,
  entry: JsonObject,
  own: string[],
  roles: JsonObject[],
  where: string,
): string | undefined {
  if (entry["claim"] !== undefined) {
    return claims.named(String(entry["claim"]), where)
  }

  const main = own.find((_, index) => (roles[index]?.["role"] ?? "main") === "main")

  return main ?? own[0]
}

function names(claims: Claims, value: JsonValue | undefined, where: string): JsonObject[] {
  const all = entries(value)

  // A name's claim may be another name's (an alternate form attested by the same
  // passage), so every name's own claims exist before any link is resolved.
  const own = all.map((name, index) =>
    claims.add(`/names/${index}`, name["cite"], `${where}[${index}]`),
  )

  return all.map((name, index) => {
    const compiled: JsonObject = {
      form: name["form"] as string,
      script: name["script"] as string,
      language: name["lang"] as string,
      role: (name["role"] as string | undefined) ?? (index === 0 ? "primary" : "alternate"),
    }

    if (name["roman"] !== undefined) {
      compiled["romanization"] = {
        value: name["roman"] as string,
        scheme: name["scheme"] as string,
        origin: (name["origin"] as string | undefined) ?? "editorial",
        pronunciation_claim: (name["pronunciation"] as boolean | undefined) ?? false,
      }
    }

    const claim = linkedClaim(claims, name, own[index], entries(name["cite"]), `${where}[${index}]`)

    if (claim !== undefined) {
      compiled["claim_id"] = claim
    }

    if (name["note"] !== undefined) {
      compiled["note"] = name["note"]
    }

    return compiled
  })
}

function geometry(claims: Claims, value: JsonValue | undefined, where: string): JsonObject[] {
  const all = entries(value)
  const own = all.map((entry, index) =>
    claims.add(`/geometry/${index}`, entry["cite"], `${where}[${index}]`),
  )

  return all.map((entry, index) => {
    const claim = linkedClaim(
      claims,
      entry,
      own[index],
      entries(entry["cite"]),
      `${where}[${index}]`,
    )

    if (claim === undefined) {
      throw new Error(`${where}[${index}]: a position needs a cite or a claim`)
    }

    const geojson =
      entry["point"] !== undefined
        ? { type: "Point", coordinates: entry["point"] }
        : (entry["geojson"] ?? null)

    return {
      claim_id: claim,
      interpretation: entry["interpretation"] as string,
      geojson,
      precision: entry["precision"] as string,
      ...copy(entry, { notes: "notes" }),
    }
  })
}

function time(claims: Claims, block: JsonValue | undefined, pointer: string, where: string) {
  if (!isObject(block)) {
    throw new Error(`${where} is missing`)
  }

  claims.add(pointer, block["cite"], where)

  try {
    return compileTime(block)
  } catch (error) {
    throw new Error(`${where}: ${(error as Error).message}`)
  }
}

/** Field-level citations of a list or text field, which has no mapping of its own to carry `cite`. */
function fieldCites(claims: Claims, kind: RecordKind, data: JsonObject): void {
  const cites = isObject(data["cites"]) ? data["cites"] : {}

  for (const [field, cite] of Object.entries(cites)) {
    const compiled =
      field === "types"
        ? `${kind}_types`
        : field === "date" && kind === "relationship"
          ? "validity"
          : field === "controller"
            ? "controller_id"
            : (RENAMED[field] ?? field)

    claims.add(`/${compiled}`, cite, `cites.${field}`)
  }
}

function place(claims: Claims, data: JsonObject): JsonObject {
  return {
    summary: data["summary"] as string,
    names: names(claims, data["names"], "names"),
    place_types: data["types"] as JsonValue,
    geometry: geometry(claims, data["at"], "at"),
    ...modern(data["modern"]),
    ...copy(data, { external_ids: "external_ids", notes: "editorial_notes" }),
  }
}

function modern(value: JsonValue | undefined): JsonObject {
  if (value === undefined) {
    return {}
  }

  return {
    modern_equivalents: entries(value).map((entry) => ({
      form: entry["form"] as string,
      language: entry["lang"] as string,
      ...copy(entry, { script: "script", note: "note" }),
    })),
  }
}

function actor(claims: Claims, data: JsonObject): JsonObject {
  const content: JsonObject = {
    summary: data["summary"] as string,
    names: names(claims, data["names"], "names"),
    actor_types: data["types"] as JsonValue,
  }

  if (data["roles"] !== undefined) {
    content["roles"] = entries(data["roles"]).map((role, index) => {
      const where = `roles[${index}]`

      claims.add(`/roles/${index}`, role["cite"], where)

      const compiled: JsonObject = { role: role["role"] as string, ...copy(role, { note: "note" }) }

      if (role["date"] !== undefined) {
        compiled["validity"] = time(
          claims,
          role["date"],
          `/roles/${index}/validity`,
          `${where}.date`,
        )
      }

      return compiled
    })
  }

  return { ...content, ...copy(data, { external_ids: "external_ids", notes: "editorial_notes" }) }
}

function event(claims: Claims, data: JsonObject, lookup: Lookup): JsonObject {
  const content: JsonObject = {
    summary: data["summary"] as string,
    event_types: data["types"] as JsonValue,
    time: time(claims, data["date"], "/time", "date"),
  }

  if (data["places"] !== undefined) {
    content["places"] = entries(data["places"]).map((entry, index) => {
      const where = `places[${index}]`

      claims.add(`/places/${index}`, entry["cite"], where)

      return {
        place_id: lookup.record(String(entry["place"]), ["place"], where),
        role: entry["role"] as string,
        ...copy(entry, { note: "note" }),
      }
    })
  }

  if (data["participants"] !== undefined) {
    content["participants"] = entries(data["participants"]).map((entry, index) => {
      const where = `participants[${index}]`

      claims.add(`/participants/${index}`, entry["cite"], where)

      return {
        actor_id: lookup.record(String(entry["actor"]), ["actor"], where),
        role: entry["role"] as string,
        ...copy(entry, { note: "note" }),
      }
    })
  }

  if (data["part_of"] !== undefined) {
    content["part_of"] = list(data["part_of"]).map((name, index) => ({
      event_id: lookup.record(String(name), ["event"], `part_of[${index}]`),
    }))
  }

  if (data["at"] !== undefined) {
    content["geometry"] = geometry(claims, data["at"], "at")
  }

  return { ...content, ...copy(data, { notes: "editorial_notes" }) }
}

/** A relationship joins any two records; the short id is resolved across kinds. */
const ENDPOINT_KINDS = ["actor", "place", "event", "relationship"]

function relationship(claims: Claims, data: JsonObject, lookup: Lookup): JsonObject {
  const content: JsonObject = {
    summary: data["summary"] as string,
    relationship_types: data["types"] as JsonValue,
    from: lookup.record(String(data["from"]), ENDPOINT_KINDS, "from"),
    to: lookup.record(String(data["to"]), ENDPOINT_KINDS, "to"),
    // A relationship is directed unless the file says otherwise, and asserts no
    // causation unless the file says so: the contract keeps "not asserted"
    // distinct from "none", and an unstated causal link must never be implied.
    directionality: (data["directionality"] as string | undefined) ?? "directed",
    causality: (data["causality"] as string | undefined) ?? "not_asserted",
  }

  if (data["date"] !== undefined) {
    content["validity"] = time(claims, data["date"], "/validity", "date")
  }

  return { ...content, ...copy(data, { notes: "editorial_notes" }) }
}

/**
 * A dated control snapshot (rfd/0002/TERRITORIES.adoc). A held place is written
 * as its short id, or as a mapping when it is the controller's seat, names how
 * it was gained, or carries its own note or cite; without its own cite, an entry
 * is supported by the snapshot's.
 */
function territory(claims: Claims, data: JsonObject, lookup: Lookup): JsonObject {
  const content: JsonObject = {
    summary: data["summary"] as string,
    controller_id: lookup.record(String(data["controller"]), ["actor"], "controller"),
    time: time(claims, data["date"], "/time", "date"),
    places: list(data["places"]).map((written, index) => {
      const where = `places[${index}]`
      const entry: JsonObject = isObject(written) ? written : { place: written }

      claims.add(`/places/${index}`, entry["cite"], where)

      const compiled: JsonObject = {
        place_id: lookup.record(String(entry["place"]), ["place"], where),
        role: (entry["role"] as string | undefined) ?? "held",
      }

      if (entry["gained"] !== undefined) {
        compiled["gained_record_id"] = lookup.record(
          String(entry["gained"]),
          ["event", "relationship"],
          `${where}.gained`,
        )
      }

      return { ...compiled, ...copy(entry, { note: "note" }) }
    }),
  }

  return { ...content, ...copy(data, { notes: "editorial_notes" }) }
}

/** Compiles one record file. Errors name the field they concern. */
export function compileRecord(
  kind: RecordKind,
  name: string,
  data: JsonObject,
  lookup: Lookup,
): CompiledRecord {
  const claims = new Claims(name, lookup)

  claims.add("", data["cite"], "cite")

  const content =
    kind === "place"
      ? place(claims, data)
      : kind === "actor"
        ? actor(claims, data)
        : kind === "event"
          ? event(claims, data, lookup)
          : kind === "relationship"
            ? relationship(claims, data, lookup)
            : territory(claims, data, lookup)

  fieldCites(claims, kind, data)

  const compiled: CompiledRecord = { content, claims: claims.ordered(data) }

  return isObject(data["dispute"]) ? { ...compiled, dispute: data["dispute"] } : compiled
}
