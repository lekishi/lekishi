import type { Chapter } from "./domain"
import { mountAtlas, type AtlasHandle, type AtlasHeading, type AtlasHistory } from "./mount"

/**
 * The atlas workspace's single mount owner.
 *
 * A chapter route renders a prerendered shell with an `#atlas-workspace` mount
 * point and calls `startAtlasPage` once it is in the browser, naming the chapter
 * it renders and the heading the chapter's card supplies. This module is the only
 * caller of `mountAtlas`: mounting is skipped while a live workspace exists, so a
 * second evaluation of this module — a duplicated bundle, a re-run, or a
 * back/forward-cache restore — cannot stack a second workspace, event list, or
 * globe onto the page.
 *
 * The page-teardown boundary is `pagehide`, which also precedes a
 * back/forward-cache freeze; `pageshow` re-creates the workspace, so a restored
 * page still has exactly one.
 *
 * The module has no import-time side effects: SvelteKit prerenders the chapter
 * shell on the server, where `document` does not exist. `startAtlasPage` wires
 * the lifecycle listeners once and is safe to call on every navigation.
 */

declare global {
  interface Window {
    /** Diagnostic handle for browser checks and manual debugging. */
    __lekishiAtlas?: AtlasHandle
  }
}

let workspace: AtlasHandle | null = null
let watching = false

// The chapter and heading the page asked for, kept so a back/forward-cache
// restore re-creates the same workspace rather than an empty or default one.
let currentChapter: Chapter | null = null
let currentStories: readonly Chapter[] | null = null
let currentHeading: AtlasHeading | undefined
let currentHistory: AtlasHistory | null = null
// The address the page started at, used once: a restored page reads its own.
let startSearch: string | null = null

/**
 * True in a browser. SvelteKit renders the chapter shell on the server while
 * prerendering, so every entry point here is a no-op without a document instead
 * of throwing during the build.
 */
function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

function mountPoint(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#atlas-workspace")
}

function reportFailure(root: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)

  root.replaceChildren()
  const alert = document.createElement("p")
  alert.setAttribute("role", "alert")
  alert.className = "p-6 text-body-sm text-danger"
  alert.textContent = `The atlas workspace failed to load: ${message}`
  root.append(alert)
}

/** Mounts the workspace once, unless the page already has a live one. */
export function mountWorkspace(): void {
  if (!inBrowser()) {
    return
  }

  const root = mountPoint()

  if (root === null || currentChapter === null || (workspace !== null && !workspace.disposed)) {
    return
  }

  // Clear the mount point so a retry after a failed load, or a restored page,
  // does not stack a second workspace (or its error message) under the new one.
  root.replaceChildren()
  workspace = null

  try {
    // The address is read at mount time, not when the page started: a page
    // restored from the back/forward cache mounts at the address it shows.
    workspace = mountAtlas(
      root,
      currentChapter,
      currentHeading,
      {
        search: startSearch ?? window.location.search,
        history: currentHistory,
      },
      currentStories ?? [currentChapter],
    )
    startSearch = null
    window.__lekishiAtlas = workspace
  } catch (error) {
    reportFailure(root, error)
  }
}

/** Releases the workspace and the renderer it owns. Safe to call repeatedly. */
export function releaseWorkspace(): void {
  if (!inBrowser()) {
    return
  }

  workspace?.dispose()
  workspace = null
  window.__lekishiAtlas = undefined
}

/** Wires the page-teardown and restore boundaries. Registers listeners once. */
export function watchWorkspaceLifecycle(): void {
  if (!inBrowser() || watching) {
    return
  }

  watching = true
  window.addEventListener("pagehide", releaseWorkspace)
  window.addEventListener("pageshow", mountWorkspace)
}

/**
 * Starts a chapter page: one workspace owner, one set of lifecycle listeners, one
 * chapter. Called by the chapter route after the prerendered shell is in the DOM.
 * `heading` is the chapter's display name and recorded decision — product
 * presentation the route takes from `chapters.ts`; without it the workspace uses
 * the chapter's published title and states no decision line. `history` writes
 * the reader's position into the address (the route supplies SvelteKit's
 * shallow routing), and `search` is the address the route is rendering, which
 * the router may not have written to `location` yet; without it the workspace
 * reads `location`. `stories` is every story's view of a chapter with several,
 * `chapter` first.
 */
export function startAtlasPage(
  chapter: Chapter,
  heading?: AtlasHeading,
  history: AtlasHistory | null = null,
  search: string | null = null,
  stories: readonly Chapter[] | null = null,
): void {
  currentChapter = chapter
  currentStories = stories
  currentHeading = heading
  currentHistory = history
  startSearch = search
  watchWorkspaceLifecycle()
  mountWorkspace()
}

/**
 * Moves the live workspace to an address in its own chapter: Back and Forward
 * between the entries it wrote, or a link to the chapter already open. A
 * request for another chapter is ignored, because that chapter mounts its own
 * workspace with the address it was opened at.
 */
export function navigateWorkspace(chapterId: string, search: string, announce = false): void {
  if (workspace !== null && !workspace.disposed && workspace.chapterId === chapterId) {
    workspace.navigate(search, announce)
  }
}
