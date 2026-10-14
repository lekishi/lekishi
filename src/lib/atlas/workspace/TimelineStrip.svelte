<script lang="ts">
  import { focusRing, transition } from "$lib/ui"
  import type { Chapter, TimeWindow } from "../domain"
  import { windowLabel, yearLabel } from "../labels"
  import type { SceneEvent } from "../scene"

  /**
   * The timeline strip (RFD 1's "Timeline and playback", RFD 5's bottom
   * region). It replaces the number fields with two rows:
   *
   * - the chapter row: the chapter's whole extent, every event as a bead (coda
   *   nodes fainter), and the window as a brush with two handles;
   * - the window row: the window's years, each event a bead in its year (a
   *   span longer than a year is a bar beneath), and the playhead.
   *
   * The handles and the playhead are native range inputs, so the strip works
   * from the keyboard and a screen reader names each control. The atlas counts
   * time in years (RFD 2 owns finer calendars), so the beads in one year sit
   * side by side in story order rather than at invented days. A possible
   * occurrence is a hollow bead; the selected event's bead is gold.
   */
  let {
    chapter,
    timeWindow,
    playhead,
    events,
    selectedEventId,
    compact = false,
    onWindowChange,
    onPlayheadChange,
    onSelect,
  }: {
    chapter: Chapter
    timeWindow: TimeWindow
    playhead: number
    /** The window's events, as the scene orders them. */
    events: readonly SceneEvent[]
    selectedEventId: string | null
    /** Phone: the window row only. */
    compact?: boolean
    onWindowChange: (window: TimeWindow) => void
    onPlayheadChange: (year: number) => void
    onSelect: (eventId: string) => void
  } = $props()

  const extent = $derived({
    start: Math.min(
      chapter.defaultWindow.start,
      timeWindow.start,
      ...chapter.events.map((event) => event.occurrence.startYear),
    ),
    end: Math.max(
      chapter.defaultWindow.end,
      timeWindow.end,
      ...chapter.events.map((event) => event.occurrence.endYear),
    ),
  })
  const extentSpan = $derived(Math.max(1, extent.end - extent.start + 1))
  const windowSpan = $derived(Math.max(1, timeWindow.end - timeWindow.start + 1))
  const storyOrder = $derived(new Map(chapter.story.map((step, index) => [step.recordId, index])))

  /** Percent across a row for the start of a year cell. */
  function at(year: number, start: number, span: number): number {
    return ((year - start) / span) * 100
  }

  // The beads of each year cell in the window row, in story order.
  const beads = $derived.by(() => {
    const byYear = new Map<number, SceneEvent[]>()
    for (const event of events) {
      const year = Math.max(event.occurrence.startYear, timeWindow.start)
      byYear.set(year, [...(byYear.get(year) ?? []), event])
    }
    return [...byYear].flatMap(([year, list]) =>
      list
        .sort(
          (a, b) =>
            (storyOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (storyOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((event, index) => ({ event, year, index, count: list.length })),
    )
  })

  const spans = $derived(
    events.filter((event) => event.occurrence.endYear > event.occurrence.startYear),
  )

  const years = $derived.by(() => {
    const step = windowSpan <= 12 ? 1 : Math.ceil(windowSpan / 8)
    const list: number[] = []
    for (let year = timeWindow.start; year <= timeWindow.end; year += step) list.push(year)
    return list
  })

  const extentYears = $derived.by(() => {
    const step = Math.max(1, Math.ceil(extentSpan / 6))
    const list: number[] = []
    for (let year = extent.start; year <= extent.end; year += step) list.push(year)
    return list
  })

  /**
   * A window in the strip's narrow column: one era marker for a window wholly
   * BCE ("233–226 BCE"), the atlas's full year text otherwise. The scale below
   * it marks the era once, on its first year, for the same reason.
   */
  function shortWindow(window: TimeWindow): string {
    return window.end <= 0 && window.start !== window.end
      ? `${1 - window.start}–${1 - window.end} BCE`
      : windowLabel(window)
  }

  const range = [
    "absolute inset-x-0 h-full w-full cursor-pointer appearance-none bg-transparent",
    "[&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent",
    "[&::-moz-range-track]:bg-transparent",
  ]
  const thumb = [
    "[&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:border-0",
    focusRing,
  ]
</script>

<section
  aria-label="Timeline"
  data-testid="atlas-timeline"
  class="pointer-events-auto flex min-w-0 flex-col gap-1.5 rounded-plate border border-frame bg-lacquer-glass px-3 py-2 text-ink shadow-plate backdrop-blur-md"
>
  {#if !compact}
    <div class="flex items-center gap-3">
      <span class="w-14 shrink-0 text-label font-semibold uppercase text-ink-dim">Chapter</span>
      <div class="relative h-5 min-w-0 flex-1">
        <div class="absolute inset-x-0 top-1/2 h-px bg-rule" aria-hidden="true"></div>
        {#each chapter.events as event (event.id)}
          <span
            aria-hidden="true"
            class={[
              "absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
              event.id === selectedEventId
                ? "bg-gold-bright"
                : event.coda
                  ? "bg-ink-dim"
                  : "bg-ink",
            ]}
            style="left: {at(event.occurrence.startYear, extent.start, extentSpan) +
              50 / extentSpan}%"
          ></span>
        {/each}
        <span
          aria-hidden="true"
          class="absolute inset-y-0 rounded-control border border-gold bg-gold-tint"
          style="left: {at(timeWindow.start, extent.start, extentSpan)}%; width: {(windowSpan /
            extentSpan) *
            100}%"
        ></span>
        <input
          id="atlas-window-start"
          type="range"
          aria-label="Window start, {yearLabel(timeWindow.start)}"
          aria-valuetext={yearLabel(timeWindow.start)}
          min={extent.start}
          max={extent.end}
          step="1"
          value={timeWindow.start}
          oninput={(event) =>
            onWindowChange({
              start: Math.min(Number(event.currentTarget.value), timeWindow.end),
              end: timeWindow.end,
            })}
          class={[
            range,
            thumb,
            "pointer-events-none [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:rounded-control [&::-webkit-slider-thumb]:bg-gold",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:rounded-control [&::-moz-range-thumb]:bg-gold",
          ]}
        />
        <input
          id="atlas-window-end"
          type="range"
          aria-label="Window end, {yearLabel(timeWindow.end)}"
          aria-valuetext={yearLabel(timeWindow.end)}
          min={extent.start}
          max={extent.end}
          step="1"
          value={timeWindow.end}
          oninput={(event) =>
            onWindowChange({
              start: timeWindow.start,
              end: Math.max(Number(event.currentTarget.value), timeWindow.start),
            })}
          class={[
            range,
            thumb,
            "pointer-events-none [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:rounded-control [&::-webkit-slider-thumb]:bg-gold",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-2 [&::-moz-range-thumb]:rounded-control [&::-moz-range-thumb]:bg-gold",
          ]}
        />
      </div>
      <span
        class="w-24 shrink-0 text-right text-caption whitespace-nowrap text-ink-dim tabular-nums"
        >{shortWindow(extent)}</span
      >
    </div>
  {/if}

  <div class="flex items-center gap-3">
    {#if !compact}
      <span class="w-14 shrink-0 text-label font-semibold uppercase text-ink-dim">Window</span>
    {/if}
    <div class="relative h-9 min-w-0 flex-1">
      <!-- Year cells -->
      {#each years as year (year)}
        <span
          aria-hidden="true"
          class="absolute inset-y-0 border-l border-rule"
          style="left: {at(year, timeWindow.start, windowSpan)}%"
        ></span>
      {/each}
      <!-- Spans longer than a year: a bar under their years -->
      {#each spans as event (event.id)}
        <span
          aria-hidden="true"
          class={[
            "absolute bottom-0.5 h-1 rounded-full",
            event.id === selectedEventId
              ? "bg-gold"
              : event.occurrence.mode === "occurrence_window"
                ? "border border-dashed border-ink-dim"
                : "bg-ink-dim",
          ]}
          style="left: {at(
            Math.max(event.occurrence.startYear, timeWindow.start),
            timeWindow.start,
            windowSpan,
          )}%; width: {((Math.min(event.occurrence.endYear, timeWindow.end) -
            Math.max(event.occurrence.startYear, timeWindow.start) +
            1) /
            windowSpan) *
            100}%"
        ></span>
      {/each}
      <!-- Playhead: a native range input, styled as the gold line -->
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-gold-bright"
        style="left: {at(Math.min(playhead, timeWindow.end), timeWindow.start, windowSpan) +
          50 / windowSpan}%"
      ></span>
      <input
        id="atlas-playhead"
        type="range"
        aria-label="Playhead"
        aria-valuetext={yearLabel(Math.round(playhead))}
        min={timeWindow.start}
        max={timeWindow.end}
        step="1"
        value={Math.round(playhead)}
        oninput={(event) => onPlayheadChange(Number(event.currentTarget.value))}
        class={[
          range,
          thumb,
          "[&::-webkit-slider-thumb]:h-9 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent",
          "[&::-moz-range-thumb]:h-9 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-transparent",
          "focus-visible:outline-offset-0",
        ]}
        style="margin-left: {50 / windowSpan}%; margin-right: {50 / windowSpan}%; width: {100 -
          100 / windowSpan}%"
      />
      <!-- Beads above the playhead input, so a bead can be picked -->
      {#each beads as bead (bead.event.id)}
        {@const cell = 100 / windowSpan}
        {@const left =
          at(bead.year, timeWindow.start, windowSpan) +
          (cell * (bead.index + 1)) / (bead.count + 1)}
        <button
          type="button"
          tabindex="-1"
          title={bead.event.title}
          aria-label={bead.event.title}
          onclick={() => onSelect(bead.event.id)}
          data-testid="atlas-timeline-bead"
          class={[
            "absolute top-2 size-2.5 -translate-x-1/2 cursor-pointer rounded-full",
            transition,
            bead.event.id === selectedEventId
              ? "scale-150 bg-gold-bright"
              : bead.event.playback === "active"
                ? "bg-gold"
                : bead.event.occurrence.mode === "occurrence_window" ||
                    bead.event.relation === "possible"
                  ? "border border-ink-dim bg-transparent hover:border-ink"
                  : "bg-ink-dim hover:bg-ink",
          ]}
          style="left: {left}%"
        ></button>
      {/each}
    </div>
    <output
      id="atlas-playhead-value"
      for="atlas-playhead"
      class="w-24 shrink-0 text-right font-display text-body-sm font-semibold text-gold-bright tabular-nums"
      >{yearLabel(Math.round(playhead))}</output
    >
  </div>

  <div class={["relative h-4", compact ? "mx-0" : "mr-[6.75rem] ml-[4.25rem]"]} aria-hidden="true">
    {#each years as year, index (year)}
      <span
        class="absolute -translate-x-1/2 text-caption whitespace-nowrap text-ink-dim tabular-nums"
        style="left: {at(year, timeWindow.start, windowSpan) + 50 / windowSpan}%"
        >{index === 0 || year > 0 ? yearLabel(year) : 1 - year}</span
      >
    {/each}
  </div>
</section>
