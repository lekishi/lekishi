/**
 * Shared value types for the v0 historical contract.
 *
 * The contract is defined over JSON documents: schemas, examples, and vectors
 * are JSON files, and every document field is JSON. These aliases keep that
 * explicit instead of falling back to `any`, and the small accessors below
 * mirror the reference semantics' "missing or wrong type behaves as empty"
 * style (`document["content"] || %{}`).
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject

export type JsonObject = { [key: string]: JsonValue }

/** A `{:ok, value} | {:error, codes}` result, as the reference semantics return. */
export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<T>(errors: string[]): Result<T> {
  return { ok: false, errors }
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isList(value: unknown): value is JsonValue[] {
  return Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === "string"
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean"
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
}

/** An object value, or an empty object when the value is missing or not an object. */
export function objectOf(value: unknown): JsonObject {
  return isObject(value) ? value : {}
}

/** A list value, or an empty list when the value is missing or not a list. */
export function listOf(value: unknown): JsonValue[] {
  return isList(value) ? value : []
}

/** A string value, or undefined when the value is missing or not a string. */
export function stringOf(value: unknown): string | undefined {
  return isString(value) ? value : undefined
}

/** True when the value is missing, null, or the empty string. */
export function blank(value: unknown): boolean {
  return value === undefined || value === null || value === ""
}
