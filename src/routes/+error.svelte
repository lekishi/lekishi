<script lang="ts">
  import { page } from "$app/state"
  import { CHAPTERS } from "$lib/atlas/chapters"
  import { windowLabel } from "$lib/atlas/labels"
  import { memberHinted, signInHref } from "$lib/atlas/members"
  import { onMount } from "svelte"
  import SearchDialog from "$lib/atlas/navigation/SearchDialog.svelte"
  import { Icon, Logo, focusRing, transition } from "$lib/ui"

  /**
   * The not-found page (RFD 5, "Not found"): say plainly that the address is
   * not part of the atlas, then offer the two ways on, search and the
   * chapters, rather than a dead end.
   */
  // SvelteKit gives an error page no props: the status and the error are the
  // page state's. The worker renders this page for a chapter address it does
  // not serve (RFD 6), so it must read them there.
  const status = $derived(page.status)
  const error = $derived(page.error)

  let searchOpen = $state(false)

  // A chapter address that is not found may be a draft the published site
  // shows only to signed-in members (RFD 6). The page cannot say which without
  // telling a stranger that a draft exists, so it offers the sign-in to anyone
  // not signed in, on chapter addresses only.
  let member = $state(true)
  onMount(() => (member = memberHinted()))
  const chapterAddress = $derived(status === 404 && page.url.pathname.startsWith("/chapters/"))
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
        "inline-flex items-center rounded-control text-ink-dim no-underline hover:text-ink",
        transition,
        focusRing,
      ]}
      aria-label="Lekishi home"
    >
      <Logo size={22} wordmark="bilingual" />
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
    {#if chapterAddress && !member}
      <p class="mt-3 text-body-sm text-ink-dim">
        Members of the lekishi organization can
        <a
          class={[
            "rounded-control text-gold underline decoration-rule underline-offset-2 hover:text-gold-bright",
            transition,
            focusRing,
          ]}
          href={signInHref(page.url.pathname + page.url.search)}
          data-sveltekit-reload>sign in</a
        > to see drafts.
      </p>
    {/if}

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
            <span
              class="min-w-0 flex-1 truncate font-serif text-body text-ink group-hover:text-gold-bright"
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
