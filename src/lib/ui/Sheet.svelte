<script lang="ts" module>
  /** The bottom sheet's resting heights, smallest first. */
  export const DETENTS = ["peek", "half", "full"] as const
  export type Detent = (typeof DETENTS)[number]
</script>

<script lang="ts">
  import type { Snippet } from "svelte"
  import Button from "./Button.svelte"
  import Icon from "./Icon.svelte"
  import { focusRing, transition } from "./classes"

  /**
   * A solid lacquer sheet (RFD 5, `Sheet`): a side panel at desktop, and on
   * phones a bottom sheet that rests at three detents. Peek shows the dial and
   * the current event, half holds the card or the list, full holds the list
   * with search (RFD 5, "Layout").
   *
   * The sheet is non-modal: the scene behind it stays usable, so it does not
   * trap focus. It sits on the fixed `sheet` layer of the z-order ladder, and
   * its parent positions it (the frame owns where things go). Escape inside
   * the sheet closes it when it can be closed. The handle is a real button, so
   * the detents are reachable without a drag.
   */
  let {
    title,
    placement = "side",
    detent = $bindable("half"),
    closable = true,
    class: className,
    ondetent,
    onclose,
    children,
  }: {
    title: string
    placement?: "side" | "bottom"
    detent?: Detent
    closable?: boolean
    class?: string
    ondetent?: (detent: Detent) => void
    onclose?: () => void
    children: Snippet
  } = $props()

  const id = $props.id()

  // The handle steps up through the detents and drops back to peek from full,
  // so one control reaches every height in at most two presses.
  const next = $derived<Detent>(detent === "peek" ? "half" : detent === "half" ? "full" : "peek")

  function step() {
    const to = next
    detent = to
    ondetent?.(to)
  }
</script>

<!--
  Escape bubbles up from whichever control inside the sheet has focus; the
  section only listens for it, it is not itself a control.
-->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  aria-labelledby="{id}-title"
  data-placement={placement}
  data-detent={placement === "bottom" ? detent : undefined}
  onkeydown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented && closable && onclose) {
      event.stopPropagation()
      onclose()
    }
  }}
  class={[
    "z-(--z-sheet) flex min-h-0 flex-col overflow-hidden border border-rule bg-lacquer text-ink shadow-sheet",
    placement === "side" && "h-full w-full rounded-plate",
    placement === "bottom" && [
      "w-full rounded-t-plate border-b-0",
      "transition-[height] duration-(--motion-base) ease-ui",
      detent === "peek" && "h-36",
      detent === "half" && "h-[50dvh]",
      detent === "full" && "h-[calc(100dvh-3.5rem)]",
    ],
    className,
  ]}
>
  {#if placement === "bottom"}
    <button
      type="button"
      onclick={step}
      aria-label={next === "peek" ? `Collapse ${title}` : `Expand ${title}`}
      class={[
        "group flex h-6 w-full shrink-0 cursor-pointer items-center justify-center",
        transition,
        focusRing,
      ]}
    >
      <span aria-hidden="true" class="h-1 w-10 rounded-full bg-rule group-hover:bg-ink-faint"
      ></span>
      <Icon
        name={next === "peek" ? "chevron-down" : "chevron-up"}
        size={14}
        class="ml-1 text-ink-faint"
      />
    </button>
  {/if}
  <header class="flex shrink-0 items-center gap-2 px-4 pb-2">
    <h2 id="{id}-title" class="min-w-0 flex-1 truncate font-serif text-title-sm">{title}</h2>
    {#if closable && onclose}
      <Button variant="icon" icon="close" size="sm" label="Close {title}" onclick={onclose} />
    {/if}
  </header>
  <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
    {@render children()}
  </div>
</section>
