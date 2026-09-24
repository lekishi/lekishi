import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { revisionHash, sourceHash } from "./canonical"
import { contractFile } from "./documents"
import { isList, isObject, isString, listOf, objectOf, type JsonObject } from "./types"

/**
 * Maintenance utility for the worked examples.
 *
 * Rewrites the hash fields under `historical/v0/examples` with the hashes of the
 * current content: each source document's `source_hash`, each revision's
 * `revision_hash`, the record's publication mirror, and the publication set's
 * member and source pins. Replacement is positional and textual, so it works
 * whether a file still carries an author's placeholder (`sha256:000...001`) or a
 * stale hash from an earlier seal, and it preserves the hand-written formatting
 * and key order of the example files.
 *
 * Run after editing example content:
 *
 *     pnpm seal
 *
 * Resealing rewrites a source document or a record, not the publication set that
 * pinned it earlier: the contract tests compare set pins with the current content,
 * so an edited approved source or revision fails until the examples are resealed
 * and the change is reviewed as a new source document or a new revision.
 */

const HASH_LITERAL = /"sha256:[0-9a-f]{64}"/g

export function examplesDirectory(): string {
  return contractFile("examples")
}

export function sealAll(directory: string = examplesDirectory()): void {
  const chaptersDirectory = path.resolve(examplesDirectory(), "..", "..", "chapters")
  const targetDirectory = path.resolve(directory)

  if (
    targetDirectory === chaptersDirectory ||
    targetDirectory.startsWith(`${chaptersDirectory}${path.sep}`)
  ) {
    throw new Error(
      "sealAll only reseals the synthetic worked examples; published chapter content requires a new revision and publication set",
    )
  }

  const sourceHashes = sealSources(directory)
  const recordHashes = sealRecords(directory)

  sealSets(directory, recordHashes, sourceHashes)
}

function sealSources(directory: string): Map<string, string> {
  const hashes = new Map<string, string>()

  for (const file of sortedFiles(directory, "sources")) {
    const document = readJson(file)
    const hash = sourceHash(document)

    sealHashes(file, [hash])
    hashes.set(String(document["source_id"]), hash)
  }

  return hashes
}

function sealRecords(directory: string): Map<string, Map<string, string>> {
  const hashes = new Map<string, Map<string, string>>()

  for (const file of sortedFiles(directory, "records")) {
    const document = readJson(file)
    const revisions = listOf(document["revisions"])
    const revisionHashes = revisions.map((revision) => revisionHash(objectOf(revision)))

    // Hash fields appear in file order: one revision_hash per revision, then the
    // publication mirror's published_revision_hash.
    const publication = objectOf(document["publication"])
    const mirrorHashes = isString(publication["published_revision_id"])
      ? [
          revisionHashes[
            revisions.findIndex(
              (revision) =>
                objectOf(revision)["revision_id"] === publication["published_revision_id"],
            )
          ],
        ]
      : []

    sealHashes(file, [...revisionHashes, ...mirrorHashes])

    const byRevision = new Map<string, string>()

    revisions.forEach((revision, index) => {
      byRevision.set(String(objectOf(revision)["revision_id"]), revisionHashes[index])
    })
    hashes.set(String(document["record_id"]), byRevision)
  }

  return hashes
}

function sealSets(
  directory: string,
  recordHashes: Map<string, Map<string, string>>,
  sourceHashes: Map<string, string>,
): void {
  for (const file of sortedFiles(directory, "publication-sets")) {
    const document = readJson(file)

    const memberHashes = listOf(document["members"]).flatMap((memberValue) => {
      const member = objectOf(memberValue)
      const hash = recordHashes.get(String(member["record_id"]))?.get(String(member["revision_id"]))

      return hash === undefined ? [] : [hash]
    })

    const pinHashes = listOf(document["sources"]).flatMap((sourceValue) => {
      const hash = sourceHashes.get(String(objectOf(sourceValue)["source_id"]))

      return hash === undefined ? [] : [hash]
    })

    sealHashes(file, [...memberHashes, ...pinHashes])
  }
}

function sortedFiles(directory: string, subdirectory: string): string[] {
  const root = path.join(directory, subdirectory)

  return readdirSync(root)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => path.join(root, file))
}

function readJson(file: string): JsonObject {
  return JSON.parse(readFileSync(file, "utf8")) as JsonObject
}

function sealHashes(file: string, hashes: string[]): void {
  const text = readFileSync(file, "utf8")
  const matches = [...text.matchAll(HASH_LITERAL)]

  if (matches.length !== hashes.length) {
    throw new Error(
      `${file} contains ${matches.length} hash fields but ${hashes.length} hashes were computed; ` +
        "add or remove the missing field instead of editing a hash by hand",
    )
  }

  // A hash literal and its replacement are the same length, so replacing by byte
  // offset in order cannot shift the later spans.
  let sealed = text

  hashes.forEach((hash, index) => {
    const start = matches[index].index

    sealed = sealed.slice(0, start) + `"${hash}"` + sealed.slice(start + matches[index][0].length)
  })

  writeFileSync(file, sealed)
}

/**
 * The all-zeros placeholder an author can write before sealing a file.
 *
 * Sealing does not require it: any hash literal in the expected position is
 * replaced. It only makes an unsealed value obvious while editing.
 */
export function placeholder(index: number): string {
  return `sha256:${String(index).padStart(64, "0")}`
}
