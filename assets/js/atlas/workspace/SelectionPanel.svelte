<script lang="ts">
  import type { HistoricalEvent, Place } from "../domain"
  import type { SelectionTimeStatus } from "../state"

  let {
    event,
    place,
    status,
    onReturnToTime,
    onClose,
  }: {
    event: HistoricalEvent | null
    place: Place | null
    status: SelectionTimeStatus | null
    onReturnToTime: () => void
    onClose: () => void
  } = $props()

  function yearLabel(occurrence: HistoricalEvent["occurrence"]): string {
    const { startYear, endYear, precision } = occurrence
    const span = startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`
    return precision === "year" ? span : `${span} (${precision} precision)`
  }
</script>

{#if event}
  <section
    id="atlas-selection"
    data-testid="atlas-selection"
    aria-label="Selected fixture event"
    class="pointer-events-auto flex max-h-full flex-col gap-3 overflow-y-auto rounded-t-2xl border border-slate-700/70 bg-slate-950/90 px-4 py-4 shadow-2xl shadow-slate-950/60 backdrop-blur md:rounded-2xl"
  >
    <header class="flex items-start justify-between gap-3">
      <div>
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">Selected event</p>
        <h2 class="text-lg font-semibold leading-tight text-slate-50">{event.title}</h2>
      </div>
      <button
        id="atlas-selection-close"
        type="button"
        onclick={onClose}
        class="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        aria-label="Close event details"
      >
        Close
      </button>
    </header>

    <p class="rounded-lg border border-dashed border-amber-300/40 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">
      Synthetic fixture content — placeholder for the reviewed chapter, not a historical claim.
    </p>

    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt class="text-slate-400">Place</dt>
      <dd class="text-slate-100">
        {place?.label ?? "Unknown"}
        {#if place}
          <span class="ml-1 text-xs text-slate-400">
            {place.locationPrecision === "approximate" ? "approximate location" : "display anchor only"}
          </span>
        {/if}
      </dd>

      <dt class="text-slate-400">Occurrence</dt>
      <dd class="text-slate-100 tabular-nums">{yearLabel(event.occurrence)}</dd>
    </dl>

    <p class="text-sm leading-relaxed text-slate-300">{event.note}</p>

    {#if status === "outside-window"}
      <div
        id="atlas-outside-time"
        data-testid="atlas-outside-time"
        role="status"
        class="flex flex-col gap-2 rounded-lg border border-sky-400/50 bg-sky-400/10 px-3 py-2 text-xs text-sky-100"
      >
        <p class="font-semibold">Outside the selected time window</p>
        <p>
          Details stay readable while the event is filtered out of the map. Returning changes the window explicitly;
          it does not silently undo your time change.
        </p>
        <button
          id="atlas-return-to-time"
          type="button"
          onclick={onReturnToTime}
          class="self-start rounded-lg border border-sky-300/70 bg-sky-300/15 px-3 py-1.5 text-xs font-semibold text-sky-50 transition hover:bg-sky-300/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-200"
        >
          Return to event's time
        </button>
      </div>
    {/if}
  </section>
{/if}
