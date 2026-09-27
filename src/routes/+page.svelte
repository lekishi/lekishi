<script lang="ts">
  import { CHAPTER } from "$lib/atlas/chapter-content"
  import { COMPARISON_COVERAGE, COMPARISON_REVIEW, COMPARISON_TITLE } from "$lib/atlas/comparison"
  import { reviewLabel, windowLabel } from "$lib/atlas/labels"
  import { RELEASE } from "$lib/atlas/release"

  // The static root page: navigation into the atlas, and the project's
  // non-negotiables stated where a reviewer will actually read them. The chapter
  // facts come from the same projection the atlas renders, so this page cannot
  // describe content the atlas does not show. It carries no application state,
  // so it is prerendered exactly as written.
  //
  // The page also carries the comparison review entry point, because the owner
  // asked for the bounded Qin fixture to be discoverable while deciding on it.
  // That card is deliberately subordinate to the reviewed chapter and the atlas
  // call to action, and it states the route's own review wording, so being
  // reachable cannot read as being approved or shipped.
  const capabilities = [
    {
      title: "Globe first",
      body: "A bundled CesiumJS globe with Natural Earth II imagery and ellipsoid terrain. No provider account, token, or ion dependency.",
    },
    {
      title: "Time as evidence",
      body: "Uncertain occurrences keep their whole supported span. Playback advances a playhead inside a fixed window and stops at its end.",
    },
    {
      title: "Sources stay visible",
      body: "The versioned historical contract keeps citations, uncertainty, calendar precision, and reuse terms with the record they describe.",
    },
  ]

  const chapterFacts = [
    { label: "Events", value: `${CHAPTER.events.length}` },
    { label: "Places", value: `${CHAPTER.places.length}` },
    { label: "Coda nodes", value: `${CHAPTER.events.filter((event) => event.coda).length}` },
    {
      label: "No sourced map position",
      value: `${CHAPTER.events.filter((event) => event.placement.kind === "none").length} of ${CHAPTER.events.length} events`,
    },
  ]
</script>

<svelte:head>
  <title>Lekishi · Historical atlas</title>
  <meta
    name="description"
    content="Lekishi is an interactive historical atlas for exploring events and connections across places and time. It currently ships the reviewed {CHAPTER.title}."
  />
</svelte:head>

<div class="flex min-h-dvh flex-col bg-slate-950">
  <header
    class="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3 sm:px-6"
  >
    <a href="/" class="flex items-center gap-2.5" aria-label="Lekishi home">
      <img src="/images/logo.svg" width="24" alt="" />
      <span class="text-sm font-semibold tracking-tight text-slate-100">Lekishi</span>
    </a>
    <nav class="flex items-center gap-4 text-xs" aria-label="Primary">
      <a href="/" class="text-slate-100 transition hover:text-white" aria-current="page">Overview</a
      >
      <a href="/atlas" class="text-slate-300 transition hover:text-white">Atlas</a>
    </nav>
  </header>

  <main class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
    <section class="flex max-w-3xl flex-col gap-5">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
        Historical atlas
      </p>
      <h1 class="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        Explore events and connections across places and time
      </h1>
      <p class="text-base leading-relaxed text-slate-300">
        Lekishi is a browser atlas for reading history in place. The atlas now renders the first
        reviewed chapter — {CHAPTER.title} — from the versioned
        <code class="rounded bg-slate-900/80 px-1.5 py-0.5 text-[0.8em] text-slate-200"
          >lekishi-historical-contract/v0</code
        >
        records: real titles, dates, and places, with the uncertainty and the places it cannot locate
        stated rather than filled in. Search, sources, and story navigation are still being built.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <a
          href="/atlas"
          class="rounded-xl border border-amber-300/70 bg-amber-300/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        >
          Open the atlas
        </a>
        <span class="text-xs text-slate-400">Static build · no account · no server process</span>
      </div>
    </section>

    <section class="grid gap-4 sm:grid-cols-3">
      {#each capabilities as capability (capability.title)}
        <div class="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 class="text-sm font-semibold text-slate-100">{capability.title}</h2>
          <p class="mt-2 text-sm leading-relaxed text-slate-400">{capability.body}</p>
        </div>
      {/each}
    </section>

    <section class="rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5">
      <h2 class="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
        Reviewed chapter
      </h2>
      <p class="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{CHAPTER.summary}</p>
      <p class="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
        {CHAPTER.publication.coverageNote}
      </p>

      <dl class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {#each chapterFacts as fact (fact.label)}
          <div class="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
            <dt class="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {fact.label}
            </dt>
            <dd class="mt-0.5 text-sm font-semibold tabular-nums text-slate-100">{fact.value}</dd>
          </div>
        {/each}
      </dl>

      <p class="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300">
        {reviewLabel(CHAPTER.publication.independence, CHAPTER.publication.reviewer)}
      </p>
      <p class="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">{RELEASE.decision}</p>
      <!--
        The set's own review notes are shown as history, not as the current
        state: the frozen digest in the ledger means the set cannot be edited to
        say the approval was taken, so the page states the decision first and
        quotes the notes as preparation-time text.
      -->
      <blockquote
        class="mt-3 max-w-3xl rounded-r-lg border-l-2 border-slate-700 bg-slate-950/40 py-2 pr-3 pl-3"
      >
        <p class="text-xs font-semibold text-slate-300">{RELEASE.notesLead}</p>
        <p class="mt-1 text-xs leading-relaxed text-slate-400">
          {CHAPTER.publication.reviewNotes}
        </p>
      </blockquote>
      <p class="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
        Published by {CHAPTER.publication.setIds.join(", ")}. {RELEASE.caveats}
      </p>
    </section>

    <!--
      The comparison review entry point. The owner asked to inspect the bounded
      Qin fixture in the product, so the root page links the review route; the
      card keeps the route's own words (`Unapproved preparation`, and the review
      note) and sits below the reviewed chapter, so being findable cannot read
      as being a launch chapter or a release.
    -->
    <section
      id="comparison-review-card"
      class="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
    >
      <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Comparison review
          </h2>
          <p class="mt-2 text-base font-semibold text-slate-100">{COMPARISON_TITLE}</p>
          <p class="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-rose-300">
            {COMPARISON_REVIEW.label} · self-review only
          </p>
        </div>
        <a
          href="/compare/qin"
          class="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
        >
          Open the comparison review
        </a>
      </div>
      <p class="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
        {COMPARISON_REVIEW.note}
      </p>
      <p class="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
        {windowLabel(COMPARISON_COVERAGE.defaultWindow)}. The same atlas workspace with BCE years
        and the published dispute, but not a launch chapter: no route, territory, or historical
        coordinate is shown for the fixture's events.
      </p>
    </section>
  </main>

  <footer class="border-t border-slate-800 px-4 py-4 text-xs text-slate-500 sm:px-6">
    <p>
      Globe: CesiumJS (Apache-2.0) · Imagery: Natural Earth II, shipped with Cesium · Terrain:
      ellipsoid, no Cesium ion account
    </p>
  </footer>
</div>
