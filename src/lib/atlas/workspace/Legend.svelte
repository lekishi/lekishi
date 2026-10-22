<script lang="ts">
  import { Badge, Icon, focusRing, transition } from "$lib/ui"
  import type { RelationshipFamily, SceneTerritory } from "../overlays"
  import HonestyPlate from "./HonestyPlate.svelte"

  /**
   * The legend (RFD 5, bottom left): only the marks the view is drawing, each
   * as the badge the card uses, so the map and the card speak one grammar.
   * Under it, what the view is made of, and the data attribution the globe
   * owes. The full attribution text ships with the tiles at
   * `/globe/ATTRIBUTION.txt`; AGENTS.md keeps the link visible here.
   *
   * At phone and tablet widths the legend folds to its button, so it never
   * covers the scene the reader is looking at.
   */
  let {
    marks,
    journeys,
    drift = false,
    families,
    territories = [],
    diorama,
    folded = false,
  }: {
    marks: {
      readonly attested: boolean
      readonly identified: boolean
      readonly anchor: boolean
      readonly tradition: boolean
    }
    journeys: boolean
    /** A journey leg the party did not steer is drawn dotted, as a drift. */
    drift?: boolean
    families: readonly RelationshipFamily[]
    /** The territory snapshots the map is drawing at the playhead. */
    territories?: readonly SceneTerritory[]
    diorama: string | null
    folded?: boolean
  } = $props()

  let open = $state(true)

  $effect(() => {
    open = !folded
  })

  const FAMILY_TEXT: Record<RelationshipFamily, string> = {
    transmission: "transmission",
    diplomacy: "diplomacy",
    conflict: "conflict",
    trade: "trade",
    institution: "institutional change",
  }

  // One whole literal per tint, so Tailwind's scanner generates each.
  const CONTROL_CLASS = [
    "bg-control-1/40 border-control-1",
    "bg-control-2/40 border-control-2",
    "bg-control-3/40 border-control-3",
    "bg-control-4/40 border-control-4",
    "bg-control-5/40 border-control-5",
    "bg-control-6/40 border-control-6",
    "bg-control-7/40 border-control-7",
    "bg-control-8/40 border-control-8",
  ]

  const FAMILY_CLASS: Record<RelationshipFamily, string> = {
    transmission: "bg-rel-transmission",
    diplomacy: "bg-rel-diplomacy",
    conflict: "bg-rel-conflict",
    trade: "bg-rel-trade",
    institution: "bg-rel-institution",
  }
</script>

<section
  aria-label="Legend"
  data-testid="atlas-legend"
  class="pointer-events-auto w-72 max-w-full rounded-plate border border-frame bg-lacquer-glass text-ink shadow-plate backdrop-blur-md"
>
  <button
    type="button"
    aria-expanded={open}
    onclick={() => (open = !open)}
    class={[
      "flex w-full cursor-pointer items-center gap-2 rounded-plate px-3 py-2 text-left text-label font-semibold uppercase text-ink-dim hover:text-ink",
      transition,
      focusRing,
    ]}
  >
    <Icon name="about" size={14} />
    <span class="flex-1">Legend</span>
    <Icon name={open ? "chevron-down" : "chevron-up"} size={14} />
  </button>

  {#if open}
    <div class="flex flex-col gap-2 border-t border-rule px-3 pt-2 pb-3">
      <ul class="flex flex-wrap gap-1.5">
        {#if marks.attested}<li><Badge kind="attested" text="attested site" /></li>{/if}
        {#if marks.identified}<li><Badge kind="identified" text="identified locality" /></li>{/if}
        {#if marks.anchor}<li><Badge kind="anchor" /></li>{/if}
        {#if marks.tradition}<li><Badge kind="tradition" text="tradition, dotted name" /></li>{/if}
        {#if journeys}<li><Badge kind="schematic" text="journey, schematic" /></li>{/if}
        {#if drift}<li><Badge kind="schematic" text="drift, not a chosen course" /></li>{/if}
      </ul>
      {#if families.length > 0}
        <ul class="flex flex-wrap gap-x-3 gap-y-1 text-caption text-ink-dim">
          {#each families as family (family)}
            <li class="inline-flex items-center gap-1.5">
              <span aria-hidden="true" class={["h-0.5 w-4 rounded-full", FAMILY_CLASS[family]]}
              ></span>
              {FAMILY_TEXT[family]}
            </li>
          {/each}
        </ul>
      {/if}
      {#if territories.length > 0}
        <ul data-testid="legend-control" class="flex flex-col gap-1 text-caption text-ink-dim">
          {#each territories as territory (territory.id)}
            <li class="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                class={[
                  "h-3 w-3 rounded-full border",
                  CONTROL_CLASS[territory.tint % CONTROL_CLASS.length],
                ]}
              ></span>
              <span>held by <span class="font-serif text-ink">{territory.label}</span></span>
              <span class="tabular-nums">{territory.dateLabel}</span>
              {#if territory.disputed}<span class="text-ink-faint">· disputed</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      <HonestyPlate
        lines={journeys || drift || families.length > 0}
        anchors={marks.anchor}
        control={territories.length > 0}
        {diorama}
      />
      <p class="text-caption text-ink-faint">
        Elevation: Terrain Tiles (Mapzen and contributors) · Land cover: ESA WorldCover · Imagery:
        Natural Earth II ·
        <a
          href="/globe/ATTRIBUTION.txt"
          class={[
            "rounded-control text-ink-dim underline decoration-rule underline-offset-2 hover:text-ink",
            transition,
            focusRing,
          ]}>Full attribution</a
        >
      </p>
    </div>
  {/if}
</section>
