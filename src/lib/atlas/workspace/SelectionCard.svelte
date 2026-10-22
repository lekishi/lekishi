<script lang="ts">
  import { Badge, Button, CitationLine, EmptyState, Icon, NameForm, SectionLabel } from "$lib/ui"
  import { focusRing, transition } from "$lib/ui"
  import {
    connectedEvents,
    controlOf,
    eventsAtPlace,
    nearbyEvents,
    placeEvidence,
    relationshipsFor,
  } from "../card"
  import type { Chapter, HistoricalEvent, Place } from "../domain"
  import {
    citationLabel,
    licenseLabel,
    occurrenceModeNote,
    roleLabel,
    unplacedNote,
    windowLabel,
    yearLabel,
  } from "../labels"
  import { selectionRecords } from "../overlays"
  import type { AtlasState } from "../state"
  import type { PlaybackState } from "../time"

  /**
   * The selection card (RFD 5's `SelectionCard`, right rail; the half detent of
   * the phone sheet). It reads narrative first: the record's own summary and,
   * when a citation carries one, the quoted passage; then the place, the date
   * as the source writes it and the people; then what the records connect it
   * to, what is merely nearby, its relationships and its sources.
   *
   * What the history depends on is in words, not colour: a disputed account
   * shows both readings, an occurrence window says it is one occurrence inside
   * the span, a place without an identification says the map claims no
   * position, and a selection outside the window keeps its card and offers the
   * explicit time change RFD 1 asks for.
   */
  let {
    chapter,
    atlasState,
    event,
    place,
    playback,
    outsideWindow,
    storyPosition,
    onClose,
    onSelectEvent,
    onReturnToTime,
    onPrevious,
    onNext,
    onCopyLink,
  }: {
    chapter: Chapter
    atlasState: AtlasState
    event: HistoricalEvent | null
    place: Place | null
    playback: PlaybackState | null
    outsideWindow: boolean
    /** "8 of 37" when the selection is a story step. */
    storyPosition: string | null
    onClose: () => void
    onSelectEvent: (eventId: string) => void
    onReturnToTime: () => void
    onPrevious: (() => void) | null
    onNext: (() => void) | null
    onCopyLink: () => void
  } = $props()

  const places = $derived(new Map(chapter.places.map((candidate) => [candidate.id, candidate])))
  const actors = $derived(new Map(chapter.actors.map((actor) => [actor.id, actor])))
  const sources = $derived(new Map(chapter.sources.map((source) => [source.id, source])))
  const eventPlace = $derived(
    event === null
      ? null
      : (places.get(
          event.placement.kind === "point"
            ? event.placement.placeId
            : (event.placement.placeId ?? ""),
        ) ?? null),
  )
  const quote = $derived(event?.citations.find((citation) => citation.quotedText !== null) ?? null)
  const connected = $derived(event === null ? [] : connectedEvents(chapter, event))
  const nearby = $derived(
    event === null
      ? []
      : nearbyEvents(chapter, event, new Set(connected.map((row) => row.event.id))),
  )
  const relationships = $derived(relationshipsFor(chapter, selectionRecords(atlasState, chapter)))
  const placeEvents = $derived(place === null ? [] : eventsAtPlace(chapter, place.id))
  const control = $derived(place === null ? [] : controlOf(chapter, place.id))
  const evidence = $derived(
    (eventPlace ?? place) === null ? null : placeEvidence((eventPlace ?? place)!),
  )
  const titleId = "atlas-selection-title"

  function span(start: number, end: number): string {
    return windowLabel({ start, end })
  }
</script>

{#snippet evidenceBadge(kind: ReturnType<typeof placeEvidence> | null)}
  {#if kind === "attested"}
    <Badge kind="attested" text="site" />
  {:else if kind === "identified"}
    <Badge kind="identified" text="identified, size is precision" />
  {:else if kind === "anchor"}
    <Badge kind="anchor" text="label anchor, no site asserted" />
  {:else if kind === "none"}
    <Badge kind="unlocated" />
  {/if}
{/snippet}

{#snippet eventLink(row: HistoricalEvent, note: string)}
  <button
    type="button"
    onclick={() => onSelectEvent(row.id)}
    class={[
      "group flex w-full cursor-pointer flex-col gap-0.5 rounded-control px-2 py-1.5 text-left hover:bg-lacquer-raised",
      transition,
      focusRing,
    ]}
  >
    <span class="font-serif text-body-sm text-ink group-hover:text-gold-bright">{row.title}</span>
    <span class="text-caption text-ink-dim tabular-nums">{note}</span>
  </button>
{/snippet}

<article
  id="atlas-selection"
  data-testid="atlas-selection"
  data-selection-kind={event ? "event" : "place"}
  aria-labelledby={titleId}
  class="pointer-events-auto flex h-full min-h-0 flex-col overflow-hidden rounded-plate border border-frame bg-lacquer text-ink shadow-sheet"
>
  <header class="flex shrink-0 items-start gap-3 border-b border-rule px-4 pt-3 pb-3">
    <div class="min-w-0 flex-1">
      <p class="text-label font-semibold uppercase text-ink-dim">
        {#if event}
          {playback === "active" ? "At the playhead" : "Event"} ·
          <span class="tabular-nums"
            >{span(event.occurrence.startYear, event.occurrence.endYear)}</span
          >
          · {event.occurrence.precision} precision
        {:else if place}
          Place · {placeEvents.length}
          {placeEvents.length === 1 ? "event" : "events"}
        {/if}
      </p>
      <h2 id={titleId} class="mt-1 font-serif text-title font-semibold text-balance">
        {#if event}
          {event.title}
        {:else if place}
          <NameForm
            name={place.label}
            lang={place.lang ?? "und"}
            romanization={place.romanization ?? undefined}
            size="title"
          />
        {/if}
      </h2>
    </div>
    <Button variant="icon" icon="close" size="sm" label="Close the card" onclick={onClose} />
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="atlas-selection-body">
    <div class="flex flex-col gap-4">
      {#if outsideWindow && event}
        <div
          id="atlas-outside-notice"
          role="status"
          class="flex flex-col gap-2 rounded-plate border border-dashed border-ink-faint px-3 py-2.5"
        >
          <p class="flex items-center gap-2 text-body-sm font-semibold text-ink">
            <Icon name="outside" size={16} />Outside the selected time
          </p>
          <p class="text-body-sm text-ink-dim">
            The card stays open; the place is off the map until you return. Returning changes the
            window to include {span(event.occurrence.startYear, event.occurrence.endYear)}.
          </p>
          <Button
            variant="primary"
            size="sm"
            class="self-start"
            id="atlas-return-to-time"
            onclick={onReturnToTime}>Return to the event's time</Button
          >
        </div>
      {/if}

      {#if event}
        {#if event.placement.kind === "none"}
          <EmptyState kind="uncovered" title="Not on the map">
            {unplacedNote(event.placement)} This is not a claim that nothing happened there.
          </EmptyState>
        {/if}

        <p class="font-serif text-body text-ink" data-testid="atlas-selection-note">
          {event.note}
        </p>

        {#if event.dispute}
          <section
            class="flex flex-col gap-2 rounded-plate border border-ink-dim px-3 py-2.5"
            data-testid="atlas-dispute"
            aria-label="Disputed account"
          >
            <Badge kind="disputed" class="self-start" />
            <p class="text-body-sm text-ink">{event.dispute.summary}</p>
            <ul class="flex list-none flex-col gap-1.5">
              {#each event.dispute.accounts as account, index (index)}
                <li class="border-l-2 border-rule pl-2 text-body-sm text-ink-dim">
                  {account.statement}
                  {#if account.locators.length > 0}
                    <span class="block text-caption text-ink-dim"
                      >{account.locators.join("; ")}</span
                    >
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if quote}
          <figure class="flex flex-col gap-1 border-l-2 border-gold pl-3">
            <blockquote lang="lzh" class="font-serif text-body text-ink">
              {quote.quotedText}
            </blockquote>
            <figcaption class="text-caption text-ink-dim">
              {sources.get(quote.sourceId)?.title ?? quote.sourceId} · {quote.locator} · as written
            </figcaption>
          </figure>
        {/if}

        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
          <dt class="text-ink-dim">Place</dt>
          <dd class="flex flex-wrap items-center gap-2">
            {#if eventPlace}
              <span class="font-serif text-ink" lang={eventPlace.lang ?? undefined}
                >{eventPlace.label}</span
              >
              {@render evidenceBadge(evidence)}
            {:else}
              <span class="text-ink-dim">No place named</span>
            {/if}
          </dd>
          <dt class="text-ink-dim">Date</dt>
          <dd class="flex flex-col gap-1">
            <span class="flex flex-wrap items-center gap-2 tabular-nums">
              {span(event.occurrence.startYear, event.occurrence.endYear)} · {event.occurrence
                .precision} precision
              {#if event.occurrence.mode === "occurrence_window"}
                <Badge kind="possible" text="uncertain span" />
              {/if}
              {#if event.coda}
                <Badge kind="coda" />
              {/if}
            </span>
            {#if event.occurrence.sourceExpression}
              <span lang="lzh" class="font-serif text-ink-dim"
                >{event.occurrence.sourceExpression}</span
              >
            {/if}
          </dd>
          {#if event.participants.length > 0}
            <dt class="text-ink-dim">Who</dt>
            <dd class="flex flex-col gap-1">
              {#each event.participants as participant (participant.actorId + participant.role)}
                {@const actor = actors.get(participant.actorId)}
                <span>
                  <span class="font-serif text-ink" lang={actor?.lang ?? undefined}
                    >{actor?.label ?? participant.actorId}</span
                  >
                  {#if actor?.romanization}
                    <span class="text-caption text-ink-dim">{actor.romanization}</span>
                  {/if}
                  <span class="text-caption text-ink-dim">· {roleLabel(participant.role)}</span>
                </span>
              {/each}
            </dd>
          {/if}
        </dl>

        {#if occurrenceModeNote(event.occurrence)}
          <p class="rounded-plate bg-lacquer-raised px-3 py-2 text-body-sm text-ink-dim">
            {occurrenceModeNote(event.occurrence)}
          </p>
        {/if}
        {#if eventPlace?.placementNote && event.placement.kind === "point"}
          <p
            class="rounded-plate bg-lacquer-raised px-3 py-2 text-body-sm text-ink-dim"
            data-testid="atlas-place-note"
          >
            {eventPlace.placementNote}
          </p>
        {/if}
      {:else if place}
        <p class="flex flex-wrap items-center gap-2">{@render evidenceBadge(evidence)}</p>
        {#if place.placementNote}
          <p
            class="rounded-plate bg-lacquer-raised px-3 py-2 text-body-sm text-ink-dim"
            data-testid="atlas-place-note"
          >
            {place.placementNote}
          </p>
        {/if}
        {#if place.position === null}
          <EmptyState kind="uncovered" title="Not on the map">
            {place.label} is named, but no identification is sourced for it, so the atlas claims no position.
            This is not a claim that nothing happened there.
          </EmptyState>
        {/if}
        <section aria-label="Events here" class="flex flex-col gap-1">
          <SectionLabel text="Events here" count={placeEvents.length} level={3} />
          {#each placeEvents as row (row.id)}
            {@render eventLink(row, span(row.occurrence.startYear, row.occurrence.endYear))}
          {/each}
        </section>
        {#if control.length > 0}
          <section aria-label="Held by" class="flex flex-col gap-1" data-testid="atlas-control">
            <SectionLabel text="Held by" count={control.length} level={3} />
            {#each control as row (row.territory.id)}
              <div class="flex flex-col gap-0.5 rounded-plate border border-rule px-3 py-2">
                <p class="flex flex-wrap items-center gap-x-2 text-body-sm">
                  <span class="font-serif text-ink">{row.controllerLabel}</span>
                  <span class="text-caption tabular-nums text-ink-dim"
                    >{span(row.territory.span.startYear, row.territory.span.endYear)}</span
                  >
                  {#if row.role === "seat"}<span class="text-caption text-ink-dim">· seat</span
                    >{/if}
                  {#if row.territory.dispute}<Badge kind="disputed" />{/if}
                </p>
                {#if row.note}<p class="text-body-sm text-ink-dim">{row.note}</p>{/if}
              </div>
            {/each}
            <p class="text-caption text-ink-faint">
              The years a source records it held; no border is drawn, and nothing is assumed between
              them.
            </p>
          </section>
        {/if}
      {/if}

      {#if connected.length > 0}
        <section aria-label="Connected" class="flex flex-col gap-1" data-testid="atlas-connected">
          <SectionLabel text="Connected" level={3} />
          {#each connected as row (row.event.id)}
            {@render eventLink(row.event, row.reason)}
          {/each}
        </section>
      {/if}

      {#if nearby.length > 0}
        <section
          aria-label="Nearby, not necessarily related"
          class="flex flex-col gap-1"
          data-testid="atlas-nearby"
        >
          <SectionLabel text="Nearby, not necessarily related" level={3} />
          {#each nearby as row (row.event.id)}
            {@render eventLink(
              row.event,
              `${row.distance} · ${yearLabel(row.event.occurrence.startYear)}`,
            )}
          {/each}
        </section>
      {/if}

      {#if relationships.length > 0}
        <section aria-label="Relationships" class="flex flex-col gap-2">
          <SectionLabel text="Relationships" level={3} />
          {#each relationships as row (row.relationship.id)}
            <div class="flex flex-col gap-1 rounded-plate border border-rule px-3 py-2">
              <p class="flex flex-wrap items-center gap-x-2 text-body-sm">
                <span class="font-serif text-ink">{row.fromLabel}</span>
                <Icon
                  name={row.relationship.directionality === "directed"
                    ? "arrow-right"
                    : "schematic"}
                  size={14}
                  class="text-ink-dim"
                />
                <span class="font-serif text-ink">{row.toLabel}</span>
                <span class="text-caption text-ink-dim"
                  >· {row.relationship.types.join(", ").replaceAll("_", " ")}</span
                >
              </p>
              <p class="text-body-sm text-ink-dim">
                {row.relationship.caption ?? row.relationship.summary}
              </p>
              <p class="text-caption text-ink-dim">
                {row.relationship.validity
                  ? span(row.relationship.validity.startYear, row.relationship.validity.endYear)
                  : "Undated"} ·
                {row.relationship.causal ? "asserts causation" : "asserts no causation"}
              </p>
            </div>
          {/each}
        </section>
      {/if}

      {#if event && event.citations.length > 0}
        <section aria-label="Sources" class="flex flex-col gap-1" data-testid="atlas-citations">
          <SectionLabel text="Sources" count={event.citations.length} level={3} />
          {#each event.citations as citation, index (index)}
            {@const source = sources.get(citation.sourceId)}
            <CitationLine
              source={source?.title ?? citation.sourceId}
              locator={citationLabel("", citation.locatorKind, citation.locator).replace(
                /^ · /,
                "",
              )}
              terms={licenseLabel(source?.licenseId ?? null)}
              href={source?.url ?? undefined}
            />
          {/each}
        </section>
      {/if}
    </div>
  </div>

  <footer class="flex shrink-0 items-center gap-2 border-t border-rule px-3 py-2">
    {#if storyPosition}
      <Button
        variant="ghost"
        size="sm"
        icon="chevron-left"
        disabled={onPrevious === null}
        onclick={() => onPrevious?.()}
        id="atlas-story-previous">Previous</Button
      >
      <span class="flex-1 text-center text-caption text-ink-dim tabular-nums">{storyPosition}</span>
      <Button
        variant="secondary"
        size="sm"
        disabled={onNext === null}
        onclick={() => onNext?.()}
        id="atlas-story-next">Next in story <Icon name="chevron-right" size={14} /></Button
      >
    {:else}
      <span class="flex-1"></span>
    {/if}
    <Button variant="icon" icon="link" size="sm" label="Copy a link to this" onclick={onCopyLink} />
  </footer>
</article>
