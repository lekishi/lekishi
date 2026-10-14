<script lang="ts" module>
  import type { SearchIndex } from "../search-index"

  // One fetch per page load: the index is a static file, and a reader who
  // opens search twice should not wait twice.
  let cached: Promise<SearchIndex> | null = null

  function loadIndex(): Promise<SearchIndex> {
    cached ??= fetch("/search-index.json").then((response) => {
      if (!response.ok) throw new Error(`search index: ${response.status}`)
      return response.json() as Promise<SearchIndex>
    })
    cached.catch(() => (cached = null))
    return cached
  }
</script>

<script lang="ts">
  import { Badge, Dialog, Icon, focusRing, transition } from "$lib/ui"
  import {
    entryYear,
    kindLabel,
    searchIndex,
    type SearchEntry,
    type SearchHit,
  } from "../search-index"

  /**
   * Search (RFD 5, "Search"): one field for every chapter, opened with `/`
   * from anywhere. Results are grouped by chapter, the current chapter first;
   * a name match comes before a match in a record's text, and the row says
   * which text matched, so a reader is never shown a result without knowing
   * why. The index is the prerendered `/search-index.json`, fetched the first
   * time the dialog opens: nothing is searched on a server.
   *
   * Every result is a real link to the chapter URL that opens it, so a result
   * can be opened in a new tab. A result in the chapter already open is handed
   * to `onOpenHere` instead, so the workspace moves to it without a page load.
   */
  let {
    open,
    current = null,
    currentName = null,
    onClose,
    onOpenHere,
  }: {
    open: boolean
    /** The open chapter's id, or null outside a chapter. */
    current?: string | null
    currentName?: string | null
    onClose: () => void
    onOpenHere?: (entry: SearchEntry) => void
  } = $props()

  const SUGGESTIONS = ["鑒眞", "秋妻屋浦", "Tōdai-ji", "韓非", "新鄭", "754"]

  let index: SearchIndex | null = $state.raw(null)
  let failed = $state(false)
  let query = $state("")
  let scope = $state<"chapter" | "all">("all")
  let active = $state(0)
  let input: HTMLInputElement | undefined = $state()
  let list: HTMLElement | undefined = $state()

  $effect(() => {
    if (!open || index !== null) return
    failed = false
    loadIndex().then(
      (loaded) => (index = loaded),
      () => (failed = true),
    )
  })

  $effect(() => {
    if (open) {
      // The dialog moves focus to its first control; the field is that
      // control, and it should also select a previous query to replace it.
      queueMicrotask(() => input?.select())
    }
  })

  const groups = $derived(
    index === null
      ? []
      : searchIndex(index, query, {
          current,
          scope: scope === "chapter" ? current : null,
        }),
  )
  const hits = $derived(groups.flatMap((group) => group.hits))
  const activeHit: SearchHit | undefined = $derived(hits[Math.min(active, hits.length - 1)])

  $effect(() => {
    void query
    void scope
    active = 0
  })

  $effect(() => {
    list?.querySelector(`[data-hit="${active}"]`)?.scrollIntoView?.({ block: "nearest" })
  })

  function choose(hit: SearchHit, event?: MouseEvent) {
    if (hit.entry.chapterId === current && onOpenHere) {
      event?.preventDefault()
      onOpenHere(hit.entry)
    }
    onClose()
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      active = hits.length === 0 ? 0 : (active + step + hits.length) % hits.length
    } else if (event.key === "Enter" && activeHit) {
      event.preventDefault()
      const link = list?.querySelector<HTMLAnchorElement>(`[data-hit="${active}"]`)
      // A click on the real link keeps the router's handling of it.
      if (link) link.click()
      else choose(activeHit)
    }
  }

  const ICON = {
    chapter: "globe",
    event: "calendar",
    place: "attested",
    person: "party",
    state: "institution",
    step: "list",
  } as const
</script>

<Dialog
  {open}
  id="search-dialog"
  labelledby="search-dialog-title"
  placement="top"
  onclose={onClose}
  class="w-[44rem]"
>
  <div class="flex max-h-[min(36rem,calc(100dvh-14dvh-1.5rem))] flex-col">
    <h2 id="search-dialog-title" class="sr-only">Search the atlas</h2>
    <div class="flex shrink-0 items-center gap-2 border-b border-rule px-4">
      <Icon name="search" size={18} class="text-gold" />
      <input
        bind:this={input}
        bind:value={query}
        onkeydown={keydown}
        id="search-dialog-input"
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls="search-dialog-results"
        aria-activedescendant={activeHit ? `search-hit-${active}` : undefined}
        aria-autocomplete="list"
        autocomplete="off"
        spellcheck="false"
        placeholder="A person, a place, an event or a year"
        class="h-14 min-w-0 flex-1 bg-transparent font-serif text-title-sm text-ink placeholder:font-interface placeholder:text-body placeholder:text-ink-faint focus:outline-none"
      />
      <kbd
        class="hidden rounded-control border border-rule px-1.5 py-0.5 text-caption text-ink-faint sm:inline"
        >Esc</kbd
      >
    </div>

    {#if current}
      <div
        role="radiogroup"
        aria-label="Search in"
        class="flex shrink-0 items-center gap-1 border-b border-rule px-3 py-1.5"
      >
        {#each [["all", "All chapters"], ["chapter", currentName ?? "This chapter"]] as const as [value, label] (value)}
          <button
            type="button"
            role="radio"
            aria-checked={scope === value}
            onclick={() => (scope = value)}
            class={[
              "max-w-[16rem] truncate rounded-full px-2.5 py-0.5 text-caption font-semibold",
              transition,
              focusRing,
              scope === value
                ? "bg-gold-tint text-gold-bright"
                : "text-ink-dim hover:bg-lacquer-raised hover:text-ink",
            ]}>{label}</button
          >
        {/each}
      </div>
    {/if}

    <div class="flex min-h-0 flex-1">
      <div
        bind:this={list}
        id="search-dialog-results"
        role="listbox"
        aria-label="Results"
        class="min-h-0 min-w-0 flex-1 overflow-y-auto py-2"
      >
        {#if failed}
          <p class="px-4 py-6 text-body-sm text-ink-dim" role="alert">
            The search index did not load. Check the connection and open search again.
          </p>
        {:else if index === null && open}
          <p class="px-4 py-6 text-body-sm text-ink-dim" aria-busy="true">Loading the index…</p>
        {:else if query.trim() === ""}
          <div class="px-4 py-4">
            <p class="text-label font-semibold uppercase text-ink-dim">Try</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each SUGGESTIONS as suggestion (suggestion)}
                <button
                  type="button"
                  onclick={() => {
                    query = suggestion
                    input?.focus()
                  }}
                  class={[
                    "rounded-full border border-frame px-3 py-1 font-serif text-body-sm text-ink hover:border-gold hover:text-gold-bright",
                    transition,
                    focusRing,
                  ]}>{suggestion}</button
                >
              {/each}
            </div>
            <p class="mt-4 text-caption text-ink-faint">
              Names match in any published form: 鑒眞, Jianzhen and Ganjin find the same person.
            </p>
          </div>
        {:else if groups.length === 0}
          <p class="px-4 py-6 text-body-sm text-ink-dim" data-testid="search-empty">
            Nothing in the published records matches “{query}”.
          </p>
        {:else}
          {#each groups as group (group.chapter.id)}
            <section aria-label={group.chapter.name} class="pb-2">
              <h3
                class="sticky top-0 z-(--z-chrome) flex items-baseline gap-2 bg-lacquer px-4 py-1.5 text-label font-semibold uppercase text-ink-dim"
              >
                <span class="truncate">{group.chapter.name}</span>
                <span class="font-normal tracking-normal text-ink-faint tabular-nums"
                  >{group.chapter.window}</span
                >
                {#if group.chapter.id === current}
                  <span class="font-normal tracking-normal text-gold">· open</span>
                {/if}
              </h3>
              {#each group.hits as hit (hit.entry.kind + hit.entry.id)}
                {@const at = hits.indexOf(hit)}
                <a
                  href={hit.entry.href}
                  id="search-hit-{at}"
                  data-hit={at}
                  data-testid="search-hit"
                  role="option"
                  aria-selected={at === active}
                  tabindex="-1"
                  onclick={(event) => choose(hit, event)}
                  onpointermove={() => (active = at)}
                  class={[
                    "mx-2 flex items-start gap-3 rounded-control px-2 py-2 no-underline",
                    transition,
                    at === active ? "bg-lacquer-raised" : "hover:bg-lacquer-raised",
                  ]}
                >
                  <Icon
                    name={ICON[hit.entry.kind]}
                    size={16}
                    class="mt-0.5 {at === active ? 'text-gold-bright' : 'text-ink-faint'}"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="flex items-baseline gap-2">
                      <span
                        class={[
                          "min-w-0 truncate font-serif text-body",
                          at === active ? "text-gold-bright" : "text-ink",
                        ]}>{hit.entry.title}</span
                      >
                      {#if hit.entry.disputed}<Badge kind="disputed" text="disputed" />{/if}
                    </span>
                    <span class="block truncate text-caption text-ink-dim">
                      {kindLabel(hit.entry.kind)}{hit.entry.detail ? ` · ${hit.entry.detail}` : ""}
                    </span>
                    {#if hit.match === "text"}
                      <span class="block truncate text-caption text-ink-faint"
                        >matched “{hit.matchedText}”</span
                      >
                    {/if}
                  </span>
                  {#if entryYear(hit.entry)}
                    <span class="shrink-0 text-caption text-ink-faint tabular-nums"
                      >{entryYear(hit.entry)}</span
                    >
                  {/if}
                </a>
              {/each}
            </section>
          {/each}
        {/if}
      </div>

      {#if activeHit && query.trim() !== ""}
        <aside
          aria-label="Preview"
          class="hidden w-60 shrink-0 flex-col gap-2 border-l border-rule px-4 py-3 md:flex"
        >
          <p class="text-label font-semibold uppercase text-gold">
            {kindLabel(activeHit.entry.kind)}
          </p>
          <p class="font-serif text-title-sm text-ink">{activeHit.entry.title}</p>
          {#if activeHit.entry.detail}
            <p class="text-body-sm text-ink-dim">{activeHit.entry.detail}</p>
          {/if}
          {#if activeHit.entry.names.length > 1}
            <p class="font-serif text-body-sm text-ink-dim">
              {activeHit.entry.names.slice(0, 4).join(" · ")}
            </p>
          {/if}
          <p class="mt-auto flex items-center gap-1 text-caption text-ink-faint">
            <kbd class="rounded-control border border-rule px-1">↵</kbd> to open
            <kbd class="ml-1 rounded-control border border-rule px-1">↑↓</kbd> to move
          </p>
        </aside>
      {/if}
    </div>
  </div>
</Dialog>
