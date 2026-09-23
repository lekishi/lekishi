import "./cesium-base-url"
import {
  CameraEventType,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantProperty,
  CreditDisplay,
  EllipsoidTerrainProvider,
  Entity,
  ImageryLayer,
  Ion,
  KeyboardEventModifier,
  LabelStyle,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  TileMapServiceImageryProvider,
  VerticalOrigin,
  Viewer,
  buildModuleUrl,
} from "cesium"
import type { GeoPoint } from "../domain"
import type { AtlasScene, SceneEvent } from "../scene"
import type { AtlasRenderer, AtlasRendererCallbacks } from "./types"

/**
 * Cesium implementation of the atlas renderer boundary.
 *
 * Cesium objects live only inside this module: the workspace passes in a
 * renderer-independent scene and receives identifiers back. Imagery comes from
 * the Natural Earth II tiles shipped inside the Cesium package, and terrain uses
 * the ellipsoid, so the foundation needs no Cesium ion account, API key, or
 * third-party provider. Attribution for both is shown in the workspace footer.
 */

const FOCUS_HEIGHT_METERS = 1_600_000
const HOME_HEIGHT_METERS = 9_000_000

// Firefox/Wayland emits much smaller deltas for a trackpad pinch than browsers
// that expose the gesture as Cesium's native PINCH event. Amplify only that
// Ctrl-wheel form so ordinary mouse wheels and touchscreen pinches keep Cesium's
// default response.
const FIREFOX_TRACKPAD_PINCH_MULTIPLIER = 5

/** Pointer movement above this many pixels counts as a manual pan, not a tap. */
const DRAG_THRESHOLD_PIXELS = 4

const DEFINITE_COLOR = Color.fromCssColorString("#f59e0b")
const POSSIBLE_COLOR = Color.fromCssColorString("#38bdf8")
const SELECTED_OUTLINE = Color.fromCssColorString("#ffffff")

type RequiredOptions = {
  focusHeightMeters: number
  homeHeightMeters: number
}

class CesiumAtlasRenderer implements AtlasRenderer {
  private readonly viewer: Viewer
  private readonly callbacks: AtlasRendererCallbacks
  private readonly options: RequiredOptions
  private readonly entities = new Map<string, Entity>()
  private readonly clickHandler: ScreenSpaceEventHandler
  private readonly resizeObserver: ResizeObserver | null
  private readonly canvas: HTMLCanvasElement
  private readonly amplifiedWheelEvents = new WeakSet<WheelEvent>()
  private pointerStart: { x: number; y: number } | null = null
  private homeApplied = false
  private lastFocusToken: number | null = null
  private disposed = false

  // Manual camera input is detected from pointer and wheel input on the canvas,
  // not from Cesium's `camera.moveStart`: that event also fires for programmatic
  // `flyTo`, and RFD 1 requires programmatic movement not to cancel following.
  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerStart = { x: event.clientX, y: event.clientY }
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const start = this.pointerStart

    if (start === null) {
      return
    }

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)

    if (distance > DRAG_THRESHOLD_PIXELS) {
      // Report once per gesture; the pointer keeps moving while the user drags.
      this.pointerStart = null
      this.callbacks.onManualCameraInput()
    }
  }

  private readonly handlePointerEnd = (): void => {
    this.pointerStart = null
  }

  private readonly handleWheel = (): void => {
    this.callbacks.onManualCameraInput()
  }

  private readonly amplifyTrackpadPinch = (event: WheelEvent): void => {
    if (!event.ctrlKey || this.amplifiedWheelEvents.has(event)) {
      return
    }

    // Run in the capture phase, replacing Firefox's tiny pinch delta before
    // Cesium's bubble-phase wheel handler sees it. A WeakSet distinguishes the
    // replacement event and prevents recursive amplification.
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

  constructor(container: HTMLElement, callbacks: AtlasRendererCallbacks, options: RequiredOptions) {
    this.callbacks = callbacks
    this.options = options

    // The library ships a demo ion token. Clearing it keeps this foundation
    // honest: any future ion-backed imagery or terrain fails loudly instead of
    // silently depending on a shared third-party credential.
    ;(Ion as { defaultAccessToken: string | undefined }).defaultAccessToken = undefined

    // CesiumJS adds the "Cesium ion" logo credit by default. This build never
    // contacts ion, so showing it would imply a provider account the project
    // does not have. The engine and imagery attribution stays in the workspace.
    ;(CreditDisplay as { cesiumCredit: unknown }).cesiumCredit = undefined

    this.viewer = new Viewer(container, {
      // The atlas owns time, selection, and camera controls; Cesium's own
      // timeline, animation, and info widgets stay out of the way.
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      baseLayer: ImageryLayer.fromProviderAsync(
        TileMapServiceImageryProvider.fromUrl(buildModuleUrl("Assets/Textures/NaturalEarthII")),
      ),
      terrainProvider: new EllipsoidTerrainProvider(),
    })

    this.viewer.scene.globe.baseColor = Color.fromCssColorString("#0f172a") ?? Color.BLACK
    this.viewer.scene.backgroundColor = Color.fromCssColorString("#020617") ?? Color.BLACK

    // Firefox on Linux exposes a trackpad pinch as a Ctrl-modified wheel event,
    // not as the touch events behind Cesium's PINCH camera event. Register that
    // form explicitly so a Magic Trackpad zooms the globe instead of bypassing
    // Cesium's otherwise modifier-specific wheel handler.
    this.viewer.scene.screenSpaceCameraController.zoomEventTypes = [
      CameraEventType.RIGHT_DRAG,
      CameraEventType.WHEEL,
      CameraEventType.PINCH,
      { eventType: CameraEventType.WHEEL, modifier: KeyboardEventModifier.CTRL },
    ]

    this.clickHandler = new ScreenSpaceEventHandler(this.viewer.scene.canvas)
    this.clickHandler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = this.viewer.scene.pick(movement.position)
      const pickedId = picked?.id instanceof Entity ? String(picked.id.id) : null
      this.callbacks.onSelectEvent(pickedId)
    }, ScreenSpaceEventType.LEFT_CLICK)

    this.canvas = this.viewer.scene.canvas
    this.canvas.addEventListener("pointerdown", this.handlePointerDown)
    this.canvas.addEventListener("pointermove", this.handlePointerMove)
    this.canvas.addEventListener("pointerup", this.handlePointerEnd)
    this.canvas.addEventListener("pointercancel", this.handlePointerEnd)
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
              this.viewer.resize()
            }
          })
    this.resizeObserver?.observe(container)
  }

  sync(scene: AtlasScene): void {
    if (this.disposed) {
      return
    }

    if (!this.homeApplied) {
      this.homeApplied = true
      this.viewer.camera.setView({
        destination: Cartesian3.fromDegrees(
          scene.homeView.lon,
          scene.homeView.lat,
          this.options.homeHeightMeters,
        ),
      })
    }

    const present = new Set<string>()

    for (const event of scene.events) {
      present.add(event.id)
      const entity = this.entities.get(event.id)

      if (entity === undefined) {
        this.entities.set(event.id, this.createEntity(event))
      } else {
        this.updateEntity(entity, event)
      }
    }

    for (const [id, entity] of this.entities) {
      if (!present.has(id)) {
        this.viewer.entities.remove(entity)
        this.entities.delete(id)
      }
    }

    // Apply each camera request exactly once; the token is bumped by the state
    // reducer whenever a new flight is wanted, including on resume.
    if (
      scene.cameraFocus !== null &&
      scene.cameraTarget !== null &&
      scene.cameraFocus.token !== this.lastFocusToken
    ) {
      this.lastFocusToken = scene.cameraFocus.token
      this.flyTo(scene.cameraTarget)
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
    this.canvas.removeEventListener("pointerup", this.handlePointerEnd)
    this.canvas.removeEventListener("pointercancel", this.handlePointerEnd)
    this.canvas.removeEventListener("wheel", this.amplifyTrackpadPinch, { capture: true })
    this.canvas.removeEventListener("wheel", this.handleWheel)
    this.clickHandler.destroy()
    this.entities.clear()
    this.viewer.destroy()
  }

  private createEntity(event: SceneEvent): Entity {
    const style = pointStyle(event)

    return this.viewer.entities.add({
      id: event.id,
      position: Cartesian3.fromDegrees(event.position.lon, event.position.lat),
      point: style,
      label: {
        text: event.title,
        font: "600 14px ui-sans-serif, system-ui, sans-serif",
        style: LabelStyle.FILL_AND_OUTLINE,
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString("#0f172a") ?? Color.BLACK,
        outlineWidth: 4,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -14),
        scaleByDistance: new NearFarScalar(1.0e6, 1.15, 2.0e7, 0.75),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }

  private updateEntity(entity: Entity, event: SceneEvent): void {
    const style = pointStyle(event)

    // Cesium graphics fields hold `Property` values, so a plain value is wrapped
    // as a constant when it changes after construction.
    if (entity.point !== undefined) {
      entity.point.pixelSize = new ConstantProperty(style.pixelSize)
      entity.point.color = new ConstantProperty(style.color)
      entity.point.outlineColor = new ConstantProperty(style.outlineColor)
      entity.point.outlineWidth = new ConstantProperty(style.outlineWidth)
    }

    if (entity.label !== undefined) {
      entity.label.text = new ConstantProperty(event.title)
      entity.label.scale = new ConstantProperty(event.selected ? 1.15 : 1.0)
    }
  }

  private flyTo(target: GeoPoint): void {
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(target.lon, target.lat, this.options.focusHeightMeters),
      duration: 1.2,
    })
  }
}

function pointStyle(event: SceneEvent): {
  pixelSize: number
  color: Color
  outlineColor: Color
  outlineWidth: number
  disableDepthTestDistance: number
} {
  const baseColor = event.relation === "possible" ? POSSIBLE_COLOR : DEFINITE_COLOR
  const selected = event.selected

  return {
    pixelSize: selected ? 16 : event.active ? 12 : 9,
    color: (baseColor ?? Color.WHITE).withAlpha(event.relation === "possible" ? 0.55 : 0.95),
    outlineColor: selected
      ? (SELECTED_OUTLINE ?? Color.WHITE)
      : (Color.fromCssColorString("#0f172a") ?? Color.BLACK),
    outlineWidth: selected ? 3 : 1.5,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  }
}

export type CesiumRendererOptions = {
  /** Height in meters used when following a selection. */
  focusHeightMeters?: number
  /** Height in meters for the initial globe view. */
  homeHeightMeters?: number
}

/** Mounts a Cesium globe and returns the renderer the workspace owns. */
export function createCesiumAtlasRenderer(
  container: HTMLElement,
  callbacks: AtlasRendererCallbacks,
  options: CesiumRendererOptions = {},
): AtlasRenderer {
  return new CesiumAtlasRenderer(container, callbacks, {
    focusHeightMeters: options.focusHeightMeters ?? FOCUS_HEIGHT_METERS,
    homeHeightMeters: options.homeHeightMeters ?? HOME_HEIGHT_METERS,
  })
}
