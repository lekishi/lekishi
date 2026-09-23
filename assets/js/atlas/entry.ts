import { mountAtlas, type AtlasHandle } from "./mount"

/**
 * The atlas page's bootstrap module.
 *
 * This is the only module that mounts the workspace, and it is the atlas page's
 * own entry (`/assets/js/atlas.js`, digested in production); the page also loads
 * the Phoenix bundle from the root layout. It must stay a separate Vite entry
 * rather than a dynamic import from `js/app.ts`: Phoenix rewrites the script URL
 * to its digested name while Vite's chunk imports reference an entry by its
 * unhashed name, so an entry that a chunk imports is fetched and evaluated twice
 * in production, which would mount two workspaces, two event lists, and two
 * globes.
 *
 * One page has one workspace owner: mounting is skipped while a live workspace
 * exists, and the workspace is released at the page-teardown boundary
 * (`pagehide`, which also precedes a back/forward-cache freeze) and re-created on
 * `pageshow` so a restored page still has exactly one workspace.
 */

declare global {
  interface Window {
    /** Diagnostic handle for browser checks and manual debugging. */
    __lekishiAtlas?: AtlasHandle
  }
}

let workspace: AtlasHandle | null = null

function mountPoint(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#atlas-workspace")
}

function reportFailure(root: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)

  root.replaceChildren()
  const alert = document.createElement("p")
  alert.setAttribute("role", "alert")
  alert.className = "p-6 text-sm text-rose-200"
  alert.textContent = `The atlas workspace failed to load: ${message}`
  root.append(alert)
}

/** Mounts the workspace once, unless the page already has a live one. */
export function mountWorkspace(): void {
  const root = mountPoint()

  if (root === null || (workspace !== null && !workspace.disposed)) {
    return
  }

  // Clear the mount point so a retry after a failed load, or a restored page,
  // does not stack a second workspace (or its error message) under the new one.
  root.replaceChildren()
  workspace = null

  try {
    workspace = mountAtlas(root)
    window.__lekishiAtlas = workspace
  } catch (error) {
    reportFailure(root, error)
  }
}

/** Releases the workspace and the renderer it owns. Safe to call repeatedly. */
export function releaseWorkspace(): void {
  workspace?.dispose()
  workspace = null
  window.__lekishiAtlas = undefined
}

/** Wires the page-teardown and restore boundaries. */
export function watchWorkspaceLifecycle(): void {
  window.addEventListener("pagehide", releaseWorkspace)
  window.addEventListener("pageshow", mountWorkspace)
}

mountWorkspace()
watchWorkspaceLifecycle()
