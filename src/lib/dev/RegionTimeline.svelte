<script lang="ts">
  import { onMount, tick } from "svelte"
  import { replaceState } from "$app/navigation"
  import { windowLabel, yearLabel } from "$lib/atlas/labels"
  import { CONTINENTS, regionOf, type RegionKey } from "$lib/historical/regions"
  import { Button, Field, focusRing, transition } from "$lib/ui"
  import {
    alive,
    axisTicks,
    busiestYear,
    fitView,
    matches,
    nearestEdges,
    pack,
    sharedText,
    threadsFrom,
    viewAt,
    xOf,
    type Thread,
    type TimelineChapter,
  } from "./region-timeline"
  import { TURN_ERA } from "./world-turn"

  /**
   * Regions in time (design review T1, picked by the owner on 2026-11-13).
   * Rows are regions grouped by continent and time runs left to right, so
   * chapters of the same years stand in one column. A region is geographic,
   * never a state: it keeps its meaning while kingdoms rise and fall in it.
   *
   * The page has one reading at a time, in the panel at the bottom: a year
   * (every chapter told then, in every region), a chapter (its threads and
   * its contemporaries), or a search. Each is in the address: `?chapter=`,
   * `?year=` or `?q=`, with `?from=&to=` for the view and `?fold=` for
   * folded continents.
   */
  let { chapters, threads }: { chapters: TimelineChapter[]; threads: Thread[] } = $props()

  // The drawn range. The earliest chapter, the Americas from 21,050 BCE, would
  // leave every other bar a sliver, so the axis starts just before Sargon and
  // a hatched end says a bar runs on past it.
  const T0 = -2400
  // The axis runs on past the last chapter so the names running past its bar
  // still have room at "All time".
  const T1 = $derived(Math.max(...chapters.map((c) => c.window.end)) + 240)
  const AXIS = 30
  const HEAD = 42
  const LANE = 28
  const ERAS: readonly (readonly [string, number, number])[] = [
    ["All time", T0, Infinity],
    ["Bronze Age", -2400, -1000],
    ["800–200 BCE", -800, -180],
    ["Han & Rome", -260, 140],
    ["The 750s", 600, 820],
  ]

  let innerWidth = $state(1440)
  const phone = $derived(innerWidth < 640)
  // Phones give the whole width to time: the region column becomes a
  // coloured rail, and each row names itself in a line above its bars.
  const labelW = $derived(phone ? 8 : 220)
  const rowHead = $derived(phone ? 22 : 0)

  let ready = $state(false)
  let pxPerYear = $state(0.5)
  let scrollLeft = $state(0)
  let clientWidth = $state(0)
  let selected = $state<string | null>(null)
  let year = $state(0)
  let query = $state("")
  let folded = $state<ReadonlySet<string>>(new Set())
  let quiet = $state<ReadonlySet<RegionKey>>(new Set())
  let wrap: HTMLElement
  let chart = $state<HTMLElement>()
  // Set once on mount, before `ready` lets the layout read them.
  let measure = $state<(text: string, font: string) => number>(() => 0)
  let serif = $state("serif")
  let sans = $state("sans-serif")

  const byId = $derived(new Map(chapters.map((c) => [c.id, c])))
  const current = $derived(selected === null ? undefined : byId.get(selected))
  const scale = $derived({ start: T0, end: T1, pxPerYear, labelW })
  const X = (y: number) => xOf(scale, y)
  const Y = (x: number) => Math.round((x - labelW) / pxPerYear + T0)
  const view = $derived(viewAt(scale, scrollLeft, clientWidth))
  const wordsOf = (c: TimelineChapter) => {
    const region = regionOf(c.region)
    return [region.name, region.continent.name, windowLabel(c.window)]
  }
  const hits = $derived(
    query.trim() === ""
      ? []
      : chapters
          .filter((c) => matches(c, query, wordsOf(c)))
          .sort((a, b) => a.window.start - b.window.start),
  )
  const linked = $derived(
    new Map(
      selected === null ? [] : threadsFrom(threads, selected).map((t) => [t.other, t.thread]),
    ),
  )
  const order = (c: TimelineChapter) =>
    CONTINENTS.flatMap((continent) => continent.regions).findIndex((r) => r.key === c.region)

  type Item = {
    c: TimelineChapter
    x0: number
    x1: number
    y: number
    inside: boolean
    nameW: number
    right: number
  }

  // The chart's geometry. Names are measured, so a row stacks its chapters
  // into sub-rows only where a bar or the name running past it would touch.
  const layout = $derived.by(() => {
    if (!ready) return null
    const titleFont = `600 13px ${serif}`
    const whenFont = `12px ${sans}`
    const pos = new Map<string, { x0: number; x1: number; y: number }>()
    let top = AXIS
    let right = X(T1) + 40

    const groups = CONTINENTS.map((continent) => {
      const open = !folded.has(continent.key)
      const groupTop = top
      top += HEAD
      const rows = continent.regions.map((region) => {
        const placed = chapters
          .filter((c) => c.region === region.key)
          .sort((a, b) => a.window.start - b.window.start)
          .map((c) => {
            const x0 = X(c.window.start)
            const x1 = Math.max(X(c.window.end + 1), x0 + 6)
            const nameW = measure(c.title, titleFont)
            const whenW = measure(windowLabel(c.window), whenFont)
            const inside = x1 - x0 >= nameW + 16
            const end = inside
              ? Math.max(x1, x0 + nameW + 16) + 6 + whenW
              : x1 + 6 + nameW + 6 + whenW
            return { c, x0, x1, inside, nameW, right: end }
          })
        const lanes = pack(placed.map((it) => ({ left: it.x0, right: it.right })))
        const still = quiet.has(region.key)
        const height = !open
          ? 18
          : still
            ? 44
            : rowHead + Math.max(1, ...lanes.map((l) => l + 1)) * LANE + 10
        const rowTop = top
        const items: Item[] = placed.map((it, k) => ({ ...it, y: rowHead + 5 + lanes[k] * LANE }))
        for (const it of items) {
          right = Math.max(right, it.right)
          if (open && !still) pos.set(it.c.id, { x0: it.x0, x1: it.x1, y: rowTop + it.y + 13 })
        }
        top += height
        return { region, top: rowTop, height, items, still }
      })
      const count = rows.reduce((n, row) => n + row.items.length, 0)
      return { continent, open, top: groupTop, rows, count }
    })

    return { groups, pos, width: right + 16, height: top }
  })

  const ticks = $derived(axisTicks(scale, yearLabel))

  // The year the guide stands on: the selected chapter's start, else the read year.
  const guide = $derived(selected !== null ? (byId.get(selected)?.window.start ?? year) : year)
  const guideLeft = $derived(Math.max(labelW, X(guide)))

  const paths = $derived.by(() => {
    const from = selected === null ? undefined : layout?.pos.get(selected)
    if (from === undefined || layout === null) return []
    return [...linked.keys()].flatMap((id) => {
      const to = layout.pos.get(id)
      if (to === undefined) return []
      const a = { x: Math.min(from.x1, from.x0 + 40), y: from.y }
      const b = { x: Math.min(to.x1, to.x0 + 40), y: to.y }
      // Threads within one row arch above the bars instead of running
      // through the names between them.
      if (Math.abs(a.y - b.y) < 20) {
        const lift = Math.min(60, 14 + Math.abs(b.x - a.x) / 8)
        return [`M${a.x} ${a.y - 9} C${a.x} ${a.y - lift} ${b.x} ${b.y - lift} ${b.x} ${b.y - 9}`]
      }
      const mid = (a.y + b.y) / 2
      return [`M${a.x} ${a.y} C${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y}`]
    })
  })

  // A bar whose start is off the left edge slides its name in to stay
  // readable, never past its own bar, so the packing still holds.
  const shiftOf = (it: Item) =>
    it.inside
      ? Math.max(0, Math.min(scrollLeft + labelW + 4 - it.x0, it.x1 - it.x0 - it.nameW - 16))
      : 0

  const lookOf = $derived(
    (c: TimelineChapter): "on" | "linked" | "hit" | "alive" | "dim" | "plain" =>
      selected !== null
        ? c.id === selected
          ? "on"
          : linked.has(c.id)
            ? "linked"
            : "dim"
        : query.trim() !== ""
          ? hits.includes(c)
            ? "hit"
            : "dim"
          : alive(c, year)
            ? "alive"
            : "plain",
  )

  // Rows with nothing in view fold to one line once the view settles, so a
  // swipe never makes the chart jump under the finger.
  let settle: ReturnType<typeof setTimeout> | undefined
  function settled(): void {
    clearTimeout(settle)
    if (layout === null) return
    const left = scrollLeft + labelW + 28
    const right = scrollLeft + clientWidth - 24
    const now = new Set<RegionKey>()
    for (const group of layout.groups)
      for (const row of group.rows)
        if (!row.items.some((it) => it.x1 >= left && it.x0 <= right)) now.add(row.region.key)
    if (now.size !== quiet.size || [...now].some((key) => !quiet.has(key))) quiet = now
    writeAddress()
  }

  let frame = 0
  function onScroll(): void {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      scrollLeft = wrap.scrollLeft
      clearTimeout(settle)
      settle = setTimeout(settled, 250)
    })
  }

  const noneText = $derived(
    `No chapter here for ${yearLabel(view.start)} – ${yearLabel(view.end)}${view.end > 0 && view.end < 1000 ? " CE" : ""} yet`,
  )
  const allQuiet = $derived(
    layout !== null && layout.groups.every((g) => g.rows.every((row) => row.still)),
  )

  async function fit(from: number, to: number): Promise<void> {
    const fitted = fitView({ start: T0, end: T1 }, labelW, wrap.clientWidth, from, to)
    pxPerYear = fitted.pxPerYear
    await tick()
    wrap.scrollLeft = fitted.scrollLeft
    scrollLeft = wrap.scrollLeft
    settled()
  }

  async function zoom(k: number): Promise<void> {
    const mid = Y(wrap.scrollLeft + (wrap.clientWidth + labelW) / 2)
    pxPerYear = Math.max(0.12, Math.min(40, pxPerYear * k))
    await tick()
    wrap.scrollLeft = X(mid) - (wrap.clientWidth + labelW) / 2
    scrollLeft = wrap.scrollLeft
    settled()
  }

  function reveal(x0: number, y?: number, x1 = x0): void {
    const left = wrap.scrollLeft + labelW - 1
    const right = wrap.scrollLeft + wrap.clientWidth + 1
    if (x0 < left || x1 > right)
      wrap.scrollLeft = x0 - labelW - Math.min(120, (wrap.clientWidth - labelW) / 4)
    if (y !== undefined && (y < wrap.scrollTop + 60 || y > wrap.scrollTop + wrap.clientHeight - 30))
      wrap.scrollTop = y - wrap.clientHeight / 3
  }

  function choose(id: string | null): void {
    selected = id
    const c = id === null ? undefined : byId.get(id)
    if (c !== undefined) {
      year = Math.max(T0, c.window.start)
      void bringIntoView(c)
    }
    writeAddress()
  }

  // A chapter may sit in a folded continent or a row folded because nothing
  // was in view, so it has no bar to reveal yet: unfold its continent, pan to
  // its years, let the rows settle around the new view, then reveal the bar.
  async function bringIntoView(c: TimelineChapter): Promise<void> {
    const continent = regionOf(c.region).continent.key
    if (folded.has(continent)) folded = new Set([...folded].filter((key) => key !== continent))
    const x0 = X(c.window.start)
    reveal(
      x0,
      undefined,
      Math.min(Math.max(X(c.window.end + 1), x0 + 60), x0 + wrap.clientWidth / 2),
    )
    scrollLeft = wrap.scrollLeft
    settled()
    await tick()
    const at = layout?.pos.get(c.id)
    if (at !== undefined) reveal(at.x0, at.y, at.x0)
  }

  // Reading a year is its own mode: it leaves a selection and a search.
  function setYear(next: number, show = false): void {
    selected = null
    query = ""
    year = Math.max(T0, Math.min(T1, next))
    if (show) reveal(X(year))
    writeAddress()
  }

  function search(text: string): void {
    query = text
    if (text.trim() !== "") selected = null
    const first = hits[0]
    if (first !== undefined) void bringIntoView(first)
    writeAddress()
  }

  function toggle(key: string): void {
    const next = new Set(folded)
    if (!next.delete(key)) next.add(key)
    folded = next
    writeAddress()
  }

  // Pressing or dragging the axis reads a year.
  function readAxis(event: PointerEvent): void {
    const axis = event.currentTarget as HTMLElement
    const at = (e: PointerEvent) =>
      setYear(Y(e.clientX - (chart?.getBoundingClientRect().left ?? 0)))
    axis.setPointerCapture(event.pointerId)
    at(event)
    axis.onpointermove = at
    axis.onpointerup = () => (axis.onpointermove = null)
  }

  function onKey(event: KeyboardEvent): void {
    const typing = (event.target as HTMLElement).closest("input") !== null
    if (event.key === "/" && !typing) {
      event.preventDefault()
      document.getElementById("timeline-search")?.focus()
    } else if (event.key === "Escape" && !typing) {
      if (selected !== null) choose(null)
      else if (query !== "") search("")
    } else if (
      !typing &&
      selected === null &&
      query.trim() === "" &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault()
      setYear(year + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1), true)
    }
  }

  let writing: ReturnType<typeof setTimeout> | undefined
  function writeAddress(): void {
    clearTimeout(writing)
    writing = setTimeout(() => {
      const url = new URL(window.location.href)
      url.search = ""
      if (selected !== null) url.searchParams.set("chapter", selected)
      else if (query.trim() === "") url.searchParams.set("year", String(year))
      if (query.trim() !== "") url.searchParams.set("q", query.trim())
      url.searchParams.set("from", String(view.start))
      url.searchParams.set("to", String(view.end))
      if (folded.size > 0) url.searchParams.set("fold", [...folded].join(","))
      replaceState(url, {})
    }, 200)
  }

  // An era chip is pressed while the view is that era, as fitting leaves it.
  const eraPressed = (start: number, end: number) => {
    const to = Math.min(end, T1)
    const slack = 2 + (to - start) * 0.01
    return Math.abs(start - view.start) <= slack && Math.abs(to - view.end) <= slack
  }

  async function pickEra(start: number, end: number): Promise<void> {
    const to = Math.min(end, T1)
    await fit(start, to)
    if (selected === null && query.trim() === "" && (year < start || year > to))
      setYear(busiestYear(chapters, start, to))
  }

  onMount(() => {
    const params = new URL(window.location.href).searchParams
    const asked = params.get("chapter")
    if (asked !== null && byId.has(asked)) selected = asked
    query = params.get("q") ?? ""
    folded = new Set(
      (params.get("fold") ?? "").split(",").filter((key) => CONTINENTS.some((c) => c.key === key)),
    )
    const context = document.createElement("canvas").getContext("2d")
    if (context === null) throw new Error("the timeline needs a 2D canvas to measure names")
    measure = (text, font) => {
      context.font = font
      return context.measureText(text).width
    }
    const style = getComputedStyle(document.documentElement)
    serif = style.getPropertyValue("--font-serif") || serif
    sans = style.getPropertyValue("--font-interface") || sans

    void document.fonts.ready.then(async () => {
      let [start, end] = [Number(params.get("from")), Number(params.get("to"))]
      if (!params.has("from") || !params.has("to") || !(end > start)) {
        const c = selected === null ? undefined : byId.get(selected)
        ;[, start, end] =
          phone && c !== undefined
            ? ["", c.window.start - 150, c.window.start + 450]
            : ERAS[phone ? 2 : 0]
      }
      const askedYear = Number(params.get("year"))
      year =
        selected !== null
          ? Math.max(T0, current?.window.start ?? T0)
          : params.has("year") && Number.isInteger(askedYear)
            ? askedYear
            : busiestYear(chapters, Math.max(T0, start), Math.min(T1, end))
      ready = true
      await tick()
      await fit(start, end)
      if (current !== undefined) void bringIntoView(current)
      else if (query.trim() !== "") search(query)
      else {
        const first = chapters.filter((c) => alive(c, year)).sort((a, b) => order(a) - order(b))[0]
        const pos = first === undefined ? undefined : layout?.pos.get(first.id)
        reveal(X(year), pos === undefined ? undefined : pos.y + 80)
      }
    })
    return () => {
      clearTimeout(settle)
      clearTimeout(writing)
      cancelAnimationFrame(frame)
    }
  })

  let lastWidth = 0
  $effect(() => {
    // A real change of width refits the view; a phone's URL bar showing or
    // hiding changes only the height.
    if (!ready || Math.abs(innerWidth - lastWidth) < 2) return
    const first = lastWidth === 0
    lastWidth = innerWidth
    if (!first) void fit(view.start, view.end)
  })

  const regionColour = (key: RegionKey) => `--lc: var(--color-region-${key})`
  const onWorld = (c: TimelineChapter) =>
    c.window.start <= TURN_ERA.end && c.window.end >= TURN_ERA.start
  const edges = $derived(nearestEdges(chapters, year, { start: T0, end: T1 }))
  const told = $derived(chapters.filter((c) => alive(c, year)).sort((a, b) => order(a) - order(b)))
</script>

<svelte:window bind:innerWidth onkeydown={onKey} />

{#snippet zoomButton(glyph: string, label: string, k: number)}
  <button
    type="button"
    aria-label={label}
    title={label}
    onclick={() => zoom(k)}
    class={[
      "grid size-8 shrink-0 cursor-pointer place-items-center rounded-control border border-frame bg-lacquer-raised text-body text-ink hover:border-gold",
      transition,
      focusRing,
    ]}>{glyph}</button
  >
{/snippet}

{#snippet card(c: TimelineChapter, sub: string)}
  <button
    type="button"
    class={[
      "grid max-w-75 shrink-0 cursor-pointer grid-cols-[8px_auto] items-baseline gap-x-2 rounded-control border border-rule bg-abyss px-2.5 py-1.5 text-left hover:border-gold max-sm:max-w-60",
      transition,
      focusRing,
    ]}
    style={regionColour(c.region)}
    onclick={() => choose(c.id)}
  >
    <span class="size-2 self-center rounded-full bg-(--lc)" aria-hidden="true"></span>
    <b class="truncate font-serif text-body-sm font-normal text-ink">{c.title}</b>
    <span class="col-start-2 truncate text-caption text-ink-dim">{sub}</span>
  </button>
{/snippet}

<div
  class="flex h-dvh flex-col overflow-hidden bg-abyss font-interface text-ink"
  data-dev-page="timeline"
>
  <header
    class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-lacquer px-4 py-2.5 max-sm:gap-x-2.5 max-sm:px-3"
  >
    <a
      href="/dev"
      class={[
        "font-display text-title-sm font-semibold tracking-widest text-ink max-sm:hidden",
        focusRing,
      ]}>LEKISHI</a
    >
    <h1 class="font-display text-title font-semibold tracking-wide max-sm:text-title-sm">
      Regions in time
    </h1>
    <div
      class="flex gap-1.5 max-sm:order-3 max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none]"
      role="group"
      aria-label="Jump to an era"
    >
      {#each ERAS as [name, start, end] (name)}
        <button
          type="button"
          aria-pressed={eraPressed(start, end)}
          onclick={() => pickEra(start, end)}
          class={[
            "inline-flex min-h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-control border px-2.5 text-caption",
            eraPressed(start, end)
              ? "border-frame bg-gold-tint text-ink"
              : "border-rule text-ink-dim hover:text-ink",
            transition,
            focusRing,
          ]}>{name}</button
        >
      {/each}
    </div>
    <div class="ml-auto flex items-center gap-2">
      <Field
        id="timeline-search"
        label="Search chapters, places and years"
        hideLabel
        placeholder="Search chapters, places, years  /"
        bind:value={query}
        oninput={search}
        class="w-72 max-lg:w-48 max-sm:w-36"
      />
      {@render zoomButton("−", "Zoom out", 1 / 1.6)}
      <span class="text-caption tabular-nums text-ink-dim max-xl:hidden"
        >≈ {(view.end - view.start).toLocaleString("en")} years in view</span
      >
      {@render zoomButton("+", "Zoom in", 1.6)}
    </div>
  </header>

  <div class="relative min-h-0 flex-1">
    <div
      bind:this={wrap}
      bind:clientWidth
      onscroll={onScroll}
      class="absolute inset-0 overflow-auto overscroll-contain"
    >
      {#if layout !== null}
        <div
          bind:this={chart}
          class="relative"
          style="width: {layout.width}px; height: {layout.height}px"
        >
          <!-- The axis. Pressing or dragging it reads a year. -->
          <div
            class="sticky top-0 z-(--z-chrome) h-7.5 cursor-ew-resize touch-pan-y border-b border-rule bg-abyss"
            style="width: {layout.width}px"
            onpointerdown={readAxis}
            role="slider"
            tabindex="-1"
            aria-label="Year"
            aria-valuemin={T0}
            aria-valuemax={T1}
            aria-valuenow={guide}
            aria-valuetext={yearLabel(guide)}
          >
            {#each ticks as tick (tick.year)}
              <span
                class={[
                  "pointer-events-none absolute top-0 h-7.5 border-l border-rule pt-1.5 pl-1 text-caption whitespace-nowrap tabular-nums",
                  tick.major ? "text-ink-dim" : "text-ink-faint",
                ]}
                style="left: {X(tick.year)}px">{tick.label}</span
              >
            {/each}
            <div
              class="sticky left-0 flex h-7.5 cursor-default items-center border-r border-rule bg-abyss px-3"
              style="width: {labelW}px"
            >
              {#if !phone}<span class="text-label font-semibold uppercase text-gold">Region</span
                >{/if}
            </div>
            {#if query.trim() === ""}
              <span
                class="pointer-events-none absolute top-1 -translate-x-1/2 rounded-control bg-gold px-2 py-0.5 text-caption font-semibold whitespace-nowrap text-on-gold tabular-nums shadow-plate"
                style="left: {Math.max(
                  scrollLeft + labelW + 40,
                  Math.min(scrollLeft + clientWidth - 40, X(guide)),
                )}px">{yearLabel(guide)}</span
              >
            {/if}
          </div>

          {#each layout.groups as group (group.continent.key)}
            <button
              type="button"
              aria-expanded={group.open}
              onclick={() => toggle(group.continent.key)}
              class={[
                "group/ghead sticky left-0 z-(--z-labels) flex h-10.5 w-max cursor-pointer items-center gap-2.5 bg-linear-to-r from-abyss from-75% to-transparent px-3 pt-1.5 text-left",
                focusRing,
              ]}
            >
              <span
                class={["text-ink-dim", transition, group.open ? "" : "-rotate-90"]}
                aria-hidden="true">▾</span
              >
              <h2 class="font-serif text-title-sm font-semibold group-hover/ghead:text-gold-bright">
                {group.continent.name}
              </h2>
              <span class="text-caption text-ink-dim"
                >{group.rows.length > 1 ? `${group.rows.length} regions, ` : ""}{group.count}
                {group.count === 1 ? "chapter" : "chapters"}</span
              >
            </button>
            {#each group.rows as row (row.region.key)}
              <div
                class="relative border-t border-rule/70"
                style="height: {row.height}px; width: {layout.width}px; {regionColour(
                  row.region.key,
                )}"
              >
                {#if !group.open}
                  <!-- A folded continent keeps a strip per region, so its weight in time still shows. -->
                  <span
                    class="sticky left-0 z-(--z-labels) block h-full overflow-hidden border-r border-l-3 border-r-rule border-l-(--lc) bg-lacquer px-3 text-caption leading-4 whitespace-nowrap text-ink-dim max-sm:px-0"
                    style="width: {labelW}px">{phone ? "" : row.region.name}</span
                  >
                  {#each row.items as it (it.c.id)}
                    <i
                      class="absolute top-1.5 h-1.5 min-w-0.75 rounded-control bg-(--lc) opacity-70"
                      style="left: {it.x0}px; width: {it.x1 - it.x0}px"
                    ></i>
                  {/each}
                {:else}
                  <div
                    class="sticky left-0 z-(--z-labels) flex h-full flex-col justify-center gap-0.5 border-r border-l-3 border-r-rule border-l-(--lc) bg-lacquer px-3 max-sm:border-0 max-sm:bg-(--lc) max-sm:px-0"
                    style="width: {labelW}px"
                  >
                    {#if !phone}
                      <b class="text-body-sm font-medium">{row.region.name}</b>
                      <span class="truncate text-caption text-ink-dim"
                        >{row.region.note} · {row.items.length}</span
                      >
                    {/if}
                  </div>
                  {#if phone}
                    <div
                      class="sticky left-2 z-(--z-labels) flex h-5.5 w-max items-center gap-1.5 px-2 text-caption font-medium text-ink-dim"
                      style="margin-top: -{row.height}px"
                    >
                      <span class="size-2 rounded-full bg-(--lc)" aria-hidden="true"></span>
                      {row.region.name} · {row.items.length}
                    </div>
                  {/if}
                  {#if row.still}
                    {#if !allQuiet}
                      <span
                        class="pointer-events-none absolute z-(--z-markers) text-caption whitespace-nowrap text-ink-dim italic"
                        style="top: {phone ? 22 : 11}px; left: {scrollLeft +
                          clientWidth -
                          16 -
                          measure(noneText, `italic 12px ${sans}`)}px">{noneText}</span
                      >
                    {/if}
                    {#each row.items as it (it.c.id)}
                      <i
                        class="absolute bottom-1 h-1.5 min-w-0.75 rounded-control bg-(--lc) opacity-45"
                        style="left: {it.x0}px; width: {it.x1 - it.x0}px"
                      ></i>
                    {/each}
                  {:else}
                    {#each row.items as it (it.c.id)}
                      {@const look = lookOf(it.c)}
                      <button
                        type="button"
                        aria-pressed={look === "on"}
                        aria-label="{it.c.title}, {windowLabel(it.c.window)}"
                        onclick={() => choose(it.c.id)}
                        class={[
                          "group/item absolute z-(--z-markers) flex h-6.5 cursor-pointer items-center rounded-control text-left",
                          look === "dim" &&
                            "opacity-35 hover:opacity-100 focus-visible:opacity-100",
                          look === "plain" &&
                            "opacity-60 hover:opacity-100 focus-visible:opacity-100",
                          transition,
                          focusRing,
                        ]}
                        style="left: {it.x0}px; top: {it.y}px"
                      >
                        <span
                          class={[
                            "absolute top-1 left-0 h-4.5 min-w-1.5 rounded-control bg-(--lc)",
                            look === "on" && "outline-2 outline-offset-2 outline-gold-bright",
                            (look === "linked" || look === "hit") &&
                              "outline-2 outline-offset-2 outline-gold",
                            look === "plain" || look === "dim" ? "opacity-85" : "",
                          ]}
                          style="width: {it.x1 - it.x0}px"
                        ></span>
                        {#if it.c.window.start < T0}
                          <!-- The bar runs on before the axis begins. -->
                          <span
                            class="absolute top-1 -left-4 h-4.5 w-3.5 bg-[repeating-linear-gradient(90deg,var(--lc)_0_3px,transparent_3px_6px)]"
                            aria-hidden="true"
                          ></span>
                        {/if}
                        <span
                          class={[
                            "relative font-serif text-body-sm whitespace-nowrap",
                            it.inside
                              ? "font-semibold text-abyss"
                              : "text-ink [text-shadow:0_0_3px_var(--color-abyss)] group-hover/item:text-gold-bright",
                          ]}
                          style={it.inside
                            ? `padding-left: 8px; transform: translateX(${shiftOf(it)}px)`
                            : `padding-left: ${it.x1 - it.x0 + 6}px`}>{it.c.title}</span
                        >
                        <span
                          class="relative text-caption whitespace-nowrap tabular-nums text-ink-dim [text-shadow:0_0_3px_var(--color-abyss)]"
                          style="margin-left: {it.inside
                            ? Math.max(6, it.x1 - it.x0 - it.nameW - 8 + 6)
                            : 6}px">{windowLabel(it.c.window)}</span
                        >
                      </button>
                    {/each}
                  {/if}
                {/if}
              </div>
            {/each}
          {/each}

          <svg
            class="pointer-events-none absolute top-0 left-0 z-(--z-markers) overflow-visible"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            {#each paths as d (d)}
              <path {d} fill="none" class="stroke-abyss" stroke-width="5" />
              <path {d} fill="none" class="stroke-gold" stroke-width="2" stroke-dasharray="5 4" />
            {/each}
          </svg>
          {#if query.trim() === ""}
            <div
              class="pointer-events-none absolute top-0 w-0 border-l border-dashed border-gold"
              style="left: {guideLeft}px; height: {layout.height}px"
            ></div>
          {/if}
        </div>
      {/if}
    </div>
    <!-- Names that run off the left edge fade under the region column instead of being cut mid-word. -->
    <div
      class="pointer-events-none absolute top-7.5 bottom-0 z-(--z-markers) w-7 bg-linear-to-r from-abyss to-transparent"
      style="left: {labelW}px"
    ></div>
  </div>

  <section
    class="max-h-[42vh] shrink-0 overflow-auto border-t border-frame bg-lacquer px-4 pt-2.5 pb-3 max-sm:max-h-[46vh] max-sm:px-3"
    aria-live="polite"
    aria-label="Reading"
  >
    {#if current !== undefined}
      {@const c = current}
      {@const own = threadsFrom(threads, c.id)
        .flatMap(({ other, thread }) => {
          const o = byId.get(other)
          return o === undefined ? [] : [{ other: o, thread }]
        })
        .sort((a, b) => order(a.other) - order(b.other))}
      {@const same = chapters
        .filter(
          (o) => o.id !== c.id && o.window.start <= c.window.end && o.window.end >= c.window.start,
        )
        .sort((a, b) => order(a) - order(b))}
      <div class="flex items-start gap-3">
        <p class="flex-1 pt-2 text-label font-semibold uppercase text-gold">
          {regionOf(c.region).name} · {windowLabel(c.window)}
        </p>
        <span class="pt-2 text-caption text-ink-dim max-sm:hidden"
          ><kbd class="rounded-control border border-rule px-1">Esc</kbd> back to the year</span
        >
        <Button
          variant="icon"
          size="sm"
          icon="close"
          label="Close the chapter"
          onclick={() => choose(null)}
        />
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-5 gap-y-2 max-sm:grid-cols-1">
        <div>
          <h3 class="font-serif text-title-sm font-semibold">{c.title}</h3>
          <p class="text-caption text-ink-dim">
            {c.events} events · {c.places} places{c.steps > 0 ? ` · a ${c.steps}-step story` : ""}
          </p>
        </div>
        <div class="flex gap-2">
          {#if onWorld(c)}
            <Button href="/dev/world?year={Math.max(TURN_ERA.start, c.window.start)}&chapter={c.id}"
              >On the world</Button
            >
          {/if}
          <Button variant="primary" href="/chapters/{c.id}">Open chapter</Button>
        </div>
      </div>
      <div class="grid gap-x-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div class="min-w-0">
          <p class="mt-2 flex items-baseline gap-2.5">
            <span
              class={[
                "text-label font-semibold uppercase",
                own.length > 0 ? "text-gold" : "text-ink-dim",
              ]}>{own.length} {own.length === 1 ? "thread" : "threads"}</span
            ><span class="text-caption text-ink-dim">shared places and people</span>
          </p>
          {#if own.length > 0}
            <div class="mt-1.5 flex gap-2 overflow-x-auto p-0.5 pb-1">
              {#each own as { other, thread } (other.id)}
                {@render card(other, `via ${sharedText(thread)}`)}
              {/each}
            </div>
          {:else}
            <p class="mt-1.5 max-w-prose text-body-sm text-ink-dim">
              No thread yet: no other chapter names a place or a person this one does. A thread
              appears when a chapter that shares one is written.
            </p>
          {/if}
        </div>
        <div class="min-w-0">
          <p class="mt-2 flex items-baseline gap-2.5">
            <span class="text-label font-semibold uppercase text-ink-dim">Same years elsewhere</span
            ><span class="text-caption text-ink-dim"
              >{same.length > 0 ? `${same.length} told in ${windowLabel(c.window)}` : ""}</span
            >
          </p>
          {#if same.length > 0}
            <div class="mt-1.5 flex gap-2 overflow-x-auto p-0.5 pb-1">
              {#each same as o (o.id)}
                {@render card(o, `${regionOf(o.region).name} · ${windowLabel(o.window)}`)}
              {/each}
            </div>
          {:else}
            <p class="mt-1.5 text-body-sm text-ink-dim">
              Nothing else is told for {windowLabel(c.window)} yet.
            </p>
          {/if}
        </div>
      </div>
    {:else if query.trim() !== ""}
      <div class="flex items-center gap-3">
        <p class="text-label font-semibold uppercase text-gold">Search</p>
        <p class="flex-1 text-caption text-ink-dim">
          {hits.length > 0
            ? `${hits.length} ${hits.length === 1 ? "chapter" : "chapters"} for “${query.trim()}”, oldest first`
            : ""}
        </p>
        <Button
          variant="icon"
          size="sm"
          icon="close"
          label="Clear the search"
          onclick={() => search("")}
        />
      </div>
      {#if hits.length > 0}
        <div class="mt-1.5 flex gap-2 overflow-x-auto p-0.5 pb-1">
          {#each hits as c (c.id)}
            {@render card(c, `${regionOf(c.region).name} · ${windowLabel(c.window)}`)}
          {/each}
        </div>
      {:else}
        <p class="mt-1.5 max-w-prose text-body-sm text-ink-dim">
          No chapter tells of “{query.trim()}” yet. Lekishi has {chapters.length} chapters, most of them
          in Eurasia; the Americas and Oceania have one each. Try a place, a people, or a year such as
          753 or 480 BCE.
        </p>
      {/if}
    {:else}
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p class="text-label font-semibold uppercase text-gold">In {yearLabel(year)}</p>
        <p class="flex-1 text-caption text-ink-dim max-sm:order-last max-sm:basis-full">
          {#if told.length > 0}
            {told.length}
            {told.length === 1 ? "chapter" : "chapters"} told, in {new Set(
              told.map((c) => c.region),
            ).size}
            {new Set(told.map((c) => c.region)).size === 1 ? "region" : "regions"}
          {:else}
            nothing told yet
          {/if}
        </p>
        <span class="text-caption text-ink-dim max-sm:hidden">← → a year · drag the axis</span>
        <Button
          size="sm"
          icon="chevron-left"
          disabled={edges.before === null}
          onclick={() => edges.before !== null && setYear(edges.before, true)}
          >{edges.before === null ? "" : yearLabel(edges.before)}</Button
        >
        <Button
          size="sm"
          icon="chevron-right"
          disabled={edges.after === null}
          onclick={() => edges.after !== null && setYear(edges.after, true)}
          >{edges.after === null ? "" : yearLabel(edges.after)}</Button
        >
      </div>
      {#if told.length > 0}
        <div class="mt-1.5 flex gap-2 overflow-x-auto p-0.5 pb-1">
          {#each told as c (c.id)}
            {@render card(c, `${regionOf(c.region).name} · ${windowLabel(c.window)}`)}
          {/each}
        </div>
      {:else}
        <p class="mt-1.5 max-w-prose text-body-sm text-ink-dim">
          No chapter covers {yearLabel(year)}. The nearest are {[edges.before, edges.after]
            .filter((e): e is number => e !== null)
            .map((e) => yearLabel(e))
            .join(" and ")}: step with the buttons or the arrow keys, or drag the axis.
        </p>
      {/if}
    {/if}
  </section>
</div>
