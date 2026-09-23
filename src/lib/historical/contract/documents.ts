import { revisionHash, sourceHash } from "./canonical"
import * as JSONSchema from "./json-schema"
import { astro, normalize } from "./time"
import * as Timestamps from "./timestamps"
import {
  blank,
  isList,
  isNumber,
  isObject,
  isString,
  listOf,
  objectOf,
  type JsonObject,
  type JsonValue,
} from "./types"
import { fileURLToPath } from "node:url"

/**
 * Per-document validation for the v0 historical contract: JSON Schema plus the
 * semantic rules a schema cannot express.
 *
 * The split is deliberate. The schema constrains structure and vocabulary, and
 * the semantics here decide combinations: which endpoints a precision requires,
 * what an interpretation may assert, when a claim needs attribution, and which
 * fields may never carry presentation or invented precision. Semantic checks run
 * only on schema-valid documents, so they can report precise codes instead of
 * defensive type errors.
 *
 * Two denylists are part of the contract, not style preferences. Renderer or
 * presentation keys (`color`, `camera`, playhead state, and similar) must never
 * enter the historical source of truth, and invented-precision keys (`radius`,
 * `confidence`, `probability`, and similar) must never be generated where the
 * evidence supplies none. Both are rejected wherever they appear.
 */

export type Violation = { code: string; where: string; detail: string }

export type DocumentValidation =
  { ok: true; warnings: string[] } | { ok: false; errors: Violation[] }

const PRESENTATION_KEYS = new Set([
  "color",
  "colour",
  "colors",
  "fill",
  "fill_color",
  "stroke",
  "stroke_color",
  "stroke_width",
  "line_width",
  "line_style",
  "dash",
  "opacity",
  "camera",
  "viewport",
  "zoom",
  "cesium",
  "czm",
  "renderer",
  "tileset",
  "sprite",
  "icon",
  "marker",
  "marker_style",
  "symbol",
  "symbol_style",
  "imagery",
  "terrain",
  "terrain_provider",
  "model_url",
  "animation",
  "playhead",
  "layer",
  "layers",
  "map_style",
  "style",
  "css_class",
  "html",
  "tooltip",
  "label_color",
  "highlight_color",
])

const INVENTED_PRECISION_KEYS = new Set([
  "radius",
  "uncertainty_radius",
  "buffer_m",
  "confidence",
  "confidence_percentage",
  "probability",
  "probability_distribution",
  "likelihood",
  "weight",
  "score",
])

// Scripts whose forms cannot be written with ASCII alone. Used only as a sanity
// check that a romanization is not recorded as a local-script form.
const NON_LATIN_SCRIPTS = new Set([
  "Hani",
  "Hira",
  "Kana",
  "Hang",
  "Arab",
  "Hebr",
  "Cyrl",
  "Grek",
  "Deva",
  "Taml",
  "Thai",
  "Khmr",
  "Copt",
  "Armn",
  "Geor",
  "Ethi",
  "Mymr",
  "Mong",
  "Tibt",
  "Java",
  "Kawi",
])

const EVIDENCE_KINDS = new Set(["place", "actor", "event", "relationship"])

const ASSERTED_GEOMETRY = new Set([
  "approximate_point",
  "source_supported_area",
  "attested_itinerary",
  "reconstructed_route",
  "schematic_link",
])

const ROUTE_GEOMETRY = new Set(["attested_itinerary", "reconstructed_route", "schematic_link"])

const DOCUMENT_TYPES = ["record", "source", "publication_set"]

/** The versioned contract tree, derived from this module's own location. */
const contractRoot = new URL("../../../../historical/v0/", import.meta.url)

/** Absolute path of a file in the versioned contract tree. */
export function contractFile(...segments: string[]): string {
  return fileURLToPath(new URL(segments.join("/"), contractRoot))
}

const schemaDirectory = contractFile("schema")

export function validate(document: unknown): DocumentValidation {
  const type = isObject(document) ? document["document"] : undefined

  if (!(isString(type) && DOCUMENT_TYPES.includes(type))) {
    return {
      ok: false,
      errors: [
        error("unknown_document_type", "", "document must be record, source, or publication_set"),
      ],
    }
  }

  const typed = document as JsonObject
  const schema = JSONSchema.validate(schemaPath(type), typed)
  const errors = [
    ...scanReservedKeys(typed),
    ...timestampErrors(typed),
    ...(schema.ok
      ? semanticErrors(typed)
      : schema.violations.map((violation) =>
          error(
            "schema_violation",
            violation.path,
            `${violation.keyword} ${violation.detail} (${where(typed)})`,
          ),
        )),
  ]

  return errors.length === 0 ? { ok: true, warnings: [] } : { ok: false, errors }
}

export function schemaPath(type: string): string {
  return `${schemaDirectory}/${type.replaceAll("_", "-")}.schema.json`
}

export function schemaDir(): string {
  return schemaDirectory
}

/** Codes reported by the semantic checks, for documentation and vector expectations. */
export function codes(): string[] {
  return [
    "record_id_kind_mismatch",
    "duplicate_revision_id",
    "revision_order_not_increasing",
    "revision_hash_mismatch",
    "research_notes_in_published_revision",
    "duplicate_claim_id",
    "claim_pointer_unresolved",
    "interpretation_missing_attribution",
    "claim_without_dispute",
    "multiple_main_claims_for_pointer",
    "unresolved_claim_reference",
    "dispute_summary_missing",
    "dispute_without_alternative_claim",
    "undisputed_with_alternative_claim",
    "no_primary_name",
    "multiple_primary_names",
    "translation_as_primary",
    "primary_name_without_claim",
    "script_form_mismatch",
    "romanization_on_latin_script",
    "attested_romanization_without_claim",
    "editorial_romanization_has_claim",
    "romanization_pronunciation_claim",
    "geometry_missing_geojson",
    "geometry_unknown_has_geojson",
    "geometry_unknown_without_notes",
    "geometry_unknown_with_precision",
    "display_anchor_without_notes",
    "display_anchor_with_precision",
    "geometry_missing_precision",
    "geometry_wrong_type",
    "geometry_claim_pointer_mismatch",
    "attested_itinerary_not_attested",
    "reconstructed_route_not_interpretation",
    "waypoints_not_route",
    "route_without_notes",
    "uncertainty_none_has_extent",
    "uncertainty_extent_missing",
    "uncertainty_without_source_expression",
    "geojson_invalid_structure",
    "geojson_coordinate_out_of_range",
    "geojson_ring_not_closed",
    "geojson_too_few_positions",
    "ordering_without_evidence",
    "ordering_self_reference",
    "part_of_self_reference",
    "relationship_self_reference",
    "causality_without_interpretation",
    "influence_without_interpretation",
    "story_window_start_after_end",
    "story_first_step_not_start",
    "boundary_not_inclusive",
    "other_type_without_note",
    "published_record_without_citation",
    "license_incomplete",
    "duplicate_set_member",
    "checklist_incomplete",
    "published_before_approved",
    "set_supersedes_itself",
    "presentation_field_in_content",
    "invented_precision_field",
    "schema_violation",
    "invalid_timestamp",
    "source_hash_mismatch",
    "unknown_document_type",
  ]
}

function semanticErrors(document: JsonObject): Violation[] {
  if (document["document"] === "record") {
    return recordErrors(document)
  }

  if (document["document"] === "source") {
    return sourceErrors(document)
  }

  return setErrors(document)
}

// --- record documents -------------------------------------------------------

function recordErrors(document: JsonObject): Violation[] {
  const kind = document["kind"]
  const recordId = document["record_id"]
  const revisions = listOf(document["revisions"])
  const publishedRevisionId = getIn(document, ["publication", "published_revision_id"])
  const errors: Violation[] = []

  flag(
    errors,
    !(isString(recordId) && recordId.startsWith(`lks:${isString(kind) ? kind : ""}:`)),
    "record_id_kind_mismatch",
    "/record_id",
    "a stable record id carries its kind segment and never changes with renames or date revisions",
  )

  errors.push(...duplicateRevisionErrors(revisions))
  errors.push(...revisionOrderErrors(revisions))

  revisions.forEach((revision, index) => {
    errors.push(...revisionErrors(revision, index, kind, recordId, publishedRevisionId))
  })

  return errors
}

function duplicateRevisionErrors(revisions: JsonValue[]): Violation[] {
  return duplicates(revisions.map((revision) => valueAt(revision, "revision_id"))).map(
    (revisionId) => error("duplicate_revision_id", "/revisions", String(revisionId)),
  )
}

function revisionOrderErrors(revisions: JsonValue[]): Violation[] {
  const errors: Violation[] = []

  for (let index = 1; index < revisions.length; index += 1) {
    const previous = revisions[index - 1]
    const current = revisions[index]

    // Only real UTC timestamps order revisions; an invalid value is reported by
    // timestampErrors rather than silently winning the comparison.
    flag(
      errors,
      Timestamps.compare(valueAt(current, "created_at"), valueAt(previous, "created_at")) === "lt",
      "revision_order_not_increasing",
      "/revisions",
      `revisions are appended oldest first; ${String(valueAt(current, "revision_id"))} precedes its predecessor`,
    )
  }

  return errors
}

// Editorial metadata timestamps are real-world UTC instants, so they must parse
// before they take part in any ordering. The schema pattern only fixes their
// shape: a value such as 2026-99-99T99:99:99Z has to be rejected instead of
// winning a publication ordering comparison by string comparison.
function timestampErrors(document: JsonObject): Violation[] {
  const errors: Violation[] = []

  for (const [value, path] of timestampFields(document)) {
    flag(
      errors,
      value !== null && value !== undefined && !Timestamps.valid(value),
      "invalid_timestamp",
      path,
      `${JSON.stringify(value)} is not a UTC timestamp`,
    )
  }

  return errors
}

function timestampFields(document: JsonObject): [JsonValue | undefined, string][] {
  if (document["document"] === "record") {
    return [
      [document["created_at"], "/created_at"],
      ...revisionTimestampFields(document["revisions"]),
    ]
  }

  if (document["document"] === "source") {
    return [[getIn(document, ["license", "reviewed_at"]), "/license/reviewed_at"]]
  }

  if (document["document"] === "publication_set") {
    return [
      [document["published_at"], "/published_at"],
      [getIn(document, ["review", "reviewed_at"]), "/review/reviewed_at"],
    ]
  }

  return []
}

function revisionTimestampFields(
  revisions: JsonValue | undefined,
): [JsonValue | undefined, string][] {
  if (!isList(revisions)) {
    return []
  }

  return revisions
    .filter((revision) => isObject(revision))
    .map((revision, index) => [revision["created_at"], `/revisions/${index}/created_at`])
}

type RevisionContext = {
  kind: JsonValue | undefined
  recordId: JsonValue | undefined
  path: string
  published: boolean
}

function revisionErrors(
  revisionValue: JsonValue,
  index: number,
  kind: JsonValue | undefined,
  recordId: JsonValue | undefined,
  publishedRevisionId: JsonValue | undefined,
): Violation[] {
  const revision = objectOf(revisionValue)
  const path = `/revisions/${index}`
  const content = objectOf(revision["content"])
  const claims = listOf(revision["claims"])
  const published = revision["revision_id"] === publishedRevisionId
  const context: RevisionContext = { kind, recordId, path, published }
  const errors: Violation[] = []

  flag(
    errors,
    revisionHash(revision) !== revision["revision_hash"],
    "revision_hash_mismatch",
    path,
    "a revision body was edited after it was sealed",
  )
  flag(
    errors,
    published && revision["research_notes"] !== null && revision["research_notes"] !== undefined,
    "research_notes_in_published_revision",
    path,
    "contributor hypotheses are never public content",
  )

  errors.push(...claimErrors(claims, content, revision, path))
  errors.push(...disputeErrors(revision, claims, path))
  errors.push(...contentErrors(content, claims, context))
  errors.push(...publishedEvidenceErrors(kind, claims, published, path))

  return errors
}

function claimErrors(
  claims: JsonValue[],
  content: JsonObject,
  revision: JsonObject,
  path: string,
): Violation[] {
  const claimIds = claims.map((claim) => valueAt(claim, "claim_id"))
  const errors: Violation[] = duplicates(claimIds).map((claimId) =>
    error("duplicate_claim_id", `${path}/claims`, String(claimId)),
  )

  const mainClaims = claims.filter((claim) => isObject(claim) && claim["role"] === "main")
  const byAssertion = new Map<string, JsonValue[]>()

  for (const claim of mainClaims) {
    const key = JSON.stringify(valueAt(claim, "asserts") ?? null)
    byAssertion.set(key, [...(byAssertion.get(key) ?? []), claim])
  }

  for (const [assertion, grouped] of byAssertion) {
    if (grouped.length > 1) {
      errors.push(error("multiple_main_claims_for_pointer", `${path}/claims`, assertion))
    }
  }

  claims.forEach((claimValue, index) => {
    const claim = objectOf(claimValue)
    const claimPath = `${path}/claims/${index}`

    flag(
      errors,
      !pointerResolves(content, claim["asserts"]),
      "claim_pointer_unresolved",
      claimPath,
      `asserts ${JSON.stringify(claim["asserts"])} does not resolve in the revision content`,
    )
    flag(
      errors,
      claim["basis"] === "cited_interpretation" && blank(claim["attributed_to"]),
      "interpretation_missing_attribution",
      claimPath,
      "a cited scholarly interpretation must name who advances it",
    )
    flag(
      errors,
      (claim["role"] === "alternative" || claim["role"] === "conflicting") &&
        getIn(revision, ["dispute", "status"]) !== "disputed",
      "claim_without_dispute",
      claimPath,
      "an alternative or conflicting claim requires a visible dispute",
    )
  })

  return [...errors, ...claimReferenceErrors(content, claimIds, path)]
}

function claimReferenceErrors(
  content: JsonObject,
  claimIds: (JsonValue | undefined)[],
  path: string,
): Violation[] {
  const errors: Violation[] = []

  for (const [claimId, referencePath] of collectReferences(
    content,
    `${path}/content`,
    "claim_id",
  )) {
    flag(
      errors,
      !claimIds.includes(claimId),
      "unresolved_claim_reference",
      referencePath,
      `claim ${JSON.stringify(claimId)} is not defined in this revision`,
    )
  }

  return errors
}

function collectReferences(value: JsonValue, path: string, key: string): [JsonValue, string][] {
  if (isObject(value)) {
    const direct: [JsonValue, string][] = isString(value[key])
      ? [[value[key], `${path}/${key}`]]
      : []

    return [
      ...direct,
      ...Object.entries(value).flatMap(([nestedKey, nested]) =>
        collectReferences(nested, `${path}/${nestedKey}`, key),
      ),
    ]
  }

  if (isList(value)) {
    return value.flatMap((nested, index) => collectReferences(nested, `${path}/${index}`, key))
  }

  return []
}

function disputeErrors(revision: JsonObject, claims: JsonValue[], path: string): Violation[] {
  const dispute = objectOf(revision["dispute"])
  const status = dispute["status"] ?? "undisputed"
  const challenging = claims.filter(
    (claim) =>
      isObject(claim) && (claim["role"] === "alternative" || claim["role"] === "conflicting"),
  ).length
  const errors: Violation[] = []

  flag(
    errors,
    status === "disputed" && blank(dispute["summary"]),
    "dispute_summary_missing",
    `${path}/dispute`,
    "a disputed account needs a summary of what differs",
  )
  flag(
    errors,
    status === "disputed" && challenging === 0,
    "dispute_without_alternative_claim",
    `${path}/dispute`,
    "a dispute needs at least one cited alternative or conflicting claim",
  )
  flag(
    errors,
    status === "undisputed" && challenging > 0,
    "undisputed_with_alternative_claim",
    `${path}/dispute`,
    "alternative or conflicting claims must not be recorded as undisputed",
  )

  return errors
}

function contentErrors(
  content: JsonObject,
  claims: JsonValue[],
  context: RevisionContext,
): Violation[] {
  const contentPath = `${context.path}/content`
  const claimsById = new Map<JsonValue, JsonObject>()

  for (const claim of claims) {
    if (isObject(claim)) {
      claimsById.set(claim["claim_id"], claim)
    }
  }

  return [
    ...timeErrors(content["time"], `${contentPath}/time`),
    ...timeErrors(content["existence"], `${contentPath}/existence`),
    ...timeErrors(content["validity"], `${contentPath}/validity`),
    ...nameErrors(content["names"], claimsById, `${contentPath}/names`, context.published),
    ...geometryErrors(content["geometry"], claimsById, `${contentPath}/geometry`, "/geometry"),
    ...orderingErrors(content["time"], claimsById, `${contentPath}/time`, context.published),
    ...typeNoteErrors(content, contentPath),
    ...kindErrors(content, claimsById, context, contentPath),
  ]
}

function timeErrors(time: JsonValue | undefined, path: string): Violation[] {
  if (time === null || time === undefined) {
    return []
  }

  const normalized = normalize(time)

  return normalized.ok
    ? []
    : normalized.errors.map((code) => error(code, path, "invalid time expression"))
}

function nameErrors(
  namesValue: JsonValue | undefined,
  claimsById: Map<JsonValue, JsonObject>,
  path: string,
  published: boolean,
): Violation[] {
  if (
    namesValue === null ||
    namesValue === undefined ||
    (isList(namesValue) && namesValue.length === 0)
  ) {
    return []
  }

  if (!isList(namesValue)) {
    return []
  }

  const names = namesValue
  const primaries = names.filter((name) => isObject(name) && name["role"] === "primary")
  const errors: Violation[] = []

  if (primaries.length === 0) {
    errors.push(
      error("no_primary_name", path, "names are present without a primary historical form"),
    )
  } else if (primaries.length > 1) {
    errors.push(error("multiple_primary_names", path, "only one name form may be primary"))
  }

  names.forEach((nameValue, index) => {
    const name = objectOf(nameValue)
    const namePath = `${path}/${index}`
    const primary = name["role"] === "primary"

    flag(
      errors,
      primary && name["translation"] !== null && name["translation"] !== undefined,
      "translation_as_primary",
      namePath,
      "a translation is not a period-appropriate primary label",
    )
    flag(
      errors,
      primary && published && (name["claim_id"] === null || name["claim_id"] === undefined),
      "primary_name_without_claim",
      namePath,
      "a published primary label needs cited support for the period-appropriate form",
    )
    flag(
      errors,
      isString(name["script"]) && NON_LATIN_SCRIPTS.has(name["script"]) && asciiOnly(name["form"]),
      "script_form_mismatch",
      namePath,
      "a romanized form must not be recorded as a local-script form",
    )
    errors.push(...romanizationErrors(name["romanization"], name, namePath))
    flag(
      errors,
      isString(name["claim_id"]) && !claimsById.has(name["claim_id"]),
      "unresolved_claim_reference",
      namePath,
      "name evidence must reference a claim in this revision",
    )
    errors.push(...timeErrors(name["validity"], `${namePath}/validity`))
  })

  return errors
}

function romanizationErrors(
  romanization: JsonValue | undefined,
  name: JsonObject,
  path: string,
): Violation[] {
  if (romanization === null || romanization === undefined) {
    return []
  }

  const entry = objectOf(romanization)
  const romanizationPath = `${path}/romanization`
  const errors: Violation[] = []

  flag(
    errors,
    name["script"] === "Latn",
    "romanization_on_latin_script",
    romanizationPath,
    "a Latin-script form needs no separate romanization",
  )
  flag(
    errors,
    entry["origin"] === "source_attested" &&
      (entry["claim_id"] === null || entry["claim_id"] === undefined),
    "attested_romanization_without_claim",
    romanizationPath,
    "a source-attested romanization must cite the form it comes from",
  )
  flag(
    errors,
    entry["origin"] === "editorial" &&
      entry["claim_id"] !== null &&
      entry["claim_id"] !== undefined,
    "editorial_romanization_has_claim",
    romanizationPath,
    "an editorial reading aid must not be presented as source evidence",
  )
  flag(
    errors,
    entry["pronunciation_claim"] !== false,
    "romanization_pronunciation_claim",
    romanizationPath,
    "a romanization is a modern reading aid, never evidence of historical pronunciation",
  )

  return errors
}

function geometryErrors(
  geometryValue: JsonValue | undefined,
  claimsById: Map<JsonValue, JsonObject>,
  path: string,
  contentBase: string,
): Violation[] {
  if (geometryValue === null || geometryValue === undefined) {
    return []
  }

  if (!isList(geometryValue) || geometryValue.length === 0) {
    return []
  }

  return geometryValue.flatMap((entryValue, index) => {
    const entry = objectOf(entryValue)
    const entryPath = `${path}/${index}`
    const entryPointer = `${contentBase}/${index}`
    const claim = claimsById.get(entry["claim_id"])
    const errors: Violation[] = []

    flag(
      errors,
      claim === undefined,
      "unresolved_claim_reference",
      entryPath,
      "geometry must reference a claim in this revision",
    )
    errors.push(...geometryPointerErrors(claim, entryPath, entryPointer, contentBase))
    errors.push(...interpretationErrors(entry, claim, entryPath))
    errors.push(...geojsonErrors(entry["geojson"], `${entryPath}/geojson`))
    errors.push(...uncertaintyErrors(entry, entryPath))
    errors.push(...timeErrors(entry["validity"], `${entryPath}/validity`))
    errors.push(...waypointErrors(entry, entryPath))

    return errors
  })
}

function geometryPointerErrors(
  claim: JsonObject | undefined,
  entryPath: string,
  entryPointer: string,
  contentBase: string,
): Violation[] {
  if (claim === undefined) {
    return []
  }

  // asserts pointers are relative to the revision content, so a claim supports a
  // geometry entry by asserting that entry, its list, or the whole content.
  const accepted = [entryPointer, contentBase, ""]
  const errors: Violation[] = []

  flag(
    errors,
    !accepted.includes(String(claim["asserts"])),
    "geometry_claim_pointer_mismatch",
    entryPath,
    "the linked claim must assert this geometry entry or the geometry list to support it",
  )

  return errors
}

function interpretationErrors(
  entry: JsonObject,
  claim: JsonObject | undefined,
  path: string,
): Violation[] {
  return [
    ...geometryPresenceErrors(entry, path),
    ...geometryLabelErrors(entry, path),
    ...geometryShapeErrors(entry, path),
    ...geometryBasisErrors(entry, claim, path),
  ]
}

function geometryPresenceErrors(entry: JsonObject, path: string): Violation[] {
  const interpretation = entry["interpretation"]
  const asserted = isString(interpretation) && ASSERTED_GEOMETRY.has(interpretation)
  const unknown = interpretation === "unknown"
  const errors: Violation[] = []

  flag(
    errors,
    asserted && isNil(entry["geojson"]),
    "geometry_missing_geojson",
    path,
    "an asserted location needs geometry",
  )
  flag(
    errors,
    unknown && !isNil(entry["geojson"]),
    "geometry_unknown_has_geojson",
    path,
    "an unknown location must not carry coordinates",
  )
  flag(
    errors,
    asserted && entry["precision"] === "unspecified",
    "geometry_missing_precision",
    path,
    "an asserted location needs its precision recorded",
  )

  return errors
}

function geometryLabelErrors(entry: JsonObject, path: string): Violation[] {
  const interpretation = entry["interpretation"]
  const precision = entry["precision"]
  const notes = entry["notes"]
  const unknown = interpretation === "unknown"
  const anchor = interpretation === "display_anchor"
  const route =
    isString(interpretation) &&
    (interpretation === "reconstructed_route" || interpretation === "schematic_link")
  const errors: Violation[] = []

  flag(
    errors,
    unknown && blank(notes),
    "geometry_unknown_without_notes",
    path,
    "explain why no placement is supported",
  )
  flag(
    errors,
    unknown && precision !== "unspecified",
    "geometry_unknown_with_precision",
    path,
    "an unknown location must not imply locational precision",
  )
  flag(
    errors,
    anchor && blank(notes),
    "display_anchor_without_notes",
    path,
    "a display anchor is not an asserted coordinate and needs an explanation",
  )
  flag(
    errors,
    anchor && precision !== "unspecified",
    "display_anchor_with_precision",
    path,
    "a display anchor must not imply locational precision",
  )
  flag(
    errors,
    route && blank(notes),
    "route_without_notes",
    path,
    "a reconstructed or schematic route must be labelled as such",
  )

  return errors
}

function geometryShapeErrors(entry: JsonObject, path: string): Violation[] {
  const interpretation = entry["interpretation"]
  const type = geojsonType(entry["geojson"])
  const errors: Violation[] = []

  flag(
    errors,
    interpretation === "approximate_point" && type !== "Point",
    "geometry_wrong_type",
    path,
    "an approximate point must be a Point",
  )
  flag(
    errors,
    interpretation === "source_supported_area" && type !== "Polygon" && type !== "MultiPolygon",
    "geometry_wrong_type",
    path,
    "a source-supported area must be a Polygon or MultiPolygon",
  )
  flag(
    errors,
    isString(interpretation) &&
      ROUTE_GEOMETRY.has(interpretation) &&
      type !== "LineString" &&
      type !== "MultiLineString",
    "geometry_wrong_type",
    path,
    "a route must be a LineString or MultiLineString",
  )

  return errors
}

function geometryBasisErrors(
  entry: JsonObject,
  claim: JsonObject | undefined,
  path: string,
): Violation[] {
  const interpretation = entry["interpretation"]
  const basis = claim === undefined ? undefined : claim["basis"]
  const errors: Violation[] = []

  flag(
    errors,
    interpretation === "attested_itinerary" && basis !== "attested",
    "attested_itinerary_not_attested",
    path,
    "an attested itinerary must rest on attestation, not on a reconstruction",
  )
  flag(
    errors,
    interpretation === "reconstructed_route" && basis !== "cited_interpretation",
    "reconstructed_route_not_interpretation",
    path,
    "a reconstructed route is a cited scholarly interpretation",
  )
  flag(
    errors,
    !isNil(entry["waypoints"]) && !(isString(interpretation) && ROUTE_GEOMETRY.has(interpretation)),
    "waypoints_not_route",
    path,
    "waypoints belong to a route interpretation",
  )

  return errors
}

function geojsonType(geojson: JsonValue | undefined): JsonValue | undefined {
  return isObject(geojson) ? geojson["type"] : undefined
}

// GeoJSON structure is checked here rather than in the schema so the contract can
// report precise codes: positions are WGS84 longitude/latitude, lines need two
// positions, and polygon rings must close.
function geojsonErrors(geojson: JsonValue | undefined, path: string): Violation[] {
  if (geojson === null || geojson === undefined) {
    return []
  }

  if (!isObject(geojson)) {
    return [
      error("geojson_invalid_structure", path, "expected a GeoJSON geometry with coordinates"),
    ]
  }

  const type = geojson["type"]
  const coordinates = geojson["coordinates"]

  if (type === "Point") {
    return positionErrors(coordinates, path)
  }

  if (type === "MultiPoint" && isList(coordinates)) {
    return coordinates.flatMap((position, index) => positionErrors(position, `${path}/${index}`))
  }

  if (type === "LineString") {
    return lineErrors(coordinates, path)
  }

  if (type === "MultiLineString" && isList(coordinates)) {
    return coordinates.flatMap((line, index) => lineErrors(line, `${path}/${index}`))
  }

  if (type === "Polygon") {
    return polygonErrors(coordinates, path)
  }

  if (type === "MultiPolygon" && isList(coordinates)) {
    return coordinates.flatMap((polygon, index) => polygonErrors(polygon, `${path}/${index}`))
  }

  return [error("geojson_invalid_structure", path, "expected a GeoJSON geometry with coordinates")]
}

function positionErrors(position: JsonValue | undefined, path: string): Violation[] {
  if (!isList(position) || !isNumber(position[0]) || !isNumber(position[1])) {
    return [error("geojson_invalid_structure", path, "a position must be [longitude, latitude]")]
  }

  const [longitude, latitude] = position

  if (longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90) {
    return []
  }

  return [error("geojson_coordinate_out_of_range", path, JSON.stringify(position))]
}

function lineErrors(coordinates: JsonValue | undefined, path: string): Violation[] {
  if (!isList(coordinates) || coordinates.length < 2) {
    return [error("geojson_too_few_positions", path, "a line needs at least two positions")]
  }

  return coordinates.flatMap((position, index) => positionErrors(position, `${path}/${index}`))
}

function polygonErrors(rings: JsonValue | undefined, path: string): Violation[] {
  if (!isList(rings) || rings.length === 0) {
    return [error("geojson_invalid_structure", path, "a polygon needs at least one ring")]
  }

  return rings.flatMap((ring, index) => ringErrors(ring, `${path}/${index}`))
}

function ringErrors(ring: JsonValue | undefined, path: string): Violation[] {
  if (!isList(ring) || ring.length < 4) {
    return [error("geojson_too_few_positions", path, "a ring needs at least four positions")]
  }

  if (!deepEqual(ring[0], ring[ring.length - 1])) {
    return [
      error("geojson_ring_not_closed", path, "the first and last positions of a ring must match"),
    ]
  }

  return ring.flatMap((position, index) => positionErrors(position, `${path}/${index}`))
}

function uncertaintyErrors(entry: JsonObject, path: string): Violation[] {
  const uncertainty = entry["uncertainty"]

  if (uncertainty === null || uncertainty === undefined || !isObject(uncertainty)) {
    return []
  }

  if (uncertainty["kind"] === "none") {
    const errors: Violation[] = []

    flag(
      errors,
      !isNil(uncertainty["extent_m"]) || !isNil(uncertainty["source_expression"]),
      "uncertainty_none_has_extent",
      path,
      "an extent must not be recorded when none is claimed",
    )

    return errors
  }

  if (uncertainty["kind"] === "source_stated_extent") {
    const errors: Violation[] = []

    flag(
      errors,
      !(isNumber(uncertainty["extent_m"]) && uncertainty["extent_m"] > 0),
      "uncertainty_extent_missing",
      path,
      "a source-stated extent needs the extent the source states",
    )
    flag(
      errors,
      blank(uncertainty["source_expression"]),
      "uncertainty_without_source_expression",
      path,
      "a source-stated extent must quote the source's own statement",
    )

    return errors
  }

  return []
}

function waypointErrors(entry: JsonObject, path: string): Violation[] {
  const waypoints = entry["waypoints"]

  if (!isList(waypoints)) {
    return []
  }

  return waypoints.flatMap((waypointValue, index) => {
    const waypoint = objectOf(waypointValue)
    const waypointPath = `${path}/waypoints/${index}`

    return [
      ...geojsonErrors(waypoint["geojson"], `${waypointPath}/geojson`),
      ...timeErrors(waypoint["time"], `${waypointPath}/time`),
    ]
  })
}

function orderingErrors(
  timeValue: JsonValue | undefined,
  claimsById: Map<JsonValue, JsonObject>,
  path: string,
  published: boolean,
): Violation[] {
  if (!isObject(timeValue) || !isList(timeValue["ordering"])) {
    return []
  }

  return timeValue["ordering"].flatMap((entryValue, index) => {
    const entry = objectOf(entryValue)
    const entryPath = `${path}/ordering/${index}`
    const claimId = entry["claim_id"]
    const errors: Violation[] = []

    flag(
      errors,
      published && entry["relation"] !== "undetermined" && isNil(claimId),
      "ordering_without_evidence",
      entryPath,
      "a published ordering assertion needs cited evidence",
    )
    flag(
      errors,
      !isNil(claimId) && !claimsById.has(claimId),
      "unresolved_claim_reference",
      entryPath,
      "ordering evidence must reference a claim in this revision",
    )

    return errors
  })
}

function typeNoteErrors(content: JsonObject, path: string): Violation[] {
  const usesOther = ["place_types", "actor_types", "event_types", "relationship_types"].some(
    (key) => isList(content[key]) && (content[key] as JsonValue[]).includes("other"),
  )
  const errors: Violation[] = []

  flag(
    errors,
    usesOther && blank(content["editorial_notes"]),
    "other_type_without_note",
    path,
    "an other type must be explained rather than silently extending the vocabulary",
  )

  return errors
}

function kindErrors(
  content: JsonObject,
  claimsById: Map<JsonValue, JsonObject>,
  context: RevisionContext,
  path: string,
): Violation[] {
  if (context.kind === "event") {
    return eventKindErrors(content, context.recordId, path)
  }

  if (context.kind === "relationship") {
    return relationshipKindErrors(content, claimsById, path)
  }

  if (context.kind === "story") {
    return storyKindErrors(content, path)
  }

  return []
}

function eventKindErrors(
  content: JsonObject,
  recordId: JsonValue | undefined,
  path: string,
): Violation[] {
  const partOf = listOf(content["part_of"])
  const ordering = isObject(content["time"]) ? listOf(content["time"]["ordering"]) : []
  const errors: Violation[] = []

  partOf.forEach((entryValue, index) => {
    const entry = objectOf(entryValue)

    flag(
      errors,
      entry["event_id"] === recordId,
      "part_of_self_reference",
      `${path}/part_of/${index}`,
      "an event cannot be part of itself",
    )
  })

  flag(
    errors,
    ordering.some((entry) => isObject(entry) && entry["record_id"] === recordId),
    "ordering_self_reference",
    path,
    "a record must not order itself",
  )

  return errors
}

function relationshipKindErrors(
  content: JsonObject,
  claimsById: Map<JsonValue, JsonObject>,
  path: string,
): Violation[] {
  const types = listOf(content["relationship_types"])
  const interpretations = [...claimsById.values()].filter(
    (claim) => claim["basis"] === "cited_interpretation",
  ).length
  const errors: Violation[] = []

  flag(
    errors,
    content["from"] === content["to"],
    "relationship_self_reference",
    path,
    "a relationship needs two distinct ends",
  )
  flag(
    errors,
    content["causality"] === "asserted" && interpretations === 0,
    "causality_without_interpretation",
    path,
    "causation is a scholarly interpretation and needs a cited_interpretation claim",
  )
  flag(
    errors,
    types.includes("proposed_influence") && interpretations === 0,
    "influence_without_interpretation",
    path,
    "a proposed influence must be presented as a cited interpretation, not as attested contact",
  )

  return errors
}

function storyKindErrors(content: JsonObject, path: string): Violation[] {
  const window = objectOf(content["window"])
  const steps = listOf(content["steps"])
  const errors: Violation[] = []

  flag(
    errors,
    isObject(window["start"]) &&
      isObject(window["end"]) &&
      astro(window["start"]) > astro(window["end"]),
    "story_window_start_after_end",
    `${path}/window`,
    "a story window must not start after it ends",
  )
  flag(
    errors,
    window["boundary"] !== "inclusive",
    "boundary_not_inclusive",
    `${path}/window`,
    "v0 windows are inclusive at both ends",
  )
  flag(
    errors,
    steps.length > 0 && !(isObject(steps[0]) && steps[0]["role"] === "start"),
    "story_first_step_not_start",
    `${path}/steps`,
    "the first story step must be the entry point",
  )

  return errors
}

function publishedEvidenceErrors(
  kind: JsonValue | undefined,
  claims: JsonValue[],
  published: boolean,
  path: string,
): Violation[] {
  if (!published || !(isString(kind) && EVIDENCE_KINDS.has(kind))) {
    return []
  }

  const cited = claims.some(
    (claim) => isObject(claim) && isList(claim["citations"]) && claim["citations"].length > 0,
  )
  const errors: Violation[] = []

  flag(
    errors,
    !cited,
    "published_record_without_citation",
    path,
    "every published event, place, actor, and relationship needs a cited claim",
  )

  return errors
}

// --- source documents -------------------------------------------------------

function sourceErrors(document: JsonObject): Violation[] {
  const license = objectOf(document["license"])
  const errors: Violation[] = []

  flag(
    errors,
    sourceHash(document) !== document["source_hash"],
    "source_hash_mismatch",
    "/source_hash",
    "source metadata was edited after sealing; publish a new source document instead of rewriting an approved one",
  )
  errors.push(...licenseErrors(license))

  return errors
}

function licenseErrors(license: JsonObject): Violation[] {
  if (license["status"] !== "recorded") {
    return []
  }

  const errors: Violation[] = []

  flag(
    errors,
    isNil(license["license_id"]),
    "license_incomplete",
    "/license",
    "record the license identifier",
  )
  flag(
    errors,
    blank(license["attribution_text"]),
    "license_incomplete",
    "/license",
    "record the attribution text",
  )
  flag(
    errors,
    isNil(license["redistribution"]),
    "license_incomplete",
    "/license",
    "record redistribution terms",
  )
  flag(
    errors,
    isNil(license["quotation_permitted"]),
    "license_incomplete",
    "/license",
    "record quotation terms",
  )

  return errors
}

// --- publication set documents ---------------------------------------------

function setErrors(document: JsonObject): Violation[] {
  const members = listOf(document["members"])
  const review = objectOf(document["review"])
  const checklist = objectOf(review["checklist"])
  const incomplete = Object.keys(checklist).filter((key) => checklist[key] !== true)
  const errors: Violation[] = []

  flag(
    errors,
    duplicates(members.map((member) => valueAt(member, "record_id"))).length > 0,
    "duplicate_set_member",
    "/members",
    "a record appears at most once per publication set",
  )
  flag(
    errors,
    incomplete.length > 0,
    "checklist_incomplete",
    "/review/checklist",
    `the review checklist must be complete before publication: ${JSON.stringify(incomplete.sort())}`,
  )
  flag(
    errors,
    isString(document["published_at"]) &&
      isString(review["reviewed_at"]) &&
      Timestamps.compare(document["published_at"], review["reviewed_at"]) === "lt",
    "published_before_approved",
    "/published_at",
    "publication cannot precede review",
  )
  flag(
    errors,
    document["supersedes"] === document["set_id"],
    "set_supersedes_itself",
    "/supersedes",
    "a set cannot supersede itself",
  )

  return errors
}

// --- shared helpers --------------------------------------------------------

function scanReservedKeys(document: JsonObject): Violation[] {
  const errors: Violation[] = []

  for (const [key, path] of collectKeys(document, "")) {
    if (PRESENTATION_KEYS.has(key)) {
      errors.push(
        error(
          "presentation_field_in_content",
          path,
          `${key} must not enter the historical source of truth`,
        ),
      )
    } else if (INVENTED_PRECISION_KEYS.has(key)) {
      errors.push(
        error(
          "invented_precision_field",
          path,
          `${key} must not be invented where the evidence supplies none`,
        ),
      )
    }
  }

  return errors
}

function collectKeys(value: JsonValue, path: string): [string, string][] {
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, nested]) => [
      [key, path] as [string, string],
      ...collectKeys(nested, `${path}/${key}`),
    ])
  }

  if (isList(value)) {
    return value.flatMap((nested, index) => collectKeys(nested, `${path}/${index}`))
  }

  return []
}

function pointerResolves(content: JsonObject, pointer: unknown): boolean {
  if (pointer === "") {
    return true
  }

  if (!isString(pointer)) {
    return false
  }

  let current: JsonValue = content

  for (const rawToken of pointer.split("/").slice(1)) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~")

    if (isObject(current) && token in current) {
      current = current[token]
      continue
    }

    if (isList(current) && /^\d+$/.test(token)) {
      const index = Number.parseInt(token, 10)

      if (index < current.length) {
        current = current[index]
        continue
      }
    }

    return false
  }

  return true
}

function duplicates(values: (JsonValue | undefined)[]): (JsonValue | undefined)[] {
  const counts = new Map<string, { value: JsonValue | undefined; count: number }>()

  for (const value of values) {
    const key = JSON.stringify(value ?? null)
    const existing = counts.get(key)

    counts.set(key, { value, count: (existing?.count ?? 0) + 1 })
  }

  return [...counts.values()]
    .filter((entry) => entry.count > 1)
    .map((entry) => entry.value)
    .sort(compareValues)
}

function asciiOnly(value: unknown): boolean {
  return isString(value) && !/[^\x00-\x7f]/.test(value)
}

function where(document: JsonObject): string {
  return String(document["record_id"] ?? document["source_id"] ?? document["set_id"] ?? "unknown")
}

function error(code: string, path: string, detail: string): Violation {
  return { code, where: path, detail }
}

function flag(
  errors: Violation[],
  condition: boolean,
  code: string,
  path: string,
  detail: string,
): void {
  if (condition) {
    errors.push(error(code, path, detail))
  }
}

function isNil(value: unknown): boolean {
  return value === null || value === undefined
}

function valueAt(value: unknown, key: string): JsonValue | undefined {
  return isObject(value) ? value[key] : undefined
}

function getIn(value: JsonValue | undefined, keys: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value

  for (const key of keys) {
    if (!isObject(current)) {
      return undefined
    }

    current = current[key]
  }

  return current
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/** Byte-order comparison, matching Elixir's term ordering for string ids. */
export function compareValues(a: unknown, b: unknown): number {
  return Buffer.compare(Buffer.from(String(a), "utf8"), Buffer.from(String(b), "utf8"))
}
