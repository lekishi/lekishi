<script lang="ts">
  import type { Chapter } from "$lib/atlas/domain"
  import { chapterHref, chapterHeading } from "$lib/atlas/chapters"
  import { releaseWorkspace, startAtlasPage } from "$lib/atlas/entry"
  import type { LocalDetailTreatment } from "$lib/atlas/scene-illustration"

  /**
   * The internal treatment-comparison surface.
   *
   * This page is project work, not a chapter: a reviewer picks a local-detail
   * treatment here and looks at the same chapter the site serves, through the
   * same workspace. The comparison's vocabulary and its control live only on
   * this page; the root page and the chapter pages carry neither, which
   * `scripts/check-static-build.mjs` enforces.
   *
   * The treatment is page state, and changing it re-mounts the workspace through
   * the one mount owner (`$lib/atlas/entry`): the effect's cleanup releases the
   * old workspace before the new one starts, so the page never holds two globes,
   * two event lists, or two owners of selection and time.
   */
  let { data }: { data: { chapter: Chapter } } = $props()

  let treatment = $state<LocalDetailTreatment>("geographic-symbolic")

  const heading = $derived(chapterHeading(data.chapter))

  const treatments: readonly { readonly id: LocalDetailTreatment; readonly label: string }[] = [
    { id: "geographic-symbolic", label: "Geographic/symbolic" },
    { id: "illustrated-local", label: "Illustrated local" },
  ]

  $effect(() => {
    const chapter = data.chapter
    const chosen = treatment

    startAtlasPage(chapter, chapterHeading(chapter), { localDetail: chosen })

    return () => releaseWorkspace()
  })
</script>

<svelte:head>
  <title>Treatment comparison · {heading.name} · Lekishi</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex h-dvh min-h-0 flex-col bg-slate-950">
  <header
    class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5"
  >
    <div class="flex min-w-0 flex-wrap items-center gap-2.5">
      <span
        id="review-status"
        class="rounded-full border border-amber-300/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-200"
      >
        Internal comparison surface · not a reader page
      </span>
      <span class="text-sm font-semibold tracking-tight text-slate-100">{heading.name}</span>
    </div>

    <!--
      The comparison's own control. It is the only control on the page that the
      chapter route does not have, and it is what the reviewer switches to look
      at the other treatment with the same chapter and the same behavior.
    -->
    <div class="flex items-center gap-2" role="group" aria-label="Local-detail treatment">
      {#each treatments as option (option.id)}
        <button
          id="review-treatment-{option.id}"
          type="button"
          data-testid="review-treatment"
          aria-pressed={treatment === option.id}
          onclick={() => (treatment = option.id)}
          class={[
            "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
            treatment === option.id
              ? "border-amber-300/70 bg-amber-300/15 text-amber-100"
              : "border-slate-600 bg-slate-950/80 text-slate-200 hover:border-slate-400 hover:text-white",
          ]}
        >
          {option.label}
        </button>
      {/each}
    </div>
  </header>

  <div
    id="review-scope"
    class="hidden flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-800/60 bg-slate-900/40 px-4 py-2 text-[0.7rem] leading-snug text-slate-400 sm:flex"
  >
    <span class="font-semibold text-slate-200">{heading.decision}</span>
    <span aria-hidden="true">·</span>
    <span>
      The same chapter, controls, search, sources, and time behavior as the served chapter; only the
      local-detail treatment changes. <a
        class="text-slate-300 underline decoration-dotted hover:text-white"
        href={chapterHref(data.chapter.id)}>Open the served chapter</a
      >
    </span>
  </div>

  <main class="relative min-h-0 flex-1">
    <!-- The workspace owns everything inside this element; see $lib/atlas/entry. -->
    <div id="atlas-workspace" class="h-full w-full"></div>
  </main>
</div>
