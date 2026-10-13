<script lang="ts">
  import type { Snippet } from "svelte"
  import SectionLabel from "./SectionLabel.svelte"

  /**
   * Every chrome surface is a plate (RFD 5, `Plate`). `glass` sits over the
   * scene with the gold frame; `solid` is lacquer for sheets and the card when
   * nothing should show through. A plate with a title is a labelled region.
   */
  let {
    tone = "glass",
    title,
    count,
    padded = true,
    class: className,
    children,
  }: {
    tone?: "glass" | "solid"
    title?: string
    count?: number
    padded?: boolean
    class?: string
    children: Snippet
  } = $props()
</script>

<section
  aria-label={title}
  data-tone={tone}
  class={[
    "rounded-plate border text-ink",
    tone === "glass"
      ? "border-frame bg-lacquer-glass shadow-plate backdrop-blur-md"
      : "border-rule bg-lacquer shadow-sheet",
    padded && "px-4 py-3",
    className,
  ]}
>
  {#if title}
    <SectionLabel text={title} {count} class="mb-2" />
  {/if}
  {@render children()}
</section>
