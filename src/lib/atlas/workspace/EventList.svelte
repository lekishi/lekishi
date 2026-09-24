<script lang="ts">
  import type { SceneEvent } from "../scene"
  import { occurrenceLabel, playbackLabel, placementLabel } from "../labels"

  let {
    events,
    selectedEventId,
    onSelect,
  }: {
    events: readonly SceneEvent[]
    selectedEventId: string | null
    onSelect: (eventId: string) => void
  } = $props()
</script>

<div class="flex h-full flex-col gap-2">
  <div class="flex items-baseline justify-between gap-2">
    <h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
      Events in window
    </h2>
    <span class="text-xs text-slate-500" data-testid="atlas-event-count">{events.length}</span>
  </div>

  <ul class="flex flex-col gap-1 overflow-y-auto pr-1" data-testid="atlas-event-list">
    {#if events.length === 0}
      <li class="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-400">
        No published events overlap this window. Widen it to bring the chapter's events back into
        view.
      </li>
    {/if}
    {#each events as event (event.id)}
      <li>
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
          <span class="flex items-center justify-between gap-2">
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
            {#if event.coda}
              <span
                class="rounded-full border border-violet-400/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-violet-300"
              >
                coda node
              </span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</div>
