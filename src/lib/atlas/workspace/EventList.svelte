<script lang="ts">
  import type { SceneEvent } from "../scene"
  import EventRow from "./EventRow.svelte"

  /**
   * The events in the selected window.
   *
   * The list is the surface that does not depend on the map, so it carries every
   * in-window event, including the ones the atlas cannot place. It is the panel's
   * scroll container, so every level between the panel and the rows has to be
   * shrinkable (`min-h-0`); without it a long window pushes the rows out of the
   * panel and under the time controls instead of scrolling them.
   */
  let {
    events,
    onSelect,
  }: {
    events: readonly SceneEvent[]
    onSelect: (eventId: string) => void
  } = $props()
</script>

<div class="flex min-h-0 flex-1 flex-col gap-2">
  <ul
    class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1"
    data-testid="atlas-event-list"
  >
    {#if events.length === 0}
      <li class="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-400">
        No published events overlap this window. Widen it to bring the chapter's events back into
        view.
      </li>
    {/if}
    {#each events as event (event.id)}
      <li>
        <EventRow {event} {onSelect} />
      </li>
    {/each}
  </ul>
</div>
