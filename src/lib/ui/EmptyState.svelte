<script lang="ts" module>
  /**
   * The two empty states RFD 1 keeps apart. "Uncovered" says the atlas has no
   * records here, which is a gap in coverage and not evidence that nothing
   * happened. "Filtered" says records exist and the current filters or window
   * hide them. Confusing the two would tell a reader something false about
   * the past, so each has its own words and glyph.
   */
  export const EMPTY_STATES = {
    uncovered: {
      title: "Not yet covered",
      body: "The atlas has no records here yet. That is a gap in coverage, not evidence that nothing happened.",
    },
    filtered: {
      title: "No results with these filters",
      body: "Records exist here, but the current search, filters or time window hide them.",
    },
  } as const

  export type EmptyKind = keyof typeof EMPTY_STATES
</script>

<script lang="ts">
  import type { Snippet } from "svelte"
  import Icon from "./Icon.svelte"

  let {
    kind,
    title,
    class: className,
    children,
    action,
  }: {
    kind: EmptyKind
    title?: string
    class?: string
    /** Replaces the default explanation. */
    children?: Snippet
    /** A way out, such as clearing the filters. */
    action?: Snippet
  } = $props()
</script>

<div
  data-empty={kind}
  class={[
    "flex flex-col items-start gap-2 rounded-plate border px-4 py-3",
    kind === "uncovered" ? "border-dashed border-rule" : "border-rule bg-lacquer-raised",
    className,
  ]}
>
  <p class="flex items-center gap-2 text-body-sm font-semibold text-ink">
    <Icon name={kind === "uncovered" ? "outside" : "search"} size={16} class="text-ink-faint" />
    {title ?? EMPTY_STATES[kind].title}
  </p>
  <div class="text-body-sm text-ink-dim">
    {#if children}
      {@render children()}
    {:else}
      {EMPTY_STATES[kind].body}
    {/if}
  </div>
  {#if action}
    {@render action()}
  {/if}
</div>
