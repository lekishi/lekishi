<script lang="ts">
  import Icon from "./Icon.svelte"
  import { focusRing, transition } from "./classes"

  /**
   * A source on one line (RFD 5, `CitationLine`): the work, the locator and
   * its reuse terms. With `href` or `onopen` the line opens the quote; without
   * either it is plain text. The terms are always shown, because a reader
   * reusing a quotation needs them next to it, not behind a click.
   */
  let {
    source,
    sourceLang,
    locator,
    terms,
    href,
    onopen,
    class: className,
  }: {
    source: string
    sourceLang?: string
    locator?: string
    terms?: string
    href?: string
    onopen?: () => void
    class?: string
  } = $props()

  const base =
    "flex w-full min-w-0 items-baseline gap-2 rounded-control px-1 py-0.5 text-left text-body-sm no-underline"
  const interactive = ["group cursor-pointer hover:bg-lacquer-raised", transition, focusRing]
</script>

{#snippet line()}
  <Icon name="sources" size={14} class="translate-y-0.5 text-ink-faint" />
  <span class="min-w-0 flex-1 truncate">
    <span lang={sourceLang} class="font-serif text-ink">{source}</span>
    {#if locator}
      <span class="text-ink-dim">, {locator}</span>
    {/if}
  </span>
  {#if terms}
    <!-- ink-faint falls below AA on the hover fill, so the terms step up with it. -->
    <span class="shrink-0 text-caption text-ink-faint group-hover:text-ink-dim">{terms}</span>
  {/if}
{/snippet}

{#if href}
  <a {href} data-citation class={[base, interactive, className]}>{@render line()}</a>
{:else if onopen}
  <button type="button" onclick={onopen} data-citation class={[base, interactive, className]}>
    {@render line()}
  </button>
{:else}
  <span data-citation class={[base, className]}>{@render line()}</span>
{/if}
