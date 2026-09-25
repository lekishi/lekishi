<script lang="ts">
  import { untrack } from "svelte"
  import type { Chapter } from "../domain"
  import { reviewSummaryLabel, windowLabel } from "../labels"
  import { buildScene } from "../scene"
  import * as atlas from "../state"
  import type { AtlasState } from "../state"
  import EventList from "./EventList.svelte"
  import Globe from "./Globe.svelte"
  import SelectionPanel from "./SelectionPanel.svelte"
  import TimeControls from "./TimeControls.svelte"

  /**
   * The workspace renders whichever chapter its caller mounts it with: the
   * production atlas passes the reviewed Tang chapter, and the comparison review
   * route passes the bounded Qin fixture. The chapter is data, not a branch in
   * this component; `detail` only decides whether the review-only dispute
   * presentation is shown, because the approved launch chapter's surface must not
   * change without an owner decision.
   */
  let {
    chapter,
    detail = "production",
  }: { chapter: Chapter; detail?: "production" | "comparison-review" } = $props()

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
  const showDisputeDetail = $derived(detail === "comparison-review")

  // What the chapter's own publication states, counted rather than claimed: the
  // notice panel has to stay true when the content changes.
  const review = $derived(chapter.publication)
  const inWindowEvents = $derived(chapter.events.filter((event) => !event.coda))
  const codaEvents = $derived(chapter.events.length - inWindowEvents.length)
  const unplacedInWindow = $derived(
    inWindowEvents.filter((event) => event.placement.kind === "none").length,
  )
  const unlocatedPlaces = $derived(chapter.places.filter((place) => place.position === null).length)

  // The review surface names the content's status in the atlas's own words; the
  // production surface keeps the wording the owner approved.
  const noticeLabel = $derived(
    detail === "comparison-review" ? "Unapproved preparation" : "Reviewed chapter",
  )

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
</script>

<div
  class="relative h-full w-full overflow-hidden bg-slate-950 text-slate-100"
  data-testid="atlas-workspace"
>
  <Globe
    {scene}
    label="Atlas globe · {chapter.title}"
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
    `md` up the column is bounded above the time controls and the event list
    shrinks to fit it, so a long window scrolls inside the panel instead of
    running under the controls.
  -->
  <div
    class="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2"
    style="bottom: {controlsHeight + 24}px"
  >
    <div class="flex shrink-0 flex-wrap items-start justify-between gap-2">
      <div
        id="atlas-notice"
        class="max-h-[45dvh] w-full min-w-0 overflow-y-auto rounded-xl border border-amber-300/40 bg-slate-950/85 px-3 py-2 backdrop-blur sm:w-auto sm:max-w-[19rem]"
      >
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
          {noticeLabel} · {reviewSummaryLabel(review.independence)}
        </p>
        <p class="mt-0.5 text-xs font-semibold leading-snug text-slate-100">{chapter.title}</p>
        <!--
          The chapter's own coverage statement is the full statement of what this
          chapter does and does not cover. Phone widths keep the derived counts
          instead: the notice must not eat the space the event list needs.
        -->
        <p class="mt-1 hidden text-[0.7rem] leading-snug text-slate-300 sm:block">
          {review.coverageNote}
        </p>
        <p class="mt-1 text-[0.65rem] leading-snug text-amber-200/80">
          {windowLabel(chapter.defaultWindow)} with {codaEvents} coda
          {codaEvents === 1 ? "node" : "nodes"} outside it; {unplacedInWindow} of {inWindowEvents.length}
          in-window events and {unlocatedPlaces} of {chapter.places.length} places without a sourced map
          position.
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
          Events ({scene.events.length})
        </button>
      </div>
    </div>

    <div
      id="atlas-event-panel"
      class={[
        "pointer-events-auto min-h-[8rem] w-[17rem] max-w-full flex-1 flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950/85 px-3 py-3 shadow-xl shadow-slate-950/50 backdrop-blur md:min-h-0 md:flex-initial",
        listOpen ? "flex" : "hidden md:flex",
      ]}
    >
      <EventList
        events={scene.events}
        selectedEventId={atlasState.selectedEventId}
        disputeDetail={showDisputeDetail}
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
          disputeDetail={showDisputeDetail}
          onReturnToTime={() => (atlasState = atlas.returnToEventTime(atlasState, chapter))}
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
