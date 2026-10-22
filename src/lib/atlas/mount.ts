import { mount, unmount } from "svelte"
import type { Chapter } from "./domain"
import AtlasWorkspace, { type AtlasHistory } from "./workspace/AtlasWorkspace.svelte"

export type { AtlasHistory }

/**
 * Mounts the atlas workspace into a SvelteKit-rendered mount point.
 *
 * SvelteKit owns the route, the page shell, and the mount point element; Svelte
 * owns everything inside it, including the single source of truth for selection,
 * time, and camera-follow state. The page bootstrap (`atlas/entry.ts`) is the
 * only caller, so one page has one workspace, and every chapter mounts through
 * this one function with the same behavior and controls.
 */

export type AtlasHandle = {
  /** The chapter the workspace renders. */
  readonly chapterId: string
  /**
   * Moves the workspace to a chapter query (Back and Forward, or a link to the
   * open chapter). `announce` shows the arrival plate, for a link.
   */
  navigate(search: string, announce?: boolean): void
  /** True once the workspace is torn down and its renderer is disposed. */
  readonly disposed: boolean
  /** Tears the workspace down and disposes the renderer. Idempotent. */
  dispose(): void
}

/**
 * What the page states beside the chapter: the display name a reader met on the
 * root page, and the chapter's recorded editorial decision. The page owns both
 * (`chapters.ts`); the workspace falls back to the chapter's own published title
 * when a caller passes none.
 */
export type AtlasHeading = {
  readonly name: string
  readonly decision: string
}

/** Where the workspace starts and how it writes the address (RFD 5's URL contract). */
export type AtlasAddress = {
  /** The address bar's query when the workspace mounts. */
  readonly search: string
  readonly history: AtlasHistory | null
}

export function mountAtlas(
  root: HTMLElement,
  chapter: Chapter,
  heading?: AtlasHeading,
  address?: AtlasAddress,
  stories?: readonly Chapter[],
): AtlasHandle {
  const component = mount(AtlasWorkspace, {
    target: root,
    props: {
      chapter,
      stories: stories ?? [chapter],
      name: heading?.name ?? chapter.title,
      decision: heading?.decision ?? "",
      search: address?.search ?? "",
      history: address?.history ?? null,
    },
  })
  let disposed = false

  return {
    chapterId: chapter.id,
    navigate(search, announce = false) {
      if (!disposed) component.navigate(search, announce)
    },
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
