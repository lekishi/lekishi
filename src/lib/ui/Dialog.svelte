<script lang="ts">
  import type { Snippet } from "svelte"

  /**
   * A modal dialog (RFD 5, `Dialog`): search, the chapter switcher and About.
   * It is the native `<dialog>`, so focus is trapped, Escape closes it and the
   * page behind is inert without any script of ours. `open` is owned by the
   * caller; every way of closing (Escape, the backdrop, a close button) is
   * reported through `onclose` so the caller's state cannot drift from the
   * element's.
   *
   * `placement="top"` sits the dialog near the top of the viewport, where a
   * search field belongs; `center` is for a sheet that is read.
   */
  let {
    open,
    labelledby,
    id,
    placement = "center",
    class: className,
    onclose,
    children,
  }: {
    open: boolean
    /** The id of the element that names the dialog. */
    labelledby: string
    id?: string
    placement?: "center" | "top"
    class?: string
    onclose: () => void
    children: Snippet
  } = $props()

  let dialog: HTMLDialogElement | undefined = $state()

  $effect(() => {
    const element = dialog

    if (element === undefined) {
      return
    }

    if (open && !element.open) {
      // jsdom has no modal dialogs; the attribute alone is enough there.
      if (typeof element.showModal === "function") element.showModal()
      else element.setAttribute("open", "")
    } else if (!open && element.open) {
      if (typeof element.close === "function") element.close()
      else element.removeAttribute("open")
    }
  })
</script>

<dialog
  bind:this={dialog}
  {id}
  aria-labelledby={labelledby}
  onclose={() => open && onclose()}
  onclick={(event) => {
    // A click on the backdrop lands on the dialog element itself.
    if (event.target === dialog) onclose()
  }}
  class={[
    "max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-plate border border-frame bg-lacquer p-0 text-ink shadow-sheet backdrop:bg-abyss/70 backdrop:backdrop-blur-sm",
    "max-h-[calc(100dvh-1.5rem)]",
    placement === "center" ? "m-auto" : "mx-auto mt-[12dvh] mb-auto",
    className,
  ]}
>
  {@render children()}
</dialog>
