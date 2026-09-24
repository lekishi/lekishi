import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as Publication from "./contract/publication"
import { type JsonObject } from "./contract/types"

/**
 * Loading for reviewed chapter content trees.
 *
 * The versioned contract lives in `historical/v0`; reviewed chapters live beside
 * it in `historical/chapters/<name>` with the same tree shape as the synthetic
 * examples (`records/`, `sources/`, `publication-sets/`). This module is the
 * content boundary: it reads the files and hands them to the contract's own
 * `Publication.checkAll`, so there is no second validator and no renderer,
 * framework, or browser dependency in the historical content path.
 */

const chaptersRoot = new URL("../../../historical/chapters/", import.meta.url)

/** Absolute path of a reviewed chapter tree. */
export function chapterDirectory(name: string): string {
  return fileURLToPath(new URL(name, chaptersRoot))
}

export type ChapterTree = {
  readonly name: string
  readonly documents: JsonObject[]
  readonly sets: JsonObject[]
}

function loadDirectory(directory: string, subdirectory: string): JsonObject[] {
  return readdirSync(path.join(directory, subdirectory))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map(
      (file) =>
        JSON.parse(readFileSync(path.join(directory, subdirectory, file), "utf8")) as JsonObject,
    )
}

/** Loads a chapter's records, sources, and publication sets as contract documents. */
export function loadChapter(name: string): ChapterTree {
  const directory = chapterDirectory(name)

  return {
    name,
    documents: [...loadDirectory(directory, "records"), ...loadDirectory(directory, "sources")],
    sets: loadDirectory(directory, "publication-sets"),
  }
}

/** Validates a chapter with the contract's own publication semantics. */
export function checkChapter(name: string): Publication.PublicationCheck {
  const tree = loadChapter(name)

  return Publication.checkAll(tree.documents, tree.sets)
}
