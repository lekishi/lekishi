<script lang="ts">
  import { Orb, type IconName } from "$lib/ui"
  import type { LayerOption } from "../overlays"
  import type { LayerId, LayerVisibility } from "../state"

  /**
   * The layer orbs (RFD 1's round orbs, RFD 5's left rail). An orb that has
   * nothing to draw in this chapter is shown disabled, and its label says why,
   * so a reader learns the chapter has no territory snapshot rather than that
   * the atlas cannot draw one. The Sources orb is not a map layer: it opens
   * the sources list, and stays pressed while that list is showing.
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
    onSources: () => void
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
  class={["pointer-events-auto flex gap-2", vertical ? "flex-col" : "flex-row flex-wrap"]}
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
  <Orb icon="sources" label="Sources" pressed={sourcesOpen} onchange={() => onSources()} />
</div>
