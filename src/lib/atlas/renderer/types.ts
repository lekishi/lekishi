import type { AtlasScene } from "../scene"

/**
 * The boundary between the workspace and whatever draws the map.
 *
 * The workspace never holds renderer objects; it holds a scene (plain data) and
 * hands it to a renderer. User input travels back as callbacks that the
 * workspace turns into state actions. A different engine can replace the
 * implementation without touching state, time filtering, or fixtures.
 */

export type AtlasRendererCallbacks = {
  /** A map click selected an event, or `null` when the click hit nothing. */
  onSelectEvent(eventId: string | null): void
  /** The user panned, zoomed, or rotated the camera themselves. */
  onManualCameraInput(): void
}

export interface AtlasRenderer {
  /** Renders the scene; safe to call for every state change. */
  sync(scene: AtlasScene): void
  /** Releases the globe, workers, and listeners. Idempotent. */
  dispose(): void
}
