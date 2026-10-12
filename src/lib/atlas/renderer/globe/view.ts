import * as THREE from "three"
import { GlobeControls, WGS84_ELLIPSOID } from "3d-tiles-renderer/three"
import type { GeoPoint } from "../../domain"
import {
  MEAN_RADIUS_M,
  eyeFor,
  interpolatePose,
  poseOf,
  surfaceDistance,
  toEcef,
  type CameraPose,
} from "./geo"
import { placeLabels, type LabelBox } from "./labels"
import { GlobeTiles, type Tileset } from "./tiles"

/**
 * The custom globe's Three.js view: the WebGL canvas, the camera and its
 * controls, the tiles, the atmosphere, and the markers and labels the atlas
 * draws on top. It knows nothing about events, time, or selection state; the
 * atlas renderer (`../globe-renderer.ts`) translates the scene into markers and
 * user input into callbacks.
 *
 * Markers and labels are HTML laid over the canvas and positioned each frame
 * from the 3D scene: text stays crisp in every script the browser can set, and
 * a label never takes the pointer, so a drag that starts on one still turns
 * the globe (`markerAt` hit-tests them for a click instead).
 *
 * The view draws a frame only when something changed (the camera, a tile
 * arriving, the markers, the size), so an idle atlas does not spin the GPU.
 */

export type MarkerTone = "definite" | "possible"
export type MarkerEmphasis = "base" | "active" | "selected"

export type GlobeMarker = {
  readonly id: string
  readonly lon: number
  readonly lat: number
  readonly label: string
  readonly tone: MarkerTone
  readonly emphasis: MarkerEmphasis
}

export interface GlobeView {
  /** The WebGL canvas; the renderer listens to it for the reader's input. */
  readonly canvas: HTMLCanvasElement
  /** Puts the camera straight above a point at once. */
  setView(target: GeoPoint, rangeM: number): void
  /** Flies the camera to straight above a point; input from the reader cancels it. */
  flyTo(target: GeoPoint, rangeM: number, durationMs: number): void
  setMarkers(markers: readonly GlobeMarker[]): void
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
}

const SPACE = "#020617"
const ATMOSPHERE = "#9fc4dc"
const HAZE = new THREE.Color("#b6ccd9")
const ZENITH = new THREE.Color("#5a86ab")
const FOV_DEG = 40
const MARKER_COLORS: Record<MarkerTone, string> = { definite: "#f59e0b", possible: "#38bdf8" }
const MARKER_SIZES: Record<MarkerEmphasis, number> = { base: 9, active: 12, selected: 16 }
/** The polar radius squared, slightly under: a point is visible when its dot with the eye exceeds it. */
const HORIZON2 = 6356752 * 6356752 * 0.999

type MarkerEntry = {
  data: GlobeMarker
  readonly root: HTMLDivElement
  readonly dot: HTMLSpanElement
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

  private createMarker(data: GlobeMarker): MarkerEntry {
    const root = document.createElement("div")
    root.className = "absolute left-0 top-0 hidden will-change-transform"
    root.dataset.markerId = data.id
    const dot = document.createElement("span")
    dot.className = "absolute block -translate-x-1/2 -translate-y-1/2 rounded-full border-solid"
    const label = document.createElement("span")
    label.className =
      "absolute bottom-[10px] block -translate-x-1/2 whitespace-nowrap font-semibold text-white [text-shadow:0_0_3px_#0f172a,0_0_6px_#0f172a,0_1px_0_#0f172a]"
    root.append(dot, label)
    this.overlay.append(root)
    const entry: MarkerEntry = {
      data,
      root,
      dot,
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
    entry.data = data
    const size = MARKER_SIZES[data.emphasis]
    const selected = data.emphasis === "selected"
    const { style } = entry.dot
    style.width = `${size}px`
    style.height = `${size}px`
    style.backgroundColor = MARKER_COLORS[data.tone]
    style.opacity = data.tone === "possible" ? "0.55" : "0.95"
    style.borderColor = selected ? "#ffffff" : "#0f172a"
    style.borderWidth = `${selected ? 3 : 1.5}px`
    entry.label.style.fontSize = selected ? "16px" : "14px"

    if (entry.label.textContent !== data.label || previous.emphasis !== data.emphasis) {
      entry.label.textContent = data.label
      entry.labelWidth = 0
    }

    entry.root.style.zIndex = selected ? "3" : data.emphasis === "active" ? "2" : "1"
  }

  /** Projects the markers and decides which labels fit. Runs only when a frame is drawn. */
  private placeMarkers(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    const eye = this.camera.position
    const projected = new THREE.Vector3()
    const boxes: LabelBox[] = []

    for (const entry of this.markers.values()) {
      if (this.markersDirty) {
        const h = this.tiles?.heightAt(entry.data.lon, entry.data.lat) ?? 0
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
      const emphasis = entry.data.emphasis
      const labelHeight = emphasis === "selected" ? 21 : 19
      boxes.push({
        id: entry.data.id,
        priority: emphasis === "selected" ? 2 : emphasis === "active" ? 1 : 0,
        left: x - entry.labelWidth / 2,
        top: y - 10 - labelHeight,
        width: entry.labelWidth,
        height: labelHeight,
      })
    }

    const shown = placeLabels(boxes)

    for (const entry of this.markers.values()) {
      const show = shown.has(entry.data.id)

      if (show !== entry.labelShown) {
        entry.labelShown = show
        entry.label.style.visibility = show ? "" : "hidden"
      }
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
      const reach = radiusPx + MARKER_SIZES[entry.data.emphasis] / 2
      const priority =
        entry.data.emphasis === "selected" ? 2 : entry.data.emphasis === "active" ? 1 : 0

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
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.dirty = true
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

    if (!moved && !this.dirty && !loading) return

    this.lastCamera.copy(this.camera.matrixWorld)
    this.dirty = false
    this.updateAtmosphere()
    this.updateLight()
    tiles?.update(this.camera, this.container.clientHeight || 1)
    this.renderer.render(this.scene, this.camera)
    this.placeMarkers()

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
