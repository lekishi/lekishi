<script lang="ts">
  import { onMount } from "svelte"
  import { releaseWorkspace, startAtlasPage } from "$lib/atlas/entry"
  import { CHAPTER } from "$lib/atlas/chapter-content"
  import { chapterPresentation } from "$lib/atlas/chapters"

  /**
   * The atlas shell.
   *
   * SvelteKit owns the route, the page, and the `#atlas-workspace` mount point.
   * Everything inside the mount point belongs to the Svelte workspace, which is
   * the single owner of atlas selection, time, and camera-follow state (RFD 3).
   *
   * The shell is prerendered, so a direct request for `/atlas` returns real HTML
   * before any JavaScript runs. `startAtlasPage` is the one module that mounts a
   * workspace; it refuses to mount a second one, and the teardown here plus the
   * bootstrap's own `pagehide`/`pageshow` handling keeps a restored page at
   * exactly one workspace. The mount and its cleanup live in `onMount` so
   * nothing touches the DOM while the shell is rendered on the server.
   *
   * The page names the chapter it renders, and its metadata comes from the
   * content's own summary through the projection, so the title cannot drift from
   * what the workspace shows. The display name is the chapter card's name
   * (`chapters.ts`), so a reader arriving from the root page finds the same
   * chapter named the same way.
   */
  const chapterName = chapterPresentation(CHAPTER.id)?.name ?? CHAPTER.title

  onMount(() => {
    startAtlasPage(CHAPTER, "production", chapterName)

    return () => releaseWorkspace()
  })
</script>

<svelte:head>
  <title>{chapterName} · Atlas · Lekishi</title>
  <meta
    name="description"
    content="The Lekishi atlas: {CHAPTER.summary} {CHAPTER.publication.coverageNote}"
  />
</svelte:head>

<div class="flex h-dvh min-h-0 flex-col bg-slate-950">
  <header
    class="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950 px-4 py-2.5"
  >
    <a href="/" class="flex items-center gap-2.5">
      <img src="/images/logo.svg" width="24" alt="" />
      <span class="text-sm font-semibold tracking-tight text-slate-100">Lekishi</span>
    </a>
    <nav class="flex items-center gap-4 text-xs" aria-label="Primary">
      <a href="/" class="text-slate-300 transition hover:text-white">Overview</a>
    </nav>
  </header>

  <main class="relative min-h-0 flex-1">
    <!-- The workspace owns everything inside this element; see $lib/atlas/entry. -->
    <div id="atlas-workspace" class="h-full w-full"></div>
  </main>
</div>
