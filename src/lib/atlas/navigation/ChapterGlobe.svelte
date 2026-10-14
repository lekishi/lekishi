<script lang="ts">
  import { onMount, type Component } from "svelte"
  import type { GeoPoint } from "../domain"
  import type { AtlasScene } from "../scene"
  import { NO_INSETS } from "../scene"
  import type { SearchChapter } from "../search-index"
  import { loadSearchIndex } from "./load-index"

  /**
   * The chapters on the globe (RFD 5, "Home"): every chapter marked where it
   * opens, on the same globe the atlas uses. A press on a mark opens the
   * chapter. It is a picture of where the stories are, not an atlas: there is
   * no state, no timeline and no selection, and the atlas workspace stays the
   * only thing that mounts one (`$lib/atlas/entry`).
   *
   * The globe is heavy, so it loads after the page has painted and only where
   * it will be seen: a wide enough viewport with WebGL. Everywhere else the
   * time ribbon and the chapter list carry the same choice. A mark is a hollow
   * diamond, the grammar's "names an area, asserts no site", because a
   * chapter's opening view is a framing, not a place in the records.
   */
  let { onOpen }: { onOpen: (href: string) => void } = $props()

  let Globe: Component<{
    scene: AtlasScene
    label: string
    onSelectPlace: (placeId: string | null) => void
    onManualCameraInput: () => void
    onError: (error: Error) => void
  }> | null = $state(null)
  let chapters: readonly SearchChapter[] = $state.raw([])
  let failed = $state(false)

  function wanted(): boolean {
    if (typeof window.matchMedia !== "function") return false
    if (!window.matchMedia("(min-width: 1024px)").matches) return false
    try {
      return document.createElement("canvas").getContext("webgl2") !== null
    } catch {
      return false
    }
  }

  onMount(() => {
    if (!wanted()) return
    let cancelled = false

    Promise.all([loadSearchIndex(), import("../workspace/Globe.svelte")]).then(
      ([index, module]) => {
        if (cancelled) return
        chapters = index.chapters
        Globe = module.default
      },
      () => (failed = true),
    )

    return () => (cancelled = true)
  })

  const center: GeoPoint = $derived.by(() => {
    if (chapters.length === 0) return { lon: 110, lat: 32 }
    const lon = chapters.reduce((sum, chapter) => sum + chapter.home.lon, 0) / chapters.length
    const lat = chapters.reduce((sum, chapter) => sum + chapter.home.lat, 0) / chapters.length
    return { lon, lat }
  })

  const scene: AtlasScene = $derived({
    chapterId: "home",
    homeView: center,
    timeWindow: { start: 0, end: 0 },
    playhead: 0,
    playing: false,
    events: [],
    places: chapters.map((chapter) => ({
      id: chapter.id,
      label: chapter.name,
      position: chapter.home,
      mark: "anchor" as const,
      precision: "region" as const,
      eventCount: chapter.events,
      tone: "definite" as const,
      playback: "inactive" as const,
      selected: false,
      disputed: false,
    })),
    journeys: [],
    arcs: [],
    territories: [],
    dioramas: [],
    selectedEventId: null,
    selectedPlaceId: null,
    selectionOutsideWindow: false,
    cameraFollow: "manual",
    cameraFocus: null,
    homeToken: 0,
    cameraTarget: null,
    safeArea: NO_INSETS,
  })
</script>

<div class="relative size-full" data-testid="chapter-globe">
  {#if Globe && !failed}
    <Globe
      {scene}
      label="The chapters on the globe"
      onSelectPlace={(id) => {
        const chapter = chapters.find((candidate) => candidate.id === id)
        if (chapter) onOpen(chapter.href)
      }}
      onManualCameraInput={() => {}}
      onError={() => (failed = true)}
    />
  {/if}
</div>
