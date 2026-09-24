import { beforeEach, describe, expect, it, vi } from "vitest"
import { FIXTURE_CHAPTER } from "../fixtures"
import { buildScene } from "../scene"
import { createAtlasState, noteManualCameraInput, resumeCameraFollow, selectEvent } from "../state"
import { createCesiumAtlasRenderer } from "./cesium-renderer"

/**
 * Smoke coverage for the Cesium renderer's mount, sync, and disposal lifecycle.
 *
 * Cesium itself is replaced by a fake engine: the point here is the boundary
 * contract (what the workspace asks the renderer to do, and what the renderer
 * releases on the way out), not WebGL rendering. Real rendering is covered by
 * the browser check against the production artifact.
 */
const fake = vi.hoisted(() => {
  class FakeColor {
    static WHITE = new FakeColor("#ffffff")
    static BLACK = new FakeColor("#000000")

    constructor(
      readonly css: string,
      readonly alpha = 1,
    ) {}

    withAlpha(alpha: number): FakeColor {
      return new FakeColor(this.css, alpha)
    }

    static fromCssColorString(css: string): FakeColor {
      return new FakeColor(css)
    }
  }

  class FakeEntity {
    point: Record<string, unknown> = {}
    label: Record<string, unknown> = {}

    constructor(readonly id: string) {}
  }

  class FakeCanvas {
    readonly listeners = new Map<string, Set<(event: unknown) => void>>()
    readonly dispatchedEvents: unknown[] = []
    clientWidth = 1280
    clientHeight = 720

    addEventListener(type: string, listener: (event: unknown) => void): void {
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add(listener)
      this.listeners.set(type, listeners)
    }

    removeEventListener(type: string, listener: (event: unknown) => void): void {
      this.listeners.get(type)?.delete(listener)
    }

    dispatch(type: string, event: unknown = {}): void {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event)
      }
    }

    dispatchEvent(event: { type: string }): boolean {
      this.dispatchedEvents.push(event)
      this.dispatch(event.type, event)
      return true
    }

    get listenerCount(): number {
      let total = 0

      for (const listeners of this.listeners.values()) {
        total += listeners.size
      }

      return total
    }
  }

  class FakeViewer {
    static instances: FakeViewer[] = []

    readonly entities: {
      items: FakeEntity[]
      add: (options: { id: string }) => FakeEntity
      remove: (entity: FakeEntity) => void
      removeAll: () => void
    }
    readonly camera = {
      setView: vi.fn(),
      flyTo: vi.fn(),
      moveStart: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    }
    readonly canvas = new FakeCanvas()
    readonly scene = {
      canvas: this.canvas,
      backgroundColor: null as FakeColor | null,
      globe: { baseColor: null as FakeColor | null },
      screenSpaceCameraController: { zoomEventTypes: [] as unknown[] },
      pick: vi.fn(() => undefined as unknown),
    }
    readonly resize = vi.fn()
    readonly destroy = vi.fn()
    readonly options: Record<string, unknown>
    readonly container: unknown

    constructor(container: unknown, options: Record<string, unknown>) {
      this.container = container
      this.options = options
      const items: FakeEntity[] = []
      this.entities = {
        items,
        add: (entityOptions) => {
          const entity = new FakeEntity(entityOptions.id)
          items.push(entity)
          return entity
        },
        remove: (entity) => {
          const index = items.indexOf(entity)
          if (index >= 0) {
            items.splice(index, 1)
          }
        },
        removeAll: () => {
          items.length = 0
        },
      }
      FakeViewer.instances.push(this)
    }
  }

  class FakeScreenSpaceEventHandler {
    static instances: FakeScreenSpaceEventHandler[] = []

    readonly actions: { action: unknown; type: unknown }[] = []
    readonly destroy = vi.fn()

    constructor(readonly canvas: unknown) {
      FakeScreenSpaceEventHandler.instances.push(this)
    }

    setInputAction(action: unknown, type: unknown): void {
      this.actions.push({ action, type })
    }
  }

  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []

    readonly observe = vi.fn()
    readonly disconnect = vi.fn()

    constructor(readonly callback: () => void) {
      FakeResizeObserver.instances.push(this)
    }
  }

  class FakeEllipsoidTerrainProvider {}

  class FakeConstantProperty {
    constructor(readonly value: unknown) {}
  }

  class FakeWheelEvent {
    readonly bubbles: boolean
    readonly cancelable: boolean
    readonly composed: boolean
    readonly ctrlKey: boolean
    readonly shiftKey: boolean
    readonly altKey: boolean
    readonly metaKey: boolean
    readonly clientX: number
    readonly clientY: number
    readonly deltaX: number
    readonly deltaY: number
    readonly deltaZ: number
    readonly deltaMode: number

    constructor(
      readonly type: string,
      init: WheelEventInit = {},
    ) {
      this.bubbles = init.bubbles ?? false
      this.cancelable = init.cancelable ?? false
      this.composed = init.composed ?? false
      this.ctrlKey = init.ctrlKey ?? false
      this.shiftKey = init.shiftKey ?? false
      this.altKey = init.altKey ?? false
      this.metaKey = init.metaKey ?? false
      this.clientX = init.clientX ?? 0
      this.clientY = init.clientY ?? 0
      this.deltaX = init.deltaX ?? 0
      this.deltaY = init.deltaY ?? 0
      this.deltaZ = init.deltaZ ?? 0
      this.deltaMode = init.deltaMode ?? 0
    }
  }

  const fromUrl = vi.fn(async (url: string) => ({ url }))
  const fromProviderAsync = vi.fn((provider: Promise<unknown>) => ({ provider }))
  const ion = { defaultAccessToken: "demo-token" as string | undefined }
  const creditDisplay = { cesiumCredit: "ion-credit" as unknown }

  return {
    FakeColor,
    FakeConstantProperty,
    FakeEntity,
    FakeEllipsoidTerrainProvider,
    FakeViewer,
    FakeScreenSpaceEventHandler,
    FakeResizeObserver,
    FakeWheelEvent,
    fromUrl,
    fromProviderAsync,
    ion,
    creditDisplay,
    buildModuleUrl: vi.fn((path: string) => `/cesium/${path}/`),
    reset() {
      FakeViewer.instances.length = 0
      FakeScreenSpaceEventHandler.instances.length = 0
      FakeResizeObserver.instances.length = 0
      fromUrl.mockClear()
      fromProviderAsync.mockClear()
      ion.defaultAccessToken = "demo-token"
      creditDisplay.cesiumCredit = "ion-credit"
    },
  }
})

vi.mock("cesium", () => ({
  CameraEventType: { RIGHT_DRAG: "right-drag", WHEEL: "wheel", PINCH: "pinch" },
  Cartesian2: class {
    constructor(
      readonly x: number,
      readonly y: number,
    ) {}
  },
  Cartesian3: {
    fromDegrees: (lon: number, lat: number, height = 0) => ({ lon, lat, height }),
  },
  Color: fake.FakeColor,
  ConstantProperty: fake.FakeConstantProperty,
  CreditDisplay: fake.creditDisplay,
  EllipsoidTerrainProvider: fake.FakeEllipsoidTerrainProvider,
  Entity: fake.FakeEntity,
  ImageryLayer: { fromProviderAsync: fake.fromProviderAsync },
  Ion: fake.ion,
  KeyboardEventModifier: { CTRL: "ctrl" },
  LabelStyle: { FILL_AND_OUTLINE: "fill-and-outline" },
  NearFarScalar: class {
    constructor(...args: number[]) {
      Object.assign(this, { args })
    }
  },
  ScreenSpaceEventHandler: fake.FakeScreenSpaceEventHandler,
  ScreenSpaceEventType: { LEFT_CLICK: "left-click" },
  TileMapServiceImageryProvider: { fromUrl: fake.fromUrl },
  VerticalOrigin: { BOTTOM: "bottom" },
  Viewer: fake.FakeViewer,
  buildModuleUrl: fake.buildModuleUrl,
}))

const chapter = FIXTURE_CHAPTER
const initial = createAtlasState(chapter)
const container = { clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement

function mount() {
  const callbacks = { onSelectEvent: vi.fn(), onManualCameraInput: vi.fn() }
  const renderer = createCesiumAtlasRenderer(container, callbacks)
  const viewer = fake.FakeViewer.instances.at(-1)!

  return { renderer, callbacks, viewer }
}

beforeEach(() => {
  fake.reset()
  vi.stubGlobal("ResizeObserver", fake.FakeResizeObserver)
  vi.stubGlobal("WheelEvent", fake.FakeWheelEvent)
})

describe("mounting", () => {
  it("starts a globe without Cesium ion and without provider credentials", () => {
    const { viewer } = mount()

    expect(fake.FakeViewer.instances).toHaveLength(1)
    expect(fake.ion.defaultAccessToken).toBeUndefined()
    expect(fake.creditDisplay.cesiumCredit).toBeUndefined()
    expect(viewer.options).toMatchObject({
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      infoBox: false,
      selectionIndicator: false,
    })
    expect(viewer.options.terrainProvider).toBeInstanceOf(fake.FakeEllipsoidTerrainProvider)
    expect(fake.fromUrl).toHaveBeenCalledWith("/cesium/Assets/Textures/NaturalEarthII/")
    expect(fake.fromProviderAsync).toHaveBeenCalledTimes(1)
    expect(viewer.scene.screenSpaceCameraController.zoomEventTypes).toContainEqual({
      eventType: "wheel",
      modifier: "ctrl",
    })
  })

  it("observes container size changes for the globe canvas", () => {
    mount()

    expect(fake.FakeResizeObserver.instances).toHaveLength(1)
    expect(fake.FakeResizeObserver.instances[0].observe).toHaveBeenCalledWith(container)

    fake.FakeResizeObserver.instances[0].callback()
    expect(fake.FakeViewer.instances[0].resize).toHaveBeenCalledTimes(1)
  })

  it("amplifies only Firefox's Ctrl-wheel trackpad pinch input", () => {
    const { viewer } = mount()
    const [amplify] = [...(viewer.canvas.listeners.get("wheel") ?? [])]
    const preventDefault = vi.fn()
    const stopImmediatePropagation = vi.fn()

    amplify({
      type: "wheel",
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      clientX: 200,
      clientY: 300,
      deltaX: 0.5,
      deltaY: -2,
      deltaZ: 0,
      deltaMode: 0,
      preventDefault,
      stopImmediatePropagation,
    })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(stopImmediatePropagation).toHaveBeenCalledOnce()
    expect(viewer.canvas.dispatchedEvents).toHaveLength(1)
    expect(viewer.canvas.dispatchedEvents[0]).toMatchObject({
      ctrlKey: true,
      clientX: 200,
      clientY: 300,
      deltaX: 2.5,
      deltaY: -10,
      deltaMode: 0,
    })

    amplify({ ctrlKey: false })
    expect(viewer.canvas.dispatchedEvents).toHaveLength(1)
  })

  it("reports map clicks as event selection", () => {
    const { callbacks, viewer } = mount()
    const handler = fake.FakeScreenSpaceEventHandler.instances[0]
    const [click] = handler.actions

    viewer.scene.pick.mockReturnValueOnce({ id: new fake.FakeEntity("event-harbor-assembly") })
    ;(click.action as (movement: unknown) => void)({ position: { x: 10, y: 20 } })

    expect(callbacks.onSelectEvent).toHaveBeenCalledWith("event-harbor-assembly")
  })
})

describe("sync", () => {
  it("applies the chapter's home view once and renders one entity per scene event", () => {
    const { renderer, viewer } = mount()
    const scene = buildScene(initial, chapter)

    renderer.sync(scene)
    renderer.sync(scene)

    expect(viewer.camera.setView).toHaveBeenCalledTimes(1)
    expect(viewer.camera.setView.mock.calls[0][0].destination).toMatchObject({
      lon: 128.5,
      lat: 32.5,
    })
    expect(viewer.entities.items.map((entity) => entity.id)).toEqual(
      scene.events.map((event) => event.id),
    )
  })

  it("removes entities that leave the scene", () => {
    const { renderer, viewer } = mount()
    renderer.sync(buildScene(initial, chapter))

    const narrowed = { ...initial, timeWindow: { start: 1200, end: 1210 } }
    renderer.sync(buildScene(narrowed, chapter))

    expect(viewer.entities.items.map((entity) => entity.id)).toEqual(["event-harbor-assembly"])
  })

  it("updates an existing entity instead of recreating it", () => {
    const { renderer, viewer } = mount()
    renderer.sync(buildScene(initial, chapter))
    const before = viewer.entities.items[0]

    renderer.sync(buildScene(selectEvent(initial, chapter, "event-harbor-assembly"), chapter))
    const after = viewer.entities.items.find((entity) => entity.id === "event-harbor-assembly")

    expect(after).toBe(before)
    expect(after?.point.pixelSize).toMatchObject({ value: 16 })
  })

  it("flies to a camera target once per focus request", () => {
    const { renderer, viewer } = mount()
    const following = selectEvent(
      resumeCameraFollow(initial, chapter),
      chapter,
      "event-harbor-assembly",
    )
    const scene = buildScene(following, chapter)

    renderer.sync(scene)
    renderer.sync(scene)

    expect(viewer.camera.flyTo).toHaveBeenCalledTimes(1)
    expect(viewer.camera.flyTo.mock.calls[0][0].destination).toMatchObject({
      lon: 129.9,
      lat: 32.8,
    })

    // Resuming again issues a new token, so a fresh flight is expected.
    renderer.sync(buildScene(resumeCameraFollow(following, chapter), chapter))
    expect(viewer.camera.flyTo).toHaveBeenCalledTimes(2)
  })

  it("does not fly when the user is not following", () => {
    const { renderer, viewer } = mount()

    renderer.sync(buildScene(selectEvent(initial, chapter, "event-harbor-assembly"), chapter))

    expect(viewer.camera.flyTo).not.toHaveBeenCalled()
  })

  it("reports a manual pan once per gesture without touching time", () => {
    const { callbacks, renderer, viewer } = mount()
    renderer.sync(buildScene(initial, chapter))

    viewer.canvas.dispatch("pointerdown", { clientX: 100, clientY: 100 })
    viewer.canvas.dispatch("pointermove", { clientX: 102, clientY: 101 })
    expect(callbacks.onManualCameraInput).not.toHaveBeenCalled()

    viewer.canvas.dispatch("pointermove", { clientX: 160, clientY: 140 })
    viewer.canvas.dispatch("pointermove", { clientX: 220, clientY: 180 })
    expect(callbacks.onManualCameraInput).toHaveBeenCalledTimes(1)

    viewer.canvas.dispatch("pointerup")
    viewer.canvas.dispatch("wheel")
    expect(callbacks.onManualCameraInput).toHaveBeenCalledTimes(2)
    expect(noteManualCameraInput(initial).playhead).toBe(initial.playhead)
  })

  it("does not treat programmatic camera flights as manual input", () => {
    const { callbacks, renderer } = mount()
    const following = selectEvent(
      resumeCameraFollow(initial, chapter),
      chapter,
      "event-harbor-assembly",
    )

    renderer.sync(buildScene(following, chapter))

    expect(callbacks.onManualCameraInput).not.toHaveBeenCalled()
  })
})

describe("dispose", () => {
  it("releases the viewer, listeners, and size observer", () => {
    const { renderer, viewer } = mount()
    renderer.sync(buildScene(initial, chapter))

    renderer.dispose()

    expect(viewer.destroy).toHaveBeenCalledTimes(1)
    expect(viewer.canvas.listenerCount).toBe(0)
    expect(fake.FakeResizeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1)
    expect(fake.FakeScreenSpaceEventHandler.instances[0].destroy).toHaveBeenCalledTimes(1)

    renderer.dispose()
    expect(viewer.destroy).toHaveBeenCalledTimes(1)
  })

  it("stops reporting camera input after disposal", () => {
    const { callbacks, renderer, viewer } = mount()
    renderer.dispose()

    viewer.canvas.dispatch("pointerdown", { clientX: 0, clientY: 0 })
    viewer.canvas.dispatch("pointermove", { clientX: 200, clientY: 200 })
    viewer.canvas.dispatch("wheel")

    expect(callbacks.onManualCameraInput).not.toHaveBeenCalled()
  })

  it("ignores scene updates after disposal", () => {
    const { renderer, viewer } = mount()
    renderer.dispose()
    renderer.sync(buildScene(initial, chapter))

    expect(viewer.entities.items).toHaveLength(0)
    expect(viewer.camera.setView).not.toHaveBeenCalled()
  })
})
