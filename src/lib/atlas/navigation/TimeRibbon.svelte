<script lang="ts">
  import { focusRing, transition } from "$lib/ui"
  import type { ChapterCard } from "../chapters"
  import { windowLabel } from "../labels"

  /**
   * The chapters on one line of time (RFD 5, "Chapters on a time ribbon"): each
   * chapter is a mark at its window, so a reader sees how far apart the two
   * stories are before reading either. The ribbon's ends are the outermost
   * windows, padded, with a century tick between; nothing on it is a claim
   * beyond the chapters' own windows.
   */
  let {
    chapters,
    current = null,
  }: {
    chapters: readonly ChapterCard[]
    current?: string | null
  } = $props()

  const span = $derived.by(() => {
    const start = Math.min(...chapters.map((chapter) => chapter.window.start))
    const end = Math.max(...chapters.map((chapter) => chapter.window.end))
    const pad = Math.max(50, Math.round((end - start) * 0.08))
    return { start: start - pad, end: end + pad }
  })

  const at = (year: number) => ((year - span.start) / (span.end - span.start)) * 100

  /**
   * Ticks at round years as a reader counts them (200 BCE, 1 CE, 200),
   * placed at their astronomical ordinals: 200 BCE is -199.
   */
  const ticks = $derived.by(() => {
    const step = span.end - span.start > 600 ? 200 : 100
    const ordinal = (year: number) => (year < 0 ? year + 1 : year)
    const list: { year: number; label: string }[] = []
    for (
      let year = Math.ceil((span.start - 1) / step) * step;
      ordinal(year) <= span.end;
      year += step
    ) {
      if (ordinal(year) < span.start) continue
      list.push({
        year: ordinal(year),
        label: year < 0 ? `${-year} BCE` : year === 0 ? "1 CE" : `${year}`,
      })
    }
    return list
  })
</script>

<div class="relative h-16 w-full" data-testid="time-ribbon">
  <div aria-hidden="true" class="absolute inset-x-0 top-7 h-px bg-rule"></div>
  {#each ticks as tick (tick.year)}
    <span
      aria-hidden="true"
      class="absolute top-9 -translate-x-1/2 text-caption text-ink-faint tabular-nums"
      style="left: {at(tick.year === 0 ? 1 : tick.year)}%">{tick.label}</span
    >
  {/each}
  <ol class="contents">
    {#each chapters as chapter (chapter.id)}
      {@const left = at(chapter.window.start)}
      {@const width = Math.max(1.2, at(chapter.window.end) - left)}
      <li class="contents">
        <a
          href={chapter.href}
          title="{chapter.name} · {windowLabel(chapter.window)}"
          class={[
            "group absolute top-5 flex h-5 -translate-x-1/2 items-center justify-center",
            transition,
            focusRing,
          ]}
          style="left: {left + width / 2}%; width: max(1.25rem, {width}%)"
        >
          <span
            class={[
              "h-2.5 w-full rounded-full border",
              chapter.id === current
                ? "border-gold-bright bg-gold"
                : "border-gold bg-gold-tint group-hover:bg-gold",
            ]}
          ></span>
          <span class="sr-only">{chapter.name}, {windowLabel(chapter.window)}</span>
        </a>
        <span
          aria-hidden="true"
          class={[
            "absolute top-0 max-w-[45%] truncate font-serif text-caption",
            // Labels near an end grow inwards, so none runs off the ribbon.
            left < 20 ? "-translate-x-2" : left > 80 ? "-translate-x-full" : "-translate-x-1/2",
            chapter.id === current ? "text-gold-bright" : "text-ink-dim",
          ]}
          style="left: {left + width / 2}%">{chapter.name}</span
        >
      </li>
    {/each}
  </ol>
</div>
