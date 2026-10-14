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
    level = 2,
    padded = true,
    class: className,
    children,
  }: {
    tone?: "glass" | "solid"
    title?: string
    count?: number
    /** The title's heading level, so a plate fits the page's outline. */
    level?: 2 | 3 | 4
    padded?: boolean
    class?: string
    children: Snippet
  } = $props()
</script>

<!--
  Named by the title alone: the heading also carries the count, which would
  make every landmark read "Sources 11".
-->
<section
  aria-label={title}
  data-tone={tone}
  class={[
    "min-w-0 rounded-plate border text-ink",
    tone === "glass"
      ? "border-frame bg-lacquer-glass shadow-plate backdrop-blur-md"
      : "border-rule bg-lacquer shadow-sheet",
    padded && "px-4 py-3",
    className,
  ]}
>
  {#if title}
    <SectionLabel text={title} {count} {level} class="mb-2" />
  {/if}
  {@render children()}
</section>
