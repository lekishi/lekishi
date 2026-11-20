<script lang="ts">
  import SiteFrame from "$lib/atlas/navigation/SiteFrame.svelte"
  import { Icon, Plate, focusRing, transition } from "$lib/ui"

  let { data } = $props()
  const ways = $derived([
    {
      href: "/time",
      title: "Time",
      icon: "timeline",
      description: "Every chapter as a bar, by region and year.",
    },
    {
      href: "/world",
      title: "World",
      icon: "globe",
      description: "The board, one turn a year, 750 to 762.",
    },
    {
      href: "/places",
      title: "Places",
      icon: "pin",
      description: `${data.sharedPlaces} ${data.sharedPlaces === 1 ? "place" : "places"} more than one chapter reaches.`,
    },
  ] as const)
  const link = [
    "rounded-control text-ink underline decoration-rule underline-offset-2 hover:decoration-current",
    focusRing,
    transition,
  ]
</script>

<svelte:head>
  <title>About · Lekishi</title>
  <meta
    name="description"
    content="How to explore Lekishi, read the campaign board and find the sources behind the stories."
  />
</svelte:head>

<SiteFrame current="/about">
  <main
    class="mx-auto flex w-full max-w-240 flex-col gap-8 px-4 py-8 text-body text-ink-dim sm:px-8 sm:py-12"
    aria-labelledby="about-title"
  >
    <header>
      <p class="text-label font-semibold uppercase text-ink-dim">About · a historical atlas</p>
      <h1 id="about-title" class="mt-2 font-display text-display text-balance text-ink">
        History, in the places it happened.
      </h1>
      <p class="mt-3 font-serif">
        {#if data.chapters > 0}
          {data.chapters}
          {data.chapters === 1 ? "chapter" : "chapters"}, each told on the ground where it happened,
          with its sources beside it.
        {:else}
          A historical atlas that tells each story where it happened, with its sources beside it.
        {/if}
      </p>
    </header>

    <section>
      <h2 class="mb-3 font-serif text-title text-ink">Three ways in</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        {#each ways as { href, title, icon, description } (href)}
          <a {href} class={["group rounded-plate", focusRing]}>
            <Plate tone="solid" class={["h-full group-hover:border-frame", transition].join(" ")}>
              <span class="flex items-center gap-2 font-serif text-title-sm"
                ><Icon name={icon} size={18} />{title}</span
              >
              <span class="mt-1 block text-body-sm text-ink-dim">{description}</span>
            </Plate>
          </a>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="mb-2 font-serif text-title text-ink">How to read the board</h2>
      <ul class="list-disc space-y-2 pl-5">
        <li>
          The land is drawn as hex tiles classed from today's imagery and elevation, not the land of
          the period.
        </li>
        <li>
          Lit hexes, towns and units mark where the story is; they are not territories, and a town's
          size claims nothing.
        </li>
        <li>Lines are schematic: they join dated stops, not a surveyed route.</li>
        <li>A diamond names an area; it asserts no site.</li>
      </ul>
    </section>

    <section id="sources" class="scroll-mt-16">
      <h2 class="mb-2 font-serif text-title text-ink">Sources and uncertainty</h2>
      <p>
        Every event names the sources it rests on. Where they disagree, the atlas tells it both ways
        and says so instead of merging them, and a contact two chapters share is kept apart from an
        influence someone inferred.
      </p>
    </section>

    <section>
      <h2 class="mb-2 font-serif text-title text-ink">On this device</h2>
      <p>
        The atlas remembers one position per chapter in this browser: the view you left, a short
        label and when you last opened it. Continue and Recently opened on Home read those
        positions. They are not sent to a server or synced between devices.
      </p>
      <p class="mt-2">
        Reading needs no account. If you sign in as a member, the site uses cookies to keep you
        signed in and show you draft chapters.
      </p>
    </section>

    <section>
      <h2 class="mb-2 font-serif text-title text-ink">Map data</h2>
      <p>
        Elevation: Terrain Tiles (Mapzen and contributors) · Land cover: ESA WorldCover 2021 (CC BY
        4.0) · Imagery: Natural Earth II · <a class={link} href="/globe/ATTRIBUTION.txt"
          >Full attribution</a
        >
      </p>
    </section>
  </main>
  <footer class="border-t border-rule bg-lacquer">
    <div
      class="mx-auto flex max-w-240 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-caption text-ink-dim sm:px-8"
    >
      <span class="mr-auto">Lekishi · a historical atlas</span>
      <a class={link} href="/about" aria-current="page">About</a>
      <a class={link} href="/about#sources">Sources and attribution</a>
    </div>
  </footer>
</SiteFrame>
