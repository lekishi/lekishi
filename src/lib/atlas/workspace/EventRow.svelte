<script lang="ts">
  import type { SceneEvent } from "../scene"
  import { occurrenceLabel, playbackLabel, placementLabel } from "../labels"

  /**
   * One event row, shared by the window's event list and the search results.
   *
   * Both surfaces describe the same event, so they render the same row: the title,
   * the place as the record states it (a display anchor is never an asserted
   * location), the occurrence with its precision and mode, and the cues a reader
   * has to be able to see — a possible match at the playhead, a disputed account,
   * a coda node, and an event the selected window excludes.
   *
   * The cues do not depend on colour alone: each is a labelled badge, and the
   * outside-window badge says in words why the row is in the list.
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
</script>

<button
  type="button"
  data-testid="atlas-event-item"
  data-event-id={event.id}
  aria-current={event.selected ? "true" : undefined}
  onclick={() => onSelect(event.id)}
  class={[
    "w-full rounded-lg border px-3 py-2 text-left transition",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
    event.selected
      ? "border-amber-300/80 bg-amber-300/10"
      : "border-slate-700/70 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-800/70",
  ]}
>
  <!--
    The title and its badges share a row when the title is short, and the
    badges drop to their own line when a longer title needs the width;
    without the wrap a long title runs under the badge at phone widths.
  -->
  <span class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
    <span class="text-sm font-medium text-slate-100">{event.title}</span>
    {#if playbackLabel(event.playback)}
      <span
        class={[
          "shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide",
          event.playback === "active"
            ? "bg-emerald-400/15 text-emerald-300"
            : "border border-amber-300/60 text-amber-200",
        ]}
      >
        {playbackLabel(event.playback)}
      </span>
    {/if}
  </span>
  <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
    <span>{placementLabel(event.placement)}</span>
    <span aria-hidden="true">·</span>
    <span class="tabular-nums">{occurrenceLabel(event.occurrence)}</span>
    {#if event.relation === "possible"}
      <span
        class="rounded-full border border-sky-400/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-sky-300"
      >
        possible
      </span>
    {/if}
    {#if event.relation === "outside"}
      <span
        data-testid="atlas-outside-badge"
        class="rounded-full border border-sky-400/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-sky-300"
      >
        outside the window
      </span>
    {/if}
    {#if event.dispute}
      <span
        data-testid="atlas-dispute-badge"
        class="rounded-full border border-rose-400/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-rose-300"
      >
        disputed account
      </span>
    {/if}
    {#if event.coda}
      <span
        class="rounded-full border border-violet-400/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-violet-300"
      >
        coda node
      </span>
    {/if}
  </span>
  {#if matchedText}
    <span class="mt-1 block text-[0.65rem] leading-snug text-slate-500">matched {matchedText}</span>
  {/if}
</button>
