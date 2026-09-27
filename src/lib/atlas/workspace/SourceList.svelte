<script lang="ts">
  import type { Source } from "../domain"
  import { licenseLabel, sourceKindLabel } from "../labels"

  /**
   * The chapter's published sources.
   *
   * This is where a reader sees what the chapter's claims rest on: the source as
   * the record names it, its kind and edition, the record's own attribution and
   * licence, and the recorded identifier when there is one. The atlas states the
   * record's terms and does not restate or upgrade them, and it links only the
   * identifier the record carries.
   */
  let {
    sources,
    citedSourceIds,
  }: {
    sources: readonly Source[]
    /** The sources the selected event cites, so the panel can mark them. */
    citedSourceIds?: readonly string[]
  } = $props()

  const cited = $derived(new Set(citedSourceIds ?? []))
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2">
  <ul
    class="flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto pr-1"
    data-testid="atlas-sources"
  >
    {#each sources as source (source.id)}
      <li
        data-testid="atlas-source"
        data-source-id={source.id}
        class={[
          "rounded-lg border px-3 py-2",
          cited.has(source.id)
            ? "border-amber-300/60 bg-amber-300/5"
            : "border-slate-700/70 bg-slate-900/60",
        ]}
      >
        <p class="text-sm font-medium leading-snug text-slate-100">{source.title}</p>
        <p class="mt-1 text-[0.7rem] leading-snug text-slate-400">
          {sourceKindLabel(source.kind)}{#if source.edition}
            · {source.edition}{/if} · {licenseLabel(source.licenseId)}
        </p>
        {#if source.attribution}
          <p class="mt-1 text-[0.7rem] leading-snug text-slate-400">{source.attribution}</p>
        {/if}
        {#if source.url}
          <a
            href={source.url}
            rel="noreferrer noopener"
            target="_blank"
            class="mt-1 inline-block break-all text-[0.7rem] text-sky-300 underline decoration-sky-300/40 underline-offset-2 transition hover:text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          >
            {source.url}
          </a>
        {/if}
      </li>
    {/each}
  </ul>
</div>
