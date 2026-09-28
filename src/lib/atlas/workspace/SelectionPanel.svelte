<script lang="ts">
  import type { Actor, HistoricalEvent, Place, Source } from "../domain"
  import {
    citationLabel,
    occurrenceLabel,
    occurrenceModeNote,
    placementLabel,
    reviewLabel,
    roleLabel,
    unplacedNote,
  } from "../labels"
  import type { LocalDetailTreatment } from "../scene-illustration"
  import type { SelectionTimeStatus } from "../state"
  import LocalScene from "./LocalScene.svelte"

  /**
   * The selected event's details.
   *
   * The panel states what the record publishes and nothing it does not: the place
   * as the record qualifies it (a display anchor is never an asserted location),
   * the occurrence with its precision and mode, the record's own summary, its
   * participants, its citations with their locators and quoted passages, and the
   * published dispute when there is one. The chapter's decision and the recorded
   * review independence stay beside all of it, so a reader always knows what they
   * are reading and how it was reviewed.
   *
   * `localDetail` is the page's local-detail treatment. The shipped
   * geographic/symbolic treatment adds nothing here; the treatment comparison's
   * illustrated-local value puts its scene card at the top of this panel's own
   * scroll area, so the card is bounded by the panel's bound (and therefore by
   * the overlay column that stops above the time controls) at every reviewed
   * viewport instead of being a second thing that can overflow them.
   */
  let {
    event,
    status,
    review,
    decision,
    placeNote,
    places,
    actors,
    sources,
    story,
    localDetail = "geographic-symbolic",
    onReturnToTime,
    onPreviousStoryStep,
    onNextStoryStep,
    onClose,
  }: {
    event: HistoricalEvent | null
    status: SelectionTimeStatus | null
    /** The chapter's recorded review status, so the details surface states it too. */
    review: { independence: string; reviewer: string }
    /** The chapter's recorded editorial decision, e.g. the owner's approval. */
    decision: string
    /** The record's own note on the geometry the atlas shows, or null. */
    placeNote: string | null
    /** The chapter's places, so the illustrated treatment can name the record's own place. */
    places: readonly Place[]
    actors: readonly Actor[]
    sources: readonly Source[]
    /** The story steps around this event, for explicit jumps. */
    story: { previous: string | null; next: string | null; caption: string | null }
    /** The page's local-detail treatment; the reader surface passes nothing. */
    localDetail?: LocalDetailTreatment
    onReturnToTime: () => void
    onPreviousStoryStep: () => void
    onNextStoryStep: () => void
    onClose: () => void
  } = $props()

  const unplaced = $derived(event === null ? null : unplacedNote(event.placement))
  const participants = $derived(
    event === null
      ? []
      : event.participants.flatMap((participant) => {
          const actor = actors.find((candidate) => candidate.id === participant.actorId)

          return actor === undefined ? [] : [{ actor, role: participant.role }]
        }),
  )
  const citations = $derived(
    event === null
      ? []
      : event.citations.flatMap((citation) => {
          const source = sources.find((candidate) => candidate.id === citation.sourceId)

          return source === undefined ? [] : [{ citation, source }]
        }),
  )
</script>

{#if event}
  <section
    id="atlas-selection"
    data-testid="atlas-selection"
    aria-label="Selected event"
    class="pointer-events-auto flex min-h-0 flex-col gap-3 overflow-y-auto rounded-t-2xl border border-slate-700/70 bg-slate-950/90 px-4 py-4 shadow-2xl shadow-slate-950/60 backdrop-blur md:rounded-2xl"
  >
    {#if localDetail === "illustrated-local"}
      <LocalScene {event} {places} />
    {/if}

    <header class="flex items-start justify-between gap-3">
      <div>
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
          Selected event
        </p>
        <h2 class="text-lg font-semibold leading-tight text-slate-50">{event.title}</h2>
        {#if story.caption}
          <p class="mt-1 text-[0.7rem] leading-snug text-slate-500">
            Story step: {story.caption}
          </p>
        {/if}
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
        Coda node — outside the chapter's primary window, separately sourced and not a mission
        effect.
      </p>
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
    {:else if placeNote}
      <!--
        The record's own note on the geometry the atlas shows. For a display anchor
        that note is what says it asserts no historical coordinate, so the panel
        states it rather than letting a labelled point read as a located site.
      -->
      <p
        data-testid="atlas-placement-note"
        class="rounded-lg border border-dashed border-slate-600 px-3 py-2 text-xs leading-snug text-slate-300"
      >
        {placeNote}
      </p>
    {/if}

    <p class="text-sm leading-relaxed text-slate-300">{event.note}</p>

    {#if participants.length > 0}
      <section class="flex flex-col gap-1.5">
        <h3 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Participants
        </h3>
        <ul class="flex flex-col gap-1" data-testid="atlas-participants">
          {#each participants as participant (participant.actor.id)}
            <li class="text-xs leading-snug text-slate-200">
              <span class="font-medium">{participant.actor.label}</span>
              <span class="text-slate-500"> · {roleLabel(participant.role)}</span>
              {#if participant.actor.aliases.length > 1}
                <span class="block text-[0.65rem] text-slate-500">
                  {participant.actor.aliases.slice(1).join(" · ")}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if event.dispute}
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

    {#if citations.length > 0}
      <section class="flex flex-col gap-2">
        <h3 class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Sources for this event
        </h3>
        <ul class="flex flex-col gap-2" data-testid="atlas-citations">
          {#each citations as entry, index (index)}
            <li class="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0">
              <p class="text-xs leading-snug text-slate-300">
                {citationLabel(
                  entry.source.title,
                  entry.citation.locatorKind,
                  entry.citation.locator,
                )}
              </p>
              {#if entry.citation.quotedText}
                <blockquote class="mt-1 text-xs leading-relaxed text-slate-400">
                  {entry.citation.quotedText}
                </blockquote>
              {/if}
              <p class="mt-1 text-[0.65rem] leading-snug text-slate-500">
                {entry.source.attribution}
              </p>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if story.previous !== null || story.next !== null}
      <div class="flex flex-wrap items-center gap-2" data-testid="atlas-story-jumps">
        <button
          id="atlas-story-previous"
          type="button"
          disabled={story.previous === null}
          onclick={onPreviousStoryStep}
          class="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ← Previous in story
        </button>
        <button
          id="atlas-story-next"
          type="button"
          disabled={story.next === null}
          onclick={onNextStoryStep}
          class="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next in story →
        </button>
      </div>
    {/if}

    <p class="text-[0.65rem] leading-snug text-slate-500" data-testid="atlas-selection-status">
      {decision}. {reviewLabel(review.independence, review.reviewer)}
    </p>
  </section>
{/if}
