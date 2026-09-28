<script lang="ts">
  import { untrack } from "svelte"
  import type { Chapter } from "../domain"
  import { windowLabel } from "../labels"
  import type { LocalDetailTreatment } from "../scene-illustration"
  import { buildScene, searchRows } from "../scene"
  import { searchChapter } from "../search"
  import * as story from "../story"
  import * as atlas from "../state"
  import type { AtlasState } from "../state"
  import EventList from "./EventList.svelte"
  import Globe from "./Globe.svelte"
  import SearchResults from "./SearchResults.svelte"
  import SelectionPanel from "./SelectionPanel.svelte"
  import SourceList from "./SourceList.svelte"
  import StoryList from "./StoryList.svelte"
  import TimeControls from "./TimeControls.svelte"

  /**
   * The workspace renders whichever chapter its caller mounts it with, through the
   * same behavior and controls for every chapter: the atlas passes the chapter it
   * loaded and the heading the chapter's card supplies, and nothing here branches
   * on which chapter it is.
   *
   * `name` is the chapter's display name and `decision` its recorded editorial
   * decision; the caller supplies both because the name a reader sees and the
   * ledger-derived decision line are product presentation (`chapters.ts`), while
   * the workspace stays chapter-agnostic and falls back to the chapter's own
   * published title and recorded review independence.
   *
   * `localDetail` selects which of RFD 1's local-detail treatments the workspace
   * presents. The default is the shipped geographic/symbolic treatment, so every
   * reader surface is unchanged; the treatment comparison's own surface passes
   * `illustrated-local` and is the only caller that does. The prop changes what
   * is drawn beside the selection, never the content, the controls, the search,
   * the selection rules, or the time behavior.
   */
  let {
    chapter,
    name = chapter.title,
    decision = "",
    localDetail = "geographic-symbolic",
  }: {
    chapter: Chapter
    name?: string
    decision?: string
    localDetail?: LocalDetailTreatment
  } = $props()

  // This component is the single owner of atlas interaction state. Everything
  // below reads from `atlasState` and dispatches actions; the renderer only
  // receives the derived scene, so selection, time, and camera-follow can never
  // diverge. The variable is not named `state`: svelte-check then reads `$state`
  // as a Svelte 4 store subscription instead of the rune, and the runes-mode
  // component stops type-checking.
  // `untrack` is deliberate: the workspace is mounted once per page for one
  // chapter, so the initial state is created from the chapter as mounted rather
  // than re-created when a caller passes a new prop value.
  let atlasState: AtlasState = $state.raw(untrack(() => atlas.createAtlasState(chapter)))
  let rendererError = $state<string | null>(null)
  let listOpen = $state(false)
  let panelTab = $state<"events" | "story" | "sources">("events")
  let query = $state("")

  // The overlay column must clear the time controls, whose height depends on the
  // viewport and on the chapter's own labels (a BCE window's year text is taller
  // than a CE window's). The controls' measured height drives the column's
  // bottom offset, so the two panels can never overlap; 120 is the height the
  // fixed 9rem offset assumed, kept as the first-paint fallback. The measurement
  // follows the element's own size — a resize observer catches both a viewport
  // change and a label change (an edited window crossing into BCE years, say) —
  // with a guard so the component tests' DOM, which has no layout, still mounts.
  let controlsElement: HTMLDivElement | undefined = $state()
  let controlsHeight = $state(120)

  $effect(() => {
    const element = controlsElement

    if (element === undefined) {
      return
    }

    const measure = () => {
      controlsHeight = element.clientHeight
    }

    measure()

    if (typeof ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver(measure)

    observer.observe(element)

    return () => observer.disconnect()
  })

  const scene = $derived(buildScene(atlasState, chapter))
  const selectedEvent = $derived(atlas.findEvent(chapter, atlasState.selectedEventId))
  const selectionStatus = $derived(atlas.selectionTimeStatus(atlasState, chapter))
  const playing = $derived(atlasState.playing)
  const searching = $derived(query.trim() !== "")
  const results = $derived(
    searching ? searchRows(atlasState, chapter, searchChapter(chapter, query)) : [],
  )
  const selectedPlaceNote = $derived(
    selectedEvent === null || selectedEvent.placement.kind !== "point"
      ? null
      : (chapter.places.find((place) => place.id === selectedEvent.placement.placeId)
          ?.placementNote ?? null),
  )
  const selectedStory = $derived({
    caption: story.storyCaption(chapter, atlasState.selectedEventId),
    previous: story.previousStoryStep(chapter, atlasState.selectedEventId)?.recordId ?? null,
    next: story.nextStoryStep(chapter, atlasState.selectedEventId)?.recordId ?? null,
  })

  // What the chapter's own publication states, counted rather than claimed: the
  // notice panel has to stay true when the content changes.
  const review = $derived(chapter.publication)
  const inWindowEvents = $derived(chapter.events.filter((event) => !event.coda))
  const codaEvents = $derived(chapter.events.length - inWindowEvents.length)
  const unplacedInWindow = $derived(
    inWindowEvents.filter((event) => event.placement.kind === "none").length,
  )
  const unlocatedPlaces = $derived(chapter.places.filter((place) => place.position === null).length)
  const disputedEvents = $derived(chapter.events.filter((event) => event.dispute !== null).length)

  // The workspace owns the playback clock; the renderer never advances time.
  $effect(() => {
    if (!playing) {
      return
    }

    let previous = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      atlasState = atlas.advancePlayhead(atlasState, chapter, now - previous)
      previous = now
    }, 100)

    return () => clearInterval(timer)
  })

  function selectEvent(eventId: string | null) {
    atlasState = atlas.selectEvent(atlasState, chapter, eventId)
    listOpen = false
  }

  /** A story step is an explicit jump: select the event and move time to it. */
  function jumpToStoryStep(eventId: string) {
    atlasState = atlas.jumpToEvent(atlasState, chapter, eventId)
    listOpen = false
  }

  // The tabs carry the counts: a surface does not need a heading of its own, and
  // the panel has to keep its height for the rows it shows at short viewports.
  const tabs = $derived([
    { id: "events", label: `Events (${scene.events.length})` },
    { id: "story", label: `Story (${chapter.story.length})` },
    { id: "sources", label: `Sources (${chapter.sources.length})` },
  ] as const)
</script>

<div
  class="relative h-full w-full overflow-hidden bg-slate-950 text-slate-100"
  data-testid="atlas-workspace"
>
  <Globe
    {scene}
    label="Atlas globe · {name}"
    onSelectEvent={selectEvent}
    onManualCameraInput={() => (atlasState = atlas.noteManualCameraInput(atlasState))}
    onError={(error) => (rendererError = error.message)}
  />

  {#if rendererError}
    <div
      id="atlas-renderer-error"
      role="alert"
      class="absolute left-1/2 top-1/2 z-30 w-[min(26rem,90%)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-rose-400/50 bg-slate-950/95 px-5 py-4 text-sm text-rose-100 shadow-2xl"
    >
      <p class="font-semibold">The globe renderer did not start</p>
      <p class="mt-1 text-rose-200/80">{rendererError}</p>
      <p class="mt-2 text-xs text-rose-200/70">
        The event list and time controls stay usable so exploration does not depend on the map.
      </p>
    </div>
  {/if}

  <!--
    One overlay column: the notice, the buttons, and the panel are laid out in
    flow, so they can never overlap each other. At phone widths the notice takes
    the full width, the buttons wrap below it, the panel keeps a usable minimum
    height, and the details panel scrolls in what is left; from `md` up the column
    is bounded above the time controls and the panel shrinks to fit it, so a long
    list scrolls inside the panel instead of running under the controls.

    The column is bounded above the time controls at every width, and it scrolls
    rather than overflowing them: at the smallest viewports a notice, a panel, and
    an open selection can together need more room than the map has, and the one
    thing that must not happen is a panel crossing the time controls. Scrolling
    keeps every surface reachable; the panel's own list and the details panel keep
    their own scroll areas inside it.
  -->
  <div
    class="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2 overflow-y-auto"
    style="bottom: {controlsHeight + 24}px"
  >
    <div class="flex shrink-0 flex-wrap items-start justify-between gap-2">
      <div
        id="atlas-notice"
        class="max-h-[45dvh] w-full min-w-0 shrink-0 overflow-y-auto rounded-xl border border-amber-300/40 bg-slate-950/85 px-3 py-2 backdrop-blur sm:w-auto sm:max-w-[19rem] md:max-h-[7rem] md:shrink"
      >
        {#if decision}
          <p class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
            {decision}
          </p>
        {/if}
        <p class="mt-0.5 text-xs font-semibold leading-snug text-slate-100">{name}</p>
        <!--
          The chapter's own coverage statement is the full statement of what this
          chapter does and does not cover. Phone widths keep the derived counts
          instead: the notice must not eat the space the list needs.
        -->
        <p class="mt-1 hidden text-[0.7rem] leading-snug text-slate-300 sm:block">
          {review.coverageNote}
        </p>
        <p class="mt-1 text-[0.65rem] leading-snug text-amber-200/80">
          {windowLabel(chapter.defaultWindow)} with {codaEvents} coda
          {codaEvents === 1 ? "node" : "nodes"} outside it; {unplacedInWindow} of {inWindowEvents.length}
          in-window events and {unlocatedPlaces} of {chapter.places.length} places without a sourced map
          position; {disputedEvents} disputed {disputedEvents === 1 ? "account" : "accounts"}.
        </p>
      </div>

      <div
        class="pointer-events-auto ml-auto flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end"
      >
        <button
          id="atlas-follow-toggle"
          type="button"
          disabled={selectedEvent === null || selectedEvent.placement.kind !== "point"}
          aria-pressed={atlasState.cameraFollow === "following"}
          onclick={() =>
            (atlasState =
              atlasState.cameraFollow === "following"
                ? atlas.noteManualCameraInput(atlasState)
                : atlas.resumeCameraFollow(atlasState, chapter))}
          class={[
            "pointer-events-auto rounded-xl border px-3 py-2 text-xs font-semibold backdrop-blur transition",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
            "disabled:cursor-not-allowed disabled:opacity-50",
            atlasState.cameraFollow === "following"
              ? "border-emerald-300/70 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25"
              : "border-slate-600 bg-slate-950/80 text-slate-200 hover:border-slate-400 hover:text-white",
          ]}
        >
          {atlasState.cameraFollow === "following" ? "Following selection" : "Resume following"}
        </button>

        <button
          id="atlas-list-toggle"
          type="button"
          aria-expanded={listOpen}
          onclick={() => (listOpen = !listOpen)}
          class="pointer-events-auto rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 backdrop-blur transition hover:border-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 md:hidden"
        >
          Explore ({scene.events.length})
        </button>
      </div>
    </div>

    <div
      id="atlas-event-panel"
      class={[
        "pointer-events-auto min-h-[8rem] w-[17rem] max-w-full flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/85 px-3 py-3 shadow-xl shadow-slate-950/50 backdrop-blur md:min-h-[11rem] md:w-[19rem] md:flex-initial",
        listOpen ? "flex" : "hidden md:flex",
      ]}
    >
      <!--
        One panel, three surfaces: the window's events, the chapter's story, and
        its sources. They share the panel so the overlays stay countable at phone
        widths, and the tab bar says which one is showing.
      -->
      <div
        class="mb-2 flex shrink-0 items-center gap-1"
        role="tablist"
        aria-label="Chapter exploration"
      >
        {#each tabs as tab (tab.id)}
          <button
            id="atlas-tab-{tab.id}"
            type="button"
            role="tab"
            aria-selected={panelTab === tab.id}
            data-testid="atlas-tab"
            onclick={() => (panelTab = tab.id)}
            class={[
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
              panelTab === tab.id
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
            ]}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      {#if panelTab === "events"}
        <div class="mb-2 flex shrink-0 flex-col gap-1.5">
          <label
            class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400"
            for="atlas-search"
          >
            Search the chapter
          </label>
          <input
            id="atlas-search"
            type="search"
            value={query}
            placeholder="A name, a place, a year"
            oninput={(event) => (query = (event.currentTarget as HTMLInputElement).value)}
            class="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"
          />
        </div>

        {#if searching}
          <SearchResults {query} {results} onSelect={selectEvent} onClear={() => (query = "")} />
        {:else}
          <EventList events={scene.events} onSelect={selectEvent} />
        {/if}
      {:else if panelTab === "story"}
        <StoryList
          steps={chapter.story}
          currentRecordId={atlasState.selectedEventId}
          onJump={jumpToStoryStep}
        />
      {:else}
        <SourceList
          sources={chapter.sources}
          citedSourceIds={selectedEvent?.citations.map((citation) => citation.sourceId) ?? []}
        />
      {/if}
    </div>

    {#if selectedEvent}
      <!--
        The details panel is bounded by the space the overlay column actually has
        and scrolls inside that bound. The column already stops above the time
        controls (`bottom: controlsHeight + 24`), so taking the bound from the
        column rather than from a fixed `100dvh` calculation keeps a long summary
        from rendering under the controls or past the bottom of the workspace,
        where the page cannot scroll to it: the record's own explanation of why an
        event has no position was the text that fell off.

        At phone widths the details and the open drawer do not share the screen:
        the smallest reviewed viewport cannot hold the notice, the drawer's list,
        and the details at once, and a reader who opens the list is choosing to
        look at the list. Selecting an event closes the drawer, so the details are
        what a reader returns to. From `md` up both stay visible, side by side.
      -->
      <div
        class={[
          "mt-auto flex min-h-0 max-h-[60%] flex-col overflow-hidden md:absolute md:right-0 md:top-[5.25rem] md:mt-0 md:max-h-[calc(100%-5.25rem)] md:w-96",
          listOpen ? "hidden md:flex" : "flex",
        ]}
      >
        <SelectionPanel
          event={selectedEvent}
          status={selectionStatus}
          review={{ independence: review.independence, reviewer: review.reviewer }}
          {decision}
          placeNote={selectedPlaceNote}
          places={chapter.places}
          actors={chapter.actors}
          sources={chapter.sources}
          story={selectedStory}
          {localDetail}
          onReturnToTime={() => (atlasState = atlas.returnToEventTime(atlasState, chapter))}
          onPreviousStoryStep={() =>
            selectedStory.previous !== null && jumpToStoryStep(selectedStory.previous)}
          onNextStoryStep={() => selectedStory.next !== null && jumpToStoryStep(selectedStory.next)}
          onClose={() => selectEvent(null)}
        />
      </div>
    {/if}
  </div>

  <div
    class="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center"
    bind:this={controlsElement}
  >
    <TimeControls
      timeWindow={atlasState.timeWindow}
      playhead={atlasState.playhead}
      playing={atlasState.playing}
      onWindowChange={(window) => (atlasState = atlas.setTimeWindow(atlasState, chapter, window))}
      onPlayheadChange={(year) => (atlasState = atlas.setPlayhead(atlasState, chapter, year))}
      onStep={(direction) => (atlasState = atlas.stepPlayhead(atlasState, chapter, direction))}
      onTogglePlaying={() => (atlasState = atlas.setPlaying(atlasState, !atlasState.playing))}
    />
  </div>

  <p
    class="pointer-events-none absolute bottom-3 left-3 z-10 hidden max-w-[16rem] text-[0.65rem] leading-snug text-slate-400 lg:block"
  >
    Globe: CesiumJS (Apache-2.0) · Imagery: Natural Earth II, shipped with Cesium · Terrain:
    ellipsoid, no Cesium ion account
  </p>
</div>
