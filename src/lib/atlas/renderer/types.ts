import type { GeoPoint } from "../domain"
import type { AtlasScene } from "../scene"

/**
 * The boundary between the workspace and whatever draws the map.
 *
 * The workspace never holds renderer objects; it holds a scene (plain data) and
 * hands it to a renderer. User input travels back as callbacks that the
 * workspace turns into state actions. A different engine can replace the
 * implementation without touching state, time filtering, or fixtures.
 */

/** Where the camera is looking, as the minimap draws it. */
export type CameraView = {
  /** The point on the ground at the centre of the clear zone. */
  readonly center: GeoPoint
  /** The camera's height above the ground, in metres. */
  readonly heightMeters: number
}

export type AtlasRendererCallbacks = {
  /**
   * A map click hit a place marker, or `null` when the click hit nothing. The
   * map draws places, not events (RFD 1, "Places first"); the workspace decides
   * whether a place with one event opens that event.
   */
  onSelectPlace(placeId: string | null): void
  /** The user panned, zoomed, or rotated the camera themselves. */
  onManualCameraInput(): void
  /** The camera settled somewhere new; reported at most a few times a second. */
  onViewChange?(view: CameraView): void
}

export interface AtlasRenderer {
  /** Renders the scene; safe to call for every state change. */
  sync(scene: AtlasScene): void
  /** Releases the globe, workers, and listeners. Idempotent. */
  dispose(): void
}
