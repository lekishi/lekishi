<script lang="ts">
  import { onMount } from "svelte"
  import { openedAgo, savedStop, type HomeChapter } from "$lib/atlas/home"
  import { windowLabel } from "$lib/atlas/labels"
  import { loadDraftCards, memberHinted, signInHref } from "$lib/atlas/members"
  import { recentPositions, type Position } from "$lib/atlas/memory"
  import HomeText from "$lib/atlas/navigation/HomeText.svelte"
  import HomeTime from "$lib/atlas/navigation/HomeTime.svelte"
  import SiteFrame from "$lib/atlas/navigation/SiteFrame.svelte"
  import { REGIONS, regionOf, type RegionKey } from "$lib/historical/regions"
  import { Button, Plate, focusRing, transition } from "$lib/ui"
  import type { PageProps } from "./$types"

  let { data }: PageProps = $props()
  let positions = $state.raw<Position[]>([])
  let drafts = $state.raw<HomeChapter[]>([])
  let member = $state(false)
  let now = $state(0)

  onMount(() => {
    now = Date.now()
    positions = recentPositions()
    member = memberHinted()
    if (member) void loadDraftCards().then((loaded) => (drafts = loaded))
  })

  const cards = $derived([...data.chapters, ...drafts])
  const byId = $derived(new Map(cards.map((chapter) => [chapter.id, chapter])))
  const saved = $derived(
    positions
      .flatMap((position) => {
        const chapter = byId.get(position.chapterId)
        return chapter ? [{ chapter, position }] : []
      })
      .slice(0, 4),
  )
  const resume = $derived(saved[0])
  const recent = $derived(saved.slice(1))
  const steps = (chapter: HomeChapter) => chapter.stories[0]?.captions.length ?? 0
  const starters = $derived(cards.toSorted((a, b) => steps(b) - steps(a)).slice(0, 3))
  const groups = $derived(
    REGIONS.map((region) => ({
      ...region,
      chapters: cards
        .filter((chapter) => chapter.region === region.key)
        .toSorted((a, b) => a.window.start - b.window.start),
    })),
  )
  const peak = $derived(Math.max(1, ...data.world.turns.map(({ events }) => events)))
  const regionColor = (key: RegionKey) => `var(--color-region-${key})`
  const footerLink = [
    "inline-flex min-h-8 items-center rounded-control text-ink-dim underline decoration-rule underline-offset-2 hover:text-ink",
    transition,
    focusRing,
  ]
</script>

<svelte:head>
  <title>Lekishi · Historical atlas</title>
  <meta
    name="description"
    content="Follow events across places and time in Lekishi, a historical atlas."
  />
</svelte:head>

{#snippet dot(key: RegionKey)}
  <span
    class="inline-block size-2 shrink-0 rounded-full"
    style:background={regionColor(key)}
    aria-hidden="true"
  ></span>
{/snippet}

{#snippet draft(chapter: HomeChapter)}
  {#if chapter.draft}
    <span
      data-chapter-draft
      class="rounded-control border border-current px-1 font-interface text-caption text-danger"
      title={chapter.status}>Draft</span
    >
  {/if}
{/snippet}

{#snippet meta(chapter: HomeChapter)}
  <span class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-dim">
    {@render dot(chapter.region)}
    <span
      >{regionOf(chapter.region).name} ·
      <span class="tabular-nums">{windowLabel(chapter.window)}</span></span
    >
    {@render draft(chapter)}
  </span>
{/snippet}

<SiteFrame current="/">
  <main
    class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-4 pb-12 min-[800px]:gap-8 min-[800px]:px-8 min-[800px]:pt-6"
  >
    <h1 class="sr-only">Lekishi</h1>
    <!-- The prerendered start state and the hydrated reader share one slot.
         Reserve the taller phone layout without moving World during hydration. -->
    <div
      class="min-h-136 max-[359px]:min-h-144 min-[800px]:min-h-68 min-[1100px]:min-h-64"
      data-testid="home-reading-slot"
    >
      {#if resume}
        {@const chapter = resume.chapter}
        {@const stop = savedStop(chapter, resume.position)}
        {@const hasStill = chapter.id === data.stills.chapterId}
        <section
          class="flex min-w-0 flex-col gap-2"
          aria-labelledby="continue-heading"
          data-testid="home-resume"
        >
          <div class="flex min-h-8 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="continue-heading" class="font-display text-title-sm">Continue</h2>
            <span class="text-caption text-ink-dim">kept on this device only</span>
          </div>
          <div
            class={[
              "grid grid-cols-1 items-start gap-3",
              recent.length > 0 && "min-[800px]:grid-cols-[7fr_5fr]",
            ]}
          >
            <div style:--region={regionColor(chapter.region)}>
              <Plate
                tone="solid"
                padded={false}
                class={[
                  "overflow-hidden border-l-4 border-l-(--region)",
                  hasStill && "grid min-[800px]:grid-cols-[minmax(0,30%)_minmax(0,1fr)]",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {#if hasStill}
                  <!-- An opening view of this chapter, not a snapshot of the saved stop. -->
                  <div class="relative h-20 min-[800px]:h-auto">
                    <img
                      src="/home/tang-mission.jpg"
                      alt=""
                      width="825"
                      height="390"
                      class="absolute inset-0 size-full object-cover"
                    />
                  </div>
                {/if}
                <div class="flex min-w-0 max-w-xl flex-col gap-2 px-4 py-3">
                  {@render meta(chapter)}
                  <h3 class="line-clamp-2 font-serif text-title">
                    <HomeText text={chapter.name} />
                  </h3>
                  <p class="line-clamp-1 text-body-sm text-ink-dim tabular-nums" title={stop.label}>
                    <HomeText text={stop.label} />
                  </p>
                  {#if stop.step !== undefined}
                    <div
                      class="h-1 max-w-lg overflow-hidden rounded-control bg-rule"
                      role="progressbar"
                      aria-label="Story progress"
                      aria-valuenow={stop.step}
                      aria-valuemax={stop.total}
                      aria-valuemin={0}
                    >
                      <div
                        class="h-full bg-gold"
                        style:width={`${(stop.step / stop.total) * 100}%`}
                      ></div>
                    </div>
                  {/if}
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Button
                      variant="primary"
                      icon="arrow-right"
                      href={`${chapter.href}${resume.position.search}`}
                      data-testid="home-continue"
                      class="tabular-nums"
                    >
                      {stop.step === undefined ? "Resume" : `Resume at step ${stop.step}`}
                    </Button>
                    <span class="text-caption text-ink-dim tabular-nums"
                      >opened {openedAgo(resume.position.at, now)}</span
                    >
                  </div>
                  {#if stop.next}
                    <div class="flex items-baseline gap-2 border-t border-rule pt-2 text-ink-dim">
                      <span class="text-label font-semibold uppercase">Next</span>
                      <p class="line-clamp-1 text-body-sm" title={stop.next}>
                        <HomeText text={stop.next} />
                      </p>
                    </div>
                  {/if}
                </div>
              </Plate>
            </div>
            {#if recent.length > 0}
              <Plate tone="solid" padded={false} class="px-2 pt-3 pb-1">
                <h3 class="px-2 pb-2 text-label font-semibold uppercase text-ink-dim">
                  Recently opened
                </h3>
                <ul data-testid="home-recent" class="divide-y divide-rule border-t border-rule">
                  {#each recent as { chapter, position } (chapter.id)}
                    <li>
                      <a
                        href={`${chapter.href}${position.search}`}
                        class={[
                          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-control px-2 py-2 no-underline hover:bg-lacquer-raised",
                          transition,
                          focusRing,
                        ]}
                      >
                        {@render dot(chapter.region)}
                        <span class="min-w-0">
                          <span class="flex items-center gap-2"
                            ><span class="block truncate font-serif text-body-sm"
                              ><HomeText text={chapter.name} /></span
                            >{@render draft(chapter)}</span
                          >
                          <span
                            class="block truncate text-body-sm text-ink-dim"
                            title={position.label}><HomeText text={position.label} /></span
                          >
                        </span>
                        <span class="text-caption text-ink-dim tabular-nums"
                          >{openedAgo(position.at, now)}</span
                        >
                      </a>
                    </li>
                  {/each}
                </ul>
              </Plate>
            {/if}
          </div>
        </section>
      {:else}
        <section aria-labelledby="start-heading" class="flex min-w-0 flex-col gap-2">
          <div class="flex min-h-8 flex-wrap items-baseline gap-x-3">
            <h2 id="start-heading" class="font-display text-title-sm">Start with a chapter</h2>
            <span class="hidden text-caption text-ink-dim min-[800px]:inline"
              >the three longest stories</span
            >
            <Button href="/about" variant="ghost" icon="arrow-right" size="sm" class="ml-auto"
              >About Lekishi</Button
            >
          </div>
          <div class="grid grid-cols-1 gap-2 min-[800px]:grid-cols-3" data-testid="home-starters">
            {#each starters as chapter (chapter.id)}
              <a
                href={chapter.href}
                style:--region={regionColor(chapter.region)}
                class={[
                  "flex min-w-0 flex-col gap-1 rounded-plate border border-rule border-l-4 border-l-(--region) bg-lacquer px-3 py-3 no-underline shadow-sheet hover:bg-lacquer-raised",
                  transition,
                  focusRing,
                ]}
              >
                {@render meta(chapter)}
                <h3 class="line-clamp-2 font-serif text-title-sm">
                  <HomeText text={chapter.name} />
                </h3>
                <div class="flex-1">
                  <p class="line-clamp-2 font-serif text-body-sm text-ink-dim">
                    <HomeText text={chapter.summary} />
                  </p>
                </div>
                <span class="text-caption text-ink-dim tabular-nums"
                  >{steps(chapter)} steps · {chapter.places} places · {chapter.events} events</span
                >
              </a>
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <div class="grid grid-cols-1 gap-6 min-[1100px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section class="flex min-w-0 flex-col gap-2" aria-labelledby="world-heading">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <h2 id="world-heading" class="font-display text-title-sm">World</h2>
          <span class="text-caption text-ink-dim">the board, one turn a year</span>
          <Button href="/world" variant="ghost" icon="arrow-right" size="sm" class="ml-auto"
            >Open the world</Button
          >
        </div>
        <Plate tone="solid" class="relative isolate flex flex-1 flex-col gap-4 overflow-hidden">
          {#if data.stills.world}
            <img
              src="/home/world.jpg"
              alt=""
              width="700"
              height="310"
              loading="lazy"
              class="pointer-events-none absolute inset-0 -z-10 size-full object-cover opacity-40"
            />
          {/if}
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p class="text-label font-semibold uppercase text-gold">Turn</p>
              <p class="font-serif text-display text-gold-bright tabular-nums">{data.world.year}</p>
            </div>
            <Button
              href={`/world?year=${data.world.start}`}
              variant={resume ? "secondary" : "primary"}
              icon="play"
              class="tabular-nums">Play from {data.world.start}</Button
            >
          </div>
          <div
            class="flex flex-col gap-2 rounded-control border border-rule bg-lacquer-glass p-2 min-[1100px]:mt-auto min-[1100px]:grow"
          >
            <div
              role="img"
              aria-label={`Events per turn: ${data.world.turns.map(({ year, events }) => `${year}, ${events}${year === data.world.year ? " (shown turn)" : ""}`).join("; ")}`}
              class="flex h-16 max-h-40 min-h-16 items-end gap-1 min-[1100px]:grow"
            >
              {#each data.world.turns as turn (turn.year)}
                <span
                  title={`${turn.year}: ${turn.events} events`}
                  class={[
                    "relative min-h-0 flex-1 rounded-t-control",
                    turn.year === data.world.year ? "bg-gold" : "bg-ink-faint",
                  ]}
                  style:height={`${(turn.events / peak) * 100}%`}
                >
                  {#if turn.year === data.world.year}<span
                      class="absolute inset-x-0 -bottom-1 h-0.5 bg-gold"
                    ></span>{/if}
                </span>
              {/each}
            </div>
            <div class="flex justify-between text-caption text-ink-dim tabular-nums">
              <span>{data.world.start}</span><span>events per turn</span><span
                >{data.world.end}</span
              >
            </div>
            <ul class="flex flex-wrap gap-1" aria-label="Chapters alive this turn">
              {#each data.world.players as id (id)}
                {@const chapter = byId.get(id)}
                {#if chapter}
                  <li
                    class="inline-flex items-center gap-2 rounded-control border border-rule px-2 py-1 text-body-sm text-ink-dim"
                  >
                    {@render dot(chapter.region)}
                    <span><HomeText text={chapter.name} /></span>
                    {@render draft(chapter)}
                  </li>
                {/if}
              {/each}
            </ul>
          </div>
        </Plate>
      </section>

      <section class="flex min-w-0 flex-col gap-2" aria-labelledby="time-heading">
        <div class="flex flex-wrap items-baseline gap-x-2">
          <h2 id="time-heading" class="font-display text-title-sm">Time</h2>
          <span class="text-caption text-ink-dim tabular-nums"
            >{cards.length} chapters by region</span
          >
          <Button href="/time" variant="ghost" icon="arrow-right" size="sm" class="ml-auto"
            >Open the timeline</Button
          >
        </div>
        <HomeTime href="/time" {groups} />
      </section>
    </div>

    <section id="chapters" class="flex min-w-0 flex-col gap-2" aria-labelledby="chapters-heading">
      <div class="flex items-baseline gap-3">
        <h2 id="chapters-heading" class="font-display text-title-sm">Chapters</h2>
        <span class="text-caption text-ink-dim tabular-nums">{cards.length}, by region</span>
      </div>
      <div class="divide-y divide-rule border-y border-rule">
        {#each groups as region (region.key)}
          {#if region.chapters.length > 0}
            <div
              class="grid gap-2 py-3 min-[800px]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"
              data-region={region.key}
            >
              <h3 class="flex items-baseline gap-2 text-body-sm font-semibold">
                {@render dot(region.key)}
                <span>{region.name}</span><span
                  class="text-caption font-normal text-ink-dim tabular-nums"
                  >· {region.chapters.length}</span
                >
              </h3>
              <ul class="flex flex-wrap gap-2">
                {#each region.chapters as chapter (chapter.id)}
                  <li class="min-w-0" data-chapter-id={chapter.id}>
                    <a
                      href={chapter.href}
                      class={[
                        "inline-flex min-h-8 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 rounded-control border border-rule px-2 py-1 no-underline hover:border-frame hover:bg-lacquer-raised",
                        transition,
                        focusRing,
                      ]}
                    >
                      <span class="font-serif text-body-sm text-ink"
                        ><HomeText text={chapter.name} /></span
                      >
                      <span class="text-caption text-ink-dim tabular-nums"
                        >{windowLabel(chapter.window)}</span
                      >
                      {@render draft(chapter)}
                      {#if chapter.draft && chapter.status}
                        <span class="w-full text-caption text-ink-dim">{chapter.status}</span>
                      {/if}
                    </a>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        {/each}
      </div>
    </section>
  </main>

  <footer class="border-t border-rule text-caption text-ink-dim">
    <div
      class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 min-[800px]:px-8"
    >
      <p>Lekishi · a historical atlas</p>
      <a href="/about" class={footerLink}>About</a>
      <a href="/about#sources" class={footerLink}>Sources and attribution</a>
      {#if member}
        <form method="POST" action="/auth/logout">
          <button type="submit" class={[footerLink, "cursor-pointer"]}>Sign out</button>
        </form>
      {:else}
        <a href={signInHref("/")} class={footerLink} data-sveltekit-reload>Members sign in</a>
      {/if}
    </div>
  </footer>
</SiteFrame>
