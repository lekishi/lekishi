<script lang="ts">
  /**
   * The caps section label with an optional count (RFD 5, `text-label`). Latin
   * only and never a sentence: a CJK heading takes `text-body-sm` instead, so a
   * historical name is never set in tracked capitals at 11 px.
   */
  let {
    text,
    count,
    level = 2,
    class: className,
  }: {
    text: string
    count?: number
    level?: 2 | 3 | 4
    class?: string
  } = $props()
</script>

<svelte:element
  this={`h${level}`}
  class={["flex items-baseline gap-2 text-label font-semibold uppercase text-ink-dim", className]}
>
  <span>{text}</span>
  {#if count !== undefined}
    <span class="font-normal tabular-nums tracking-normal text-ink-faint">{count}</span>
  {/if}
</svelte:element>
