<script lang="ts">
  import { CHAPTER } from "../chapter-content"
  import { reviewSummaryLabel } from "../labels"
  import { buildScene } from "../scene"
  import * as atlas from "../state"
  import type { AtlasState } from "../state"
  import EventList from "./EventList.svelte"
  import Globe from "./Globe.svelte"
  import SelectionPanel from "./SelectionPanel.svelte"
  import TimeControls from "./TimeControls.svelte"

  // This component is the single owner of atlas interaction state. Everything
  // below reads from `atlasState` and dispatches actions; the renderer only
  // receives the derived scene, so selection, time, and camera-follow can never
  // diverge. The variable is not named `state`: svelte-check then reads `$state`
  // as a Svelte 4 store subscription instead of the rune, and the runes-mode
  // component stops type-checking.
  let atlasState: AtlasState = $state.raw(atlas.createAtlasState(CHAPTER))
  let rendererError = $state<string | null>(null)
  let listOpen = $state(false)

  const scene = $derived(buildScene(atlasState, CHAPTER))
  const selectedEvent = $derived(atlas.findEvent(CHAPTER, atlasState.selectedEventId))
  const selectionStatus = $derived(atlas.selectionTimeStatus(atlasState, CHAPTER))
  const playing = $derived(atlasState.playing)

  // What the chapter's own publication states, counted rather than claimed: the
  // notice panel has to stay true when the content changes.
  const review = CHAPTER.publication
  const inWindowEvents = $derived(CHAPTER.events.filter((event) => !event.coda))
  const codaEvents = $derived(CHAPTER.events.length - inWindowEvents.length)
  const unplacedInWindow = $derived(
    inWindowEvents.filter((event) => event.placement.kind === "none").length,
  )
  const unlocatedPlaces = $derived(CHAPTER.places.filter((place) => place.position === null).length)

  // The workspace owns the playback clock; the renderer never advances time.
  $effect(() => {
    if (!playing) {
      return
    }

    let previous = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      atlasState = atlas.advancePlayhead(atlasState, CHAPTER, now - previous)
      previous = now
    }, 100)

    return () => clearInterval(timer)
  })

  function selectEvent(eventId: string | null) {
    atlasState = atlas.selectEvent(atlasState, CHAPTER, eventId)
    listOpen = false
  }
</script>

<div
  class="relative h-full w-full overflow-hidden bg-slate-950 text-slate-100"
  data-testid="atlas-workspace"
>
  <Globe
    {scene}
    label="Atlas globe · {CHAPTER.title}"
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
    One overlay column: the notice, the event list, and the selection panel are
    laid out in flow, so they can never overlap each other. At phone widths the
    notice takes the full width, the buttons wrap below it, the event list keeps
    a usable minimum height, and the details panel scrolls in what is left; from
    `md` up the column is content-sized and each panel keeps its own corner of
    the viewport.
  -->
  <div
    class="pointer-events-none absolute inset-x-3 bottom-36 top-3 z-20 flex flex-col gap-2 md:bottom-auto"
  >
    <div class="flex shrink-0 flex-wrap items-start justify-between gap-2">
      <div
        id="atlas-notice"
        class="max-h-[45dvh] w-full min-w-0 overflow-y-auto rounded-xl border border-amber-300/40 bg-slate-950/85 px-3 py-2 backdrop-blur sm:w-auto sm:max-w-[19rem]"
      >
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
          Reviewed chapter · {reviewSummaryLabel(review.independence)}
        </p>
        <p class="mt-0.5 text-xs font-semibold leading-snug text-slate-100">{CHAPTER.title}</p>
        <!--
          The chapter's own coverage statement is the full statement of what this
          chapter does and does not cover. Phone widths keep the derived counts
          instead: the notice must not eat the space the event list needs.
        -->
        <p class="mt-1 hidden text-[0.7rem] leading-snug text-slate-300 sm:block">
          {review.coverageNote}
        </p>
        <p class="mt-1 text-[0.65rem] leading-snug text-amber-200/80">
          {CHAPTER.defaultWindow.start}–{CHAPTER.defaultWindow.end} with {codaEvents} coda nodes outside
          it; {unplacedInWindow} of {inWindowEvents.length} in-window events and {unlocatedPlaces}
          places carry no sourced map position.
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
                : atlas.resumeCameraFollow(atlasState, CHAPTER))}
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
          Events ({scene.events.length})
        </button>
      </div>
    </div>

    <div
      id="atlas-event-panel"
      class={[
        "pointer-events-auto min-h-[8rem] w-[17rem] max-w-full flex-1 flex-col rounded-2xl border border-slate-700/70 bg-slate-950/85 px-3 py-3 shadow-xl shadow-slate-950/50 backdrop-blur md:max-h-[calc(100dvh-13rem)] md:min-h-0 md:flex-none",
        listOpen ? "flex" : "hidden md:flex",
      ]}
    >
      <EventList
        events={scene.events}
        selectedEventId={atlasState.selectedEventId}
        onSelect={selectEvent}
      />
    </div>

    {#if selectedEvent}
      <div
        class="mt-auto min-h-0 max-h-[60%] md:absolute md:right-0 md:top-[5.25rem] md:mt-0 md:max-h-[calc(100dvh-14rem)] md:w-96"
      >
        <SelectionPanel
          event={selectedEvent}
          status={selectionStatus}
          review={{ independence: review.independence, reviewer: review.reviewer }}
          onReturnToTime={() => (atlasState = atlas.returnToEventTime(atlasState, CHAPTER))}
          onClose={() => selectEvent(null)}
        />
      </div>
    {/if}
  </div>

  <div class="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center">
    <TimeControls
      timeWindow={atlasState.timeWindow}
      playhead={atlasState.playhead}
      playing={atlasState.playing}
      onWindowChange={(window) => (atlasState = atlas.setTimeWindow(atlasState, CHAPTER, window))}
      onPlayheadChange={(year) => (atlasState = atlas.setPlayhead(atlasState, CHAPTER, year))}
      onStep={(direction) => (atlasState = atlas.stepPlayhead(atlasState, CHAPTER, direction))}
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
