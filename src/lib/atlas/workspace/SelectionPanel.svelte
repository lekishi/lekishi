<script lang="ts">
  import type { HistoricalEvent } from "../domain"
  import {
    occurrenceLabel,
    occurrenceModeNote,
    placementLabel,
    reviewLabel,
    unplacedNote,
  } from "../labels"
  import type { SelectionTimeStatus } from "../state"

  let {
    event,
    status,
    review,
    disputeDetail = false,
    onReturnToTime,
    onClose,
  }: {
    event: HistoricalEvent | null
    status: SelectionTimeStatus | null
    /** The chapter's recorded review status, so the details surface states it too. */
    review: { independence: string; reviewer: string }
    /** The comparison review surface shows the published dispute; the launch atlas does not yet. */
    disputeDetail?: boolean
    onReturnToTime: () => void
    onClose: () => void
  } = $props()

  const unplaced = $derived(event === null ? null : unplacedNote(event.placement))
</script>

{#if event}
  <section
    id="atlas-selection"
    data-testid="atlas-selection"
    aria-label="Selected event"
    class="pointer-events-auto flex min-h-0 flex-col gap-3 overflow-y-auto rounded-t-2xl border border-slate-700/70 bg-slate-950/90 px-4 py-4 shadow-2xl shadow-slate-950/60 backdrop-blur md:rounded-2xl"
  >
    <header class="flex items-start justify-between gap-3">
      <div>
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
          Selected event
        </p>
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

    {#if event.coda}
      <p
        class="rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-xs text-violet-100"
      >
        Coda node — outside the primary 750–754 mission window, separately sourced and not a mission
        effect.
      </p>
    {/if}

    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt class="text-slate-400">Place</dt>
      <dd class="text-slate-100">{placementLabel(event.placement)}</dd>

      <dt class="text-slate-400">Occurrence</dt>
      <dd class="text-slate-100 tabular-nums">{occurrenceLabel(event.occurrence)}</dd>

      {#if event.occurrence.sourceExpression}
        <dt class="text-slate-400">As written</dt>
        <dd class="text-slate-100">{event.occurrence.sourceExpression}</dd>
      {/if}
    </dl>

    {#if occurrenceModeNote(event.occurrence)}
      <p class="text-xs leading-snug text-slate-400">{occurrenceModeNote(event.occurrence)}</p>
    {/if}

    {#if unplaced}
      <p
        data-testid="atlas-unplaced"
        class="rounded-lg border border-dashed border-slate-600 px-3 py-2 text-xs text-slate-300"
      >
        Not on the map: {unplaced}
      </p>
    {/if}

    <p class="text-sm leading-relaxed text-slate-300">{event.note}</p>

    {#if disputeDetail && event.dispute}
      <section
        id="atlas-dispute"
        data-testid="atlas-dispute"
        class="flex flex-col gap-2 rounded-lg border border-rose-400/40 bg-rose-400/5 px-3 py-2.5"
      >
        <h3 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-rose-300">
          Disputed account
        </h3>
        <p class="text-xs leading-snug text-rose-50">{event.dispute.summary}</p>
        {#each event.dispute.accounts as account, index (index)}
          <div class="border-t border-rose-400/20 pt-2">
            <p class="text-xs leading-snug text-slate-200">{account.statement}</p>
            {#if account.locators.length > 0}
              <p class="mt-1 text-[0.65rem] leading-snug text-slate-500">
                {account.locators.join(" · ")}
              </p>
            {/if}
          </div>
        {/each}
      </section>
    {/if}

    {#if status === "outside-window"}
      <div
        id="atlas-outside-time"
        data-testid="atlas-outside-time"
        role="status"
        class="flex flex-col gap-2 rounded-lg border border-sky-400/50 bg-sky-400/10 px-3 py-2 text-xs text-sky-100"
      >
        <p class="font-semibold">Outside the selected time window</p>
        <p>
          Details stay readable while the event is filtered out of the map. Returning changes the
          window explicitly; it does not silently undo your time change.
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

    <p class="text-[0.65rem] leading-snug text-slate-500">
      {reviewLabel(review.independence, review.reviewer)}
    </p>
  </section>
{/if}
