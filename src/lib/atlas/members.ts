import type { ChapterCard } from "./chapters"
import type { SearchIndex } from "./search-index"

/**
 * What the prerendered pages add for a signed-in member of the lekishi
 * organization (RFD 6). The pages are the same files for everyone; after they
 * have painted, a member's browser asks the Pages worker for the drafts.
 *
 * The readable `lekishi_member` cookie is only a hint that a session exists,
 * set and cleared with it, so a reader who is not signed in never makes these
 * requests. It is not the credential: the worker checks the session itself and
 * answers anyone without one with a 404.
 */

/** Whether this browser holds the members' hint. Browser-only. */
export function memberHinted(): boolean {
  try {
    return document.cookie.split("; ").includes("lekishi_member=1")
  } catch {
    return false
  }
}

/** Where to sign in, coming back to `path` afterwards. */
export function signInHref(path: string): string {
  return `/auth/login?next=${encodeURIComponent(path)}`
}

async function memberJson<T>(url: string): Promise<T | null> {
  if (!memberHinted()) return null

  try {
    const response = await fetch(url, { credentials: "same-origin" })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

/** The drafts' cards for the home page, or none for anyone but a member. */
export async function loadDraftCards(): Promise<ChapterCard[]> {
  return (await memberJson<ChapterCard[]>("/drafts.json")) ?? []
}

/** The drafts' search index, or null for anyone but a member. */
export function loadDraftSearchIndex(): Promise<SearchIndex | null> {
  return memberJson<SearchIndex>("/drafts/search-index.json")
}
