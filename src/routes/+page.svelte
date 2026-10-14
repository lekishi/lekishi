<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { CHAPTERS, chapterPresentation } from "$lib/atlas/chapters"
  import { windowLabel } from "$lib/atlas/labels"
  import { lastPosition, type Position } from "$lib/atlas/memory"
  import ChapterGlobe from "$lib/atlas/navigation/ChapterGlobe.svelte"
  import SearchDialog from "$lib/atlas/navigation/SearchDialog.svelte"
  import TimeRibbon from "$lib/atlas/navigation/TimeRibbon.svelte"
  import { Icon, focusRing, transition } from "$lib/ui"

  /**
   * The home page (RFD 5, "Home"): search first, the chapters on the globe and
   * on a line of time, and where the reader left off.
   *
   * The chapters are peers. Each card carries its name, window, story summary
   * and an entry, and its recorded editorial decision in small print after the
   * entry: metadata about the chapter, never its pitch. The cards come from
   * `chapters.ts`, whose tests pin them against the chapter trees.
   *
   * Everything a reader needs is prerendered. The globe, the search index and
   * "Continue" are additions the browser makes after the page has painted;
   * without them the page is the same choice in text.
   */
  const SUGGESTIONS = ["鑒眞", "秋妻屋浦", "韓非", "新鄭", "754"]

  const principles = [
    {
      icon: "globe",
      title: "Real terrain, nothing rented",
      body: "Elevation and imagery are built from open data and shipped with the site. No map service, account or token.",
    },
    {
      icon: "calendar",
      title: "Time as the sources state it",
      body: "An uncertain date keeps its whole span. The date as the source writes it stays beside the year.",
    },
    {
      icon: "sources",
      title: "Every claim cited",
      body: "Citations, disputes, and the places that cannot be located stay visible beside the record.",
    },
  ] as const

  let searchOpen = $state(false)
  let query = $state("")
  let resume = $state<Position | null>(null)

  onMount(() => {
    resume = lastPosition()
  })

  const resumeChapter = $derived(resume ? chapterPresentation(resume.chapterId) : undefined)

  function openSearch(text = "") {
    query = text
    searchOpen = true
  }

  function shortcut(event: KeyboardEvent) {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest("input, textarea, select, [contenteditable='true'], dialog[open]")) return
    event.preventDefault()
    openSearch()
  }
</script>

<svelte:window onkeydown={shortcut} />

<svelte:head>
  <title>Lekishi · Historical atlas</title>
  <meta
    name="description"
    content="Lekishi is a historical atlas: follow events across places and time on a globe, with the sources, the uncertainty, and the places it cannot locate kept visible."
  />
</svelte:head>

<div class="flex min-h-dvh flex-col bg-abyss font-interface text-ink">
  <header class="flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
    <a
      href="/"
      class={["flex items-center gap-2.5 rounded-control no-underline", focusRing]}
      aria-label="Lekishi home"
    >
      <img src="/images/logo.svg" width="26" height="26" alt="" />
      <span class="font-display text-body font-semibold tracking-wide text-ink">LEKISHI</span>
    </a>
    <nav aria-label="Primary" class="flex items-center gap-1">
      <a
        href="#chapters"
        class={[
          "rounded-control px-3 py-1.5 text-body-sm text-ink-dim no-underline hover:text-ink",
          transition,
          focusRing,
        ]}>Chapters</a
      >
      <button
        type="button"
        onclick={() => openSearch()}
        class={[
          "inline-flex cursor-pointer items-center gap-1.5 rounded-control px-3 py-1.5 text-body-sm text-ink-dim hover:text-ink",
          transition,
          focusRing,
        ]}
      >
        <Icon name="search" size={16} />Search
      </button>
    </nav>
  </header>

  <main class="flex flex-1 flex-col">
    <!--
      `grid-cols-1` is a minmax(0, 1fr) track: without it the implicit column
      is sized to its widest unbreakable content, the search button's one-line
      placeholder, and the hero runs off a 320 px screen.
    -->
    <section
      class="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 pt-10 pb-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:pt-16"
    >
      <div class="flex max-w-2xl flex-col gap-6">
        <p class="text-label font-semibold uppercase text-gold">A historical atlas</p>
        <h1 class="font-display text-display text-balance text-ink">
          History, in the places it happened.
        </h1>
        <p class="max-w-xl font-serif text-body text-ink-dim">
          Follow embassies, voyages and conquests across a globe drawn from real terrain, with every
          date, dispute and source kept beside the story.
        </p>

        <button
          type="button"
          onclick={() => openSearch()}
          data-testid="home-search"
          class={[
            "group flex h-14 w-full max-w-xl cursor-text items-center gap-3 rounded-plate border border-frame bg-lacquer px-4 text-left shadow-plate hover:border-gold",
            transition,
            focusRing,
          ]}
        >
          <Icon name="search" size={20} class="text-gold" />
          <span class="flex-1 truncate text-body text-ink-faint group-hover:text-ink-dim"
            >Search people, places, events and years</span
          >
          <kbd
            class="hidden rounded-control border border-rule px-1.5 py-0.5 text-caption text-ink-faint sm:inline"
            >/</kbd
          >
        </button>
        <div class="-mt-2 flex flex-wrap items-center gap-1.5">
          <span class="mr-1 text-caption text-ink-faint">Try</span>
          {#each SUGGESTIONS as suggestion (suggestion)}
            <button
              type="button"
              onclick={() => openSearch(suggestion)}
              class={[
                "cursor-pointer rounded-full border border-rule px-3 py-0.5 font-serif text-body-sm text-ink-dim hover:border-gold hover:text-gold-bright",
                transition,
                focusRing,
              ]}>{suggestion}</button
            >
          {/each}
        </div>

        {#if resume && resumeChapter}
          <a
            href="{resumeChapter.href}{resume.search}"
            data-testid="home-continue"
            class={[
              "group flex max-w-xl items-center gap-3 rounded-plate border border-rule bg-lacquer-raised px-4 py-3 no-underline hover:border-gold",
              transition,
              focusRing,
            ]}
          >
            <span class="min-w-0 flex-1">
              <span class="block text-label font-semibold uppercase text-ink-dim"
                >Continue where you left off</span
              >
              <span
                class="block truncate font-serif text-body text-ink group-hover:text-gold-bright"
                >{resume.label}</span
              >
              <span class="block truncate text-caption text-ink-faint">{resumeChapter.name}</span>
            </span>
            <Icon name="arrow-right" size={18} class="text-gold" />
          </a>
        {/if}
      </div>

      <div
        aria-hidden="true"
        class="relative hidden aspect-square w-full overflow-hidden rounded-full border border-frame bg-lacquer shadow-sheet lg:block"
      >
        <ChapterGlobe onOpen={(href) => goto(href)} />
      </div>
    </section>

    <section
      id="chapters"
      aria-labelledby="chapters-heading"
      class="mx-auto flex w-full max-w-6xl scroll-mt-4 flex-col gap-5 px-4 pb-16 sm:px-8"
    >
      <div class="flex items-baseline justify-between gap-4">
        <h2 id="chapters-heading" class="font-display text-title text-ink">Chapters</h2>
        <span class="text-caption text-ink-faint">{CHAPTERS.length} chapters</span>
      </div>
      <div class="rounded-plate border border-rule bg-lacquer px-4 pt-3 pb-1 sm:px-6">
        <TimeRibbon chapters={CHAPTERS} />
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        {#each CHAPTERS as chapter (chapter.id)}
          <article
            class="group flex flex-col rounded-plate border border-rule bg-lacquer p-5 shadow-plate transition-[border-color] duration-(--motion-fast) ease-ui hover:border-frame"
            data-chapter-id={chapter.id}
          >
            <p class="text-label font-semibold uppercase text-gold">
              <span class="tabular-nums">{windowLabel(chapter.window)}</span>
            </p>
            <h3 class="mt-2 font-display text-title text-ink">{chapter.name}</h3>
            <p class="mt-3 flex-1 font-serif text-body-sm text-ink-dim">{chapter.summary}</p>
            <div class="mt-5">
              <a
                href={chapter.href}
                class={[
                  "inline-flex items-center gap-2 rounded-control bg-gold px-4 py-2 text-body-sm font-semibold text-on-gold no-underline hover:bg-gold-bright",
                  transition,
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright",
                ]}
              >
                Open the chapter<span class="sr-only">: {chapter.name}</span>
                <Icon name="arrow-right" size={16} />
              </a>
            </div>
            <!--
              Editorial state: one line after the entry, in every card, so the
              cards read alike and the status is never the card's identity.
            -->
            <p class="mt-3 text-caption text-ink-dim">{chapter.status}</p>
          </article>
        {/each}
      </div>
    </section>

    <section class="border-t border-rule bg-lacquer">
      <div class="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-8">
        {#each principles as principle (principle.title)}
          <div>
            <Icon name={principle.icon} size={20} class="text-gold" />
            <h2 class="mt-3 font-serif text-title-sm text-ink">{principle.title}</h2>
            <p class="mt-1 text-body-sm text-ink-dim">{principle.body}</p>
          </div>
        {/each}
      </div>
    </section>
  </main>

  <footer
    class="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-4 text-caption text-ink-faint sm:px-8"
  >
    <p>A static site: no account and no server.</p>
    <p>
      Elevation: Terrain Tiles (Mapzen and contributors) · Imagery from Natural Earth II ·
      <a
        class={[
          "rounded-control text-ink-dim underline decoration-rule underline-offset-2 hover:text-ink",
          transition,
          focusRing,
        ]}
        href="/globe/ATTRIBUTION.txt">Full attribution</a
      >
    </p>
  </footer>
</div>

<SearchDialog open={searchOpen} bind:query onClose={() => (searchOpen = false)} />
