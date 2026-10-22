import * as THREE from "three"
import { GlobeControls, WGS84_ELLIPSOID } from "3d-tiles-renderer/three"
import type { GeoPoint } from "../../domain"
import { DioramaLayer, type GlobeDiorama } from "./diorama"
import { principalOffset, ViewThrottle, type Insets } from "./framing"
import {
  MEAN_RADIUS_M,
  eyeFor,
  fromEcef,
  interpolatePose,
  poseOf,
  surfaceDistance,
  toEcef,
  type CameraPose,
  type Vec3,
} from "./geo"
import { placeLabelBoxes, type LabelBox } from "./labels"
import { LineLayer, type GlobeOverlays } from "./line-layer"
import { HORIZON2, hiddenByEarth, type ScreenPoint } from "./lines"
import { markerLook, type GlobeMarker, type MarkerLook } from "./marks"
import { GlobeTiles, type Tileset } from "./tiles"

export type { GlobeMarker } from "./marks"
export type { GlobeOverlays, GlobeJourney, GlobeArc } from "./line-layer"
export type { GlobeDiorama } from "./diorama"

/**
 * The custom globe's Three.js view: the WebGL canvas, the camera and its
 * controls, the tiles, the atmosphere, and the markers and labels the atlas
 * draws on top. It knows nothing about events, time, or selection state; the
 * atlas renderer (`../globe-renderer.ts`) translates the scene into markers and
 * user input into callbacks.
 *
 * Markers, labels and lines are HTML and SVG laid over the canvas and
 * positioned each frame from the 3D scene: text stays crisp in every script
 * the browser can set, a line's dash or double stroke stays the same in
 * pixels at every altitude, and every colour is a design-system token the
 * browser resolves. None of it takes the pointer, so a drag that starts on a
 * label still turns the globe (`markerAt` hit-tests markers for a click).
 * The diorama's symbols are the one atlas layer drawn in WebGL, because they
 * stand on the terrain.
 *
 * The camera frames into the clear zone the workspace's chrome leaves
 * (`setSafeArea`): the projection's principal point moves to the clear zone's
 * centre, so every flight lands its target there, and the markers, lines and
 * camera controls all project through that same camera.
 *
 * The view draws a frame only when something changed (the camera, a tile
 * arriving, the markers, the size), so an idle atlas does not spin the GPU.
 */

/** Where the camera is looking: the ground at the clear zone's centre, and its height. */
export type GlobeCameraView = {
  readonly center: GeoPoint
  readonly heightMeters: number
}

export interface GlobeView {
  /** The WebGL canvas; the renderer listens to it for the reader's input. */
  readonly canvas: HTMLCanvasElement
  /** Puts the camera straight above a point at once. */
  setView(target: GeoPoint, rangeM: number): void
  /** Flies the camera to straight above a point; input from the reader cancels it. */
  flyTo(target: GeoPoint, rangeM: number, durationMs: number): void
  setMarkers(markers: readonly GlobeMarker[]): void
  /** Journeys and relationship arcs, drawn under the markers. */
  setOverlays(overlays: GlobeOverlays): void
  /** The scene's dioramas; each is fetched the first time the camera is low over it. */
  setDioramas(dioramas: readonly GlobeDiorama[]): void
  /** The scene's edges the chrome covers, in CSS pixels; flights frame into the rest. */
  setSafeArea(insets: Insets): void
  /** The marker (dot or label) under a client point, within `radiusPx` of its dot. */
  markerAt(clientX: number, clientY: number, radiusPx: number): string | null
  /** Matches the drawing buffer to the container's size. */
  resize(): void
  /** Releases the WebGL context, workers, and listeners. Idempotent. */
  dispose(): void
}

export type GlobeViewOptions = {
  /** Where `tileset.json` and the bundles are served, ending in `/`. */
  readonly tilesUrl: string
  /** Vertical exaggeration for terrain, as in the renderer spike. */
  readonly exaggeration?: number
  /** Where the camera looks, reported a few times a second at most and once when it settles. */
  readonly onViewChange?: (view: GlobeCameraView) => void
}

const SPACE = "#020617"
const ATMOSPHERE = "#9fc4dc"
const HAZE = new THREE.Color("#b6ccd9")
const ZENITH = new THREE.Color("#5a86ab")
const FOV_DEG = 40
/** The view is reported to the workspace at most this often while the camera moves. */
const VIEW_REPORT_MS = 250

type MarkerEntry = {
  data: GlobeMarker
  look: MarkerLook
  readonly root: HTMLDivElement
  readonly control: HTMLSpanElement
  readonly pulse: HTMLSpanElement
  readonly mark: HTMLSpanElement
  readonly core: HTMLSpanElement
  readonly count: HTMLSpanElement
  readonly label: HTMLSpanElement
  world: THREE.Vector3
  labelWidth: number
  screen: { x: number; y: number } | null
  labelShown: boolean
}

type Flight = {
  from: CameraPose
  to: CameraPose
  start: number
  duration: number
  arcRangeM: number
}

class ThreeGlobeView implements GlobeView {
  readonly canvas: HTMLCanvasElement
  private readonly container: HTMLElement
  private readonly overlay: HTMLDivElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 1, 4e7)
  private readonly globe = new THREE.Group()
  private readonly controls: GlobeControls
  private readonly sun = new THREE.DirectionalLight("#fff1dc", 2.1)
  private readonly hemisphere = new THREE.HemisphereLight("#dcecff", "#6b5a3b", 0.6)
  private readonly atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  private readonly fog = new THREE.FogExp2(HAZE, 0)
  private readonly exaggeration: number
  private readonly abort = new AbortController()
  private tiles: GlobeTiles | null = null
  private markers = new Map<string, MarkerEntry>()
  private readonly lines: LineLayer
  private readonly dioramas: DioramaLayer
  private safeArea: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  private readonly viewThrottle = new ViewThrottle(VIEW_REPORT_MS)
  private readonly onViewChange: ((view: GlobeCameraView) => void) | null
  private readonly projected = new THREE.Vector3()
  private flight: Flight | null = null
  private driving = false
  private warming = false
  private warmed = false
  private dirty = true
  private markersDirty = true
  private readonly lastCamera = new THREE.Matrix4()
  private raf = 0
  private disposed = false

  // Any input on the globe hands the camera to the controls and ends a flight
  // (a wheel turn alone does not fire the controls' start event).
  private readonly takeControl = (): void => {
    this.driving = true
    this.flight = null
    this.dirty = true
  }

  private readonly restoreContext = (): void => {
    this.dirty = true
  }

  constructor(container: HTMLElement, options: GlobeViewOptions) {
    this.container = container
    this.exaggeration = options.exaggeration ?? 2.2
    this.onViewChange = options.onViewChange ?? null
    this.canvas = document.createElement("canvas")
    this.canvas.className = "block h-full w-full touch-none outline-none"
    this.overlay = document.createElement("div")
    this.overlay.className = "pointer-events-none absolute inset-0 overflow-hidden"
    this.overlay.setAttribute("aria-hidden", "true")

    // Throws where WebGL is unavailable; the workspace reports it.
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
    })
    this.canvas.addEventListener("webglcontextrestored", this.restoreContext)
    container.append(this.canvas, this.overlay)
    this.lines = new LineLayer(this.overlay)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.setClearColor(new THREE.Color(SPACE))

    this.globe.name = "globe"
    this.scene.fog = this.fog
    this.scene.add(this.globe, this.sun, this.sun.target, this.hemisphere)
    this.atmosphere = this.createAtmosphere()
    this.sky = this.createSky()
    this.scene.add(this.atmosphere, this.sky)
    this.dioramas = new DioramaLayer({
      scene: this.scene,
      exaggeration: this.exaggeration,
      signal: this.abort.signal,
      compile: (object) => this.renderer.compileAsync(object, this.camera, this.scene),
      onReady: () => {
        this.dirty = true
      },
    })

    this.controls = new GlobeControls(this.globe, this.camera, this.canvas)
    this.controls.setEllipsoid(WGS84_ELLIPSOID, this.globe)
    this.controls.enableDamping = true
    this.controls.addEventListener("start", this.takeControl)

    for (const type of ["pointerdown", "wheel", "touchstart"] as const) {
      this.canvas.addEventListener(type, this.takeControl, { passive: true, capture: true })
    }

    this.resize()
    void this.loadTiles(options.tilesUrl)
    this.raf = requestAnimationFrame(this.frame)
  }

  private async loadTiles(tilesUrl: string): Promise<void> {
    try {
      const base = new URL(tilesUrl, window.location.href).href
      const response = await fetch(new URL("tileset.json", base), { signal: this.abort.signal })

      if (!response.ok) {
        throw new Error(`${response.status} loading the globe's tileset`)
      }

      const tileset = (await response.json()) as Tileset

      if (this.disposed) return
      // GPU memory for tiles: phones and tablets get half; a tile they evict
      // and need again comes from the HTTP cache.
      const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false
      this.tiles = new GlobeTiles({
        baseUrl: base,
        tileset,
        exaggeration: this.exaggeration,
        memoryBudgetMB: coarse ? 128 : 256,
        onChange: () => {
          this.dirty = true
          this.markersDirty = true
        },
      })
      this.globe.add(this.tiles.group)
      this.dirty = true
    } catch (error) {
      if (!this.disposed) console.error("globe: the tileset did not load", error)
    }
  }

  private createAtmosphere(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { color: { value: new THREE.Color(ATMOSPHERE) } },
      vertexShader:
        "varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }",
      fragmentShader:
        "uniform vec3 color; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(color*f*1.4, f); }",
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(6378137 * 1.025, 96, 48), material)
    mesh.raycast = () => {}
    return mesh
  }

  // Low over the Earth the reader faces a horizon, not space: a sky gradient
  // fills the view above it and a distance haze softens the terrain toward it.
  // Both fade out with altitude, so the globe seen from space stays crisp.
  private createSky(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      uniforms: {
        horizon: { value: HAZE },
        zenith: { value: ZENITH },
        up: { value: new THREE.Vector3(0, 0, 1) },
        sinDip: { value: 0 },
        strength: { value: 0 },
      },
      vertexShader:
        "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
      // Elevation 0 is the true horizon, which lies below the local horizontal
      // by the dip angle at the camera's altitude; below it is the Earth.
      fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; uniform vec3 up; uniform float sinDip; uniform float strength; varying vec3 vDir;
        void main(){ float h = dot(normalize(vDir), up) + sinDip;
          vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.5, h));
          gl_FragColor = vec4(c, strength * smoothstep(-0.01, 0.015, h));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material)
    mesh.renderOrder = -1
    mesh.frustumCulled = false
    mesh.raycast = () => {}
    return mesh
  }

  private updateAtmosphere(): void {
    const altitude = Math.max(1, this.camera.position.length() - MEAN_RADIUS_M)
    const horizonDistance = Math.sqrt(2 * MEAN_RADIUS_M * altitude + altitude * altitude)
    const fade = 1 - THREE.MathUtils.smoothstep(altitude, 150e3, 900e3)
    // About 80% haze at the horizon low down, none from space.
    this.fog.density = (1.3 / horizonDistance) * fade

    if (this.tiles) this.tiles.fogDensity = this.fog.density

    const uniforms = this.sky.material.uniforms
    ;(uniforms.up.value as THREE.Vector3).copy(this.camera.position).normalize()
    uniforms.sinDip.value = Math.sqrt(1 - (MEAN_RADIUS_M / (MEAN_RADIUS_M + altitude)) ** 2)
    uniforms.strength.value = 1 - THREE.MathUtils.smoothstep(altitude, 60e3, 400e3)
    this.sky.visible = uniforms.strength.value > 0
    this.sky.position.copy(this.camera.position)
    this.sky.scale.setScalar(this.camera.near * 20)
    this.sky.updateMatrixWorld()
  }

  // The light follows the camera, from over the reader's left shoulder, so
  // relief reads the same wherever on Earth they look. A fixed sun would leave
  // half the globe in night, which an atlas of every era cannot afford.
  private updateLight(): void {
    const toCamera = this.camera.position.clone().normalize()
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1)
    const direction = toCamera
      .multiplyScalar(0.75)
      .addScaledVector(up, 0.5)
      .addScaledVector(right, -0.45)
      .normalize()
    this.sun.target.position.set(0, 0, 0)
    this.sun.position.copy(direction).multiplyScalar(MEAN_RADIUS_M * 2)
    this.sun.target.updateMatrixWorld()
    this.hemisphere.position.copy(this.camera.position).normalize()
  }

  private applyPose(pose: CameraPose): void {
    const { eye, up, target } = eyeFor(pose)
    this.camera.position.set(...eye)
    this.camera.up.set(...up)
    this.camera.lookAt(...target)
    const altitude = this.camera.position.length() - MEAN_RADIUS_M
    this.camera.near = Math.max(1, altitude * 0.02)
    this.camera.far = 4e7
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
    this.dirty = true
  }

  private currentPose(): CameraPose {
    const direction = new THREE.Vector3()
    this.camera.getWorldDirection(direction)
    const p = this.camera.position
    return poseOf([p.x, p.y, p.z], [direction.x, direction.y, direction.z])
  }

  setView(target: GeoPoint, rangeM: number): void {
    if (this.disposed) return
    this.flight = null
    this.driving = false
    this.applyPose({ lon: target.lon, lat: target.lat, rangeM, headingDeg: 0, pitchDeg: -90 })
  }

  flyTo(target: GeoPoint, rangeM: number, durationMs: number): void {
    if (this.disposed) return
    const to: CameraPose = {
      lon: target.lon,
      lat: target.lat,
      rangeM,
      headingDeg: 0,
      pitchDeg: -90,
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

    // Reduced motion: the camera arrives without the journey.
    if (reduced || durationMs <= 0) {
      this.setView(target, rangeM)
      return
    }

    const from = this.currentPose()
    // A long flight climbs high enough to see where it is going.
    const distance = surfaceDistance(from, to)
    const arcRangeM = Math.min(1.6e7, distance * 1.1)
    this.driving = false
    this.flight = { from, to, start: performance.now(), duration: durationMs, arcRangeM }
    this.dirty = true
  }

  setMarkers(markers: readonly GlobeMarker[]): void {
    if (this.disposed) return
    const present = new Set<string>()

    for (const data of markers) {
      present.add(data.id)
      const entry = this.markers.get(data.id) ?? this.createMarker(data)
      this.updateMarker(entry, data)
    }

    for (const [id, entry] of this.markers) {
      if (!present.has(id)) {
        entry.root.remove()
        this.markers.delete(id)
      }
    }

    this.markersDirty = true
    this.dirty = true
  }

  setOverlays(overlays: GlobeOverlays): void {
    if (this.disposed) return

    if (this.lines.set(overlays, this.heightAt)) {
      this.dirty = true
    }
  }

  setDioramas(dioramas: readonly GlobeDiorama[]): void {
    if (this.disposed) return
    this.dioramas.set(dioramas)
    this.dirty = true
  }

  setSafeArea(insets: Insets): void {
    if (this.disposed) return
    const current = this.safeArea

    if (
      current.top === insets.top &&
      current.right === insets.right &&
      current.bottom === insets.bottom &&
      current.left === insets.left
    ) {
      return
    }

    this.safeArea = {
      top: insets.top,
      right: insets.right,
      bottom: insets.bottom,
      left: insets.left,
    }
    this.applyProjection()
  }

  /** Ground height as the tiles draw it, for laying markers and lines on the terrain. */
  private readonly heightAt = (lon: number, lat: number): number =>
    this.tiles?.heightAt(lon, lat) ?? 0

  private createMarker(data: GlobeMarker): MarkerEntry {
    const root = document.createElement("div")
    root.dataset.markerId = data.id
    const part = () => {
      const span = document.createElement("span")
      root.append(span)
      return span
    }
    // In drawing order: a controller's disc and the selection's pulse under
    // the mark, the label on top.
    const control = part()
    const pulse = part()
    const mark = part()
    const core = part()
    const count = part()
    const label = part()
    this.overlay.append(root)
    const entry: MarkerEntry = {
      data,
      look: markerLook(data),
      root,
      control,
      pulse,
      mark,
      core,
      count,
      label,
      world: new THREE.Vector3(),
      labelWidth: 0,
      screen: null,
      labelShown: true,
    }
    this.markers.set(data.id, entry)
    return entry
  }

  private updateMarker(entry: MarkerEntry, data: GlobeMarker): void {
    const previous = entry.data
    const look = markerLook(data)
    const hidden = entry.screen === null
    entry.data = data
    entry.look = look
    entry.root.className = `${look.group} will-change-transform${hidden ? " hidden" : ""}`
    entry.root.dataset.mark = data.mark
    entry.root.style.zIndex = String(look.priority + 1)

    const sized = (element: HTMLElement, className: string | null, size: number) => {
      element.className = className ?? "hidden"
      element.style.width = `${size}px`
      element.style.height = `${size}px`
    }

    sized(entry.mark, look.mark, look.size)
    sized(entry.core, look.core, Math.max(4, Math.round(look.size * 0.42)))
    sized(entry.pulse, look.pulse, look.size + 10)
    sized(entry.control, look.control, look.controlSize)

    if (data.control === null) {
      delete entry.root.dataset.control
    } else {
      entry.root.dataset.control = data.control.seat ? "seat" : "held"
    }

    entry.count.className = look.count ?? "hidden"
    entry.count.style.left = `${Math.round(look.hitRadius + 3)}px`
    entry.count.textContent = data.count > 1 ? String(data.count) : ""

    entry.label.className = look.label
    entry.label.style.bottom = `${look.labelOffset}px`

    if (entry.label.textContent !== data.label || previous.emphasis !== data.emphasis) {
      entry.label.textContent = data.label
      entry.labelWidth = 0
    }

    entry.label.style.visibility = entry.labelShown ? "" : "hidden"
  }

  /** Projects a world point to the canvas, or null behind the horizon or the camera. */
  private project(world: Vec3, eye: Vec3, width: number, height: number): ScreenPoint | null {
    if (hiddenByEarth(world, eye)) return null
    const p = this.projected.set(...world).project(this.camera)

    // Samples far off the screen still count: low over a stop, the next
    // sample is tens of kilometres away, and the line must still run off the
    // edge toward it. Only a sample nearly in the camera's plane, whose
    // projection explodes, breaks the line.
    if (p.z >= 1 || Math.abs(p.x) > 1e4 || Math.abs(p.y) > 1e4) return null
    return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height }
  }

  /**
   * Projects the lines and markers and decides which labels fit. Runs only
   * when a frame is drawn.
   */
  private placeOverlay(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    const eye = this.camera.position
    const eyeAt: Vec3 = [eye.x, eye.y, eye.z]
    const projected = new THREE.Vector3()
    const boxes: LabelBox[] = []

    // New tiles change the ground the lines and markers stand on.
    if (this.markersDirty) {
      this.lines.refresh(this.heightAt)
    }

    const captions = this.lines.place((world) => this.project(world, eyeAt, width, height))

    for (const entry of this.markers.values()) {
      if (this.markersDirty) {
        const h = this.heightAt(entry.data.lon, entry.data.lat)
        entry.world.set(...toEcef(entry.data.lon, entry.data.lat, h))
      }

      projected.copy(entry.world).project(this.camera)
      const visible =
        entry.world.dot(eye) > HORIZON2 &&
        projected.z < 1 &&
        Math.abs(projected.x) <= 1.05 &&
        Math.abs(projected.y) <= 1.05

      if (!visible) {
        entry.screen = null
        entry.root.classList.add("hidden")
        continue
      }

      const x = ((projected.x + 1) / 2) * width
      const y = ((1 - projected.y) / 2) * height
      entry.screen = { x, y }
      entry.root.classList.remove("hidden")
      entry.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`

      if (entry.labelWidth === 0) entry.labelWidth = entry.label.offsetWidth
      const { labelHeight, labelOffset, priority } = entry.look
      boxes.push({
        id: entry.data.id,
        priority,
        left: x - entry.labelWidth / 2,
        top: y - labelOffset - labelHeight,
        width: entry.labelWidth,
        height: labelHeight,
      })
    }

    // The lines' captions compete with place names for room and lose to them
    // (their priorities are negative), and never cover a mark: a place is
    // never hidden for a caption.
    const marks = [...this.markers.values()].flatMap(({ screen, look }) =>
      screen === null
        ? []
        : [
            {
              left: screen.x - look.hitRadius,
              top: screen.y - look.hitRadius,
              right: screen.x + look.hitRadius,
              bottom: screen.y + look.hitRadius,
            },
          ],
    )
    const clear = (box: LabelBox) =>
      !marks.some(
        (mark) =>
          box.left < mark.right &&
          mark.left < box.left + box.width &&
          box.top < mark.bottom &&
          mark.top < box.top + box.height,
      )

    for (const caption of captions) {
      boxes.push(...caption.boxes.filter(clear))
    }

    const placed = placeLabelBoxes(boxes)

    for (const entry of this.markers.values()) {
      const show = placed.has(entry.data.id)

      if (show !== entry.labelShown) {
        entry.labelShown = show
        entry.label.style.visibility = show ? "" : "hidden"
      }
    }

    for (const caption of captions) {
      caption.show(placed.get(caption.id) ?? null)
    }

    this.markersDirty = false
  }

  markerAt(clientX: number, clientY: number, radiusPx: number): string | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    let nearest: string | null = null
    let nearestDistance = Infinity
    let nearestPriority = -1

    for (const entry of this.markers.values()) {
      if (entry.screen === null) continue
      const distance = Math.hypot(entry.screen.x - x, entry.screen.y - y)
      const reach = radiusPx + entry.look.hitRadius
      const priority = entry.look.priority

      // Co-located events must pick the dot drawn on top, not insertion order.
      if (
        distance <= reach &&
        (distance < nearestDistance || (distance === nearestDistance && priority > nearestPriority))
      ) {
        nearest = entry.data.id
        nearestDistance = distance
        nearestPriority = priority
      }
    }

    if (nearest !== null) return nearest

    // A shown label is as good a target as its dot.
    for (const entry of this.markers.values()) {
      if (entry.screen === null || !entry.labelShown) continue
      const box = entry.label.getBoundingClientRect()

      if (
        clientX >= box.left - 2 &&
        clientX <= box.right + 2 &&
        clientY >= box.top - 2 &&
        clientY <= box.bottom + 2
      ) {
        return entry.data.id
      }
    }

    return null
  }

  resize(): void {
    if (this.disposed) return
    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1
    this.renderer.setSize(width, height, false)
    this.applyProjection()
  }

  /**
   * Sizes the projection to the canvas and moves its principal point to the
   * centre of the clear zone. The full image is the canvas itself, so the
   * scale is unchanged and only the centre moves; the camera controls, the
   * tiles' culling and the overlay all read this one projection matrix.
   */
  private applyProjection(): void {
    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1
    const offset = principalOffset(width, height, this.safeArea)
    this.camera.aspect = width / height

    if (offset.x === 0 && offset.y === 0) {
      this.camera.clearViewOffset()
    } else {
      this.camera.setViewOffset(width, height, offset.x, offset.y, width, height)
    }

    this.camera.updateProjectionMatrix()
    this.dirty = true
  }

  /** The ground at the clear zone's centre, and the camera's height above the terrain. */
  private cameraView(): GlobeCameraView {
    const p = this.camera.position
    const pose = this.currentPose()
    const under = fromEcef(p.x, p.y, p.z)
    return {
      center: { lon: pose.lon, lat: pose.lat },
      heightMeters: Math.max(1, under.height - this.heightAt(under.lon, under.lat)),
    }
  }

  // Compiles every shader the globe can draw while the first view is on
  // screen, so no program is compiled mid-flight: on the spike's iPhone a
  // program compiled during the flight cost an 808 ms frame.
  private async warmUp(): Promise<void> {
    this.warming = true
    const pivot = (this.controls as unknown as { pivotMesh?: THREE.Object3D }).pivotMesh
    const pivotParent = pivot?.parent ?? null
    const pivotVisible = pivot?.visible ?? false
    const skyVisible = this.sky.visible

    if (pivot) {
      this.scene.add(pivot)
      pivot.visible = true
    }

    this.sky.visible = true

    try {
      await this.renderer.compileAsync(this.scene, this.camera)
    } catch (error) {
      console.warn("globe: shader warm-up failed", error)
    } finally {
      if (pivot) {
        if (pivotParent) pivotParent.add(pivot)
        else this.scene.remove(pivot)
        pivot.visible = pivotVisible
      }

      this.sky.visible = skyVisible
      this.warming = false
      this.dirty = true
    }
  }

  private readonly frame = (): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)

    if (this.warming) return

    if (this.flight) {
      const t = (performance.now() - this.flight.start) / this.flight.duration
      this.applyPose(interpolatePose(this.flight.from, this.flight.to, t, this.flight.arcRangeM))
      if (t >= 1) this.flight = null
    } else if (this.driving) {
      this.controls.update()
    }

    this.camera.updateMatrixWorld()
    const moved = !this.camera.matrixWorld.equals(this.lastCamera)
    const tiles = this.tiles
    const loading = tiles !== null && !tiles.settled

    // Reported before the idle check: the camera coming to rest is a frame
    // with nothing to draw, and it is the report the minimap needs most.
    if (this.onViewChange && this.viewThrottle.frame(performance.now(), moved)) {
      this.onViewChange(this.cameraView())
    }

    if (!moved && !this.dirty && !loading) return

    this.lastCamera.copy(this.camera.matrixWorld)
    this.dirty = false
    this.updateAtmosphere()
    this.updateLight()
    const p = this.camera.position
    const under = fromEcef(p.x, p.y, p.z)
    this.dioramas.update(under.height - this.heightAt(under.lon, under.lat), under)
    tiles?.update(this.camera, this.container.clientHeight || 1)
    this.renderer.render(this.scene, this.camera)
    this.placeOverlay()

    if (!this.warmed && tiles?.rootsReady) {
      this.warmed = true
      void this.warmUp()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.abort.abort()
    this.canvas.removeEventListener("webglcontextrestored", this.restoreContext)

    for (const type of ["pointerdown", "wheel", "touchstart"] as const) {
      this.canvas.removeEventListener(type, this.takeControl, { capture: true })
    }

    this.controls.removeEventListener("start", this.takeControl)
    this.controls.dispose()
    this.tiles?.dispose()
    this.tiles = null
    this.atmosphere.geometry.dispose()
    this.atmosphere.material.dispose()
    this.sky.geometry.dispose()
    this.sky.material.dispose()
    this.dioramas.dispose()
    this.lines.dispose()
    this.markers.clear()
    this.renderer.dispose()
    // Hand the WebGL context back now rather than at garbage collection:
    // browsers cap live contexts, and a chapter switch must not leak one.
    this.renderer.forceContextLoss()
    this.overlay.remove()
    this.canvas.remove()
  }
}

/** Mounts the globe view into a container the caller sizes and positions. */
export function createGlobeView(container: HTMLElement, options: GlobeViewOptions): GlobeView {
  return new ThreeGlobeView(container, options)
}
