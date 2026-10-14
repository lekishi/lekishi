/**
 * Where the reader left off, kept on this device only (RFD 5, "Continue where
 * you left off"). The home page offers the last chapter position, and the
 * chapter switcher offers each chapter's own.
 *
 * Only a chapter id, the chapter's query string and a short label are kept:
 * no account, no server, nothing that leaves the browser. Storage can be
 * missing or throw (a private window, blocked site data, a prerender), so
 * every read and write is guarded and a failure is the same as no memory.
 */

export type Position = {
  readonly chapterId: string
  /** The chapter's query string, with its `?`, or the empty string. */
  readonly search: string
  /** What the reader was looking at, in a few words. */
  readonly label: string
  /** Milliseconds since the epoch. */
  readonly at: number
}

const KEY = "lekishi:positions:v1"

type Stored = { readonly last: string | null; readonly chapters: Record<string, Position> }

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function isPosition(value: unknown): value is Position {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.chapterId === "string" &&
    typeof candidate.search === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.at === "number"
  )
}

function read(): Stored {
  const empty: Stored = { last: null, chapters: {} }

  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return empty
    const { last, chapters } = parsed as { last?: unknown; chapters?: unknown }
    const kept: Record<string, Position> = {}

    if (typeof chapters === "object" && chapters !== null) {
      for (const [id, position] of Object.entries(chapters)) {
        if (isPosition(position) && position.chapterId === id) kept[id] = position
      }
    }

    return { last: typeof last === "string" && last in kept ? last : null, chapters: kept }
  } catch {
    return empty
  }
}

/** Remembers a chapter position and makes it the one "Continue" offers. */
export function rememberPosition(position: Position): void {
  try {
    const stored = read()
    storage()?.setItem(
      KEY,
      JSON.stringify({
        last: position.chapterId,
        chapters: { ...stored.chapters, [position.chapterId]: position },
      }),
    )
  } catch {
    // Storage full or blocked: forgetting is the safe failure.
  }
}

/** The last position in a chapter, or null. */
export function chapterPosition(chapterId: string): Position | null {
  return read().chapters[chapterId] ?? null
}

/** The position "Continue where you left off" offers, or null. */
export function lastPosition(): Position | null {
  const stored = read()
  return stored.last === null ? null : (stored.chapters[stored.last] ?? null)
}

/** Forgets every position. */
export function forgetPositions(): void {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // Nothing to forget.
  }
}
