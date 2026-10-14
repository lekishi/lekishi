<script lang="ts">
  import { chapterHeading } from "$lib/atlas/chapters"
  import { releaseWorkspace, startAtlasPage } from "$lib/atlas/entry"
  import { windowLabel } from "$lib/atlas/labels"
  import type { Chapter } from "$lib/atlas/domain"
  import { focusRing, Logo } from "$lib/ui"

  /**
   * The chapter page.
   *
   * One route renders every chapter the site carries, with the same shell and the
   * same workspace: a reader arriving from the root page finds the chapter named
   * the way the card named it, its window in the atlas's own year text, and the
   * recorded decision on the content, then the workspace itself.
   *
   * SvelteKit owns the route, the page, and the `#atlas-workspace` mount point.
   * Everything inside the mount point belongs to the Svelte workspace, which is
   * the single owner of atlas selection, time, and camera-follow state (RFD 3).
   *
   * The shell is prerendered from the route's load, so a direct request for a
   * chapter returns real HTML before any JavaScript runs. `startAtlasPage` is the
   * one module that mounts a workspace; it refuses to mount a second one, and the
   * teardown here plus the bootstrap's own `pagehide`/`pageshow` handling keeps a
   * restored page at exactly one workspace.
   *
   * The mount runs in an effect rather than `onMount`, because SvelteKit reuses
   * this page component when the router moves between two chapters of the same
   * dynamic route: `onMount` would run once and the new chapter would render
   * under the previous chapter's workspace. The effect re-runs whenever the
   * loaded chapter changes, and its cleanup releases the workspace before the
   * next one starts, so the URL, the heading, and the workspace always describe
   * the same chapter. The effect is browser-only: Svelte does not run effects
   * while the shell is rendered on the server, so nothing touches the DOM during
   * prerendering.
   */
  let { data }: { data: { chapter: Chapter } } = $props()

  // Derived, not read once: the page is prerendered from the route's load, and a
  // reader arriving from the root page must find the chapter named the way the
  // card named it.
  const heading = $derived(chapterHeading(data.chapter))

  $effect(() => {
    const chapter = data.chapter

    startAtlasPage(chapter, chapterHeading(chapter))

    return () => releaseWorkspace()
  })
</script>

<svelte:head>
  <title>{heading.name} · Lekishi</title>
  <meta
    name="description"
    content="{heading.name}: {data.chapter.summary} {data.chapter.publication.coverageNote}"
  />
</svelte:head>

<div class="flex h-dvh min-h-0 flex-col bg-slate-950">
  <header
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5"
  >
    <div class="flex min-w-0 items-center gap-2.5">
      <a
        href="/"
        class={["flex items-center rounded-control text-ink", focusRing]}
        aria-label="Lekishi home"
      >
        <Logo size={22} wordmark />
      </a>
      <span
        id="chapter-decision"
        class="rounded-full border border-emerald-400/50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-300"
      >
        {heading.decision}
      </span>
    </div>
    <nav class="flex items-center gap-4 text-xs" aria-label="Primary">
      <a href="/" class="text-slate-300 transition hover:text-white">Overview</a>
    </nav>
  </header>

  <!--
    The chapter's identity, prerendered from the load: its window in the atlas's
    own year text and the decision recorded on its content. At phone widths the
    strip is hidden: the header badge and the workspace notice already state the
    decision, and the workspace needs that height for the map and the list.
  -->
  <div
    id="chapter-scope"
    class="hidden flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-800/60 bg-slate-900/40 px-4 py-2 text-[0.7rem] leading-snug text-slate-400 sm:flex"
  >
    <span class="font-semibold text-slate-200">{windowLabel(data.chapter.defaultWindow)}</span>
    <span aria-hidden="true">·</span>
    <span>{heading.status}</span>
  </div>

  <main class="relative min-h-0 flex-1">
    <!-- The workspace owns everything inside this element; see $lib/atlas/entry. -->
    <div id="atlas-workspace" class="h-full w-full"></div>
  </main>
</div>
