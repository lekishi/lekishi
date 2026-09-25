<script lang="ts">
  import { onMount } from "svelte"
  import { COMPARISON_REVIEW } from "$lib/atlas/comparison"
  import { releaseWorkspace, startAtlasPage } from "$lib/atlas/entry"
  import { windowLabel } from "$lib/atlas/labels"
  import type { Chapter } from "$lib/atlas/domain"

  /**
   * The comparison review route.
   *
   * It renders the bounded Qin fixture through the same workspace the production
   * atlas uses, so the owner can inspect the corrected revisions the internal
   * review prepared before deciding on them. The fixture is not approved content:
   * the header states that it is unapproved preparation, the load keeps the
   * fixture's own coverage window, and the workspace shows the published dispute
   * for the events that carry one. Nothing here changes the atlas route, which
   * still renders the reviewed Tang chapter.
   *
   * The shell is prerendered from the load data, so a direct request for
   * `/compare/qin` states the fixture's window and review status before any
   * JavaScript runs. The workspace itself mounts in `onMount`, as on the atlas
   * route, and this page releases it on teardown.
   */
  let { data }: { data: { chapter: Chapter } } = $props()

  onMount(() => {
    startAtlasPage(data.chapter, "comparison-review")

    return () => releaseWorkspace()
  })
</script>

<svelte:head>
  <title>{data.chapter.title} · Comparison fixture · Lekishi</title>
  <meta name="description" content="{COMPARISON_REVIEW.label}: {COMPARISON_REVIEW.note}" />
</svelte:head>

<div class="flex h-dvh min-h-0 flex-col bg-slate-950">
  <header
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5"
  >
    <div class="flex items-center gap-2.5">
      <a href="/" class="flex items-center gap-2.5">
        <img src="/images/logo.svg" width="24" alt="" />
        <span class="text-sm font-semibold tracking-tight text-slate-100">Lekishi</span>
      </a>
      <span
        id="comparison-status"
        class="rounded-full border border-rose-400/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-rose-300"
      >
        {COMPARISON_REVIEW.label}
      </span>
    </div>
    <nav class="flex items-center gap-4 text-xs" aria-label="Primary">
      <a href="/atlas" class="text-slate-300 transition hover:text-white">Reviewed Tang atlas</a>
      <a href="/" class="text-slate-300 transition hover:text-white">Overview</a>
    </nav>
  </header>

  <!--
    The fixture's identity and review state, prerendered from the load: the
    window in BCE years, the review note, and the fact that this content is not a
    launch chapter. The workspace below states the coverage note and the derived
    counts for the chapter it renders. At phone widths the strip is hidden: the
    header badge and the workspace notice already state the review status, and
    the workspace needs that height for the map and the event list.
  -->
  <div
    id="comparison-scope"
    class="hidden flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-800/60 bg-slate-900/40 px-4 py-2 text-[0.7rem] leading-snug text-slate-400 sm:flex"
  >
    <span class="font-semibold text-slate-200">{windowLabel(data.chapter.defaultWindow)}</span>
    <span aria-hidden="true">·</span>
    <span>{COMPARISON_REVIEW.note}</span>
  </div>

  <main class="relative min-h-0 flex-1">
    <!-- The workspace owns everything inside this element; see $lib/atlas/entry. -->
    <div id="atlas-workspace" class="h-full w-full"></div>
  </main>
</div>
