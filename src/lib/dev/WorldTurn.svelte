<script lang="ts">
  import { onMount } from "svelte"
  import { replaceState } from "$app/navigation"
  import type { Chapter, GeoPoint, HistoricalEvent } from "$lib/atlas/domain"
  import { BoardLayer } from "$lib/atlas/renderer/globe/board"
  import Globe from "$lib/atlas/workspace/Globe.svelte"
  import { Button, Icon, type IconName, focusRing, focusRingOnGold, transition } from "$lib/ui"
  import {
    TURN_ERA,
    glyphOf,
    worldTurn,
    type ChapterReach,
    type NamedPlaces,
    type WorldPlayer,
  } from "./world-turn"

  /**
   * The campaign map prototype (design review of 2026-11-09, B1): the atlas's
   * own globe tilted like a strategy map, every chapter alive in the turn's
   * year drawn at once as a player, and the B1 mock's interface around it:
   * the turn and its counts at the top, the players on the left, what happens
   * this turn on the right, the selected unit at the bottom, and Next turn.
   *
   * On a tablet the players become a strip and this turn's events step inside
   * the unit card; on a phone the card is a bottom sheet with Next turn above
   * it. The globe frames into the clear zone between them (the scene's safe
   * area), as the atlas does.
   */
  let {
    chapters,
    named,
    reach,
  }: { chapters: Chapter[]; named: NamedPlaces; reach: ChapterReach[] } = $props()

  // A player's colour is its controller token, in the order the board's
  // shader reads them (`board.ts`); literal class names so Tailwind generates
  // each one.
  const TINTS = [
    "bg-control-1",
    "bg-control-2",
    "bg-control-3",
    "bg-control-4",
    "bg-control-5",
    "bg-control-6",
    "bg-control-7",
    "bg-control-8",
  ]

  // The unit each player moves; the glyph is the banner's (`glyphOf`).
  const ICONS: Record<string, IconName> = {
    "tang-mission-750-754": "ship",
    "du-huan-751-762": "party",
    "stephen-ii-journey-753-754": "party",
  }
  const banner = (id: string) => ({
    glyph: glyphOf({ id, title: chapters.find((chapter) => chapter.id === id)?.title ?? "" }),
    icon: ICONS[id] ?? ("list" as const),
  })

  const PITCH = { tilted: -32, overhead: -90 } as const
  const HEIGHT = {
    tilted: { home: 1_500_000, focus: 800_000 },
    overhead: { home: 9_000_000, focus: 1_600_000 },
  } as const
  type Pitch = keyof typeof PITCH

  let year = $state(753)
  let pitch = $state<Pitch>("tilted")
  let focus = $state<{ target: GeoPoint; token: number } | null>(null)
  let homeId = $state("tang-mission-750-754")
  let selectedEventId = $state<string | null>(null)
  let safeArea = $state({ top: 0, right: 0, bottom: 0, left: 0 })
  let ready = $state(false)
  // Next turn floats above the bottom sheet on phones; elsewhere it keeps its corner.
  let nextBottom = $state<number | null>(null)
  let board = $state(true)
  let journeys = $state(true)
  let top: HTMLElement
  let rail: HTMLElement
  let notes: HTMLElement
  let card: HTMLElement

  // The selected event's place, from the events themselves: the turn's scene
  // draws its banner selected, so it cannot be read back from the turn.
  const shownPlaceId = $derived.by(() => {
    if (selectedEventId === null) return null
    for (const chapter of chapters) {
      const event = chapter.events.find((e) => e.id === selectedEventId)
      if (event !== undefined)
        return event.placement.kind === "point" ? event.placement.placeId : null
    }
    return null
  })

  const turn = $derived(
    worldTurn(chapters, year, {
      safeArea,
      focus,
      named,
      home: homeId,
      reach: board ? reach : undefined,
      journeys,
      selectedPlaceId: shownPlaceId,
    }),
  )
  // The seat `worldTurn` gives a player: its index among every chapter here.
  const tintOf = (id: string) =>
    TINTS[
      Math.max(
        0,
        chapters.findIndex((chapter) => chapter.id === id),
      ) % TINTS.length
    ]
  const titleOf = (id: string) => chapters.find((chapter) => chapter.id === id)?.title ?? id
  const era = (y: number) => (y <= 0 ? `${1 - y} BCE` : `${y}`)

  // The followed player: the one the reader chose, or the first alive when
  // that chapter has ended (the Tang embassy after 754).
  const player = $derived(
    turn.players.find((p) => p.chapterId === homeId) ?? turn.players.at(0) ?? null,
  )
  // This turn's events across every player, as the notifications list them.
  const happenings = $derived(
    turn.players.flatMap((p) => p.events.map((event) => ({ chapterId: p.chapterId, event }))),
  )
  const shownEvents = $derived(player?.events ?? [])
  const shown = $derived(
    shownEvents.find((event) => event.id === selectedEventId) ?? shownEvents.at(0) ?? null,
  )
  const shownIndex = $derived(shown === null ? -1 : shownEvents.indexOf(shown))

  function when(event: HistoricalEvent): string {
    const { startYear, endYear, sourceExpression } = event.occurrence
    if (sourceExpression !== null && sourceExpression.length <= 28) return sourceExpression
    return startYear === endYear ? era(startYear) : `${era(startYear)}–${era(endYear)}`
  }

  function positionOf(event: HistoricalEvent): GeoPoint | null {
    return event.placement.kind === "point" ? event.placement.position : null
  }

  function measure(): void {
    const page = document.documentElement.getBoundingClientRect()
    const bar = top.getBoundingClientRect()
    const side = rail.getBoundingClientRect()
    const right = notes.getBoundingClientRect()
    const sheet = card.getBoundingClientRect()
    // Wide: players and notes are side rails. Narrow: the players are a strip
    // under the bar, and the unit card is a sheet along the bottom.
    const wide = side.height > side.width
    safeArea = {
      top: Math.round(wide ? bar.bottom : side.bottom),
      right: right.width > 0 ? Math.round(page.width - right.left) : 0,
      bottom: wide ? 0 : Math.round(page.height - sheet.top),
      left: wide ? Math.round(side.right) : 0,
    }
    nextBottom = sheet.left <= 0 ? Math.round(page.height - sheet.top + 12) : null
  }

  function writeAddress(): void {
    const url = new URL(window.location.href)
    url.searchParams.set("year", String(year))
    url.searchParams.set("pitch", pitch)
    url.searchParams.set("chapter", homeId)
    for (const [key, on] of [
      ["board", board],
      ["journeys", journeys],
    ] as const) {
      if (on) url.searchParams.delete(key)
      else url.searchParams.set(key, "off")
    }
    replaceState(url, {})
  }

  // A new turn keeps the camera where the reader left it; the units move, and
  // the card shows the followed player's first event of the turn.
  function goTo(next: number): void {
    year = Math.max(TURN_ERA.start, Math.min(TURN_ERA.end, next))
    selectedEventId = null
    writeAddress()
  }

  function flyTo(target: GeoPoint): void {
    focus = { target, token: (focus?.token ?? 0) + 1 }
  }

  function follow(p: WorldPlayer): void {
    homeId = p.chapterId
    selectedEventId = null
    flyTo(p.unit.position)
    writeAddress()
  }

  function show(chapterId: string, event: HistoricalEvent): void {
    homeId = chapterId
    selectedEventId = event.id
    const at = positionOf(event)
    if (at !== null) flyTo(at)
    writeAddress()
  }

  // A press on a place opens the first event any player has there this turn.
  function selectPlace(placeId: string | null): void {
    if (placeId === null) return
    const hit = happenings.find(({ event }) => event.placeIds.includes(placeId))
    if (hit !== undefined) show(hit.chapterId, hit.event)
  }

  // A new pitch remounts the globe, which opens over the followed chapter.
  function setPitch(next: Pitch): void {
    pitch = next
    focus = null
    writeAddress()
  }

  onMount(() => {
    const params = new URL(window.location.href).searchParams
    const asked = Number(params.get("year"))
    if (Number.isInteger(asked) && asked >= TURN_ERA.start && asked <= TURN_ERA.end) year = asked
    if (params.get("pitch") === "overhead") pitch = "overhead"
    if (params.get("board") === "off") board = false
    if (params.get("journeys") === "off") journeys = false
    const chapter = params.get("chapter")
    if (chapter !== null && chapters.some((c) => c.id === chapter)) homeId = chapter
    measure()
    ready = true
    const observer = new ResizeObserver(measure)
    for (const element of [top, rail, notes, card]) observer.observe(element)
    return () => observer.disconnect()
  })
</script>

{#snippet medal(id: string, size: string, text: string)}
  <span
    class={[
      "grid shrink-0 place-items-center rounded-full border-2 border-gold font-serif font-semibold text-on-gold shadow-plate",
      tintOf(id),
      size,
      text,
    ]}
    aria-hidden="true">{banner(id).glyph}</span
  >
{/snippet}

{#snippet lens(label: string, icon: IconName, on: boolean, toggle: () => void, extra = "")}
  <button
    type="button"
    aria-pressed={on}
    aria-label={label}
    title={label}
    onclick={toggle}
    class={[
      "grid size-9 shrink-0 place-items-center rounded-full border lg:size-10",
      on
        ? "border-gold bg-gold-tint text-gold-bright"
        : "border-frame bg-lacquer text-ink-dim hover:text-ink",
      transition,
      focusRing,
      extra,
    ]}><Icon name={icon} size={18} /></button
  >
{/snippet}

<div class="relative h-dvh overflow-hidden bg-abyss font-interface text-ink" data-dev-page="world">
  {#if ready}
    {#key pitch}
      <Globe
        scene={turn.scene}
        label="The world in {era(year)}, {turn.players.length} chapters alive"
        options={{
          pitchDeg: PITCH[pitch],
          homeHeightMeters: HEIGHT[pitch].home,
          focusHeightMeters: HEIGHT[pitch].focus,
          board: (onChange) => new BoardLayer(onChange),
        }}
        onSelectPlace={selectPlace}
        onManualCameraInput={() => {}}
        onError={(error) => console.error(error)}
      />
    {/key}
  {/if}

  <!-- The turn, its counts, and the lenses. -->
  <header
    bind:this={top}
    class="absolute inset-x-0 top-0 z-(--z-chrome) flex h-13 items-center gap-3 border-b border-frame bg-lacquer-glass px-2.5 backdrop-blur-sm md:h-14 md:gap-4 md:px-4"
  >
    <a
      href="/dev"
      class={[
        "hidden font-display text-title-sm font-semibold tracking-widest text-ink md:block",
        focusRing,
      ]}>LEKISHI</a
    >
    <div class="flex items-center gap-1 md:border-l md:border-rule md:pl-4">
      <Button
        variant="icon"
        size="sm"
        icon="chevron-left"
        label="Previous turn"
        disabled={year <= TURN_ERA.start}
        onclick={() => goTo(year - 1)}
      />
      <p class="flex items-baseline gap-2" aria-live="polite">
        <span class="text-label font-semibold uppercase text-gold">Turn</span>
        <span
          class="font-display text-title font-semibold tabular-nums text-gold-bright md:text-display"
          >{era(year)}</span
        >
      </p>
      <Button
        variant="icon"
        size="sm"
        icon="chevron-right"
        label="Next turn"
        disabled={year >= TURN_ERA.end}
        onclick={() => goTo(year + 1)}
      />
    </div>
    <ul class="hidden gap-4 text-caption whitespace-nowrap text-ink-dim lg:flex">
      <li class="flex items-center gap-1.5">
        <Icon name="party" size={14} class="text-gold" /><b
          class="font-medium text-ink tabular-nums">{turn.players.length}</b
        > chapters alive
      </li>
      <li class="flex items-center gap-1.5">
        <Icon name="calendar" size={14} class="text-gold" /><b
          class="font-medium text-ink tabular-nums">{happenings.length}</b
        > events this turn
      </li>
      <li class="flex items-center gap-1.5">
        <Icon name="identified" size={14} class="text-gold" /><b
          class="font-medium text-ink tabular-nums">{turn.reached}</b
        > places reached
      </li>
      <li class="flex items-center gap-1.5">
        <Icon name="link" size={14} class="text-gold" /><b class="font-medium text-ink tabular-nums"
          >{turn.threads.length}</b
        > shared places
      </li>
    </ul>
    <div class="ml-auto flex items-center gap-1.5 md:gap-2">
      {@render lens("The sources' reach", "territory", board, () => {
        board = !board
        writeAddress()
      })}
      {@render lens("Journeys", "journeys", journeys, () => {
        journeys = !journeys
        writeAddress()
      })}
      {@render lens(
        "Overhead camera",
        "globe",
        pitch === "overhead",
        () => setPitch(pitch === "overhead" ? "tilted" : "overhead"),
        "md:hidden",
      )}
      <div
        class="hidden rounded-control border border-rule p-0.5 md:flex"
        role="group"
        aria-label="Camera"
      >
        {#each ["tilted", "overhead"] as const as option (option)}
          <button
            type="button"
            aria-pressed={pitch === option}
            onclick={() => setPitch(option)}
            class={[
              "rounded-control px-3 py-1 text-body-sm capitalize",
              pitch === option ? "bg-gold-tint text-ink" : "text-ink-dim hover:text-ink",
              transition,
              focusRing,
            ]}>{option}</button
          >
        {/each}
      </div>
    </div>
  </header>

  <!-- Players: the chapters alive this turn. A rail on desktop, a strip below. -->
  <nav
    bind:this={rail}
    aria-label="Chapters alive in {era(year)}"
    class="absolute inset-x-2.5 top-15 z-(--z-chrome) flex gap-1.5 md:inset-x-3 md:top-17 md:gap-2 lg:right-auto lg:left-4 lg:top-20 lg:w-74 lg:flex-col"
  >
    {#each turn.players as p (p.chapterId)}
      {@const on = player?.chapterId === p.chapterId}
      <button
        type="button"
        aria-pressed={on}
        aria-label={p.title}
        onclick={() => follow(p)}
        class={[
          "flex min-w-0 items-center gap-2.5 rounded-plate border bg-lacquer-glass p-1 text-left shadow-plate backdrop-blur-md md:flex-1 md:p-1.5 md:pr-2.5 lg:flex-none",
          on ? "border-gold" : "border-frame hover:border-gold",
          transition,
          focusRing,
        ]}
      >
        {@render medal(p.chapterId, "size-8.5 md:size-10", "text-body md:text-title-sm")}
        <span class="hidden min-w-0 flex-1 flex-col md:flex">
          <span class="truncate font-serif text-body-sm font-semibold text-ink">{p.title}</span>
          <span class="hidden truncate text-caption text-ink-dim lg:block">
            {p.unit.moving ? "Unit at" : "Last at"}
            <span class="font-serif">{p.unit.label}</span>
          </span>
          <span class="mt-1 h-0.75 rounded-full bg-rule" aria-hidden="true">
            <span class="block h-full rounded-full bg-gold" style:width="{p.progress * 100}%"
            ></span>
          </span>
        </span>
      </button>
    {/each}
  </nav>

  <!-- What happens this turn, in date order. Desktop only; below, the card steps through it. -->
  <aside
    bind:this={notes}
    aria-label="This turn"
    class="absolute top-20 right-4 bottom-40 z-(--z-chrome) hidden w-72 flex-col gap-1.5 lg:flex"
  >
    <p class="px-1 text-label font-semibold uppercase text-gold">
      This turn · {happenings.length}
      {happenings.length === 1 ? "event" : "events"}
    </p>
    <ul class="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
      {#each happenings as { chapterId, event } (`${chapterId}/${event.id}`)}
        {@const on = shown?.id === event.id}
        <li>
          <button
            type="button"
            aria-pressed={on}
            onclick={() => show(chapterId, event)}
            class={[
              "grid w-full grid-cols-[2rem_minmax(0,1fr)] gap-2.5 rounded-plate border bg-lacquer-glass p-1.5 pr-2.5 text-left shadow-plate backdrop-blur-md",
              on ? "border-gold" : "border-frame hover:border-gold",
              transition,
              focusRing,
            ]}
          >
            {@render medal(chapterId, "size-8", "text-body-sm")}
            <span class="flex min-w-0 flex-col">
              <span class="line-clamp-2 font-serif text-body-sm text-ink">{event.title}</span>
              <span class="truncate text-caption text-ink-faint">{when(event)}</span>
            </span>
          </button>
        </li>
      {:else}
        <li class="px-1 text-caption text-ink-dim">No dated event this turn.</li>
      {/each}
    </ul>
    {#if turn.threads.length > 0}
      <ul
        aria-label="Shared places"
        class="flex shrink-0 flex-col gap-1 rounded-plate border border-frame bg-lacquer-glass p-2.5 text-caption text-ink-dim shadow-plate backdrop-blur-md"
      >
        <li class="text-label font-semibold uppercase text-gold">
          Shared places · {turn.threads.length}
        </li>
        {#each turn.threads as thread (thread.placeId)}
          <li>
            <span class="font-serif text-body-sm text-ink">{thread.label}</span>
            · {thread.chapterIds.map(titleOf).join(" · ")}
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <!-- The selected unit, with its event this turn. A sheet on phones. -->
  <section
    bind:this={card}
    aria-label="Selected unit"
    class="absolute inset-x-0 bottom-0 z-(--z-chrome) grid grid-cols-[3rem_minmax(0,1fr)] gap-3 rounded-t-plate border border-b-0 border-frame bg-lacquer-glass px-3.5 pt-3.5 pb-4.5 shadow-plate backdrop-blur-md md:right-38 md:bottom-3 md:left-3 md:rounded-plate md:border-b md:pb-3.5 lg:right-auto lg:bottom-4 lg:left-4 lg:w-105 lg:grid-cols-[3.5rem_minmax(0,1fr)]"
  >
    {#if player === null}
      <p class="col-span-2 text-body-sm text-ink-dim">No chapter is alive in {era(year)}.</p>
    {:else}
      {@render medal(player.chapterId, "size-12 lg:size-14", "text-title lg:text-title")}
      <div class="flex min-w-0 flex-col">
        <p class="flex items-center gap-1.5 text-label font-semibold uppercase text-gold">
          <Icon name={banner(player.chapterId).icon} size={14} />
          <span class="truncate"
            >{player.unit.moving ? "Unit at" : "Last at"} {player.unit.label}</span
          >
        </p>
        <h2 class="mt-1 line-clamp-2 font-serif text-title-sm font-semibold text-ink">
          {shown?.title ?? player.title}
        </h2>
        <p class="mt-0.5 truncate text-caption text-ink-dim">
          {#if shown !== null}{when(shown)} ·
          {/if}<span class="font-serif">{player.title}</span>
        </p>
        {#if shown !== null && shown.note.length > 0}
          <p class="mt-2 line-clamp-3 font-serif text-body-sm text-ink max-md:line-clamp-2">
            {shown.note}
          </p>
        {:else if shown === null}
          <p class="mt-2 text-body-sm text-ink-dim">
            The story is quiet this turn: no event of this chapter is dated {era(year)}.
          </p>
        {/if}
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            icon="arrow-right"
            href="/chapters/{player.chapterId}{shown === null ? '' : `?event=${shown.id}`}"
            >Open in the chapter</Button
          >
          <Button
            variant="ghost"
            size="sm"
            icon="follow"
            class="max-md:hidden"
            onclick={() => follow(player)}>Follow</Button
          >
          {#if shownEvents.length > 1}
            <span class="ml-auto flex items-center gap-1 lg:hidden">
              <Button
                variant="icon"
                size="sm"
                icon="chevron-left"
                label="Previous event this turn"
                disabled={shownIndex <= 0}
                onclick={() => show(player.chapterId, shownEvents[shownIndex - 1])}
              />
              <span class="text-caption tabular-nums text-ink-dim"
                >{shownIndex + 1} of {shownEvents.length}</span
              >
              <Button
                variant="icon"
                size="sm"
                icon="chevron-right"
                label="Next event this turn"
                disabled={shownIndex >= shownEvents.length - 1}
                onclick={() => show(player.chapterId, shownEvents[shownIndex + 1])}
              />
            </span>
          {/if}
        </div>
      </div>
    {/if}
  </section>

  <!-- Next turn. Above the sheet on phones. -->
  <button
    type="button"
    disabled={year >= TURN_ERA.end}
    onclick={() => goTo(year + 1)}
    style:bottom={nextBottom === null ? undefined : `${nextBottom}px`}
    class={[
      "absolute right-3 bottom-3 z-(--z-chrome) grid size-23 place-items-center rounded-full bg-gold text-on-gold shadow-sheet ring-4 ring-abyss outline-2 outline-offset-4 outline-gold md:size-32 lg:right-4 lg:bottom-4",
      "hover:bg-gold-bright disabled:bg-lacquer-raised disabled:text-ink-dim",
      transition,
      focusRingOnGold,
    ]}
  >
    <span class="flex flex-col items-center">
      <span class="text-label font-bold uppercase max-md:tracking-normal">
        {year >= TURN_ERA.end ? "Last turn" : "Next turn"}
      </span>
      <b class="font-display text-title font-semibold tabular-nums md:text-display"
        >{era(Math.min(year + 1, TURN_ERA.end))}</b
      >
    </span>
  </button>

  <!-- How to read the board. Wide screens only. -->
  {#if board}
    <ul
      class="absolute bottom-4 left-113 z-(--z-chrome) hidden gap-3.5 rounded-plate border border-frame bg-lacquer-glass px-3 py-1.5 text-caption whitespace-nowrap text-ink-dim shadow-plate backdrop-blur-md xl:flex"
    >
      <li class="flex items-center gap-1.5">
        <span class="size-3 rounded-control border border-gold bg-gold-tint"></span>told this turn
      </li>
      <li class="flex items-center gap-1.5">
        <span class="size-3 rounded-control bg-ink-faint"></span>told before
      </li>
      <li class="flex items-center gap-1.5">
        <span class="size-3 rounded-control border border-rule bg-abyss"></span>no source yet
      </li>
      <li class="flex items-center gap-1.5">
        <span class="h-3 w-5 rounded-control border border-dashed border-ink"></span>possible
      </li>
      <li>banners and edges mark stories, never territories</li>
    </ul>
  {/if}
</div>
