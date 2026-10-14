<script lang="ts">
  import { Button, Icon, focusRing, transition } from "$lib/ui"

  /**
   * The date bar (RFD 5, top region): where the reader is in time, in which
   * chapter, and how far through its story. It replaces the old notice plate.
   *
   * The year is the playhead's, in the atlas's own year text. Beside it, when
   * something is selected, is the date as the source writes it (天寶十二載十二
   * 月廿日): the record's own expression, never a converted era date, because
   * RFD 2 owns calendar conversion and the atlas does not invent one. The
   * chapter name is the switcher, search is one key away, and About states the
   * chapter's editorial status, once.
   */
  let {
    chapterName,
    year,
    sourceExpression,
    windowText,
    windowChanged,
    storyText,
    compact = false,
    onAbout,
    onSwitch,
    onSearch,
  }: {
    chapterName: string
    /** The playhead's year, in the atlas's year text. */
    year: string
    /** The selected record's own date expression, or null. */
    sourceExpression: string | null
    windowText: string
    /** The window is not the chapter's default, so the bar says so. */
    windowChanged: boolean
    /** "8 / 37", or null when the reader is not at a story step. */
    storyText: string | null
    compact?: boolean
    onAbout: () => void
    onSwitch: () => void
    onSearch: () => void
  } = $props()
</script>

<header
  id="atlas-date-bar"
  aria-label="Date and chapter"
  class={[
    "pointer-events-auto flex min-w-0 items-center gap-2 rounded-plate border border-frame bg-lacquer-glass text-ink shadow-plate backdrop-blur-md",
    compact ? "h-11 px-2" : "h-12 px-3",
  ]}
>
  <a
    href="/"
    class={[
      "flex shrink-0 items-center gap-2 rounded-control px-1 py-1 no-underline",
      transition,
      focusRing,
    ]}
    aria-label="Lekishi home"
  >
    <img src="/images/logo.svg" width="22" height="22" alt="" />
    {#if !compact}
      <span class="hidden font-display text-body-sm font-semibold tracking-wide text-ink xl:inline"
        >LEKISHI</span
      >
    {/if}
  </a>

  {#if !compact}
    <button
      type="button"
      id="atlas-chapter-switcher"
      onclick={onSwitch}
      aria-haspopup="dialog"
      class={[
        "group flex min-w-0 shrink items-center gap-1.5 rounded-control px-2 py-1 text-left hover:bg-lacquer-raised",
        transition,
        focusRing,
      ]}
    >
      <span class="truncate font-serif text-body-sm font-semibold text-ink">{chapterName}</span>
      <Icon name="chevron-down" size={14} class="text-ink-dim group-hover:text-ink" />
      <span class="sr-only">, switch chapter</span>
    </button>
    <span aria-hidden="true" class="h-6 w-px shrink-0 bg-rule"></span>
  {/if}

  <p
    id="atlas-date"
    class="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden"
    aria-live="polite"
  >
    <span class="sr-only">Playhead</span>
    <span
      class={[
        "shrink-0 font-display font-semibold tabular-nums text-gold-bright",
        compact ? "text-title-sm" : "text-title",
      ]}
      data-testid="atlas-playhead-year">{year}</span
    >
    {#if sourceExpression}
      <span lang="lzh" class="min-w-0 truncate font-serif text-body-sm text-ink-dim"
        >{sourceExpression}</span
      >
    {/if}
  </p>

  <div class="flex shrink-0 items-center gap-1">
    {#if !compact}
      <span
        class={[
          "hidden px-2 text-caption tabular-nums lg:inline",
          windowChanged ? "text-gold-bright" : "text-ink-dim",
        ]}
        data-testid="atlas-window-label"
      >
        Window <b class="font-semibold text-ink">{windowText}</b>
      </span>
    {/if}
    {#if storyText}
      <span class="hidden px-2 text-caption tabular-nums text-ink-dim md:inline">
        Story <b class="font-semibold text-ink">{storyText}</b>
      </span>
    {/if}
    {#if compact}
      <Button variant="icon" icon="list" size="sm" label="Switch chapter" onclick={onSwitch} />
    {/if}
    <Button
      variant="icon"
      icon="search"
      size={compact ? "sm" : "md"}
      label="Search all chapters (/)"
      onclick={onSearch}
      data-testid="atlas-open-search"
    />
    <Button
      variant="ghost"
      size="sm"
      icon="about"
      onclick={onAbout}
      id="atlas-about-open"
      aria-controls="atlas-about"
    >
      <span class={compact ? "sr-only" : ""}>About</span>
    </Button>
  </div>
</header>
