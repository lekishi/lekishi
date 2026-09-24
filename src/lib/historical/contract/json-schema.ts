import { readFileSync } from "node:fs"
import path from "node:path"
import { isObject, listOf, type JsonObject, type JsonValue } from "./types"

/**
 * Minimal JSON Schema (2020-12 subset) validator for the v0 historical contract.
 *
 * The contract ships real JSON Schema documents and validates them with the exact
 * keyword subset those schemas use. Any other keyword raises
 * `UnsupportedKeywordError`: a schema can never silently under-validate, because
 * an unimplemented keyword stops validation instead of being ignored. `format` is
 * treated as an annotation, as the specification permits.
 *
 * `checkSchema` walks every subschema of a document (not only the parts reached
 * by an instance) so a typo in a keyword name is caught even when no instance
 * exercises that branch.
 */

export class UnsupportedKeywordError extends Error {}

export class SchemaError extends Error {}

const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "format",
])

const KEYWORDS = new Set([
  "type",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "enum",
  "const",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "anyOf",
  "allOf",
  "oneOf",
  "not",
  "if",
  "then",
  "else",
  "$ref",
])

const SUBSCHEMA_KEYS = new Set([
  "$defs",
  "properties",
  "items",
  "additionalProperties",
  "allOf",
  "anyOf",
  "oneOf",
  "if",
  "then",
  "else",
  "not",
])

export type Violation = {
  keyword: string
  path: string
  detail: string
}

export type SchemaValidation = { ok: true } | { ok: false; violations: Violation[] }

type Context = { dir: string; file: string }

const schemaCache = new Map<string, JsonObject>()

export function readSchema(schemaPath: string): JsonObject {
  const resolved = path.resolve(schemaPath)
  const cached = schemaCache.get(resolved)

  if (cached !== undefined) {
    return cached
  }

  const schema = JSON.parse(readFileSync(resolved, "utf8")) as JsonObject
  schemaCache.set(resolved, schema)

  return schema
}

/** Validates `instance` against the JSON Schema document at `schemaPath`. */
export function validate(schemaPath: string, instance: unknown): SchemaValidation {
  const context = contextFor(schemaPath)
  const violations = check(readSchema(schemaPath), instance, "", context)

  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}

/** Throws unless every subschema of `schemaPath` uses only supported keywords. */
export function checkSchema(schemaPath: string): void {
  const context = contextFor(schemaPath)
  walkSchema(readSchema(schemaPath), "", context)
}

function contextFor(schemaPath: string): Context {
  const resolved = path.resolve(schemaPath)

  return { dir: path.dirname(resolved), file: path.basename(resolved) }
}

function check(
  schema: JsonValue,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  if (typeof schema === "boolean") {
    throw new SchemaError(
      `boolean schema at ${instancePath || "/"} in ${context.file} is not supported`,
    )
  }

  if (!isObject(schema)) {
    return []
  }

  ensureSupported(schema, instancePath, context)

  const reference = schema["$ref"]

  if (typeof reference === "string") {
    const { referenced, context: refContext } = resolveRef(reference, context)
    const siblings: JsonObject = { ...schema }
    delete siblings["$ref"]

    return [
      ...check(referenced, instance, instancePath, refContext),
      ...checkKeywords(siblings, instance, instancePath, context),
    ]
  }

  return checkKeywords(schema, instance, instancePath, context)
}

function checkKeywords(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  return [
    ...typeViolations(schema, instance, instancePath),
    ...constViolations(schema, instance, instancePath),
    ...enumViolations(schema, instance, instancePath),
    ...stringViolations(schema, instance, instancePath),
    ...numberViolations(schema, instance, instancePath),
    ...arrayViolations(schema, instance, instancePath, context),
    ...objectViolations(schema, instance, instancePath, context),
    ...combinatorViolations(schema, instance, instancePath, context),
  ]
}

function typeViolations(schema: JsonObject, instance: unknown, instancePath: string): Violation[] {
  const expected = schema["type"]

  if (expected === undefined) {
    return []
  }

  const allowed = Array.isArray(expected) ? expected : [expected]

  return allowed.some((type) => matchesType(instance, type))
    ? []
    : [violation("type", instancePath, allowed.join("|"))]
}

function constViolations(schema: JsonObject, instance: unknown, instancePath: string): Violation[] {
  if (!Object.hasOwn(schema, "const")) {
    return []
  }

  return deepEqual(instance, schema["const"])
    ? []
    : [violation("const", instancePath, JSON.stringify(schema["const"]))]
}

function enumViolations(schema: JsonObject, instance: unknown, instancePath: string): Violation[] {
  const allowed = schema["enum"]

  if (!Array.isArray(allowed)) {
    return []
  }

  return allowed.some((candidate) => deepEqual(candidate, instance))
    ? []
    : [violation("enum", instancePath, JSON.stringify(instance))]
}

function stringViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
): Violation[] {
  if (typeof instance !== "string") {
    return []
  }

  const min = schema["minLength"]
  const max = schema["maxLength"]
  const pattern = schema["pattern"]
  // The reference implementation counted graphemes; code points are the closest
  // practical equivalent here, and every schema constraint is on ASCII text.
  const length = [...instance].length
  const violations: Violation[] = []

  if (typeof min === "number" && length < min) {
    violations.push(violation("minLength", instancePath, JSON.stringify(min)))
  }

  if (typeof max === "number" && length > max) {
    violations.push(violation("maxLength", instancePath, JSON.stringify(max)))
  }

  if (typeof pattern === "string" && !new RegExp(pattern).test(instance)) {
    violations.push(violation("pattern", instancePath, JSON.stringify(instance)))
  }

  return violations
}

function numberViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
): Violation[] {
  if (typeof instance !== "number") {
    return []
  }

  const violations: Violation[] = []

  const minimum = schema["minimum"]
  const maximum = schema["maximum"]
  const exclusiveMinimum = schema["exclusiveMinimum"]
  const exclusiveMaximum = schema["exclusiveMaximum"]

  if (typeof minimum === "number" && instance < minimum) {
    violations.push(violation("minimum", instancePath, JSON.stringify(minimum)))
  }

  if (typeof maximum === "number" && instance > maximum) {
    violations.push(violation("maximum", instancePath, JSON.stringify(maximum)))
  }

  if (typeof exclusiveMinimum === "number" && instance <= exclusiveMinimum) {
    violations.push(violation("exclusiveMinimum", instancePath, JSON.stringify(exclusiveMinimum)))
  }

  if (typeof exclusiveMaximum === "number" && instance >= exclusiveMaximum) {
    violations.push(violation("exclusiveMaximum", instancePath, JSON.stringify(exclusiveMaximum)))
  }

  return violations
}

function arrayViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  if (!Array.isArray(instance)) {
    return []
  }

  const min = schema["minItems"]
  const max = schema["maxItems"]
  const violations: Violation[] = []

  if (typeof min === "number" && instance.length < min) {
    violations.push(violation("minItems", instancePath, JSON.stringify(min)))
  }

  if (typeof max === "number" && instance.length > max) {
    violations.push(violation("maxItems", instancePath, JSON.stringify(max)))
  }

  if (schema["uniqueItems"] === true && !allUnique(instance)) {
    violations.push(violation("uniqueItems", instancePath, ""))
  }

  violations.push(...itemViolations(schema["items"], instance, instancePath, context))

  return violations
}

function itemViolations(
  schema: JsonValue | undefined,
  instance: JsonValue[],
  instancePath: string,
  context: Context,
): Violation[] {
  if (schema === undefined || schema === null) {
    return []
  }

  return instance.flatMap((item, index) => check(schema, item, `${instancePath}/${index}`, context))
}

function objectViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  if (!isObject(instance)) {
    return []
  }

  const properties = isObject(schema["properties"]) ? schema["properties"] : {}
  const required = listOf(schema["required"])

  // Only own properties count. `key in object` also matches Object.prototype
  // members, so a document field named `constructor` or `toString` would look
  // like a declared property and slip past `additionalProperties`.
  const missing = required
    .filter((key) => typeof key === "string" && !Object.hasOwn(instance, key))
    .map((key) => violation("required", instancePath, String(key)))

  const propertyViolations = Object.entries(instance)
    .filter(([key]) => Object.hasOwn(properties, key))
    .flatMap(([key, value]) => check(properties[key], value, `${instancePath}/${key}`, context))

  return [
    ...missing,
    ...propertyViolations,
    ...additionalViolations(schema, instance, properties, instancePath, context),
  ]
}

function additionalViolations(
  schema: JsonObject,
  instance: JsonObject,
  properties: JsonObject,
  instancePath: string,
  context: Context,
): Violation[] {
  const additional = schema["additionalProperties"] ?? true

  if (additional === false) {
    return Object.keys(instance)
      .filter((key) => !Object.hasOwn(properties, key))
      .sort()
      .map((key) => violation("additionalProperties", instancePath, key))
  }

  if (isObject(additional)) {
    return Object.entries(instance)
      .filter(([key]) => !Object.hasOwn(properties, key))
      .flatMap(([key, value]) => check(additional, value, `${instancePath}/${key}`, context))
  }

  return []
}

function combinatorViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  return [
    ...allOfViolations(schema, instance, instancePath, context),
    ...anyOfViolations(schema, instance, instancePath, context),
    ...oneOfViolations(schema, instance, instancePath, context),
    ...notViolations(schema, instance, instancePath, context),
    ...conditionalViolations(schema, instance, instancePath, context),
  ]
}

function allOfViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  const branches = schema["allOf"]

  if (!Array.isArray(branches)) {
    return []
  }

  return branches.flatMap((branch) => check(branch, instance, instancePath, context))
}

function anyOfViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  const branches = schema["anyOf"]

  if (!Array.isArray(branches)) {
    return []
  }

  return branches.some((branch) => check(branch, instance, instancePath, context).length === 0)
    ? []
    : [violation("anyOf", instancePath, "no branch matched")]
}

function oneOfViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  const branches = schema["oneOf"]

  if (!Array.isArray(branches)) {
    return []
  }

  const matched = branches.filter(
    (branch) => check(branch, instance, instancePath, context).length === 0,
  ).length

  return matched === 1 ? [] : [violation("oneOf", instancePath, `${matched} branches matched`)]
}

function notViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  const subschema = schema["not"]

  if (subschema === undefined) {
    return []
  }

  return check(subschema, instance, instancePath, context).length === 0
    ? [violation("not", instancePath, "instance matched a forbidden schema")]
    : []
}

function conditionalViolations(
  schema: JsonObject,
  instance: unknown,
  instancePath: string,
  context: Context,
): Violation[] {
  const ifSchema = schema["if"]

  if (ifSchema === undefined) {
    return []
  }

  const branch =
    check(ifSchema, instance, instancePath, context).length === 0 ? schema["then"] : schema["else"]

  return branch === undefined ? [] : check(branch, instance, instancePath, context)
}

function resolveRef(
  reference: string,
  context: Context,
): { referenced: JsonValue; context: Context } {
  const [file = "", pointer = ""] = splitOnce(reference, "#")

  if (file === "") {
    return {
      referenced: fetchPointer(
        readSchema(path.join(context.dir, context.file)),
        pointer,
        reference,
      ),
      context,
    }
  }

  const resolved = path.resolve(context.dir, file)

  return {
    referenced: fetchPointer(readSchema(resolved), pointer, reference),
    context: { dir: path.dirname(resolved), file: path.basename(resolved) },
  }
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator)

  return index === -1 ? [value, ""] : [value.slice(0, index), value.slice(index + separator.length)]
}

function fetchPointer(schema: JsonValue, pointer: string, reference: string): JsonValue {
  if (pointer === "") {
    return schema
  }

  if (!pointer.startsWith("/")) {
    throw new SchemaError(`invalid JSON Pointer ${JSON.stringify(pointer)} in $ref ${reference}`)
  }

  let current: JsonValue = schema

  for (const rawToken of pointer.split("/").slice(1)) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~")

    if (isObject(current) && Object.hasOwn(current, token)) {
      current = current[token]
      continue
    }

    if (Array.isArray(current) && /^\d+$/.test(token)) {
      const index = Number.parseInt(token, 10)

      if (index < current.length) {
        current = current[index]
        continue
      }
    }

    throw new SchemaError(`cannot resolve $ref ${reference}: missing ${JSON.stringify(token)}`)
  }

  return current
}

function walkSchema(schema: JsonValue, schemaPath: string, context: Context): void {
  if (!isObject(schema)) {
    return
  }

  ensureSupported(schema, schemaPath, context)

  for (const [key, value] of Object.entries(schema)) {
    if (SUBSCHEMA_KEYS.has(key)) {
      walkSubschemaValue(key, value, schemaPath, context)
    }
  }
}

function walkSubschemaValue(
  key: string,
  value: JsonValue,
  schemaPath: string,
  context: Context,
): void {
  if (key === "$defs" || key === "properties") {
    if (isObject(value)) {
      for (const [name, subschema] of Object.entries(value)) {
        walkSchema(subschema, `${schemaPath}/${key}/${name}`, context)
      }
    }

    return
  }

  if (key === "allOf" || key === "anyOf" || key === "oneOf") {
    if (Array.isArray(value)) {
      value.forEach((subschema, index) =>
        walkSchema(subschema, `${schemaPath}/${key}/${index}`, context),
      )
    }

    return
  }

  if (key === "items" || key === "if" || key === "then" || key === "else" || key === "not") {
    walkSchema(value, `${schemaPath}/${key}`, context)

    return
  }

  if (key === "additionalProperties" && isObject(value)) {
    walkSchema(value, `${schemaPath}/additionalProperties`, context)
  }
}

function ensureSupported(schema: JsonObject, schemaPath: string, context: Context): void {
  const unknown = Object.keys(schema).filter((key) => !ANNOTATIONS.has(key) && !KEYWORDS.has(key))

  if (unknown.length > 0) {
    throw new UnsupportedKeywordError(
      `unsupported JSON Schema keyword(s) ${JSON.stringify(unknown.sort())} at ${schemaPath || "/"} ` +
        `in ${context.file}: the v0 contract validates with a fixed keyword subset and refuses to ignore keywords`,
    )
  }
}

function matchesType(instance: unknown, type: JsonValue): boolean {
  switch (type) {
    case "integer":
      return typeof instance === "number" && Number.isInteger(instance)
    case "number":
      return typeof instance === "number" && Number.isFinite(instance)
    case "string":
      return typeof instance === "string"
    case "boolean":
      return typeof instance === "boolean"
    case "object":
      return isObject(instance)
    case "array":
      return Array.isArray(instance)
    case "null":
      return instance === null
    default:
      throw new SchemaError(`unsupported JSON Schema type ${JSON.stringify(type)}`)
  }
}

function allUnique(items: JsonValue[]): boolean {
  const seen: string[] = []

  for (const item of items) {
    const key = JSON.stringify(sortForComparison(item))

    if (seen.includes(key)) {
      return false
    }

    seen.push(key)
  }

  return true
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortForComparison(a)) === JSON.stringify(sortForComparison(b))
}

function sortForComparison(value: unknown): JsonValue {
  if (isObject(value)) {
    // Null prototype for the same reason as the canonical encoder: assigning
    // `__proto__` on an ordinary object would drop the key instead of copying it.
    const sorted = Object.create(null) as JsonObject

    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortForComparison(value[key])
    }

    return sorted
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sortForComparison(entry))
  }

  return value as JsonValue
}

function violation(keyword: string, instancePath: string, detail: string): Violation {
  return { keyword, path: instancePath || "", detail }
}
