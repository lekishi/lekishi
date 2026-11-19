<script lang="ts">
  import type { Snippet } from "svelte"
  import { Button, Icon, Logo, focusRing, transition } from "$lib/ui"
  import SearchDialog from "./SearchDialog.svelte"

  const doors = [
    { href: "/", text: "Home", icon: "sources" },
    { href: "/time", text: "Time", icon: "timeline" },
    { href: "/world", text: "World", icon: "globe" },
    { href: "/places", text: "Places", icon: "pin" },
  ] as const

  let {
    current,
    viewport = false,
    children,
  }: {
    current: (typeof doors)[number]["href"] | "/about"
    /** Time's chart scrolls inside the space left by both bars. */
    viewport?: boolean
    children: Snippet<[(text?: string) => void]>
  } = $props()
  let open = $state(false)
  let query = $state("")

  function search(text = "") {
    query = text
    open = true
  }

  function shortcut(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.key !== "/" ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      open
    )
      return
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false']), dialog[open]",
      )
    )
      return
    event.preventDefault()
    search()
  }
</script>

<svelte:window onkeydown={shortcut} />

<div
  class={[
    "flex flex-col bg-abyss font-interface text-ink pb-[calc(3.5rem+1px+env(safe-area-inset-bottom))] min-[800px]:pb-0",
    viewport ? "h-dvh" : "min-h-dvh",
  ]}
>
  <header class="sticky top-0 z-(--z-chrome) shrink-0 border-b border-rule bg-lacquer">
    <div class="mx-auto flex min-h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 min-[800px]:gap-6">
      <a
        href="/"
        aria-label="Lekishi home"
        aria-current={current === "/" ? "page" : undefined}
        class={["inline-flex h-11 items-center rounded-control", focusRing]}
      >
        <span class="flex sm:hidden"><Logo size={22} wordmark="caps" /></span>
        <span class="hidden sm:flex"><Logo size={22} wordmark="bilingual" /></span>
      </a>
      <nav aria-label="Primary" class="hidden self-stretch min-[800px]:flex">
        {#each doors.slice(1) as { href, text } (href)}
          {@render desktopLink(href, text)}
        {/each}
      </nav>
      <button
        type="button"
        aria-label="Search"
        aria-keyshortcuts="/"
        aria-haspopup="dialog"
        onclick={() => search()}
        class={[
          "ml-auto hidden h-9 max-w-80 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-control border border-rule bg-abyss px-3 text-left text-body-sm text-ink-dim hover:border-frame hover:text-ink min-[800px]:flex",
          focusRing,
          transition,
        ]}
      >
        <Icon name="search" />
        <span class="flex-1 truncate">Search people, places, years</span>
        <kbd
          aria-hidden="true"
          class="rounded-control border border-rule px-2 text-caption text-ink-faint">/</kbd
        >
      </button>
      <div class="hidden self-stretch min-[800px]:flex">
        {@render desktopLink("/about", "About")}
      </div>
      <div class="ml-auto flex items-center gap-1 min-[800px]:hidden">
        <Button
          variant="icon"
          icon="search"
          label="Search"
          class="size-11"
          onclick={() => search()}
        />
        <a
          href="/about"
          aria-label="About"
          aria-current={current === "/about" ? "page" : undefined}
          class={[
            "grid size-11 place-items-center rounded-control hover:bg-lacquer-raised hover:text-ink",
            current === "/about" ? "text-gold" : "text-ink-dim",
            focusRing,
            transition,
          ]}
        >
          <Icon name="about" size={20} />
        </a>
      </div>
    </div>
  </header>

  <div class="min-h-0 flex-1">{@render children(search)}</div>

  <nav
    aria-label="Primary"
    class="fixed inset-x-0 bottom-0 z-(--z-chrome) grid grid-cols-4 border-t border-rule bg-lacquer pb-[env(safe-area-inset-bottom)] min-[800px]:hidden"
  >
    {#each doors as { href, text, icon } (href)}
      <a
        {href}
        aria-current={current === href ? "page" : undefined}
        class={[
          "flex h-14 flex-col items-center justify-center gap-1 rounded-control text-caption hover:bg-lacquer-raised hover:text-ink",
          current === href ? "font-semibold text-gold" : "text-ink-dim",
          focusRing,
          "focus-visible:-outline-offset-2",
          transition,
        ]}
      >
        <Icon name={icon} size={20} />{text}
      </a>
    {/each}
  </nav>
</div>

{#snippet desktopLink(href: string, text: string)}
  <a
    {href}
    aria-current={current === href ? "page" : undefined}
    class={[
      "inline-flex items-center border-b-2 px-3 text-body-sm hover:text-ink",
      current === href ? "border-gold font-semibold text-gold" : "border-transparent text-ink-dim",
      focusRing,
      "focus-visible:-outline-offset-2",
      transition,
    ]}>{text}</a
  >
{/snippet}

<SearchDialog {open} bind:query onClose={() => (open = false)} />
