<script lang="ts">
  import { page } from "$app/state"
  import { CHAPTERS } from "$lib/atlas/chapters"
  import { windowLabel } from "$lib/atlas/labels"
  import SearchDialog from "$lib/atlas/navigation/SearchDialog.svelte"
  import { Icon, focusRing, transition } from "$lib/ui"

  /**
   * The not-found page (RFD 5, "Not found"): say plainly that the address is
   * not part of the atlas, then offer the two ways on, search and the
   * chapters, rather than a dead end.
   */
  let { status, error }: { status: number; error: { message: string } | null } = $props()

  let searchOpen = $state(false)
</script>

<svelte:head>
  <title>{status === 404 ? "Not found" : status} · Lekishi</title>
</svelte:head>

<main
  class="flex min-h-dvh flex-col items-center justify-center bg-abyss px-4 py-12 font-interface text-ink"
>
  <div class="w-full max-w-lg">
    <a
      href="/"
      class={[
        "inline-flex items-center gap-2 rounded-control font-display text-body-sm font-semibold tracking-wide text-ink-dim no-underline hover:text-ink",
        transition,
        focusRing,
      ]}
    >
      <img src="/images/logo.svg" width="22" height="22" alt="" />LEKISHI
    </a>
    <p class="mt-10 text-label font-semibold uppercase text-gold">{status}</p>
    <h1 class="mt-2 font-display text-title text-ink">
      {status === 404 ? "This page is not part of the atlas" : "Something went wrong"}
    </h1>
    <p class="mt-2 text-body-sm text-ink-dim">
      {status === 404
        ? "The address may be mistyped, or older than the site's chapters."
        : (error?.message ?? "The page could not be rendered.")}
    </p>
    <p class="mt-1 truncate text-caption text-ink-faint">{page.url.pathname}</p>

    <button
      type="button"
      onclick={() => (searchOpen = true)}
      class={[
        "mt-6 flex h-12 w-full cursor-text items-center gap-3 rounded-plate border border-frame bg-lacquer px-4 text-left hover:border-gold",
        transition,
        focusRing,
      ]}
    >
      <Icon name="search" size={18} class="text-gold" />
      <span class="text-body-sm text-ink-faint">Search the atlas</span>
    </button>

    <h2 class="mt-8 text-label font-semibold uppercase text-ink-dim">Chapters</h2>
    <ul class="mt-2 flex flex-col gap-2">
      {#each CHAPTERS as chapter (chapter.id)}
        <li>
          <a
            href={chapter.href}
            class={[
              "group flex items-baseline gap-3 rounded-plate border border-rule bg-lacquer px-4 py-3 no-underline hover:border-frame",
              transition,
              focusRing,
            ]}
          >
            <span class="min-w-0 flex-1 truncate font-serif text-body text-ink group-hover:text-gold-bright"
              >{chapter.name}</span
            >
            <span class="shrink-0 text-caption text-ink-dim tabular-nums"
              >{windowLabel(chapter.window)}</span
            >
          </a>
        </li>
      {/each}
    </ul>
  </div>
</main>

<SearchDialog open={searchOpen} onClose={() => (searchOpen = false)} />
