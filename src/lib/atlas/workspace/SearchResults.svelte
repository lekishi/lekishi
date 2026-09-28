<script lang="ts">
  import type { SceneSearchResult } from "../scene"
  import EventRow from "./EventRow.svelte"

  /**
   * Search results.
   *
   * A result is an event the query matched, in the chapter's whole story rather
   * than only the selected window: a reader who searches for a name has to find
   * it. A result outside the window says so on its row, and selecting it keeps its
   * details with the outside-window notice — the atlas does not pretend the
   * window contains it.
   */
  let {
    query,
    results,
    onSelect,
    onClear,
  }: {
    query: string
    results: readonly SceneSearchResult[]
    onSelect: (eventId: string) => void
    onClear: () => void
  } = $props()
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2">
  <div class="flex items-baseline justify-between gap-2">
    <h2 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
      {results.length}
      {results.length === 1 ? "result" : "results"}
    </h2>
    <button
      id="atlas-search-clear"
      type="button"
      onclick={onClear}
      class="rounded-lg border border-slate-700 px-2 py-0.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
    >
      Clear search
    </button>
  </div>

  <ul
    class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1"
    data-testid="atlas-search-results"
  >
    {#if results.length === 0}
      <li
        data-testid="atlas-search-empty"
        class="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-400"
      >
        No published event in this chapter matches “{query}”. The search covers the chapter's event
        titles and summaries, its places and participants under the names the records publish, and
        its sources' locators.
      </li>
    {/if}
    {#each results as result (result.event.id)}
      <li>
        <EventRow event={result.event} matchedText={result.matchedText} {onSelect} />
      </li>
    {/each}
  </ul>
</div>
