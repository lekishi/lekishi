<script lang="ts">
  import { Badge, focusRing, transition } from "$lib/ui"
  import { windowLabel } from "../labels"
  import type { SceneEvent } from "../scene"

  /**
   * One event row, shared by the window's list, search results and a place's
   * events. Both surfaces describe the same event, so they render the same row:
   * the title in the serif (the name leads), the place as the record states it,
   * the year span, and the cues a reader has to see, each a glyph and a word: at
   * the playhead, possible, disputed account, coda, outside the window, and no
   * sourced position. A display anchor is never described as a location.
   */
  let {
    event,
    matchedText = null,
    onSelect,
  }: {
    event: SceneEvent
    /** What a search matched, shown so a result explains itself. */
    matchedText?: string | null
    onSelect: (eventId: string) => void
  } = $props()

  const span = $derived(
    windowLabel({ start: event.occurrence.startYear, end: event.occurrence.endYear }),
  )
</script>

<button
  type="button"
  data-testid="atlas-event-item"
  data-event-id={event.id}
  aria-current={event.selected ? "true" : undefined}
  onclick={() => onSelect(event.id)}
  class={[
    "group flex w-full cursor-pointer flex-col gap-1 rounded-plate border px-3 py-2 text-left",
    transition,
    focusRing,
    event.selected
      ? "border-gold bg-gold-tint"
      : "border-transparent hover:border-rule hover:bg-lacquer-raised",
  ]}
>
  <span class="font-serif text-body-sm font-semibold text-ink">{event.title}</span>
  <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-dim">
    <span class="tabular-nums">{span}</span>
    {#if event.placement.label}
      <span aria-hidden="true">·</span>
      <span class="font-serif">{event.placement.label}</span>
    {/if}
    {#if event.playback === "active"}
      <Badge kind="active" />
    {:else if event.playback === "possible"}
      <Badge kind="possible" text="possible at the playhead" />
    {/if}
    {#if event.relation === "possible"}
      <Badge kind="possible" text="partly in the window" />
    {/if}
    {#if event.relation === "outside"}
      <span data-testid="atlas-outside-badge"><Badge kind="outside" /></span>
    {/if}
    {#if event.dispute}
      <span data-testid="atlas-dispute-badge"><Badge kind="disputed" /></span>
    {/if}
    {#if event.coda}
      <Badge kind="coda" />
    {/if}
    {#if event.placement.kind === "none"}
      <Badge kind="unlocated" text="not on the map" />
    {/if}
  </span>
  {#if matchedText}
    <span class="text-caption text-ink-dim"
      >matched <span class="font-serif">{matchedText}</span></span
    >
  {/if}
</button>
