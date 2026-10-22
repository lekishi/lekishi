<script lang="ts" module>
  /**
   * How the workspace writes its position into the address bar. The chapter
   * route supplies it with SvelteKit's shallow routing, so this component
   * never imports the router and still mounts in a test without one. Each
   * call takes the chapter's query string (with its `?`, or empty).
   */
  export type AtlasHistory = {
    /** A jump the reader made (a story step, a search result): Back returns from it. */
    push(search: string): void
    /** A change within the view (a click on the map, a window edit). */
    replace(search: string): void
  }
</script>

<script lang="ts">
  import { untrack } from "svelte"
  import { Icon, Orb, Sheet, type Detent, focusRing, transition } from "$lib/ui"
  import { chapterFacts, pennants } from "../card"
  import type { Chapter } from "../domain"
  import { windowLabel, yearLabel } from "../labels"
  import { rememberPosition } from "../memory"
  import ChapterSwitcher from "../navigation/ChapterSwitcher.svelte"
  import SearchDialog from "../navigation/SearchDialog.svelte"
  import { familyOf, layerOptions, RELATIONSHIP_FAMILIES } from "../overlays"
  import {
    applyChapterQuery,
    chapterQuery,
    chooseStory,
    isEmptyQuery,
    readChapterQuery,
    type Arrival,
  } from "../query"
  import type { CameraView } from "../renderer/types"
  import { buildScene, NO_INSETS, type SafeArea } from "../scene"
  import type { SearchEntry } from "../search-index"
  import * as atlas from "../state"
  import type { AtlasState } from "../state"
  import AboutSheet from "./AboutSheet.svelte"
  import ArrivalPlate from "./ArrivalPlate.svelte"
  import DateBar from "./DateBar.svelte"
  import EventDial from "./EventDial.svelte"
  import ExploreList, { type ExploreTab } from "./ExploreList.svelte"
  import Globe from "./Globe.svelte"
  import LayerOrbs from "./LayerOrbs.svelte"
  import Legend from "./Legend.svelte"
  import Minimap from "./Minimap.svelte"
  import Pennants from "./Pennants.svelte"
  import SelectionCard from "./SelectionCard.svelte"
  import TimelineStrip from "./TimelineStrip.svelte"

  /**
   * The atlas frame (RFD 5, "Layout"): the globe fills the page and the
   * interface is regions around it, never panels floating over each other.
   *
   * - Desktop: the date bar across the top; a left rail with the layer orbs,
   *   the people and the explore list; the selection card in a right rail;
   *   the dial, the timeline strip and the locator across the bottom; the
   *   legend in the scene's corner.
   * - Tablet: the orbs stand in a column, the explore list opens beside them,
   *   and the card keeps its rail.
   * - Phone: a compact date bar and a row of orbs on top, and one bottom
   *   sheet with three detents: peek holds the dial and what is current, half
   *   holds the card or the list, full holds the list with search.
   *
   * The globe is told how much of it the frame covers (the scene safe area),
   * so a flight frames its target in the clear part of the screen.
   *
   * The workspace renders whichever chapter it is mounted with and branches on
   * no chapter id. It is the single owner of the atlas state: selection, time,
   * playback, layers and camera follow change here and only here, and the
   * renderer receives the derived scene. A chapter with several stories is
   * mounted with a view of each (rfd/0002/CHAPTER_STORIES.adoc); the workspace
   * shows one at a time, and choosing another resets the step and the window
   * to that story's own. The state variable is not called
   * `state`: svelte-check would read `$state` as a store subscription and
   * stop type-checking the component.
   */
  let {
    chapter: opened,
    stories = [opened],
    name = opened.title,
    decision = "",
    search = "",
    history = null,
  }: {
    /** The chapter as the story it opens on shows it. */
    chapter: Chapter
    /** Every story's view of the chapter, the one it opens on first. */
    stories?: readonly Chapter[]
    name?: string
    decision?: string
    /** The address bar's query when the workspace mounts. */
    search?: string
    history?: AtlasHistory | null
  } = $props()

  // `untrack`: the workspace is mounted once per page for one chapter, so its
  // first state comes from the chapter and the address it was mounted with.
  const opening = untrack(() => arrive(search, null))
  /** The story the reader is in, as its view of the chapter. */
  let chapter: Chapter = $state.raw(untrack(() => opening.chapter))
  let atlasState: AtlasState = $state.raw(opening.state)
  let arrival = $state.raw(untrack(() => arrivalPlate(opening)))
  let arrivalFor: AtlasState | null = opening.state

  let rendererError = $state<string | null>(null)
  let view = $state.raw<CameraView | null>(null)
  let exploreTab = $state<ExploreTab>("story")
  let chapterQueryText = $state("")
  let person = $state<string | null>(null)
  let listOpen = $state(false)
  let aboutOpen = $state(false)
  let searchOpen = $state(false)
  let switcherOpen = $state(false)
  // A link that opens a record (an event, a place or a story step) opens the
  // phone sheet at half, where its card is; at peek the card is not drawn,
  // and the reader would see the arrival plate name a card they cannot read.
  // The detent only matters in the phone frame.
  let detent: Detent = $state(untrack(() => (opensRecord(opening.state) ? "half" : "peek")))
  let notice = $state<string | null>(null)

  // ---- Layout ------------------------------------------------------------

  // Measured by `measure` below rather than `bind:clientWidth`, which needs a
  // ResizeObserver that a test DOM does not have.
  let width = $state(0)
  // A DOM without layout (the component tests) reports zero: it gets the
  // desktop frame, which has every control.
  const mode = $derived(
    width === 0 || width >= 1180 ? "desktop" : width >= 768 ? "tablet" : "phone",
  )

  let root: HTMLDivElement | undefined = $state()
  let topRegion: HTMLElement | undefined = $state()
  let leftRegion: HTMLElement | undefined = $state()
  let rightRegion: HTMLElement | undefined = $state()
  let bottomRegion: HTMLElement | undefined = $state()
  let safeArea: SafeArea = $state.raw(NO_INSETS)

  /** The frame's regions, measured as insets from the workspace's edges. */
  function measure() {
    if (root === undefined) return
    width = root.clientWidth
    const box = root.getBoundingClientRect()
    if (box.width === 0) return
    // A region that has left the page is bound as null, not undefined.
    const edge = (
      element: HTMLElement | null | undefined,
      side: "top" | "bottom" | "left" | "right",
    ) => (element ? element.getBoundingClientRect()[side] : null)
    const top = edge(topRegion, "bottom")
    const bottom = edge(bottomRegion, "top")
    const left = edge(leftRegion, "right")
    const right = edge(rightRegion, "left")
    const next: SafeArea = {
      top: top === null ? 0 : Math.max(0, Math.round(top - box.top)),
      bottom: bottom === null ? 0 : Math.max(0, Math.round(box.bottom - bottom)),
      left: left === null ? 0 : Math.max(0, Math.round(left - box.left)),
      right: right === null ? 0 : Math.max(0, Math.round(box.right - right)),
    }
    if (
      next.top !== safeArea.top ||
      next.bottom !== safeArea.bottom ||
      next.left !== safeArea.left ||
      next.right !== safeArea.right
    ) {
      safeArea = next
    }
  }

  $effect(() => {
    const regions = [root, topRegion, leftRegion, rightRegion, bottomRegion].filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    )
    void detent
    measure()
    if (typeof ResizeObserver === "undefined") return
    // Measured on the next frame, not inside the observer's callback: a
    // measurement can switch the layout or move a region, and a size change
    // made while the observer delivers is reported by WebKit as a
    // "ResizeObserver loop" error on every phone load.
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    for (const element of regions) observer.observe(element)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  })

  // ---- Derived view ------------------------------------------------------

  const scene = $derived(buildScene(atlasState, chapter, safeArea))
  const selectedEvent = $derived(atlas.findEvent(chapter, atlasState.selectedEventId))
  const selectedPlace = $derived(atlas.findPlace(chapter, atlasState.selectedPlaceId))
  const hasSelection = $derived(selectedEvent !== null || selectedPlace !== null)
  const storyStep = $derived(
    atlasState.storyStep === null ? null : (chapter.story[atlasState.storyStep] ?? null),
  )
  const storyRelationship = $derived(
    storyStep?.kind === "summary"
      ? (chapter.relationships.find((relationship) => relationship.id === storyStep.recordId) ??
          null)
      : null,
  )
  const options = $derived(layerOptions(chapter))
  const people = $derived(pennants(chapter))
  const facts = $derived(chapterFacts(chapter))
  const windowChanged = $derived(
    atlasState.timeWindow.start !== chapter.defaultWindow.start ||
      atlasState.timeWindow.end !== chapter.defaultWindow.end,
  )
  const progress = $derived.by(() => {
    const { start, end } = atlasState.timeWindow
    return end === start ? 1 : (atlasState.playhead - start) / (end - start)
  })
  const nextEvent = $derived(
    scene.events
      .filter((event) => event.occurrence.startYear > Math.floor(atlasState.playhead))
      .sort((a, b) => a.occurrence.startYear - b.occurrence.startYear)[0] ?? null,
  )
  const canFollow = $derived(
    (selectedEvent !== null && selectedEvent.placement.kind === "point") ||
      (selectedPlace !== null && selectedPlace.position !== null),
  )
  const marks = $derived({
    attested: scene.places.some((place) => place.mark === "attested"),
    identified: scene.places.some((place) => place.mark === "identified"),
    anchor: scene.places.some((place) => place.mark === "anchor"),
    tradition: scene.places.some((place) => place.tradition),
  })
  const families = $derived(
    RELATIONSHIP_FAMILIES.filter((family) => scene.arcs.some((arc) => arc.family === family)),
  )
  const dioramaInView = $derived.by(() => {
    if (view === null) return null
    const camera = view
    const shown = scene.dioramas.find(
      (diorama) =>
        camera.heightMeters < diorama.showBelowMeters &&
        Math.abs(camera.center.lat - diorama.center.lat) < 1.5 &&
        Math.abs(camera.center.lon - diorama.center.lon) < 1.5,
    )
    return shown ? (atlas.findPlace(chapter, shown.placeId)?.label ?? null) : null
  })
  const storyPosition = $derived(
    atlasState.storyStep === null ? null : `${atlasState.storyStep + 1} of ${chapter.story.length}`,
  )

  // ---- The address, and where the reader left off -------------------------

  // The first state came from the address, so it is not written back: a
  // stale link stays in the bar until the reader moves, and the arrival plate
  // has already said what it opened instead.
  let written = untrack(() => chapterQuery(opening.state, opening.chapter))
  let pushNext = false

  function positionLabel(state: AtlasState): string {
    return (
      atlas.findEvent(chapter, state.selectedEventId)?.title ??
      atlas.findPlace(chapter, state.selectedPlaceId)?.label ??
      (state.storyStep === null ? null : chapter.story[state.storyStep]?.caption) ??
      name
    )
  }

  function remember(state: AtlasState, query: string) {
    rememberPosition({
      chapterId: chapter.id,
      search: query,
      label: positionLabel(state),
      at: Date.now(),
    })
  }

  untrack(() => remember(opening.state, written))

  $effect(() => {
    const state = atlasState
    const query = chapterQuery(state, chapter)

    untrack(() => {
      if (query === written) return
      written = query
      if (pushNext) history?.push(query)
      else history?.replace(query)
      pushNext = false
      remember(state, query)
    })
  })

  // The arrival plate describes the view a link opened; the reader's next
  // change to that view retires it.
  $effect(() => {
    const state = atlasState
    untrack(() => {
      if (arrival !== null && state !== arrivalFor) arrival = null
    })
  })

  /** True when a state has a card to show: a selection or a story step. */
  function opensRecord(state: AtlasState): boolean {
    return (
      state.selectedEventId !== null || state.selectedPlaceId !== null || state.storyStep !== null
    )
  }

  type StoryArrival = Arrival & { readonly chapter: Chapter }

  /**
   * Where an address opens: its story, and the state the rest of it asks for
   * there. `active` is the story the reader is in, which a link to an event or
   * a place stays in when the story holds it.
   */
  function arrive(
    query: string,
    active: string | null,
    start: (view: Chapter) => AtlasState = atlas.createAtlasState,
  ): StoryArrival {
    const parsed = readChapterQuery(new URLSearchParams(query))
    const chosen = chooseStory(stories, parsed, active)
    const base = start(chosen.chapter)

    if (chosen.missing !== null) {
      return {
        chapter: chosen.chapter,
        state: base,
        opened: null,
        widened: false,
        notFound: { kind: "story", value: chosen.missing },
      }
    }

    return {
      chapter: chosen.chapter,
      ...(isEmptyQuery(parsed)
        ? { state: base, opened: null, widened: false, notFound: null }
        : applyChapterQuery(base, chosen.chapter, parsed)),
    }
  }

  function arrivalPlate(result: StoryArrival) {
    const chapter = result.chapter

    if (result.notFound !== null) {
      const what = { story: "story", event: "event", place: "place", step: "story step" }[
        result.notFound.kind
      ]
      return {
        tone: "missing" as const,
        playable: false,
        title: `This chapter has no ${what} “${result.notFound.value}”.`,
        detail: "The link may be older than the chapter's records. It opened at the start.",
      }
    }

    const opened = result.opened
    if (opened === null) return null
    const widened = result.widened
      ? `The window widened to ${windowLabel(result.state.timeWindow)} to include it.`
      : null

    if (opened.kind === "event") {
      return {
        tone: "arrived" as const,
        playable: true,
        title: atlas.findEvent(chapter, opened.id)?.title ?? opened.id,
        detail: widened,
      }
    }

    if (opened.kind === "place") {
      return {
        tone: "arrived" as const,
        playable: false,
        title: atlas.findPlace(chapter, opened.id)?.label ?? opened.id,
        detail: widened,
      }
    }

    return {
      tone: "arrived" as const,
      playable: false,
      title: `Story ${opened.index + 1} of ${chapter.story.length}: ${chapter.story[opened.index]?.caption ?? ""}`,
      detail: widened,
    }
  }

  /**
   * Moves the workspace to an address: Back and Forward, or a link to the
   * chapter that is already open. An address the workspace wrote itself is
   * ignored, so its own writes never loop back. `announce` shows the arrival
   * plate, for a link; Back and Forward return silently to where the reader
   * was.
   */
  export function navigate(query: string, announce = false): void {
    const normalized = query === "?" ? "" : query
    if (normalized === written) return
    // Back and Forward return to the story the address was written in; a link
    // to an event or a place stays in the reader's story when it holds it.
    const result = arrive(normalized, announce ? chapter.storyKey : null, (view) => ({
      ...atlas.createAtlasState(view),
      layers: atlasState.layers,
      homeToken: atlasState.homeToken + (view === chapter ? 0 : 1),
    }))
    if (result.chapter !== chapter) person = null
    chapter = result.chapter
    written = chapterQuery(result.state, chapter)
    arrivalFor = result.state
    atlasState = result.state
    arrival = announce ? arrivalPlate(result) : null
    if (mode === "phone" && detent === "peek" && opensRecord(result.state)) detent = "half"
    remember(result.state, written)
  }

  // ---- Actions -----------------------------------------------------------

  function update(next: AtlasState, jump = false) {
    if (jump) pushNext = true
    atlasState = next
  }

  /**
   * Opens another story at its start: its own window, no step, and the globe
   * flown to where it happens. The layers the reader chose stay as they are.
   */
  function enterStory(view: Chapter) {
    chapter = view
    person = null
    atlasState = {
      ...atlas.createAtlasState(view),
      layers: atlasState.layers,
      homeToken: atlasState.homeToken + 1,
    }
  }

  function chooseStoryByKey(key: string) {
    const view = stories.find((candidate) => candidate.storyKey === key)
    if (view === undefined || view === chapter) return
    pushNext = true
    enterStory(view)
    exploreTab = "story"
  }

  function selectEvent(eventId: string | null) {
    update(atlas.selectEvent(atlasState, chapter, eventId))
    listOpen = false
    if (mode === "phone" && eventId !== null) detent = "half"
  }

  function jumpToStep(index: number) {
    update(atlas.jumpToStoryStep(atlasState, chapter, index), true)
    listOpen = false
    if (mode === "phone") detent = "half"
  }

  function selectPlace(placeId: string | null) {
    const here =
      placeId === null
        ? []
        : scene.events.filter(
            (event) => event.placement.kind === "point" && event.placement.placeId === placeId,
          )

    if (here.length === 1) {
      selectEvent(here[0]!.id)
      return
    }

    update(atlas.selectPlace(atlasState, chapter, placeId))
    if (mode === "phone" && placeId !== null) detent = "half"
  }

  function openFromSearch(entry: SearchEntry) {
    const kind = entry.kind
    // A record in another story opens that story first, as its link would.
    const view = chooseStory(
      stories,
      readChapterQuery(new URL(entry.href, "https://lekishi.invalid").searchParams),
      chapter.storyKey,
    ).chapter
    if (view !== chapter) enterStory(view)
    if (kind === "event") {
      update(atlas.jumpToEvent(atlasState, chapter, entry.id), true)
    } else if (kind === "place") {
      update(atlas.selectPlace(atlasState, chapter, entry.id, true), true)
    } else if (kind === "step") {
      const index = chapter.story.findIndex((step) => step.recordId === entry.id)
      if (index !== -1) update(atlas.jumpToStoryStep(atlasState, chapter, index), true)
    } else if (kind === "person" || kind === "state") {
      person = entry.id
      exploreTab = "events"
      listOpen = true
      if (mode === "phone") detent = "full"
    }
    if (mode === "phone" && kind !== "person" && kind !== "state") detent = "half"
  }

  function wholeChapter() {
    update(atlas.returnHome(atlasState))
  }

  function toggleFollow() {
    update(
      atlasState.cameraFollow === "following"
        ? atlas.noteManualCameraInput(atlasState)
        : atlas.resumeCameraFollow(atlasState, chapter),
    )
  }

  function toggleSources() {
    const showing =
      exploreTab === "sources" && (mode === "desktop" || listOpen || detent !== "peek")
    if (showing) {
      exploreTab = "story"
      listOpen = false
      return
    }
    exploreTab = "sources"
    listOpen = true
    if (mode === "phone") detent = "full"
  }

  function choosePerson(actorId: string | null) {
    person = actorId
    if (actorId !== null) exploreTab = "events"
  }

  async function copyLink() {
    const url = `${location.origin}${location.pathname}${chapterQuery(atlasState, chapter)}`
    try {
      await navigator.clipboard.writeText(url)
      notice = "Link copied"
    } catch {
      notice = url
    }
  }

  $effect(() => {
    if (notice === null) return
    const timer = setTimeout(() => (notice = null), 2400)
    return () => clearTimeout(timer)
  })

  // The workspace owns the playback clock; the renderer never advances time.
  $effect(() => {
    if (!atlasState.playing) return
    let previous = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      atlasState = atlas.advancePlayhead(atlasState, chapter, now - previous)
      previous = now
    }, 100)
    return () => clearInterval(timer)
  })

  /** `/` opens search from anywhere that is not a text field. */
  function shortcut(event: KeyboardEvent) {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest("input, textarea, select, [contenteditable='true'], dialog[open]")) return
    event.preventDefault()
    searchOpen = true
  }

  const sourcesOpen = $derived(
    exploreTab === "sources" && (mode === "desktop" || listOpen || detent !== "peek"),
  )
</script>

<svelte:window onkeydown={shortcut} />

{#snippet dateBar(compact: boolean)}
  <DateBar
    chapterName={name}
    year={yearLabel(Math.floor(atlasState.playhead))}
    sourceExpression={selectedEvent?.occurrence.sourceExpression ?? null}
    windowText={windowLabel(atlasState.timeWindow)}
    {windowChanged}
    storyText={atlasState.storyStep === null
      ? null
      : `${atlasState.storyStep + 1} / ${chapter.story.length}`}
    {compact}
    onAbout={() => (aboutOpen = true)}
    onSwitch={() => (switcherOpen = true)}
    onSearch={() => (searchOpen = true)}
  />
{/snippet}

{#snippet orbs(vertical: boolean)}
  <LayerOrbs
    {options}
    layers={atlasState.layers}
    {sourcesOpen}
    {vertical}
    onToggle={(layer, visible) => update(atlas.setLayer(atlasState, layer, visible))}
    onSources={mode === "desktop" ? undefined : toggleSources}
  />
{/snippet}

{#snippet explore()}
  <ExploreList
    {chapter}
    {scene}
    {atlasState}
    bind:tab={exploreTab as string}
    bind:query={chapterQueryText}
    {person}
    onSelect={selectEvent}
    onJump={jumpToStep}
    onStory={chooseStoryByKey}
    onClearPerson={() => (person = null)}
  />
{/snippet}

{#snippet card()}
  {#if hasSelection}
    <SelectionCard
      {chapter}
      {atlasState}
      event={selectedEvent}
      place={selectedPlace}
      playback={selectedEvent ? atlas.playbackState(atlasState, selectedEvent) : null}
      outsideWindow={atlas.selectionTimeStatus(atlasState, chapter) === "outside-window"}
      {storyPosition}
      onClose={() => update(atlas.selectEvent(atlasState, chapter, null))}
      onSelectEvent={(eventId) => update(atlas.jumpToEvent(atlasState, chapter, eventId), true)}
      onReturnToTime={() => update(atlas.returnToEventTime(atlasState, chapter))}
      onPrevious={atlasState.storyStep !== null && atlasState.storyStep > 0
        ? () => jumpToStep(atlasState.storyStep! - 1)
        : null}
      onNext={atlasState.storyStep !== null && atlasState.storyStep < chapter.story.length - 1
        ? () => jumpToStep(atlasState.storyStep! + 1)
        : null}
      onCopyLink={copyLink}
    />
  {:else if storyStep !== null && atlasState.storyStep !== null}
    {@const index = atlasState.storyStep}
    <!--
      A story step the atlas has no card for: the story's own caption for a
      relationship it narrates. It keeps the story's previous and next, so
      walking the story never dead-ends on a summary step.
    -->
    <article
      id="atlas-story-summary"
      data-testid="atlas-story-summary-step"
      class="pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-plate border border-frame bg-lacquer text-ink shadow-sheet"
    >
      <div class="min-h-0 overflow-y-auto px-4 py-3">
        <p class="text-label font-semibold uppercase text-ink-dim">
          Story · {index + 1} of {chapter.story.length}
        </p>
        <h2 class="mt-1 font-serif text-title-sm text-ink">{storyStep.caption}</h2>
        {#if storyRelationship}
          <p class="mt-2 text-body-sm text-ink-dim">{storyRelationship.summary}</p>
          <p class="mt-2 text-caption text-ink-faint">
            {familyOf(storyRelationship) ?? "relationship"}{storyRelationship.validity
              ? ` · ${windowLabel({ start: storyRelationship.validity.startYear, end: storyRelationship.validity.endYear })}`
              : ""}{storyRelationship.causal ? "" : " · asserts no causation"}
          </p>
        {/if}
      </div>
      <footer class="flex shrink-0 items-center gap-2 border-t border-rule px-3 py-2">
        <button
          type="button"
          id="atlas-story-previous"
          disabled={index === 0}
          onclick={() => jumpToStep(index - 1)}
          class={[
            "inline-flex h-8 cursor-pointer items-center gap-1 rounded-control px-2 text-body-sm text-ink-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-50",
            transition,
            focusRing,
          ]}><Icon name="chevron-left" size={14} />Previous</button
        >
        <span class="flex-1"></span>
        <button
          type="button"
          id="atlas-story-next"
          disabled={index === chapter.story.length - 1}
          onclick={() => jumpToStep(index + 1)}
          class={[
            "inline-flex h-8 cursor-pointer items-center gap-1 rounded-control border border-frame px-3 text-body-sm text-ink hover:bg-lacquer-raised disabled:cursor-not-allowed disabled:opacity-50",
            transition,
            focusRing,
          ]}>Next in story<Icon name="chevron-right" size={14} /></button
        >
      </footer>
    </article>
  {/if}
{/snippet}

{#snippet dial(compact: boolean)}
  <EventDial
    playing={atlasState.playing}
    {progress}
    nextLabel={nextEvent
      ? `Next: ${nextEvent.title} · ${yearLabel(nextEvent.occurrence.startYear)}`
      : null}
    following={atlasState.cameraFollow === "following"}
    {canFollow}
    {compact}
    onTogglePlay={() => update(atlas.setPlaying(atlasState, !atlasState.playing))}
    onStep={(direction) => update(atlas.stepPlayhead(atlasState, chapter, direction))}
    onToggleFollow={toggleFollow}
    onWholeChapter={wholeChapter}
  />
{/snippet}

{#snippet strip(compact: boolean)}
  <TimelineStrip
    {chapter}
    timeWindow={atlasState.timeWindow}
    playhead={atlasState.playhead}
    events={scene.events}
    selectedEventId={atlasState.selectedEventId}
    {compact}
    onWindowChange={(window) => update(atlas.setTimeWindow(atlasState, chapter, window))}
    onPlayheadChange={(year) => update(atlas.setPlayhead(atlasState, chapter, year))}
    onSelect={selectEvent}
  />
{/snippet}

{#snippet legend(folded: boolean)}
  <Legend
    {marks}
    journeys={scene.journeys.length > 0}
    {families}
    territories={scene.territories}
    diorama={dioramaInView}
    {folded}
  />
{/snippet}

{#snippet minimap()}
  <Minimap
    home={chapter.homeView}
    places={scene.places}
    journeys={scene.journeys}
    camera={view}
    onHome={wholeChapter}
  />
{/snippet}

{#snippet overlays()}
  {#if arrival}
    <ArrivalPlate
      title={arrival.title}
      detail={arrival.detail}
      tone={arrival.tone}
      onPlay={arrival.playable ? () => update(atlas.setPlaying(atlasState, true)) : undefined}
      onRestart={arrival.tone === "arrived" && chapter.story.length > 0
        ? () => jumpToStep(0)
        : undefined}
      onDismiss={() => (arrival = null)}
    />
  {/if}
  {#if notice}
    <p
      role="status"
      class="pointer-events-auto max-w-md truncate rounded-plate border border-frame bg-lacquer-glass px-3 py-1.5 text-caption text-ink shadow-plate backdrop-blur-md"
    >
      {notice}
    </p>
  {/if}
{/snippet}

<div
  bind:this={root}
  class="relative isolate h-full w-full overflow-hidden bg-abyss font-interface text-ink"
  data-testid="atlas-workspace"
  data-layout={mode}
>
  <Globe
    {scene}
    label="Atlas globe · {name}"
    onSelectPlace={selectPlace}
    onManualCameraInput={() => (atlasState = atlas.noteManualCameraInput(atlasState))}
    onViewChange={(next) => (view = next)}
    onError={(error) => (rendererError = error.message)}
  />

  {#if rendererError}
    <div
      id="atlas-renderer-error"
      role="alert"
      class="absolute top-1/2 left-1/2 z-(--z-alert) w-[min(26rem,90%)] -translate-x-1/2 -translate-y-1/2 rounded-plate border border-danger bg-lacquer px-5 py-4 text-body-sm text-ink shadow-sheet"
    >
      <p class="font-semibold text-danger">The globe did not start</p>
      <p class="mt-1 text-ink-dim">{rendererError}</p>
      <p class="mt-2 text-caption text-ink-dim">
        The story, the events, the timeline and the sources all work without it.
      </p>
    </div>
  {/if}

  {#if mode === "desktop"}
    <div
      class="pointer-events-none absolute inset-0 z-(--z-chrome) grid grid-cols-[19.5rem_minmax(0,1fr)_24rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-3"
    >
      <div class="col-span-3" bind:this={topRegion}>{@render dateBar(false)}</div>

      <aside bind:this={leftRegion} aria-label="Explore" class="flex min-h-0 flex-col gap-2">
        {@render orbs(false)}
        <Pennants {people} active={person} onToggle={choosePerson} />
        <div
          id="atlas-event-panel"
          class="pointer-events-auto flex min-h-0 flex-1 flex-col rounded-plate border border-frame bg-lacquer-glass px-3 py-3 shadow-plate backdrop-blur-md"
        >
          {@render explore()}
        </div>
      </aside>

      <div class="relative flex min-h-0 flex-col items-center gap-2">
        {@render overlays()}
        <div class="pointer-events-none mt-auto self-start">
          {@render legend(false)}
        </div>
      </div>

      <aside aria-label="Selection" class="flex min-h-0 flex-col">
        {#if hasSelection || storyStep !== null}
          <div bind:this={rightRegion} class="flex max-h-full min-h-0 flex-col">
            {@render card()}
          </div>
        {/if}
      </aside>

      <div bind:this={bottomRegion} class="col-span-3 flex items-end gap-3">
        {@render dial(false)}
        <div class="min-w-0 flex-1">{@render strip(false)}</div>
        {@render minimap()}
      </div>
    </div>
  {:else if mode === "tablet"}
    <div
      class="pointer-events-none absolute inset-0 z-(--z-chrome) grid grid-cols-[auto_minmax(0,1fr)_22rem] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-3"
    >
      <div class="col-span-3" bind:this={topRegion}>{@render dateBar(false)}</div>

      <aside bind:this={leftRegion} aria-label="Layers" class="flex min-h-0 flex-col gap-2">
        {@render orbs(true)}
        <!--
          The frame's grid lets pointer input through to the globe
          (pointer-events-none) and each control opts back in. The layer orbs
          do so as a group; this orb stands outside that group, so it opts in
          itself, or a press on it would land on the globe instead.
        -->
        <Orb
          class="pointer-events-auto"
          icon="list"
          label={listOpen ? "Close the story and events" : "Story and events"}
          pressed={listOpen}
          onchange={(next) => (listOpen = next)}
        />
      </aside>

      <div class="relative flex min-h-0 flex-col items-start gap-2">
        {#if listOpen}
          <div
            id="atlas-event-panel"
            class="pointer-events-auto flex min-h-0 w-80 max-w-full flex-1 flex-col gap-2 rounded-plate border border-frame bg-lacquer px-3 py-3 shadow-sheet"
          >
            <Pennants {people} active={person} onToggle={choosePerson} />
            <div class="min-h-0 flex-1">{@render explore()}</div>
          </div>
        {:else}
          <div class="flex w-full flex-col items-center gap-2">{@render overlays()}</div>
          <div class="mt-auto">{@render legend(true)}</div>
        {/if}
      </div>

      <aside aria-label="Selection" class="flex min-h-0 flex-col">
        {#if hasSelection || storyStep !== null}
          <div bind:this={rightRegion} class="flex max-h-full min-h-0 flex-col">
            {@render card()}
          </div>
        {/if}
      </aside>

      <div bind:this={bottomRegion} class="col-span-3 flex items-end gap-3">
        {@render dial(false)}
        <div class="min-w-0 flex-1">{@render strip(false)}</div>
        {@render minimap()}
      </div>
    </div>
  {:else}
    <div class="pointer-events-none absolute inset-0 z-(--z-chrome) flex flex-col">
      <div bind:this={topRegion} class="flex flex-col gap-2 px-2 pt-2">
        {@render dateBar(true)}
        <div class="-mx-2 overflow-x-auto px-2 pb-1">{@render orbs(false)}</div>
      </div>
      <div class="flex flex-col items-center gap-2 px-2 pt-1">{@render overlays()}</div>
      {#if detent === "peek"}
        <div class="mt-auto px-2 pb-2">{@render legend(true)}</div>
      {/if}
      <!--
        The sheet's detents are heights in viewport units, but it sits under
        the date bar, the orbs and any arrival plate, whose height the detent
        cannot know. The region may shrink (min-h-0) and the sheet shrinks with
        it as a flex item, so the full detent ends at the bottom of the screen
        instead of running past it with its last rows and its footer cut off.
      -->
      <div
        bind:this={bottomRegion}
        class={["pointer-events-auto flex min-h-0 flex-col", detent !== "peek" && "mt-auto"]}
      >
        <Sheet
          title={selectedEvent?.title ?? selectedPlace?.label ?? storyStep?.caption ?? name}
          placement="bottom"
          bind:detent
          closable={false}
        >
          <!--
            The list takes what the sheet has left under the dial, the strip
            and the people, rather than a fixed share of the viewport: a fixed
            60dvh ran below the sheet's bottom edge, so the list's last rows
            sat under a second, outer scroll and could not be reached by
            scrolling the list. Its floor keeps the tabs, the search field and
            a few rows at the half detent, where the sheet's body scrolls to it.
          -->
          <div class="flex h-full flex-col gap-3">
            {@render dial(true)}
            {#if detent !== "peek"}
              {@render strip(true)}
              {#if (hasSelection || storyStep !== null) && !listOpen}
                <div class="flex min-h-[24rem] flex-col">{@render card()}</div>
                <button
                  type="button"
                  onclick={() => {
                    listOpen = true
                    detent = "full"
                  }}
                  class={[
                    "self-center rounded-control px-2 py-1 text-body-sm text-ink-dim underline decoration-rule underline-offset-2 hover:text-ink",
                    transition,
                    focusRing,
                  ]}>Story and events</button
                >
              {:else}
                <Pennants {people} active={person} onToggle={choosePerson} />
                <div id="atlas-event-panel" class="flex min-h-48 flex-1 flex-col">
                  {@render explore()}
                </div>
              {/if}
            {/if}
          </div>
        </Sheet>
      </div>
    </div>
  {/if}

  <AboutSheet
    {chapter}
    {name}
    {decision}
    {facts}
    open={aboutOpen}
    onClose={() => (aboutOpen = false)}
  />
  <SearchDialog
    open={searchOpen}
    current={chapter.id}
    currentName={name}
    onClose={() => (searchOpen = false)}
    onOpenHere={openFromSearch}
  />
  <ChapterSwitcher
    open={switcherOpen}
    current={chapter.id}
    onClose={() => (switcherOpen = false)}
  />
</div>
