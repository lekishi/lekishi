<script lang="ts">
  import { untrack } from "svelte"
  import { releaseWorkspace, startAtlasPage } from "$lib/atlas/entry"

  /**
   * The workspace on the Wikidata snapshot, with nothing of the chapter route's
   * address handling: the page is for watching the atlas carry hundreds of
   * events, so it mounts the one workspace and releases it on teardown, as the
   * chapter route does, and leaves the address alone.
   */
  let { data } = $props()

  $effect(() => {
    const chapter = data.chapter
    if (chapter === null) return

    untrack(() =>
      startAtlasPage(chapter, {
        name: chapter.title,
        decision: "Unreviewed Wikidata items, for testing the atlas",
      }),
    )
    return () => releaseWorkspace()
  })
</script>

<svelte:head>
  <title>Wikidata before 100 CE · Lekishi</title>
  <meta name="description" content="Unreviewed Wikidata items, for stress-testing the atlas." />
  <meta name="robots" content="noindex" />
</svelte:head>

<main
  class="flex h-dvh min-h-0 flex-col overflow-hidden bg-abyss font-interface text-ink"
  data-dev-route="wikidata"
  data-dev-page="wikidata"
>
  <p
    class="flex shrink-0 items-center justify-center gap-2 border-b border-danger bg-lacquer px-4 py-1.5 text-center text-caption text-ink"
  >
    <span
      class="shrink-0 rounded-control border border-current px-1.5 text-label font-semibold uppercase text-danger"
    >
      Dev
    </span>
    <span
      >{data.chapter?.events.length ?? 0} unreviewed Wikidata items (CC0), not content<span
        class="max-sm:hidden">. Built on the dev server and previews only.</span
      ></span
    >
  </p>
  <div class="relative min-h-0 flex-1">
    <!-- The workspace owns everything inside this element; see $lib/atlas/entry. -->
    <div id="atlas-workspace" class="h-full w-full"></div>
  </div>
</main>
