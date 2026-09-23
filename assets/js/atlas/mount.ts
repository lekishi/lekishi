import { mount, unmount } from "svelte"
import AtlasWorkspace from "./workspace/AtlasWorkspace.svelte"

/**
 * Mounts the atlas workspace into a Phoenix-rendered mount point.
 *
 * Phoenix owns the page shell, the route, and the mount point element; Svelte
 * owns everything inside it, including the single source of truth for selection,
 * time, and camera-follow state. The page bootstrap (`atlas/entry.ts`) is the
 * only caller, so one page has one workspace.
 */
export type AtlasHandle = {
  /** True once the workspace is torn down and its renderer is disposed. */
  readonly disposed: boolean
  /** Tears the workspace down and disposes the renderer. Idempotent. */
  dispose(): void
}

export function mountAtlas(root: HTMLElement): AtlasHandle {
  const component = mount(AtlasWorkspace, { target: root })
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
