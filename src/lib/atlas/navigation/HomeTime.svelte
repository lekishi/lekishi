<script lang="ts">
  import { windowLabel } from "$lib/atlas/labels"
  import type { HomeChapter } from "$lib/atlas/home"
  import { pack } from "$lib/dev/region-timeline"
  import type { Region } from "$lib/historical/regions"
  import { Button, Plate, focusRing } from "$lib/ui"

  let { href, groups }: { href: string; groups: (Region & { chapters: HomeChapter[] })[] } =
    $props()

  const start = -2400
  const end = $derived(
    Math.max(820, ...groups.flatMap(({ chapters }) => chapters.map((c) => c.window.end))),
  )
  const x = (year: number) => ((Math.max(start, year) - start) / (end - start)) * 100
  const eras = [
    { name: "Bronze Age", from: -2400, to: -1000 },
    { name: "800–200 BCE", from: -800, to: -180 },
    { name: "Han & Rome", from: -260, to: 140 },
    { name: "The 750s", from: 600, to: 820 },
  ]
  const rows = $derived(
    groups.map((region) => {
      const spans = region.chapters.map((chapter) => {
        const left = Math.min(98, x(chapter.window.start))
        return { chapter, left, right: Math.max(left + 2, x(chapter.window.end)) }
      })
      const lanes = pack(spans, 1)
      return {
        ...region,
        lanes: Math.max(1, ...lanes.map((lane) => lane + 1)),
        spans: spans.map((span, i) => ({ ...span, lane: lanes[i] })),
      }
    }),
  )
</script>

{#snippet chart(linked: boolean)}
  <div
    class="grid grid-cols-[8rem_minmax(0,1fr)] divide-x divide-rule @[600px]:grid-cols-[13.5rem_minmax(0,1fr)]"
  >
    <div></div>
    <div class="relative h-6 text-caption tabular-nums text-ink-dim">
      {#each [{ year: -1999, label: "2000 BCE" }, { year: -999, label: "1000 BCE" }, { year: 1, label: "1 CE" }] as tick (tick.year)}
        <span
          class="absolute inset-y-0 flex items-center border-l border-rule pl-1 whitespace-nowrap"
          style:left={`${x(tick.year)}%`}
        >
          <span class={tick.year === -999 ? "hidden min-[440px]:inline" : ""}>{tick.label}</span>
        </span>
      {/each}
    </div>
  </div>
  {#each rows as row (row.key)}
    <div
      role="group"
      aria-label={row.name}
      class="grid grid-cols-[8rem_minmax(0,1fr)] items-stretch border-t border-rule @[600px]:grid-cols-[13.5rem_minmax(0,1fr)]"
      style:--region={`var(--color-region-${row.key})`}
    >
      <span
        class="flex items-center justify-between gap-1 border-l-2 border-l-(--region) px-2 py-1 text-caption text-ink-dim"
      >
        <span class="min-w-0" aria-hidden="true">
          <span class="@[600px]:hidden">{row.shortName ?? row.name}</span>
          <span class="hidden @[600px]:inline">{row.name}</span>
        </span>
        <span class="tabular-nums">{row.chapters.length}</span>
      </span>
      <div
        class="relative border-l border-rule"
        style:min-height={`calc(var(--spacing) * ${Math.max(6, 2 * row.lanes + 2)})`}
      >
        {#each [-1999, -999, 1] as year (year)}
          <span class="absolute inset-y-0 border-l border-rule" style:left={`${x(year)}%`}></span>
        {/each}
        {#each row.spans as { chapter, left, right, lane } (chapter.id)}
          {@const clipped = chapter.window.start < start}
          {@const label = `${chapter.name}, ${windowLabel(chapter.window)}${clipped ? " (begins before this chart)" : ""}${chapter.draft ? " (draft)" : ""}`}
          {@const bar = [
            "absolute h-1.5 rounded-control",
            clipped
              ? "bg-[repeating-linear-gradient(135deg,var(--region)_0_3px,transparent_3px_6px)]"
              : "bg-(--region)",
          ]}
          {@const top = `calc(50% + var(--spacing) * ${2 * lane - row.lanes + 0.25})`}
          {#if linked}
            <a
              href={chapter.href}
              title={label}
              aria-label={label}
              class={[bar, focusRing, "focus-visible:z-(--z-markers)"]}
              style:left={`${left}%`}
              style:width={`${right - left}%`}
              style:top
            ></a>
          {:else}
            <span class={bar} style:left={`${left}%`} style:width={`${right - left}%`} style:top
            ></span>
          {/if}
        {/each}
      </div>
    </div>
  {/each}
{/snippet}

<Plate tone="solid" padded={false} class="@container flex flex-1 flex-col">
  <div class="flex flex-wrap items-center gap-1 border-b border-rule px-2 py-2">
    <span class="px-2 text-caption text-ink-dim">Jump to</span>
    {#each eras as era (era.name)}
      <Button variant="secondary" size="sm" href={`${href}?from=${era.from}&to=${era.to}`}
        >{era.name}</Button
      >
    {/each}
  </div>
  <div class="hidden min-[800px]:block">{@render chart(true)}</div>
  <a
    {href}
    aria-label="Open the timeline"
    class={["block rounded-control no-underline min-[800px]:hidden", focusRing]}
  >
    {@render chart(false)}
  </a>
</Plate>
