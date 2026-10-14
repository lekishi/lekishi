<script lang="ts">
  import { onMount } from "svelte"
  import { createGlobeAtlasRenderer } from "../renderer/globe-renderer"
  import type { AtlasRenderer, CameraView } from "../renderer/types"
  import type { AtlasScene } from "../scene"

  let {
    scene,
    label,
    onSelectPlace,
    onManualCameraInput,
    onViewChange,
    onError,
  }: {
    scene: AtlasScene
    label: string
    onSelectPlace: (placeId: string | null) => void
    onManualCameraInput: () => void
    onViewChange?: (view: CameraView) => void
    onError: (error: Error) => void
  } = $props()

  let container: HTMLDivElement
  let renderer = $state<AtlasRenderer | null>(null)

  onMount(() => {
    try {
      const mounted = createGlobeAtlasRenderer(container, {
        onSelectPlace,
        onManualCameraInput,
        onViewChange,
      })
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
