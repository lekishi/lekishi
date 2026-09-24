import { createHash } from "node:crypto"
import { isObject, type JsonObject, type JsonValue } from "./types"

/**
 * Canonical JSON encoding and revision hashing for the v0 historical contract.
 *
 * The hash is what makes "the exact revision approved" checkable in a file-based
 * workflow: publication sets store `sha256:` hashes over the canonical encoding
 * of a revision body without its own `revision_hash` field. A later edit to a
 * published revision changes the hash and fails validation, so published history
 * cannot be rewritten silently.
 *
 * Canonical encoding sorts object keys recursively and emits no insignificant
 * whitespace, so the hash does not depend on key order or formatting. This is the
 * same encoding the Elixir reference implementation produced, which is why the
 * stored hashes in `historical/v0/examples` still verify: keys sort by UTF-8 byte
 * order, numbers use the shortest round-trip form, and strings are escaped the
 * same way.
 */

/** Sorts keys by UTF-8 byte order, matching Elixir's binary term ordering. */
function compareKeys(a: string, b: string): number {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")

  return Buffer.compare(left, right)
}

export function canonical(value: unknown): JsonValue {
  if (isObject(value)) {
    // A null-prototype accumulator. Assigning `__proto__` on an ordinary object
    // runs the inherited setter instead of creating an own property, which would
    // silently drop that key from the canonical encoding and therefore from the
    // hash: an edited `__proto__` field would keep the same revision hash.
    const sorted = Object.create(null) as JsonObject

    for (const key of Object.keys(value).sort(compareKeys)) {
      sorted[key] = canonical(value[key])
    }

    return sorted
  }

  if (Array.isArray(value)) {
    return value.map((entry) => canonical(entry))
  }

  return value as JsonValue
}

/** The canonical JSON text of a value: sorted keys, no insignificant whitespace. */
export function encode(value: unknown): string {
  return JSON.stringify(canonical(value))
}

/** Lowercase hex SHA-256 of a UTF-8 string. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

function hashWithout(document: JsonObject, key: string): string {
  const body: JsonObject = { ...document }
  delete body[key]

  return `sha256:${sha256(encode(body))}`
}

/** Hashes a revision body without its own `revision_hash` field. */
export function revisionHash(revision: JsonObject): string {
  return hashWithout(revision, "revision_hash")
}

/**
 * Hashes a source document without its own `source_hash`.
 *
 * Source metadata is what publication review approves: a publication set pins the
 * `source_hash` of every source cited by a published revision, so editing a title
 * or a license attribution after approval is detected even if the source document
 * is resealed.
 */
export function sourceHash(source: JsonObject): string {
  return hashWithout(source, "source_hash")
}

export function isHash(value: unknown): boolean {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value)
}
