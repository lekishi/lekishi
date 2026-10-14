<script lang="ts">
  import type { Snippet } from "svelte"
  import { focusRing, transition } from "./classes"

  /**
   * A tablist with one panel (RFD 5, `Tabs`), extracted from the event panel.
   *
   * Roving focus: only the selected tab is in the tab order, the arrow keys
   * move between tabs (wrapping), and Home and End jump to the ends. Selection
   * follows focus, because every panel here is cheap to show and a reader
   * moving through the tabs expects to see each one. The selected tab is told
   * apart by its fill and an underline as well as `aria-selected`.
   */
  type Tab = { readonly id: string; readonly label: string; readonly count?: number }

  let {
    tabs,
    selected = $bindable(),
    label,
    idPrefix,
    class: className,
    onselect,
    children,
  }: {
    tabs: readonly Tab[]
    selected?: string
    /** The tablist's accessible name. */
    label: string
    /** Prefix for the tab and panel ids, unique on the page. */
    idPrefix: string
    class?: string
    onselect?: (id: string) => void
    /** The panel, rendered for the selected tab's id. */
    children: Snippet<[string]>
  } = $props()

  const current = $derived(tabs.find((tab) => tab.id === selected) ?? tabs[0])
  let buttons: HTMLButtonElement[] = $state([])

  function choose(index: number) {
    const tab = tabs[index]
    if (!tab) return
    selected = tab.id
    onselect?.(tab.id)
    buttons[index]?.focus()
  }

  function keydown(event: KeyboardEvent, index: number) {
    const last = tabs.length - 1
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    choose(next)
  }
</script>

<div class={["flex min-h-0 flex-col", className]}>
  <div role="tablist" aria-label={label} class="flex shrink-0 items-center gap-1">
    {#each tabs as tab, index (tab.id)}
      {@const isSelected = tab.id === current?.id}
      <button
        bind:this={buttons[index]}
        id="{idPrefix}-tab-{tab.id}"
        type="button"
        role="tab"
        aria-selected={isSelected}
        aria-controls="{idPrefix}-panel"
        tabindex={isSelected ? 0 : -1}
        onclick={() => choose(index)}
        onkeydown={(event) => keydown(event, index)}
        class={[
          "group inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control px-2.5 text-body-sm font-semibold",
          transition,
          focusRing,
          isSelected
            ? "bg-lacquer-raised text-ink shadow-[inset_0_-2px_0_var(--color-gold)]"
            : "text-ink-dim hover:bg-lacquer-raised hover:text-ink",
        ]}
      >
        {tab.label}
        {#if tab.count !== undefined}
          <!-- ink-faint falls below AA on the raised fill, so the count steps up with it. -->
          <span
            class={[
              "font-normal tabular-nums",
              isSelected ? "text-ink-dim" : "text-ink-faint group-hover:text-ink-dim",
            ]}>{tab.count}</span
          >
        {/if}
      </button>
    {/each}
  </div>
  {#if current}
    <div
      id="{idPrefix}-panel"
      role="tabpanel"
      aria-labelledby="{idPrefix}-tab-{current.id}"
      tabindex="0"
      class={["mt-2 min-h-0 flex-1 rounded-control", focusRing]}
    >
      {@render children(current.id)}
    </div>
  {/if}
</div>
