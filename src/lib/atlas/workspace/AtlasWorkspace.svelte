<script lang="ts">
  import { FIXTURE_CHAPTER } from "../fixtures"
  import { buildScene, placeOf } from "../scene"
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
  let atlasState: AtlasState = $state.raw(atlas.createAtlasState(FIXTURE_CHAPTER))
  let rendererError = $state<string | null>(null)
  let listOpen = $state(false)

  const scene = $derived(buildScene(atlasState, FIXTURE_CHAPTER))
  const selectedEvent = $derived(atlas.findEvent(FIXTURE_CHAPTER, atlasState.selectedEventId))
  const selectedPlace = $derived(
    selectedEvent === null ? null : placeOf(FIXTURE_CHAPTER, selectedEvent.placeId),
  )
  const selectionStatus = $derived(atlas.selectionTimeStatus(atlasState, FIXTURE_CHAPTER))
  const playing = $derived(atlasState.playing)

  // The workspace owns the playback clock; the renderer never advances time.
  $effect(() => {
    if (!playing) {
      return
    }

    let previous = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      atlasState = atlas.advancePlayhead(atlasState, FIXTURE_CHAPTER, now - previous)
      previous = now
    }, 100)

    return () => clearInterval(timer)
  })

  function selectEvent(eventId: string | null) {
    atlasState = atlas.selectEvent(atlasState, FIXTURE_CHAPTER, eventId)
    listOpen = false
  }
</script>

<div
  class="relative h-full w-full overflow-hidden bg-slate-950 text-slate-100"
  data-testid="atlas-workspace"
>
  <Globe
    {scene}
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
    laid out in flow, so they can never overlap each other. On phones the column
    is bounded above the time controls and the notice shrinks beside the controls
    instead of colliding with them; from `md` up the column is content-sized and
    each panel keeps its own corner of the viewport.
  -->
  <div
    class="pointer-events-none absolute inset-x-3 bottom-36 top-3 z-20 flex flex-col gap-2 md:bottom-auto"
  >
    <div class="flex items-start justify-between gap-2">
      <div
        id="atlas-notice"
        class="min-w-0 rounded-xl border border-amber-300/40 bg-slate-950/80 px-3 py-2 backdrop-blur sm:max-w-[15rem]"
      >
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
          Synthetic fixture
        </p>
        <p class="mt-0.5 text-xs leading-snug text-slate-300">
          Placeholder events for the technical foundation. Not historical content.
        </p>
      </div>

      <div class="pointer-events-auto flex shrink-0 flex-col items-end gap-2">
        <button
          id="atlas-follow-toggle"
          type="button"
          disabled={selectedEvent === null}
          aria-pressed={atlasState.cameraFollow === "following"}
          onclick={() =>
            (atlasState =
              atlasState.cameraFollow === "following"
                ? atlas.noteManualCameraInput(atlasState)
                : atlas.resumeCameraFollow(atlasState, FIXTURE_CHAPTER))}
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
        "pointer-events-auto min-h-0 w-[17rem] max-w-full flex-1 flex-col rounded-2xl border border-slate-700/70 bg-slate-950/85 px-3 py-3 shadow-xl shadow-slate-950/50 backdrop-blur md:max-h-[calc(100dvh-11rem)] md:flex-none",
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
          place={selectedPlace}
          status={selectionStatus}
          onReturnToTime={() => (atlasState = atlas.returnToEventTime(atlasState, FIXTURE_CHAPTER))}
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
      onWindowChange={(window) =>
        (atlasState = atlas.setTimeWindow(atlasState, FIXTURE_CHAPTER, window))}
      onPlayheadChange={(year) =>
        (atlasState = atlas.setPlayhead(atlasState, FIXTURE_CHAPTER, year))}
      onStep={(direction) =>
        (atlasState = atlas.stepPlayhead(atlasState, FIXTURE_CHAPTER, direction))}
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
