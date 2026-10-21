import { compileChapter, type ChapterBundle } from "./authoring/compile"
import { readTree, type AuthoringTree } from "./authoring/tree"
import * as Publication from "./contract/publication"
import { type JsonObject } from "./contract/types"

/**
 * Loading for reviewed chapter content.
 *
 * Content is authored as record files under `historical/` and each chapter is a
 * manifest in `historical/chapters/` (RFD 2). This module is the Node content
 * boundary: it compiles a chapter into complete v0 documents and hands them to
 * the contract's own `Publication.checkAll`, so there is no second validator and
 * no renderer, framework, or browser dependency in the historical content path.
 *
 * A chapter the owner has not approved still compiles, as a draft preview, so
 * its content faces every contract and chapter test before anyone approves it.
 * Whether a chapter is approved is the bundle's `state`, read by the approval
 * gate; a preview set is never evidence of approval.
 */

let cached: AuthoringTree | undefined

/** The authoring tree, read once per process: content does not change under a test run. */
function tree(): AuthoringTree {
  cached ??= readTree()

  return cached
}

/**
 * Ids of every chapter manifest under `historical/chapters`, sorted.
 *
 * The approval gate reads this instead of naming one chapter, so a new chapter
 * cannot appear without the gate deciding what it is.
 */
export function listChapters(): string[] {
  return [...tree().chapters.keys()].sort()
}

export type ChapterTree = {
  readonly name: string
  readonly documents: JsonObject[]
  readonly sets: JsonObject[]
}

/** A chapter's compiled bundle, with its approval state and digest. */
export function chapterBundle(name: string): ChapterBundle {
  return compileChapter(tree(), name, { preview: true })
}

/**
 * Loads a chapter's records, sources, and publication set as contract documents:
 * the approved set when the chapter's approval matches, otherwise a draft
 * preview. Every call returns fresh documents, so a test may edit what it loads.
 */
export function loadChapter(name: string): ChapterTree {
  const bundle = chapterBundle(name)

  // A JSON round trip, not structuredClone: the compiled documents may share
  // objects (a set's publisher and every record's mirror of it), and a test that
  // edits one copy must not edit the others, exactly as with files on disk.
  return JSON.parse(
    JSON.stringify({ name, documents: bundle.documents, sets: bundle.sets }),
  ) as ChapterTree
}

/** Validates a chapter with the contract's own publication semantics. */
export function checkChapter(name: string): Publication.PublicationCheck {
  const chapter = loadChapter(name)

  return Publication.checkAll(chapter.documents, chapter.sets)
}
