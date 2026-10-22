import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"
import { validate } from "../contract/json-schema"
import { isObject, type JsonObject } from "../contract/types"
import { RECORD_KINDS, type RecordKind } from "./records"

/**
 * The world-first authoring tree (RFD 2, "Decided: directory and identifier
 * realization").
 *
 * Every record lives once under `historical/<kind folder>/`, and its file name
 * is its id: `historical/events/tang/akimeya-landfall-753.yaml` is
 * `lks:event:akimeya-landfall-753`. Subfolders are for authors' tidiness and
 * never change an id, so two files with one name under one kind fail here
 * rather than letting one silently win. Chapters are manifests in
 * `historical/chapters/*.yaml`; the v0 contract, its schemas and vectors stay in
 * `historical/v0`.
 *
 * Every file is checked against its kind's JSON Schema in `historical/schema`
 * before anything is compiled, so a typo is reported against the file an author
 * wrote rather than against generated v0 output.
 *
 * Reading is split from the file system: `buildTree` takes paths and text, so
 * `pnpm approvals` can build the tree an earlier commit held from Git objects
 * with exactly the rules the build uses.
 */

export type FileKind = RecordKind | "source" | "chapter"

export type AuthoringFile = {
  readonly kind: FileKind
  /** The id within its kind: the file name without `.yaml`. */
  readonly name: string
  /** The path below `historical/`, for messages. */
  readonly path: string
  readonly data: JsonObject
}

export type AuthoringTree = {
  /** Records by full id (`lks:event:akimeya-landfall-753`). */
  readonly records: ReadonlyMap<string, AuthoringFile>
  /** Sources by name (`toseiden`). */
  readonly sources: ReadonlyMap<string, AuthoringFile>
  /** Chapter manifests by chapter id. */
  readonly chapters: ReadonlyMap<string, AuthoringFile>
}

export type TreeFile = { readonly path: string; readonly text: string }

/** The folder under `historical/` that holds each kind. */
export const KIND_FOLDERS: Record<FileKind, string> = {
  place: "places",
  actor: "actors",
  event: "events",
  relationship: "relationships",
  source: "sources",
  chapter: "chapters",
}

const historicalRoot = new URL("../../../../historical/", import.meta.url)

/** Absolute path of `historical/`. */
export function historicalDirectory(): string {
  return fileURLToPath(historicalRoot)
}

/** Absolute path of a record-file schema. */
export function schemaFile(kind: FileKind): string {
  return path.join(historicalDirectory(), "schema", `${kind}.schema.json`)
}

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/

function kindOf(relative: string): FileKind | undefined {
  const [folder, ...rest] = relative.split("/")
  const kind = (Object.keys(KIND_FOLDERS) as FileKind[]).find((key) => KIND_FOLDERS[key] === folder)

  // Chapter manifests sit directly in `chapters/`; nothing below it is a manifest.
  if (kind === "chapter" && rest.length !== 1) {
    return undefined
  }

  return kind
}

type ReadFile = { readonly data: JsonObject } | { readonly problems: readonly string[] }

/**
 * Parsed and schema-checked files by kind and text. Parsing and checking every
 * file is most of what building a tree costs, and grows with every record, yet
 * the trees a process builds share nearly all their files: the tests build the
 * real tree with one file edited, and `pnpm approvals` builds the tree at each
 * commit in a manifest's history. A file's result depends only on its kind and
 * text, so each distinct file is read once. Cached data is frozen, so a caller
 * that changed it would fail rather than alter every later tree.
 */
const readCache = new Map<string, ReadFile>()

function readFile(kind: FileKind, text: string): ReadFile {
  const key = `${kind}\n${text}`
  const cached = readCache.get(key)

  if (cached !== undefined) {
    return cached
  }

  const read = parseFile(kind, text)
  readCache.set(key, read)

  return read
}

function parseFile(kind: FileKind, text: string): ReadFile {
  let data: unknown

  try {
    data = parse(text)
  } catch (error) {
    return { problems: [(error as Error).message] }
  }

  if (!isObject(data)) {
    return { problems: ["a record file is a YAML mapping"] }
  }

  const validation = validate(schemaFile(kind), data)

  if (!validation.ok) {
    return {
      problems: validation.violations.map(
        (violation) => `${violation.path || "/"} ${violation.keyword}: ${violation.detail}`,
      ),
    }
  }

  return { data: deepFreeze(data) }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child)
    }

    Object.freeze(value)
  }

  return value
}

/** Collects the tree's files, failing with every problem at once. */
export function buildTree(files: readonly TreeFile[]): AuthoringTree {
  const errors: string[] = []
  const byKind = new Map<FileKind, Map<string, AuthoringFile>>()

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const kind = kindOf(file.path)

    if (kind === undefined || !file.path.endsWith(".yaml")) {
      continue
    }

    const name = path.posix.basename(file.path, ".yaml")

    if (!NAME.test(name)) {
      errors.push(
        `${file.path}: the file name is the id, so it must be lowercase letters, digits and hyphens`,
      )
      continue
    }

    const read = readFile(kind, file.text)

    if ("problems" in read) {
      errors.push(...read.problems.map((problem) => `${file.path}: ${problem}`))
      continue
    }

    const data = read.data

    const folder = byKind.get(kind) ?? new Map<string, AuthoringFile>()
    const existing = folder.get(name)

    if (existing !== undefined) {
      errors.push(
        `${file.path}: ${existing.path} already defines ${name}; an id is the file name, so it must be unique within ${KIND_FOLDERS[kind]}/`,
      )
      continue
    }

    folder.set(name, { kind, name, path: file.path, data })
    byKind.set(kind, folder)
  }

  if (errors.length > 0) {
    throw new Error(
      ["The record files are invalid:", ...errors.map((error) => `  - ${error}`)].join("\n"),
    )
  }

  const records = new Map<string, AuthoringFile>()

  for (const kind of RECORD_KINDS) {
    for (const [name, file] of byKind.get(kind) ?? []) {
      records.set(`lks:${kind}:${name}`, file)
    }
  }

  return {
    records,
    sources: byKind.get("source") ?? new Map(),
    chapters: byKind.get("chapter") ?? new Map(),
  }
}

function walk(directory: string, relative: string, into: TreeFile[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`

    if (entry.isDirectory()) {
      walk(path.join(directory, entry.name), child, into)
    } else if (entry.name.endsWith(".yaml")) {
      into.push({ path: child, text: readFileSync(path.join(directory, entry.name), "utf8") })
    }
  }
}

/** Every record file under `historical/`, as paths below it and their text. */
export function readFiles(root: string = historicalDirectory()): TreeFile[] {
  const files: TreeFile[] = []

  for (const folder of Object.values(KIND_FOLDERS)) {
    try {
      walk(path.join(root, folder), folder, files)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error
      }
    }
  }

  return files
}

/** The authoring tree on disk. */
export function readTree(root: string = historicalDirectory()): AuthoringTree {
  return buildTree(readFiles(root))
}
