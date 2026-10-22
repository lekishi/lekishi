<script lang="ts" module>
  export type ExploreTab = "story" | "events" | "sources"
</script>

<script lang="ts">
  import { EmptyState, Field, Tabs } from "$lib/ui"
  import type { Chapter } from "../domain"
  import { searchRows, type AtlasScene, type SceneEvent } from "../scene"
  import { searchChapter } from "../search"
  import type { AtlasState } from "../state"
  import EventRow from "./EventRow.svelte"
  import Journal from "./Journal.svelte"
  import SourceList from "./SourceList.svelte"
  import StoryChoice from "./StoryChoice.svelte"

  /**
   * The non-map list (RFD 5's `ExploreList`): the story as a journal, the
   * window's events with search, and the sources. It is the atlas without the
   * globe, so every record the map shows can be reached from here, and a
   * failed renderer leaves exploration intact (RFD 4 RC4).
   *
   * Search covers the whole chapter, not only the window: a result outside the
   * window says so, and selecting it keeps its card with the outside-window
   * notice. A person filter (from the pennants) narrows the events to theirs.
   *
   * A chapter with several stories lists them above the journal, and the
   * journal, the events and the sources are the chosen story's.
   */
  let {
    chapter,
    scene,
    atlasState,
    tab = $bindable("story"),
    query = $bindable(""),
    person = null,
    onSelect,
    onJump,
    onClearPerson,
    onStory = () => {},
  }: {
    chapter: Chapter
    scene: AtlasScene
    atlasState: AtlasState
    tab?: string
    query?: string
    /** An actor id the events are filtered to, or null. */
    person?: string | null
    onSelect: (eventId: string) => void
    onJump: (index: number) => void
    onClearPerson: () => void
    /** Opens another of the chapter's stories, by its key. */
    onStory?: (key: string) => void
  } = $props()

  const searching = $derived(query.trim() !== "")
  const results = $derived(
    searching ? searchRows(atlasState, chapter, searchChapter(chapter, query)) : [],
  )
  const personLabel = $derived(
    person === null ? null : (chapter.actors.find((actor) => actor.id === person)?.label ?? null),
  )
  const events = $derived(
    person === null
      ? scene.events
      : scene.events.filter((event: SceneEvent) =>
          chapter.events
            .find((candidate) => candidate.id === event.id)
            ?.participants.some((participant) => participant.actorId === person),
        ),
  )
  const cited = $derived(
    chapter.events
      .find((event) => event.id === atlasState.selectedEventId)
      ?.citations.map((citation) => citation.sourceId) ?? [],
  )
  const tabs = $derived([
    { id: "story", label: "Story", count: chapter.story.length },
    { id: "events", label: "Events", count: scene.events.length },
    { id: "sources", label: "Sources", count: chapter.sources.length },
  ])
</script>

<Tabs
  {tabs}
  bind:selected={tab}
  label="Explore the chapter"
  idPrefix="atlas-explore"
  class="h-full min-h-0"
>
  {#snippet children(id)}
    <div class="flex h-full min-h-0 flex-col" data-testid="atlas-explore-{id}">
      {#if id === "story"}
        {#if chapter.stories.length > 1}
          <StoryChoice stories={chapter.stories} current={chapter.storyKey} {onStory} />
        {/if}
        <div class="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          <Journal steps={chapter.story} current={atlasState.storyStep} {onJump} />
        </div>
      {:else if id === "events"}
        <Field
          id="atlas-search"
          label="Search this chapter"
          hideLabel
          bind:value={query}
          placeholder="A name, a place, a year"
          class="mb-2 shrink-0"
        />
        {#if personLabel && !searching}
          <p class="mb-2 flex shrink-0 items-center gap-2 text-caption text-ink-dim">
            Events with <span class="font-serif text-body-sm text-ink">{personLabel}</span>
            <button
              type="button"
              class="cursor-pointer rounded-control px-1 underline decoration-frame underline-offset-2 hover:text-ink"
              onclick={onClearPerson}>show all</button
            >
          </p>
        {/if}
        <div class="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          {#if searching}
            <p class="mb-1 text-caption text-ink-dim" aria-live="polite">
              {results.length}
              {results.length === 1 ? "event matches" : "events match"}, in every script and
              romanization
            </p>
            {#if results.length === 0}
              <EmptyState kind="filtered">
                Nothing in this chapter matches “{query}”. Search all chapters with the search
                button in the date bar.
              </EmptyState>
            {:else}
              <ul class="flex list-none flex-col gap-1" data-testid="atlas-search-results">
                {#each results as result (result.event.id)}
                  <li>
                    <EventRow
                      event={result.event}
                      matchedText={result.match === "name" ? result.matchedText : null}
                      {onSelect}
                    />
                  </li>
                {/each}
              </ul>
            {/if}
          {:else if events.length === 0}
            <EmptyState kind="filtered">
              No events in this window. Widen the window on the timeline, or search the chapter.
            </EmptyState>
          {:else}
            <ul class="flex list-none flex-col gap-1" data-testid="atlas-event-list">
              {#each events as event (event.id)}
                <li><EventRow {event} {onSelect} /></li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else}
        <div class="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
          <SourceList sources={chapter.sources} citedSourceIds={cited} />
        </div>
      {/if}
    </div>
  {/snippet}
</Tabs>
