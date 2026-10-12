<script lang="ts">
  import { onMount } from "svelte"
  import { createGlobeAtlasRenderer } from "../renderer/globe-renderer"
  import type { AtlasRenderer } from "../renderer/types"
  import type { AtlasScene } from "../scene"

  let {
    scene,
    label,
    onSelectEvent,
    onManualCameraInput,
    onError,
  }: {
    scene: AtlasScene
    label: string
    onSelectEvent: (eventId: string | null) => void
    onManualCameraInput: () => void
    onError: (error: Error) => void
  } = $props()

  let container: HTMLDivElement
  let renderer = $state<AtlasRenderer | null>(null)

  onMount(() => {
    try {
      const mounted = createGlobeAtlasRenderer(container, { onSelectEvent, onManualCameraInput })
      mounted.sync(scene)
      renderer = mounted
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }

    // Disposal is the renderer's own responsibility: the workspace must not
    // leave a WebGL context, worker pool, or camera listener behind.
    return () => {
      renderer?.dispose()
      renderer = null
    }
  })

  $effect(() => {
    renderer?.sync(scene)
  })
</script>

<div
  bind:this={container}
  class="absolute inset-0"
  data-testid="atlas-globe"
  role="application"
  aria-label={label}
></div>
