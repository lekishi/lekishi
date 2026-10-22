import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { loadServedChapter } from "../chapter-catalog"
import { TANG_CHAPTER } from "../chapter-registry"
import type { Chapter } from "../domain"
import { FIXTURE_CHAPTER } from "../fixtures"
import { buildScene } from "../scene"
import {
  createAtlasState,
  noteManualCameraInput,
  resumeCameraFollow,
  returnHome,
  selectEvent,
  setLayer,
} from "../state"
import { arcFor, createGlobeAtlasRenderer, markerFor } from "./globe-renderer"

/**
 * Coverage for the globe renderer's mount, sync, input, and disposal lifecycle.
 *
 * The Three.js view is replaced by a fake: the point here is the boundary
 * contract (what the workspace asks the renderer to do, how the reader's input
 * comes back, and what the renderer releases on the way out), not WebGL. Real
 * rendering is covered by the browser checks against the built artifact.
 */
const fake = vi.hoisted(() => {
  class FakeCanvas {
    readonly listeners = new Map<string, Set<(event: unknown) => void>>()
    readonly dispatchedEvents: unknown[] = []

    addEventListener(type: string, listener: (event: unknown) => void): void {
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add(listener)
      this.listeners.set(type, listeners)
    }

    removeEventListener(type: string, listener: (event: unknown) => void): void {
      this.listeners.get(type)?.delete(listener)
    }

    dispatch(type: string, event: Record<string, unknown> = {}): void {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({ button: 0, pointerId: 1, pointerType: "mouse", timeStamp: 0, ...event })
      }
    }

    dispatchEvent(event: { type: string }): boolean {
      this.dispatchedEvents.push(event)
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

  class FakeView {
    static instances: FakeView[] = []
    readonly canvas = new FakeCanvas()
    readonly setView = vi.fn()
    readonly flyTo = vi.fn()
    readonly setMarkers = vi.fn()
    readonly setOverlays = vi.fn()
    readonly setDioramas = vi.fn()
    readonly setSafeArea = vi.fn()
    readonly markerAt = vi.fn((): string | null => null)
    readonly resize = vi.fn()
    readonly dispose = vi.fn()

    constructor(
      readonly container: unknown,
      readonly options: { tilesUrl: string; onViewChange?: (view: unknown) => void },
    ) {
      FakeView.instances.push(this)
    }

    /** The marker ids of the latest `setMarkers` call. */
    get markerIds(): string[] {
      const calls = this.setMarkers.mock.calls
      return calls.length === 0 ? [] : (calls.at(-1)?.[0] as { id: string }[]).map((m) => m.id)
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

  class FakeWheelEvent {
    constructor(
      readonly type: string,
      init: Record<string, unknown>,
    ) {
      Object.assign(this, init)
    }
  }

  return {
    FakeView,
    FakeResizeObserver,
    FakeWheelEvent,
    reset() {
      FakeView.instances = []
      FakeResizeObserver.instances = []
    },
  }
})

vi.mock("./globe/view", () => ({
  createGlobeView: (
    container: unknown,
    options: { tilesUrl: string; onViewChange?: (view: unknown) => void },
  ) => new fake.FakeView(container, options),
}))

const chapter = FIXTURE_CHAPTER
const initial = createAtlasState(chapter)
const container = { clientWidth: 1280, clientHeight: 720 } as unknown as HTMLElement

function mount() {
  const callbacks = {
    onSelectPlace: vi.fn(),
    onManualCameraInput: vi.fn(),
    onViewChange: vi.fn(),
  }
  const renderer = createGlobeAtlasRenderer(container, callbacks)
  const view = fake.FakeView.instances.at(-1)!

  return { renderer, callbacks, view }
}

beforeEach(() => {
  fake.reset()
  vi.stubGlobal("ResizeObserver", fake.FakeResizeObserver)
  vi.stubGlobal("WheelEvent", fake.FakeWheelEvent)
})

describe("mounting", () => {
  it("mounts the custom globe on the tiles the artifact ships", () => {
    const { view } = mount()

    expect(fake.FakeView.instances).toHaveLength(1)
    expect(view.container).toBe(container)
    // Same-origin tiles under the site root: no provider, token, or tile service.
    expect(view.options.tilesUrl).toBe("/globe/")
  })

  it("observes container size changes for the globe canvas", () => {
    mount()

    expect(fake.FakeResizeObserver.instances).toHaveLength(1)
    expect(fake.FakeResizeObserver.instances[0].observe).toHaveBeenCalledWith(container)

    fake.FakeResizeObserver.instances[0].callback()
    expect(fake.FakeView.instances[0].resize).toHaveBeenCalledTimes(1)
  })

  it("amplifies only Firefox's Ctrl-wheel trackpad pinch input", () => {
    const { view } = mount()
    const [amplify] = [...(view.canvas.listeners.get("wheel") ?? [])]
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
    expect(view.canvas.dispatchedEvents).toHaveLength(1)
    expect(view.canvas.dispatchedEvents[0]).toMatchObject({
      ctrlKey: true,
      clientX: 200,
      clientY: 300,
      deltaX: 2.5,
      deltaY: -10,
      deltaMode: 0,
    })

    // The replacement itself is not amplified again, and a plain wheel is left alone.
    amplify(view.canvas.dispatchedEvents[0])
    amplify({ ctrlKey: false })
    expect(view.canvas.dispatchedEvents).toHaveLength(1)
  })

  it("reports a click on a marker as event selection", () => {
    const { callbacks, view } = mount()
    view.markerAt.mockReturnValueOnce("place-north-harbor")

    view.canvas.dispatch("pointerdown", { clientX: 10, clientY: 20, timeStamp: 100 })
    view.canvas.dispatch("pointerup", { clientX: 11, clientY: 20, timeStamp: 180 })

    expect(view.markerAt).toHaveBeenCalledWith(11, 20, 8)
    expect(callbacks.onSelectPlace).toHaveBeenCalledWith("place-north-harbor")
  })

  it("reports a click on empty globe as clearing the selection", () => {
    const { callbacks, view } = mount()

    view.canvas.dispatch("pointerdown", { clientX: 10, clientY: 20 })
    view.canvas.dispatch("pointerup", { clientX: 10, clientY: 20 })

    expect(callbacks.onSelectPlace).toHaveBeenCalledWith(null)
  })

  it("gives a tap a wider reach than a mouse click", () => {
    const { view } = mount()

    view.canvas.dispatch("pointerdown", { clientX: 10, clientY: 20, pointerType: "touch" })
    view.canvas.dispatch("pointerup", { clientX: 10, clientY: 20, pointerType: "touch" })

    expect(view.markerAt).toHaveBeenCalledWith(10, 20, 14)
  })

  it("does not select on a drag, a long press, or a secondary button", () => {
    const { callbacks, view } = mount()

    view.canvas.dispatch("pointerdown", { clientX: 10, clientY: 20 })
    view.canvas.dispatch("pointermove", { clientX: 60, clientY: 20 })
    view.canvas.dispatch("pointerup", { clientX: 60, clientY: 20 })

    view.canvas.dispatch("pointerdown", { clientX: 10, clientY: 20, timeStamp: 0 })
    view.canvas.dispatch("pointerup", { clientX: 10, clientY: 20, timeStamp: 900 })

    view.canvas.dispatch("pointerdown", { clientX: 10, clientY: 20, button: 2 })
    view.canvas.dispatch("pointerup", { clientX: 10, clientY: 20, button: 2 })

    expect(callbacks.onSelectPlace).not.toHaveBeenCalled()
  })
})

describe("sync", () => {
  it("applies the chapter's home view once and draws one marker per place", () => {
    const { renderer, view } = mount()
    const scene = buildScene(initial, chapter)

    renderer.sync(scene)
    renderer.sync(scene)

    expect(view.setView).toHaveBeenCalledTimes(1)
    expect(view.setView).toHaveBeenCalledWith({ lon: 128.5, lat: 32.5 }, 9_000_000)
    // The map draws places, each once, however many events stand at it; a
    // list-only event stays in the scene and adds no marker, because the map
    // must not invent the position it does not have.
    expect(view.markerIds).toEqual(scene.places.map((place) => place.id))
    expect(new Set(view.markerIds).size).toBe(view.markerIds.length)
    expect(scene.events.length).toBeGreaterThan(view.markerIds.length)
  })

  it("removes markers that leave the scene", () => {
    const { renderer, view } = mount()
    renderer.sync(buildScene(initial, chapter))

    const narrowed = { ...initial, timeWindow: { start: 1200, end: 1210 } }
    renderer.sync(buildScene(narrowed, chapter))

    expect(view.markerIds).toEqual(["place-north-harbor"])
  })

  it("emphasizes the selected event's place", () => {
    const { renderer, view } = mount()

    renderer.sync(buildScene(selectEvent(initial, chapter, "event-harbor-assembly"), chapter))
    const markers = view.setMarkers.mock.calls.at(-1)?.[0] as { id: string; emphasis: string }[]

    expect(markers.find((m) => m.id === "place-north-harbor")?.emphasis).toBe("selected")
    expect(markers.filter((m) => m.emphasis === "selected")).toHaveLength(1)
  })

  it("flies to a camera target once per focus request", () => {
    const { renderer, view } = mount()
    const following = selectEvent(
      resumeCameraFollow(initial, chapter),
      chapter,
      "event-harbor-assembly",
    )
    const scene = buildScene(following, chapter)

    renderer.sync(scene)
    renderer.sync(scene)

    expect(view.flyTo).toHaveBeenCalledTimes(1)
    expect(view.flyTo.mock.calls[0][0]).toMatchObject({ lon: 129.9, lat: 32.8 })
    expect(view.flyTo.mock.calls[0][1]).toBe(1_600_000)

    // Resuming again issues a new token, so a fresh flight is expected.
    renderer.sync(buildScene(resumeCameraFollow(following, chapter), chapter))
    expect(view.flyTo).toHaveBeenCalledTimes(2)
  })

  it("does not fly when the user is not following", () => {
    const { renderer, view } = mount()

    renderer.sync(buildScene(selectEvent(initial, chapter, "event-harbor-assembly"), chapter))

    expect(view.flyTo).not.toHaveBeenCalled()
  })

  it("reports a manual pan once per gesture without touching time", () => {
    const { callbacks, renderer, view } = mount()
    renderer.sync(buildScene(initial, chapter))

    view.canvas.dispatch("pointerdown", { clientX: 100, clientY: 100 })
    view.canvas.dispatch("pointermove", { clientX: 102, clientY: 101 })
    expect(callbacks.onManualCameraInput).not.toHaveBeenCalled()

    view.canvas.dispatch("pointermove", { clientX: 160, clientY: 140 })
    view.canvas.dispatch("pointermove", { clientX: 220, clientY: 180 })
    expect(callbacks.onManualCameraInput).toHaveBeenCalledTimes(1)

    view.canvas.dispatch("pointerup", { clientX: 220, clientY: 180 })
    view.canvas.dispatch("wheel")
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

describe("the evidence grammar", () => {
  let tang: Chapter

  beforeAll(async () => {
    tang = await loadServedChapter(TANG_CHAPTER)
  })

  it("hands each place's evidence form, count and dispute to its marker", () => {
    const { renderer, view } = mount()
    const scene = buildScene(createAtlasState(tang), tang)
    renderer.sync(scene)
    const markers = view.setMarkers.mock.calls.at(-1)?.[0] as ReturnType<typeof markerFor>[]

    expect(markers).toEqual(scene.places.map(markerFor))

    for (const [index, place] of scene.places.entries()) {
      expect(markers[index]).toMatchObject({
        mark: place.mark,
        precision: place.precision,
        count: place.eventCount,
        disputed: place.disputed,
        tradition: place.tradition,
        tone: place.tone,
      })
    }

    // The Tang chapter's opening window has identified localities, display
    // anchors and several events at one place, so the grammar is exercised
    // on real content.
    expect(new Set(markers.map((marker) => marker.mark))).toEqual(new Set(["identified", "anchor"]))
    expect(markers.some((marker) => marker.count > 1)).toBe(true)
  })

  it("passes journeys, arcs and dioramas to the view, as plain data", () => {
    const { renderer, view } = mount()
    let state = selectEvent(createAtlasState(tang), tang, "lks:event:akimeya-landfall-753")
    state = setLayer(state, "diplomacy", true)
    const scene = buildScene(state, tang)
    renderer.sync(scene)
    const overlays = view.setOverlays.mock.calls.at(-1)?.[0] as {
      journeys: { id: string; stops: unknown[]; vessel: unknown; selected: boolean }[]
      arcs: ReturnType<typeof arcFor>[]
    }

    expect(scene.journeys.length).toBeGreaterThan(0)
    expect(overlays.journeys.map((journey) => journey.id)).toEqual(
      scene.journeys.map((journey) => journey.id),
    )

    for (const [index, journey] of scene.journeys.entries()) {
      expect(overlays.journeys[index].stops).toEqual(journey.stops.map((stop) => stop.position))
      expect(overlays.journeys[index].vessel).toEqual(journey.vessel)
      expect(overlays.journeys[index].selected).toBe(journey.selected)
    }

    // The landfall is a stop of 鑒眞's voyage, so that journey is the selected one.
    expect(overlays.journeys.find((journey) => journey.id === "jianzhen-voyage")?.selected).toBe(
      true,
    )
    expect(scene.arcs.length).toBeGreaterThan(0)
    expect(overlays.arcs).toEqual(scene.arcs.map(arcFor))
    // Territory is drawn on the markers, never as a line or an area.
    expect(Object.keys(overlays).sort()).toEqual(["arcs", "journeys"])
    expect(view.setDioramas).toHaveBeenLastCalledWith([
      {
        id: "akimeya",
        url: "/dioramas/akimeya.json",
        center: scene.dioramas[0].center,
        showBelowMeters: 220_000,
      },
    ])
  })

  it("captions an arc with its ends in the arc's direction", () => {
    const arc = {
      id: "r",
      family: "diplomacy" as const,
      label: "An embassy",
      from: { lon: 135.8, lat: 34.7 },
      to: { lon: 108.9, lat: 34.3 },
      fromLabel: "日本",
      toLabel: "唐",
      directed: true,
      emphasis: "selected" as const,
    }

    expect(arcFor(arc).caption).toBe("日本 → 唐")
    expect(arcFor({ ...arc, directed: false }).caption).toBe("日本 – 唐")
  })
})

describe("framing", () => {
  it("applies the safe area before the first view, so the home view lands in the clear zone", () => {
    const { renderer, view } = mount()
    const safeArea = { top: 56, right: 384, bottom: 120, left: 288 }

    renderer.sync({ ...buildScene(initial, chapter), safeArea })

    expect(view.setSafeArea).toHaveBeenCalledWith(safeArea)
    expect(view.setSafeArea.mock.invocationCallOrder[0]).toBeLessThan(
      view.setView.mock.invocationCallOrder[0],
    )

    const narrower = { ...safeArea, right: 0 }
    renderer.sync({ ...buildScene(initial, chapter), safeArea: narrower })
    expect(view.setSafeArea).toHaveBeenLastCalledWith(narrower)
  })

  it("flies home once per home request, never on the first sync", () => {
    const { renderer, view } = mount()
    const home = returnHome(initial)

    // A scene that arrives already carrying a home token is the first view.
    renderer.sync(buildScene(home, chapter))
    expect(view.flyTo).not.toHaveBeenCalled()

    renderer.sync(buildScene(returnHome(home), chapter))
    renderer.sync(buildScene(returnHome(home), chapter))

    expect(view.flyTo).toHaveBeenCalledTimes(1)
    expect(view.flyTo).toHaveBeenCalledWith(chapter.homeView, 9_000_000, 1_200)
  })

  it("reports where the camera looks, and stops after disposal", () => {
    const { callbacks, renderer, view } = mount()
    const report = { center: { lon: 130.2, lat: 31.3 }, heightMeters: 120_000 }

    view.options.onViewChange?.(report)
    expect(callbacks.onViewChange).toHaveBeenCalledWith(report)

    renderer.dispose()
    view.options.onViewChange?.(report)
    expect(callbacks.onViewChange).toHaveBeenCalledTimes(1)
  })
})

describe("dispose", () => {
  it("releases the view, listeners, and size observer", () => {
    const { renderer, view } = mount()
    renderer.sync(buildScene(initial, chapter))

    renderer.dispose()

    expect(view.dispose).toHaveBeenCalledTimes(1)
    expect(view.canvas.listenerCount).toBe(0)
    expect(fake.FakeResizeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1)

    renderer.dispose()
    expect(view.dispose).toHaveBeenCalledTimes(1)
  })

  it("stops reporting camera input after disposal", () => {
    const { callbacks, renderer, view } = mount()
    renderer.dispose()

    view.canvas.dispatch("pointerdown", { clientX: 0, clientY: 0 })
    view.canvas.dispatch("pointermove", { clientX: 200, clientY: 200 })
    view.canvas.dispatch("wheel")

    expect(callbacks.onManualCameraInput).not.toHaveBeenCalled()
  })

  it("ignores scene updates after disposal", () => {
    const { renderer, view } = mount()
    renderer.dispose()
    renderer.sync(buildScene(initial, chapter))

    expect(view.setMarkers).not.toHaveBeenCalled()
    expect(view.setOverlays).not.toHaveBeenCalled()
    expect(view.setDioramas).not.toHaveBeenCalled()
    expect(view.setSafeArea).not.toHaveBeenCalled()
    expect(view.setView).not.toHaveBeenCalled()
  })
})
