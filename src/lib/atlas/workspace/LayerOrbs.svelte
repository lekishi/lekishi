<script lang="ts">
  import { Orb, handled, type IconName } from "$lib/ui"
  import type { LayerOption } from "../overlays"
  import type { LayerId, LayerVisibility } from "../state"

  /**
   * The layer orbs (RFD 1's round orbs, RFD 5's left rail). An orb that has
   * nothing to draw in this chapter is shown disabled, and its label says why,
   * so a reader learns the chapter has no territory snapshot rather than that
   * the atlas cannot draw one. The Sources orb is not a map layer: it opens
   * the sources list, and stays pressed while that list is showing. On desktop
   * the list is always open with a Sources tab, so the orb is left out there.
   */
  let {
    options,
    layers,
    sourcesOpen,
    vertical = false,
    onToggle,
    onSources,
  }: {
    options: readonly LayerOption[]
    layers: LayerVisibility
    sourcesOpen: boolean
    vertical?: boolean
    onToggle: (layer: LayerId, visible: boolean) => void
    /** Omitted where the sources already have a tab beside the list (desktop). */
    onSources?: () => void
  } = $props()

  const META: Record<LayerId, { icon: IconName; label: string; none: string }> = {
    journeys: { icon: "journeys", label: "Journeys", none: "Journeys: none in this chapter" },
    transmission: {
      icon: "transmission",
      label: "Transmission arcs",
      none: "Transmission: no arcs in this chapter",
    },
    diplomacy: {
      icon: "diplomacy",
      label: "Diplomacy arcs",
      none: "Diplomacy: no arcs in this chapter",
    },
    conflict: {
      icon: "conflict",
      label: "Conflict arcs",
      none: "Conflict: no arcs in this chapter",
    },
    trade: { icon: "trade", label: "Trade arcs", none: "Trade: no arcs in this chapter" },
    institution: {
      icon: "institution",
      label: "Institutional change arcs",
      none: "Institutional change: no arcs in this chapter",
    },
    territory: {
      icon: "territory",
      label: "Territory",
      none: "Territory: no snapshots in this chapter",
    },
  }
</script>

<div
  role="group"
  aria-label="Map layers"
  data-testid="atlas-layers"
  class={["pointer-events-auto flex gap-2", handled, vertical ? "flex-col" : "flex-row flex-wrap"]}
>
  {#each options as option (option.id)}
    <Orb
      icon={META[option.id].icon}
      label={option.available ? META[option.id].label : META[option.id].none}
      pressed={option.available && layers[option.id]}
      disabled={!option.available}
      onchange={(next) => onToggle(option.id, next)}
    />
  {/each}
  {#if onSources}
    <Orb icon="sources" label="Sources" pressed={sourcesOpen} onchange={() => onSources()} />
  {/if}
</div>
