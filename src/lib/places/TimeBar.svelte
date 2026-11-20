<script lang="ts">
  import { windowLabel, yearLabel } from "$lib/atlas/labels"
  import { Button, Plate, focusRing } from "$lib/ui"
  import { momentWindow, type PlaceEntry, type PlaceMoment } from "./catalogue"

  let {
    entry,
    current,
    choose,
  }: {
    entry: PlaceEntry
    current: PlaceMoment | null
    choose: (moment: PlaceMoment | null) => void
  } = $props()
  const index = $derived(current === null ? -1 : entry.moments.indexOf(current))
  const chapter = $derived(entry.chapters.find((candidate) => candidate.id === current?.chapterId))
  const span = $derived(momentWindow(entry.moments))
  const runs = $derived.by(() => {
    const runs: { moments: PlaceMoment[]; gap: number; end: number }[] = []
    for (const moment of entry.moments) {
      const previous = runs.at(-1)
      if (previous?.moments[0].chapterId === moment.chapterId) {
        previous.moments.push(moment)
        previous.end = Math.max(previous.end, moment.end)
      } else {
        runs.push({
          moments: [moment],
          gap: previous ? moment.start - previous.end : 0,
          end: moment.end,
        })
      }
    }
    return runs
  })

  function step(direction: number) {
    const next = entry.moments[index + direction]
    if (next) choose(next)
  }

  function key(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return
    if (
      event.target instanceof Element &&
      event.target.closest('input, textarea, select, [contenteditable], [role="dialog"]')
    )
      return
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    step(event.key === "ArrowLeft" ? -1 : 1)
  }
</script>

<svelte:window onkeydown={key} />

<Plate tone="glass" class="flex flex-col gap-2">
  <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
    <Button
      variant="icon"
      icon="chevron-left"
      label="Earlier moment"
      disabled={index <= 0}
      onclick={() => step(-1)}
    />
    <div aria-live="polite" class="min-w-0">
      {#if current && chapter}
        <p class="font-semibold text-body-sm text-gold-bright tabular-nums">
          {windowLabel(current)}
        </p>
        <p class="line-clamp-2 font-serif text-body-sm">{current.title}</p>
        <p class="flex items-center gap-1.5 text-caption text-ink-dim">
          <span
            class="size-2 shrink-0 rounded-full"
            style:background-color="var(--color-region-{chapter.region})"
          ></span>
          <span class="truncate">{chapter.title}</span><span class="shrink-0 tabular-nums"
            >· {index + 1} of {entry.moments.length}</span
          >
        </p>
      {:else}
        <p class="font-semibold text-body-sm text-gold-bright">All time</p>
        <p class="font-serif text-body-sm">
          {entry.moments.length}
          {entry.moments.length === 1 ? "moment" : "moments"} at {entry.place.label}, in {new Set(
            entry.moments.map((moment) => moment.chapterId),
          ).size} chapters
        </p>
        {#if span}<p class="text-caption text-ink-dim">
            {windowLabel(span)} · Step through the moments
          </p>{/if}
      {/if}
    </div>
    <Button
      variant="icon"
      icon="chevron-right"
      label={current ? "Later moment" : "First moment"}
      disabled={index + 1 >= entry.moments.length}
      onclick={() => step(1)}
    />
  </div>
  {#if span}
    <div class="flex min-w-0 items-center gap-2 text-caption text-ink-dim tabular-nums">
      <button
        type="button"
        aria-pressed={current === null}
        onclick={() => choose(null)}
        class={[
          "min-h-8 shrink-0 rounded-control border px-2",
          current === null ? "border-gold text-gold-bright" : "border-rule",
          focusRing,
        ]}>All time</button
      >
      <span class="shrink-0">{yearLabel(span.start)}</span>
      <div
        class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1"
        aria-label="Moments, not to scale"
      >
        {#each runs as run (run.moments[0])}
          {@const region = entry.chapters.find(
            (candidate) => candidate.id === run.moments[0].chapterId,
          )?.region}
          {#if run.gap > 1}<span class="shrink-0">{run.gap} yr</span>{/if}
          <div class="flex flex-1 items-center gap-px" style:color="var(--color-region-{region})">
            {#each run.moments as moment (`${moment.chapterId}/${moment.id}`)}
              {@const on = current === moment}
              <span
                aria-hidden="true"
                class={[
                  "min-w-px flex-1 rounded-control md:hidden",
                  on ? "h-4 bg-gold" : "h-2 bg-current",
                ]}
              ></span>
              <button
                type="button"
                aria-pressed={on}
                aria-label="{windowLabel(moment)}: {moment.title}"
                title="{windowLabel(moment)}: {moment.title}"
                onclick={() => choose(moment)}
                class={[
                  "hidden h-7 min-w-2 flex-1 items-center justify-center rounded-control md:flex",
                  focusRing,
                ]}
              >
                <span class={["w-1 rounded-control", on ? "h-5 bg-gold" : "h-3 bg-current"]}></span>
              </button>
            {/each}
          </div>
        {/each}
      </div>
      <span class="shrink-0">{yearLabel(span.end)}</span>
    </div>
  {/if}
</Plate>
