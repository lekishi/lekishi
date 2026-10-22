import type { SceneArc, SceneDiorama, SceneJourney } from "../overlays"
import type { AtlasScene, ScenePlace } from "../scene"
import {
  createGlobeView,
  type GlobeArc,
  type GlobeDiorama,
  type GlobeJourney,
  type GlobeMarker,
  type GlobeView,
} from "./globe/view"
import type { AtlasRenderer, AtlasRendererCallbacks } from "./types"

/**
 * The custom globe behind the atlas renderer boundary.
 *
 * The owner chose the custom Three.js globe on 2026-10-12 (the renderer spike
 * record, `rfd/0003/RENDERER_SPIKE.adoc`), and it replaces the Cesium renderer
 * here without changing the boundary: the workspace hands over a scene of plain
 * data and receives place ids and camera input back. Three.js objects live only
 * in `./globe/`; this module turns the scene into markers, lines, dioramas and
 * camera requests, and the reader's pointer and wheel input into callbacks.
 *
 * Flights frame into the scene's safe area (RFD 5, "Scene safe area"): the
 * view moves its projection's centre into the clear zone, so the home view,
 * a followed selection and an explicit jump all land between the rails.
 *
 * The globe is drawn from tiles shipped in the artifact (`/globe/`, built by
 * `scripts/globe/build-tiles.py` from open elevation and Natural Earth II), so
 * there is no provider account, token, or runtime tile service.
 */

const FOCUS_HEIGHT_METERS = 1_600_000
const HOME_HEIGHT_METERS = 9_000_000
const FLIGHT_MS = 1_200

// Firefox on Linux reports a trackpad pinch as a Ctrl-modified wheel event with
// very small deltas. Amplify only that form; ordinary wheels and touchscreen
// pinches keep the camera controls' own response.
const FIREFOX_TRACKPAD_PINCH_MULTIPLIER = 5

/** Pointer movement above this many pixels counts as a manual pan, not a tap. */
const DRAG_THRESHOLD_PIXELS = 4
/** A press held longer than this is not a click. */
const CLICK_MAX_MS = 500

export type GlobeRendererOptions = {
  /** Height in meters used when following a selection. */
  focusHeightMeters?: number
  /** Height in meters for the initial globe view. */
  homeHeightMeters?: number
  /** Where the globe's tiles are served, ending in `/`. */
  tilesUrl?: string
}

/**
 * The marker a scene place draws: its form is the evidence (attested ring,
 * identified halo, display-anchor diamond), its fill the certainty, its size
 * the emphasis, a dotted name an event told as tradition, and a disc under it the controller of a drawn territory
 * snapshot. The scene only carries places with a published position, so
 * no coordinate is invented for a list-only event.
 */
export function markerFor(place: ScenePlace): GlobeMarker {
  return {
    id: place.id,
    lon: place.position.lon,
    lat: place.position.lat,
    label: place.label,
    mark: place.mark,
    precision: place.precision,
    tone: place.tone,
    emphasis: place.selected ? "selected" : place.playback === "active" ? "active" : "base",
    count: place.eventCount,
    disputed: place.disputed,
    tradition: place.tradition,
    control:
      place.control === null
        ? null
        : { tint: place.control.tint, seat: place.control.seat, disputed: place.control.disputed },
  }
}

/** A journey's line: its stops' positions in order, the legs drawn between them, and where the vessel is. */
export function journeyFor(journey: SceneJourney): GlobeJourney {
  return {
    id: journey.id,
    stops: journey.stops.map((stop) => stop.position),
    legs: journey.legs,
    vessel: journey.vessel,
    selected: journey.selected,
  }
}

/** A relationship arc, captioned with its two ends' names in the arc's direction. */
export function arcFor(arc: SceneArc): GlobeArc {
  return {
    id: arc.id,
    family: arc.family,
    from: arc.from,
    to: arc.to,
    directed: arc.directed,
    emphasis: arc.emphasis,
    caption: `${arc.fromLabel} ${arc.directed ? "→" : "–"} ${arc.toLabel}`,
  }
}

export function dioramaFor(diorama: SceneDiorama): GlobeDiorama {
  return {
    id: diorama.id,
    url: diorama.url,
    center: diorama.center,
    showBelowMeters: diorama.showBelowMeters,
  }
}

class GlobeAtlasRenderer implements AtlasRenderer {
  private readonly view: GlobeView
  private readonly canvas: HTMLCanvasElement
  private readonly callbacks: AtlasRendererCallbacks
  private readonly options: Required<Omit<GlobeRendererOptions, "tilesUrl">>
  private readonly resizeObserver: ResizeObserver | null
  private readonly amplifiedWheelEvents = new WeakSet<WheelEvent>()
  /** Where the current press started, while it may still be a drag. */
  private dragStart: { x: number; y: number } | null = null
  /** Where and when the current press started, while it may still be a click. */
  private press: { x: number; y: number; time: number; pointerId: number } | null = null
  private homeApplied = false
  private lastHomeToken: number | null = null
  private lastFocusToken: number | null = null
  private disposed = false

  // Manual camera input is read from the reader's own pointer and wheel input on
  // the canvas, never from the camera moving: programmatic flights move it too,
  // and RFD 1 requires them not to cancel following.
  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.dragStart = { x: event.clientX, y: event.clientY }
    this.press =
      event.button === 0
        ? { x: event.clientX, y: event.clientY, time: event.timeStamp, pointerId: event.pointerId }
        : null
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const start = this.dragStart

    if (start === null) {
      return
    }

    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD_PIXELS) {
      // Report once per gesture; the pointer keeps moving while the reader drags.
      this.dragStart = null
      this.press = null
      this.callbacks.onManualCameraInput()
    }
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const press = this.press
    this.dragStart = null
    this.press = null

    if (
      press === null ||
      press.pointerId !== event.pointerId ||
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD_PIXELS ||
      event.timeStamp - press.time > CLICK_MAX_MS
    ) {
      return
    }

    // A tap is a finger, so it reaches a little further than a mouse click.
    const radius = event.pointerType === "touch" ? 14 : 8
    this.callbacks.onSelectPlace(this.view.markerAt(event.clientX, event.clientY, radius))
  }

  private readonly handlePointerCancel = (): void => {
    this.dragStart = null
    this.press = null
  }

  private readonly handleWheel = (): void => {
    this.callbacks.onManualCameraInput()
  }

  private readonly amplifyTrackpadPinch = (event: WheelEvent): void => {
    if (!event.ctrlKey || this.amplifiedWheelEvents.has(event)) {
      return
    }

    // Runs in the capture phase, replacing Firefox's tiny pinch delta before the
    // camera controls' bubble-phase wheel handler sees it. The WeakSet marks the
    // replacement so it is not amplified again.
    event.preventDefault()
    event.stopImmediatePropagation()

    const amplified = new WheelEvent(event.type, {
      bubbles: event.bubbles,
      cancelable: event.cancelable,
      composed: event.composed,
      ctrlKey: true,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      clientX: event.clientX,
      clientY: event.clientY,
      deltaX: event.deltaX * FIREFOX_TRACKPAD_PINCH_MULTIPLIER,
      deltaY: event.deltaY * FIREFOX_TRACKPAD_PINCH_MULTIPLIER,
      deltaZ: event.deltaZ * FIREFOX_TRACKPAD_PINCH_MULTIPLIER,
      deltaMode: event.deltaMode,
    })

    this.amplifiedWheelEvents.add(amplified)
    this.canvas.dispatchEvent(amplified)
  }

  constructor(
    container: HTMLElement,
    callbacks: AtlasRendererCallbacks,
    options: GlobeRendererOptions,
  ) {
    this.callbacks = callbacks
    this.options = {
      focusHeightMeters: options.focusHeightMeters ?? FOCUS_HEIGHT_METERS,
      homeHeightMeters: options.homeHeightMeters ?? HOME_HEIGHT_METERS,
    }
    this.view = createGlobeView(container, {
      tilesUrl: options.tilesUrl ?? "/globe/",
      onViewChange: (view) => {
        if (!this.disposed) this.callbacks.onViewChange?.(view)
      },
    })
    this.canvas = this.view.canvas
    this.canvas.addEventListener("pointerdown", this.handlePointerDown)
    this.canvas.addEventListener("pointermove", this.handlePointerMove)
    this.canvas.addEventListener("pointerup", this.handlePointerUp)
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel)
    this.canvas.addEventListener("wheel", this.amplifyTrackpadPinch, {
      capture: true,
      passive: false,
    })
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: true })

    this.resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (!this.disposed) {
              this.view.resize()
            }
          })
    this.resizeObserver?.observe(container)
  }

  sync(scene: AtlasScene): void {
    if (this.disposed) {
      return
    }

    // The clear zone first, so the home view below already lands inside it.
    this.view.setSafeArea(scene.safeArea)

    if (!this.homeApplied) {
      this.homeApplied = true
      this.lastHomeToken = scene.homeToken
      this.view.setView(scene.homeView, this.options.homeHeightMeters)
    } else if (scene.homeToken !== this.lastHomeToken) {
      // The reader asked for the chapter's opening view again: one flight per
      // request, never on the first sync (which already placed the camera).
      this.lastHomeToken = scene.homeToken
      this.view.flyTo(scene.homeView, this.options.homeHeightMeters, FLIGHT_MS)
    }

    this.view.setMarkers(scene.places.map(markerFor))
    this.view.setOverlays({
      journeys: scene.journeys.map(journeyFor),
      arcs: scene.arcs.map(arcFor),
    })
    this.view.setDioramas(scene.dioramas.map(dioramaFor))

    // Apply each camera request exactly once; the token is bumped by the state
    // reducer whenever a new flight is wanted, including on resume.
    if (
      scene.cameraFocus !== null &&
      scene.cameraTarget !== null &&
      scene.cameraFocus.token !== this.lastFocusToken
    ) {
      this.lastFocusToken = scene.cameraFocus.token
      this.view.flyTo(scene.cameraTarget, this.options.focusHeightMeters, FLIGHT_MS)
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.resizeObserver?.disconnect()
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown)
    this.canvas.removeEventListener("pointermove", this.handlePointerMove)
    this.canvas.removeEventListener("pointerup", this.handlePointerUp)
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel)
    this.canvas.removeEventListener("wheel", this.amplifyTrackpadPinch, { capture: true })
    this.canvas.removeEventListener("wheel", this.handleWheel)
    this.view.dispose()
  }
}

/** Mounts the custom globe and returns the renderer the workspace owns. */
export function createGlobeAtlasRenderer(
  container: HTMLElement,
  callbacks: AtlasRendererCallbacks,
  options: GlobeRendererOptions = {},
): AtlasRenderer {
  return new GlobeAtlasRenderer(container, callbacks, options)
}
