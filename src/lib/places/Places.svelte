<script lang="ts">
  import { afterNavigate, pushState, replaceState } from "$app/navigation"
  import { onMount, tick } from "svelte"
  import type { GeoPoint } from "$lib/atlas/domain"
  import { windowLabel } from "$lib/atlas/labels"
  import { CAMPAIGN_BOARD } from "$lib/atlas/renderer/globe-renderer"
  import { normalizeForSearch } from "$lib/atlas/search"
  import { hexOf, hexRegion } from "$lib/atlas/renderer/globe/board"
  import { surfaceDistance } from "$lib/atlas/renderer/globe/geo"
  import type { CameraView } from "$lib/atlas/renderer/types"
  import { NO_INSETS } from "$lib/atlas/scene"
  import Globe from "$lib/atlas/workspace/Globe.svelte"
  import { REGIONS } from "$lib/historical/regions"
  import { Button, Field, NameForm, Plate, focusRing } from "$lib/ui"
  import { placesBoard, placesScene } from "./board-scene"
  import { momentWindow, type PlaceCatalogue, type PlaceEntry, type PlaceMoment } from "./catalogue"
  import { overviewCenter, overviewRange } from "./overview"
  import boundaries from "./region-boundaries.json"
  import TimeBar from "./TimeBar.svelte"

  let { catalogue }: { catalogue: PlaceCatalogue } = $props()
  const modes = ["By region", "Most chapters", "A–Z"] as const
  const globeOptions = { ...CAMPAIGN_BOARD, pitchDeg: -90 }
  // Position labels over open tiles rather than in the densest place clusters.
  const labelPositions: Partial<Record<string, GeoPoint>> = {
    "western-europe": { lon: 14, lat: 49 },
    "north-west-africa": { lon: 12, lat: 27 },
    mediterranean: { lon: 21, lat: 41.5 },
    "mesopotamia-levant": { lon: 45, lat: 30.5 },
    "iran-anatolia": { lon: 59, lat: 26 },
  }
  let homeToken = $state(0)
  let selection = $state<string | null>(null)
  let momentIndex = $state(-1)
  let missing = $state("")
  let chapterLink = $state<string | null>(null)
  let filter = $state("")
  let mode = $state<(typeof modes)[number]>("By region")
  let target = $state<GeoPoint | null>(null)
  let rangeMeters = $state<number | undefined>()
  let camera = $state<CameraView | null>(null)
  let clusterChoices = $state<PlaceEntry[]>([])
  let flight = $state(0)
  let mapError = $state(false)
  let barHeight = $state(0)
  let wide = $state(false)
  let mapWidth = $state(0)
  let mapHeight = $state(0)
  let controlsHeight = $state(0)
  let map: HTMLDivElement
  let rail: HTMLElement
  let index: HTMLElement

  onMount(() => {
    const measure = () => {
      mapWidth = map.clientWidth
      mapHeight = map.clientHeight
      wide = window.matchMedia("(min-width: 64rem)").matches
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(map)
    return () => observer.disconnect()
  })

  const shared = $derived(catalogue.places)
  const positions = $derived(
    shared.flatMap(({ place }) => (place.position ? [place.position] : [])),
  )
  const homeView = $derived(overviewCenter(positions))
  const selected = $derived(shared.find((entry) => entry.id === selection) ?? null)
  const inset = $derived(
    wide ? controlsHeight + 20 + (selected ? barHeight : 0) : selected ? barHeight + 8 : 0,
  )
  const homeRangeMeters = $derived(overviewRange(positions, homeView, mapWidth, mapHeight, inset))
  const current = $derived(selected?.moments[momentIndex] ?? null)
  const chapter = $derived(selected?.chapters.find(({ id }) => current?.chapterId === id))
  const visible = $derived.by(() => {
    const query = normalizeForSearch(filter.trim())
    return shared
      .filter(({ place }) =>
        [place.label, ...place.aliases].some((name) => normalizeForSearch(name).includes(query)),
      )
      .sort(
        (a, b) =>
          (mode === "A–Z" ? 0 : b.chapters.length - a.chapters.length) ||
          (a.place.romanization ?? a.place.label).localeCompare(
            b.place.romanization ?? b.place.label,
          ),
      )
  })
  const polygons = boundaries.map(({ poly }) => poly)
  const groups = $derived.by(() => {
    const placed = visible.filter(({ place }) => place.position !== null)
    const buckets = Map.groupBy(placed, ({ place }) => {
      const { lon, lat } = place.position!
      const region = hexRegion(hexOf(lon, lat), polygons)
      return region === 0 ? null : boundaries[region - 1].key
    })
    return [
      ...(mode === "By region"
        ? [
            ...REGIONS.map(({ key, name }) => ({
              key,
              title: name,
              entries: buckets.get(key) ?? [],
            })),
            { key: null, title: "Outside the drawn regions", entries: buckets.get(null) ?? [] },
          ]
        : [{ key: null, title: "", entries: placed }]),
      {
        key: null,
        title: "No position asserted",
        entries: visible.filter(({ place }) => place.position === null),
      },
    ]
  })
  const allTime = $derived(Object.values(catalogue.reach).flat())
  const board = $derived({
    ...placesBoard(chapter ? catalogue.reach[chapter.id] : allTime),
    regions: mode === "By region" ? { polygons, strength: chapter ? 0.22 : 1 } : undefined,
  })
  const height = $derived(camera?.heightMeters ?? homeRangeMeters)
  const clusters = $derived.by(() => {
    const radius = (height * 26) / Math.max(240, mapHeight)
    // A place outside the current telling's reach must not stand in for one in it.
    const active = chapter
      ? shared.filter((entry) => entry.chapters.some(({ id }) => id === chapter?.id))
      : shared
    const sorted = [...active].sort((a, b) => b.chapters.length - a.chapters.length)
    const groups: PlaceEntry[][] = []
    for (const entry of sorted) {
      const position = entry.place.position
      if (position === null) continue
      const group =
        entry === selected
          ? undefined
          : groups.find(
              ([first]) =>
                first !== selected &&
                first.place.position !== null &&
                surfaceDistance(position, first.place.position) < radius,
            )
      if (group) group.push(entry)
      else groups.push([entry])
    }
    return chapter
      ? [
          ...groups,
          ...shared
            .filter((entry) => entry.place.position && !active.includes(entry))
            .map((entry) => [entry]),
        ]
      : groups
  })
  const scene = $derived.by(() => {
    const base = placesScene(
      clusters.map(([entry]) => entry),
      selected,
      chapter?.id ?? null,
      board,
      {
        homeView,
        homeToken,
        cameraFocus:
          target === null ? null : { token: flight, recordId: selection ?? "", rangeMeters },
        cameraTarget: target,
        safeArea: { ...NO_INSETS, top: wide ? 0 : controlsHeight + 8, bottom: inset },
      },
    )
    const markers = base.places.map((place, index) => ({
      ...place,
      clusterSize: clusters[index].length - 1,
    }))
    const labels =
      mode === "By region" && (mapWidth >= 768 || height < 4_000_000)
        ? boundaries.map(({ key, short, label: [lon, lat] }) => ({
            id: `region/${key}`,
            guideLabel: true,
            position: labelPositions[key] ?? { lon, lat },
            label: short.replace("\n", " "),
            mark: "anchor" as const,
            precision: "unspecified" as const,
            playback: "inactive" as const,
            eventCount: 0,
            tone: "definite" as const,
            selected: false,
            disputed: false,
            tradition: false,
            control: null,
          }))
        : []
    return { ...base, homeRangeMeters, places: [...markers, ...labels] }
  })

  function focus(position: GeoPoint | null, range?: number) {
    target = position
    rangeMeters = range
    if (position === null) homeToken++
    else flight++
  }

  async function reveal(entry: PlaceEntry, focusRow = false) {
    await tick()
    const row = document.getElementById(`places-row-${entry.id}`)
    if (!row || selection !== entry.id) return
    const scroll = wide ? rail : index
    scroll.scrollTop += row.getBoundingClientRect().top - scroll.getBoundingClientRect().top
    if (focusRow) row.querySelector("button")?.focus({ preventScroll: true })
  }

  function applyAddress(url: URL) {
    const id = url.searchParams.get("place")
    const event = url.searchParams.get("event")
    const owner = url.searchParams.get("chapter")
    const entry = shared.find((entry) => entry.id === id)
    const single = !entry && catalogue.singletons.find((entry) => entry.id === id)
    chapterLink = single ? single.href : null
    selection = entry?.id ?? null
    const telling =
      entry?.moments.findIndex((moment) => moment.id === event && owner === moment.chapterId) ?? -1
    momentIndex =
      telling >= 0 ? telling : (entry?.moments.findIndex((moment) => moment.id === event) ?? -1)
    missing = single
      ? `One chapter reaches ${single.label}.`
      : id !== null && !entry
        ? `Place “${id}” is no longer listed.`
        : event !== null && momentIndex < 0
          ? `Moment “${event}” is no longer listed at this place.`
          : ""
    if (entry) {
      filter = ""
      frameMoment(entry, entry.moments[momentIndex] ?? null)
      void reveal(entry)
    } else {
      focus(null)
      if (!wide && index) index.scrollTop = 0
    }
  }

  function pop() {
    applyAddress(new URL(window.location.href))
  }
  // SvelteKit's route snapshot can predate shallow replacements on Back.
  // The browser address carries the actual selected telling.
  afterNavigate(pop)

  function choosePlace(entry: PlaceEntry, fromMap = false) {
    const url = new URL(window.location.href)
    url.searchParams.set("place", entry.id)
    url.searchParams.delete("event")
    url.searchParams.delete("chapter")
    if (url.href !== window.location.href) pushState(url, {})
    selection = entry.id
    momentIndex = -1
    missing = ""
    chapterLink = null
    clusterChoices = []
    frameMoment(entry, null)
    if (fromMap) filter = ""
    if (fromMap || !wide) void reveal(entry, fromMap)
  }

  function chooseMoment(moment: PlaceMoment | null) {
    if (selected === null) return
    const fromIndex = index.contains(document.activeElement)
    if (moment?.chapterId !== current?.chapterId) frameMoment(selected, moment)
    const url = new URL(window.location.href)
    url.searchParams.delete("chapter")
    if (moment) {
      url.searchParams.set("event", moment.id)
      if (
        selected.moments.some(
          (candidate) => candidate.id === moment.id && candidate.chapterId !== moment.chapterId,
        )
      ) {
        url.searchParams.set("chapter", moment.chapterId)
      }
    } else url.searchParams.delete("event")
    replaceState(url, {})
    missing = ""
    momentIndex = moment === null ? -1 : selected.moments.indexOf(moment)
    if (!wide) void reveal(selected, fromIndex)
  }

  function frameMoment(entry: PlaceEntry, moment: PlaceMoment | null) {
    if (!moment) return focus(entry.place.position, 2_250_000)
    const reach = catalogue.reach[moment.chapterId]
    const center = entry.place.position ?? reach[0]
    if (!center) return focus(null)
    const farthest = Math.max(0, ...reach.map((point) => surfaceDistance(center, point)))
    focus(center, Math.min(13_000_000, Math.max(1_000_000, farthest * 2.7)))
  }

  async function selectRegion(key: string) {
    const item = boundaries.find((region) => region.key === key)
    if (!item) return
    const [lon, lat] = item.label
    const center = { lon, lat }
    const radius = Math.max(...item.poly.map(([lon, lat]) => surfaceDistance(center, { lon, lat })))
    focus(center, Math.min(13_000_000, radius * 2.8))
    await tick()
    const heading = document.getElementById(`places-region-${key}`)
    const scroll = wide ? rail : index
    if (heading)
      scroll.scrollTop += heading.getBoundingClientRect().top - scroll.getBoundingClientRect().top
  }

  function selectMap(id: string | null) {
    if (id?.startsWith("region/")) return void selectRegion(id.slice(7))
    const group = clusters.find(([entry]) => entry.id === id)
    if (!group) return
    if (group.length === 1) choosePlace(group[0], true)
    else {
      const next = Math.max(30_000, height / 3)
      clusterChoices = height <= 90_000 ? group : []
      focus(group[0].place.position, next)
    }
  }

  function zoom(factor: number) {
    clusterChoices = []
    focus(camera?.center ?? homeView, Math.max(30_000, Math.min(25_000_000, height * factor)))
  }
</script>

<svelte:window onpopstate={pop} />

{#snippet legend()}
  {chapter
    ? `Lit hexes are where “${chapter.title}” reaches, never a territory.`
    : "Lit hexes are where the chapters reach. Region lines group the index; neither is a territory."}
  <a class={["flex min-h-6 w-fit items-center underline", focusRing]} href="/globe/ATTRIBUTION.txt"
    >Imagery and elevation attribution</a
  >
{/snippet}

{#snippet momentDetail(moment: PlaceMoment)}
  {#if moment.tradition}<p class="text-caption text-ink-dim">Tradition</p>{/if}
  {#if moment.dispute}<p class="text-caption text-ink-dim">{moment.dispute}</p>{/if}
  <p class="font-serif text-body-sm">{moment.note}</p>
  <Button variant="ghost" size="sm" href={moment.href}>Open this moment in the chapter</Button>
{/snippet}

<div
  class="flex h-full min-w-0 flex-col bg-abyss text-ink max-lg:[@media(max-height:34rem)]:h-auto max-[800px]:[@media(max-height:34rem)]:pb-[calc(3.5rem+1px+env(safe-area-inset-bottom))] lg:grid lg:grid-cols-[27.5rem_minmax(0,1fr)]"
>
  <section aria-label="Places map" class="relative shrink-0 min-w-0 lg:order-2">
    <div
      bind:this={map}
      style:--map-chrome="{selected ? controlsHeight + barHeight + 96 : 0}px"
      class={[
        "relative isolate h-[max(var(--map-chrome),min(19rem,43dvh))] overflow-hidden bg-abyss md:h-[max(var(--map-chrome),min(76vw,53dvh))] lg:h-full",
        !selected && "max-sm:[@media(max-height:43rem)]:h-[12.5rem]",
      ]}
    >
      {#if mapWidth > 0 && mapHeight > 0}
        <Globe
          {scene}
          label="Map of places reached by chapters"
          options={globeOptions}
          onSelectPlace={selectMap}
          onViewChange={(view) => (camera = view)}
          onManualCameraInput={() => {
            clusterChoices = []
          }}
          onError={(error) => {
            mapError = true
            console.error(error)
          }}
        />
      {/if}
      {#if clusterChoices.length}
        <ul
          aria-label="Places at this position"
          class="absolute right-3 top-14 z-(--z-chrome) max-h-28 overflow-y-auto rounded-plate border border-frame bg-lacquer p-2 lg:top-3 lg:max-h-44"
        >
          {#each clusterChoices as entry (entry.id)}
            <li>
              <Button variant="ghost" size="sm" onclick={() => choosePlace(entry, true)}
                >{entry.place.label}</Button
              >
            </li>
          {/each}
        </ul>
      {/if}
      {#if mapError}<p class="absolute inset-x-4 top-4 text-body-sm text-ink-dim" role="status">
          The map could not load. The place index is still available.
        </p>{/if}
      <div
        bind:clientHeight={controlsHeight}
        class="absolute right-3 top-2 z-(--z-chrome) flex items-end justify-end gap-2 lg:inset-x-3 lg:top-auto lg:bottom-[calc(var(--time-bar)+1.25rem)] lg:justify-between"
        style:--time-bar="{selected ? barHeight : 0}px"
      >
        <p
          class="hidden max-w-96 rounded-control bg-lacquer-glass p-2 text-caption text-ink-dim lg:block"
        >
          {@render legend()}
        </p>
        <Plate padded={false} class="flex shrink-0 gap-1 p-1">
          <Button variant="icon" icon="plus" label="Closer" onclick={() => zoom(0.6)} />
          <Button variant="icon" icon="minus" label="Farther" onclick={() => zoom(1.67)} />
          <Button
            variant="icon"
            icon="extent"
            label="Fit all places"
            onclick={() => {
              clusterChoices = []
              focus(null)
            }}
          />
        </Plate>
      </div>
    </div>
    {#if selected}
      <div
        bind:clientHeight={barHeight}
        class="absolute inset-x-2 bottom-2 z-(--z-chrome) lg:inset-x-3 lg:bottom-3"
      >
        <TimeBar entry={selected} {current} choose={chooseMoment} />
      </div>
    {/if}
  </section>

  <section
    bind:this={index}
    aria-labelledby="places-title"
    class="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-lacquer max-lg:[@media(max-height:34rem)]:h-48 max-lg:[@media(max-height:34rem)]:flex-none max-lg:[@media(max-height:34rem)]:overscroll-auto lg:order-1 lg:flex lg:flex-col lg:overflow-hidden lg:border-r lg:border-frame"
  >
    <div class="border-b border-rule px-3 py-1 text-caption text-ink-dim lg:hidden">
      {@render legend()}
    </div>
    <header class="flex shrink-0 flex-col gap-2 border-b border-rule px-4 py-2 sm:gap-3 sm:p-4">
      <div>
        <h1
          id="places-title"
          class="font-display text-display font-semibold max-sm:[@media(max-height:43rem)]:text-body"
        >
          Places
        </h1>
        <p class="text-body-sm text-ink-dim max-sm:[@media(max-height:43rem)]:sr-only">
          {shared.length} places two or more chapters reach
        </p>
      </div>
      <Field
        label="Filter places"
        hideLabel
        placeholder="Filter {shared.length} places"
        bind:value={filter}
      />
      <div role="group" aria-label="Order places" class="flex flex-wrap gap-1">
        {#each modes as option (option)}
          <button
            type="button"
            aria-pressed={option === mode}
            onclick={() => (mode = option)}
            class={[
              "min-h-8 rounded-control border px-2 text-body-sm",
              focusRing,
              option === mode
                ? "border-gold bg-gold-tint text-gold-bright"
                : "border-rule text-ink-dim",
            ]}>{option}</button
          >
        {/each}
      </div>
      {#if missing}
        <p role="status" class="text-body-sm text-ink-dim">
          {missing}
          {#if chapterLink}<a href={chapterLink} class={["underline", focusRing]}
              >Open in the chapter</a
            >{/if}
        </p>
      {/if}
    </header>
    <div bind:this={rail} class="min-h-0 lg:overflow-y-auto">
      {#each groups.filter((group) => group.entries.length > 0) as group (group.title)}
        {#if group.title}
          <h2
            id={group.key ? `places-region-${group.key}` : undefined}
            class="flex items-center justify-between border-b border-rule bg-lacquer-raised px-4 py-2 text-body-sm font-semibold"
          >
            <span class="flex items-center gap-2">
              {#if group.key}
                {@const key = group.key}
                <button
                  type="button"
                  onclick={() => selectRegion(key)}
                  class={[
                    "flex min-h-8 items-center gap-2 rounded-control text-left hover:text-gold-bright",
                    focusRing,
                  ]}
                >
                  <span
                    class="size-2 rounded-full"
                    style:background-color="var(--color-region-{key})"
                  ></span>{group.title}
                </button>
              {:else}{group.title}{/if}
            </span>
            <span class="text-caption text-ink-dim">{group.entries.length}</span>
          </h2>
        {/if}
        <ul>
          {#each group.entries as entry (entry.id)}
            {@const on = selected?.id === entry.id}
            {@const span = momentWindow(entry.moments)}
            <li
              id="places-row-{entry.id}"
              class={[
                "border-l-2 border-b border-b-rule",
                on ? "border-l-gold bg-lacquer-raised" : "border-l-transparent",
              ]}
            >
              <button
                type="button"
                aria-expanded={on}
                onclick={() => choosePlace(entry)}
                class={[
                  "flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-lacquer-raised",
                  focusRing,
                ]}
              >
                <span class="flex min-w-0 flex-1 flex-col">
                  <NameForm
                    name={entry.place.label}
                    lang={entry.place.lang ?? "und"}
                    romanization={entry.place.romanization ?? undefined}
                    size="body"
                    class={on ? "[&>span:first-child]:text-gold-bright" : undefined}
                  />
                  {#if entry.place.position === null}<span class="text-caption text-ink-dim"
                      >No position asserted</span
                    >{/if}
                </span>
                <span class="flex flex-wrap justify-end gap-1" aria-hidden="true">
                  {#each entry.chapters as by (by.id)}
                    <span
                      class="size-2 rounded-full"
                      style:background-color="var(--color-region-{by.region})"
                    ></span>
                  {/each}
                </span>
                <span
                  class="text-caption text-ink-dim tabular-nums"
                  aria-label="{entry.chapters.length} chapters">{entry.chapters.length}</span
                >
              </button>
              {#if on}
                <div class="space-y-2 px-4 pb-3">
                  {#if current}
                    <div class="space-y-1 lg:hidden">
                      {@render momentDetail(current)}
                    </div>
                  {/if}
                  {#if entry.place.placementNote}<p class="font-serif text-body-sm text-ink-dim">
                      {entry.place.placementNote}
                    </p>{/if}
                  <p class="text-body-sm text-ink-dim">
                    In time · {entry.moments.length}
                    {entry.moments.length === 1 ? "moment" : "moments"}{span
                      ? `, ${windowLabel(span)}`
                      : ""}
                  </p>
                  {#each entry.chapters as by (by.id)}
                    {@const moments = entry.moments.filter((moment) => moment.chapterId === by.id)}
                    {@const years = momentWindow(moments)}
                    <div class="border-t border-rule pt-2">
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex items-start gap-2">
                          <span
                            class="mt-1.5 size-2 shrink-0 rounded-full"
                            style:background-color="var(--color-region-{by.region})"
                          ></span>
                          <div>
                            <p class="font-serif text-body-sm">{by.title}</p>
                            <p class="text-caption text-ink-dim">
                              {years
                                ? `${moments.length} ${moments.length === 1 ? "moment" : "moments"} here, ${windowLabel(years)}`
                                : "No dated moments here"}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" href={by.href}>Open</Button>
                      </div>
                      {#if current?.chapterId === by.id}
                        <ol class="space-y-1 pl-4" aria-label="Moments in {by.title}">
                          {#each moments as moment (moment.id)}
                            <li aria-current={current === moment ? "step" : undefined}>
                              <button
                                type="button"
                                onclick={() => chooseMoment(moment)}
                                class={[
                                  "min-h-8 rounded-control text-left text-body-sm",
                                  focusRing,
                                  current === moment ? "text-gold-bright" : "text-ink-dim",
                                ]}
                              >
                                {windowLabel(moment)} · {moment.title}
                              </button>
                              {#if current === moment}
                                <div class="hidden lg:block">
                                  {@render momentDetail(moment)}
                                </div>
                              {/if}
                            </li>
                          {/each}
                        </ol>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="p-4 text-body-sm text-ink-dim">No shared place matches this filter.</p>
      {/each}
    </div>
    {#if selected}
      <!-- Let even the final selected row reach the top of the scrollport. -->
      <div class="h-full lg:hidden" aria-hidden="true"></div>
    {/if}
  </section>
</div>
