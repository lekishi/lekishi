<script lang="ts">
  import { untrack } from "svelte"
  import { afterNavigate, pushState, replaceState } from "$app/navigation"
  import { page } from "$app/state"
  import { chapterHeading, chapterHref } from "$lib/atlas/chapters"
  import type { Chapter } from "$lib/atlas/domain"
  import { navigateWorkspace, releaseWorkspace, startAtlasPage } from "$lib/atlas/entry"
  import { windowLabel } from "$lib/atlas/labels"
  import { DRAFT_SCOPE } from "$lib/atlas/release"
  import type { AtlasHistory } from "$lib/atlas/mount"
  import { Logo, focusRing } from "$lib/ui"

  /**
   * The chapter page.
   *
   * One route renders every chapter the site carries. SvelteKit owns the route
   * and the `#atlas-workspace` mount point; everything inside the mount point
   * belongs to the Svelte workspace, the single owner of atlas state (RFD 3).
   *
   * The page is prerendered from the route's load, so a direct request returns
   * the chapter's name, window, decision, summary and coverage as real HTML
   * before any JavaScript runs. That shell covers the page until the workspace
   * has mounted, and is the page a reader without JavaScript keeps.
   *
   * The mount runs in an effect rather than `onMount`, because SvelteKit reuses
   * this component when the router moves between two chapters of the same
   * route: the effect re-runs for the new chapter and its cleanup releases the
   * old workspace first. The effect is browser-only, so nothing touches the DOM
   * while prerendering.
   *
   * The address carries the reader's position (RFD 5's URL contract). The
   * workspace writes it through shallow routing, so moving around a chapter
   * never reloads it; Back and Forward between those entries are handed back to
   * the workspace, and a link to the chapter already open moves the workspace
   * to it and says what it opened.
   */
  let { data }: { data: { chapter: Chapter } } = $props()

  const heading = $derived(chapterHeading(data.chapter))
  let mounted = $state(false)

  const history: AtlasHistory = {
    push: (search) => pushState(`${location.pathname}${search}`, {}),
    replace: (search) => replaceState(`${location.pathname}${search}`, {}),
  }

  $effect(() => {
    const chapter = data.chapter

    untrack(() => {
      startAtlasPage(chapter, chapterHeading(chapter), history, page.url.search)
      mounted = true
    })

    return () => releaseWorkspace()
  })

  afterNavigate(({ to, type }) => {
    // A link to the chapter already open. The first arrival is the mount's
    // own, and a popstate is the listener's below.
    if (type === "enter" || type === "popstate" || to === null) return
    if (to.url.pathname !== chapterHref(data.chapter.id)) return
    navigateWorkspace(data.chapter.id, to.url.search, true)
  })
</script>

<svelte:window
  onpopstate={() => {
    // Back and Forward between the entries the workspace wrote are shallow:
    // the router does not navigate, so the workspace is told directly.
    if (location.pathname === chapterHref(data.chapter.id)) {
      navigateWorkspace(data.chapter.id, location.search)
    }
  }}
/>

<svelte:head>
  <title>{heading.name} · Lekishi</title>
  <meta
    name="description"
    content="{heading.name}, {windowLabel(data.chapter.defaultWindow)}: {data.chapter.summary}"
  />
</svelte:head>

<main class="flex h-dvh min-h-0 flex-col overflow-hidden bg-abyss font-interface text-ink">
  {#if heading.draft}
    <!--
      A draft chapter, served only by development and pull-request previews.
      The strip sits above the atlas rather than over it, so it stays on screen
      the whole time the chapter is open without covering any of the atlas's
      own regions, and it is in the prerendered HTML too. A phone keeps the
      decision and drops the sentence on where drafts are served, so the strip
      stays one line.
    -->
    <p
      id="chapter-draft"
      class="flex shrink-0 items-center justify-center gap-2 border-b border-danger bg-lacquer px-4 py-1.5 text-center text-caption text-ink"
    >
      <span
        class="shrink-0 rounded-control border border-current px-1.5 text-label font-semibold uppercase text-danger"
      >
        Draft
      </span>
      <span>{heading.decision}<span class="max-sm:hidden">. {DRAFT_SCOPE}</span></span>
    </p>
  {/if}

  <div class="relative min-h-0 flex-1">
    <!-- The workspace owns everything inside this element; see $lib/atlas/entry. -->
    <div id="atlas-workspace" class="h-full w-full"></div>

    {#if !mounted}
      <!--
      The prerendered chapter: what the page is about before the globe loads,
      and all of it for a reader without JavaScript.
    -->
      <section
        id="chapter-scope"
        aria-labelledby="chapter-title"
        class="absolute inset-0 z-(--z-sheet) flex items-center justify-center overflow-y-auto bg-abyss px-4 py-10"
      >
        <div class="w-full max-w-xl">
          <a
            href="/"
            class={[
              "inline-flex items-center rounded-control text-ink-dim no-underline hover:text-ink",
              focusRing,
            ]}
            aria-label="Lekishi home"
          >
            <Logo size={22} wordmark="bilingual" />
          </a>
          <p class="mt-8 text-label font-semibold uppercase text-gold">
            Chapter · <span class="tabular-nums">{windowLabel(data.chapter.defaultWindow)}</span>
          </p>
          <h1 id="chapter-title" class="mt-2 font-display text-display text-ink">
            {heading.name}
          </h1>
          <p id="chapter-decision" class="mt-3 text-body-sm font-semibold text-gold-bright">
            {heading.decision}
          </p>
          <p class="mt-1 text-body-sm text-ink-dim">{heading.status}</p>
          <p class="mt-6 font-serif text-body text-ink">{data.chapter.summary}</p>
          <p class="mt-4 text-body-sm text-ink-dim">{data.chapter.publication.coverageNote}</p>
          <p class="mt-8 flex items-center gap-2 text-caption text-ink-faint" aria-live="polite">
            <span class="inline-block size-2 animate-pulse rounded-full bg-gold"></span>
            Opening the globe…
          </p>
          <noscript>
            <p class="mt-2 text-body-sm text-ink-dim">
              The atlas needs JavaScript to draw the globe and the timeline.
            </p>
          </noscript>
        </div>
      </section>
    {/if}
  </div>
</main>
