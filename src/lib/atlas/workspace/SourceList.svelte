<script lang="ts">
  import { Icon, focusRing, transition } from "$lib/ui"
  import type { Source } from "../domain"
  import { licenseLabel, sourceKindLabel } from "../labels"

  /**
   * The chapter's published sources: the source as the record names it, its
   * kind and edition, the record's own attribution and licence, and the
   * recorded identifier when there is one. The atlas states the record's terms
   * and does not restate or upgrade them. The sources the selection cites are
   * marked, and listed first.
   */
  let {
    sources,
    citedSourceIds = [],
  }: {
    sources: readonly Source[]
    citedSourceIds?: readonly string[]
  } = $props()

  const cited = $derived(new Set(citedSourceIds))
  const ordered = $derived(
    [...sources].sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id))),
  )
</script>

<ul class="flex list-none flex-col gap-1.5" data-testid="atlas-sources">
  {#each ordered as source (source.id)}
    <li
      data-testid="atlas-source"
      data-source-id={source.id}
      data-cited={cited.has(source.id) ? "true" : undefined}
      class={[
        "flex flex-col gap-1 rounded-plate border px-3 py-2",
        cited.has(source.id) ? "border-gold bg-gold-tint" : "border-rule",
      ]}
    >
      <p class="font-serif text-body-sm font-semibold text-ink">{source.title}</p>
      <p class="text-caption text-ink-dim">
        {sourceKindLabel(source.kind)}{#if source.edition}
          · {source.edition}{/if} · {licenseLabel(source.licenseId)}
        {#if cited.has(source.id)}
          · <span class="font-semibold text-gold-bright">cited by the selection</span>
        {/if}
      </p>
      {#if source.attribution}
        <p class="text-caption text-ink-dim">{source.attribution}</p>
      {/if}
      {#if source.url}
        <a
          href={source.url}
          rel="noreferrer noopener"
          target="_blank"
          class={[
            "inline-flex items-center gap-1 self-start break-all rounded-control text-caption text-ink-dim underline decoration-frame underline-offset-2 hover:text-ink",
            transition,
            focusRing,
          ]}
        >
          <Icon name="link" size={12} />{source.url}
        </a>
      {/if}
    </li>
  {/each}
</ul>
