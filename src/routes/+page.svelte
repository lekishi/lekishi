<script lang="ts">
  import { CHAPTERS } from "$lib/atlas/chapters"
  import { windowLabel } from "$lib/atlas/labels"

  /**
   * The static root page.
   *
   * It presents the chapters a reader can open — as peers, each with its own name,
   * story summary, and entry — and the project's non-negotiables stated where a
   * reviewer will actually read them. The page carries no application state, so it
   * is prerendered exactly as written.
   *
   * The cards come from `src/lib/atlas/chapters.ts`, whose tests pin them against
   * the chapter trees, so the page cannot describe a chapter the atlas does not
   * carry. Editorial state is secondary metadata on a card, never the card's pitch
   * and never its reason to exist: the Tang chapter's recorded owner approval and
   * the Qin chapter's missing release decision are stated in small print beside
   * the entry, and nothing here says a chapter exists for the internal treatment
   * comparison or names the contract records it is built from.
   */
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
      body: "Every claim keeps its citation, its date precision, its uncertainty, and its reuse terms beside the record it describes.",
    },
  ]
</script>

<svelte:head>
  <title>Lekishi · Historical atlas</title>
  <meta
    name="description"
    content="Lekishi is an interactive historical atlas for exploring events and connections across places and time, with the sources, the uncertainty, and the places it cannot locate kept visible."
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
        Lekishi is a browser atlas for reading history in place: real titles, dates, and places,
        with the uncertainty and the places it cannot locate stated rather than filled in.
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

    <section class="flex flex-col gap-4" aria-labelledby="chapters-heading">
      <h2
        id="chapters-heading"
        class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
      >
        Chapters
      </h2>
      <div class="grid gap-4 md:grid-cols-2">
        {#each CHAPTERS as chapter (chapter.id)}
          <article
            class="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-slate-700"
            data-chapter-id={chapter.id}
          >
            <h3 class="text-lg font-semibold tracking-tight text-slate-100">{chapter.name}</h3>
            <p class="mt-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {windowLabel(chapter.window)}
            </p>
            <p class="mt-3 flex-1 text-sm leading-relaxed text-slate-400">{chapter.summary}</p>
            <div class="mt-5">
              <a
                href={chapter.href}
                class="inline-block rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
              >
                Open the chapter<span class="sr-only">: {chapter.name}</span>
              </a>
            </div>
            <!--
              Editorial state: one line below the entry, in every card, so the two
              cards read alike and the status is never the card's identity.
              `text-slate-400` rather than a dimmer grey: the Qin card's line is
              the qualification that keeps a peer presentation from reading as
              approval, so it has to stay readable.
            -->
            <p class="mt-3 text-[0.7rem] leading-snug text-slate-400">{chapter.status}</p>
          </article>
        {/each}
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
  </main>

  <footer class="border-t border-slate-800 px-4 py-4 text-xs text-slate-500 sm:px-6">
    <p>
      Globe: CesiumJS (Apache-2.0) · Imagery: Natural Earth II, shipped with Cesium · Terrain:
      ellipsoid, no Cesium ion account
    </p>
  </footer>
</div>
