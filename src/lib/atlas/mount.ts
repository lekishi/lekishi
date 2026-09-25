import { mount, unmount } from "svelte"
import type { Chapter } from "./domain"
import AtlasWorkspace from "./workspace/AtlasWorkspace.svelte"

/**
 * Mounts the atlas workspace into a SvelteKit-rendered mount point.
 *
 * SvelteKit owns the route, the page shell, and the mount point element; Svelte
 * owns everything inside it, including the single source of truth for selection,
 * time, and camera-follow state. The page bootstrap (`atlas/entry.ts`) is the
 * only caller, so one page has one workspace.
 */
/**
 * Which detail surface the workspace shows. `production` is the reviewed launch
 * chapter's surface; `comparison-review` additionally marks disputed events and
 * shows their published accounts, which is the comparison fixture's review
 * surface. The distinction exists so a review surface can show more without
 * changing what the approved launch chapter renders.
 */
export type AtlasDetail = "production" | "comparison-review"

export type AtlasHandle = {
  /** True once the workspace is torn down and its renderer is disposed. */
  readonly disposed: boolean
  /** Tears the workspace down and disposes the renderer. Idempotent. */
  dispose(): void
}

export function mountAtlas(
  root: HTMLElement,
  chapter: Chapter,
  detail: AtlasDetail = "production",
): AtlasHandle {
  const component = mount(AtlasWorkspace, { target: root, props: { chapter, detail } })
  let disposed = false

  return {
    get disposed() {
      return disposed
    },
    dispose() {
      if (disposed) {
        return
      }

      disposed = true
      void unmount(component)
    },
  }
}
