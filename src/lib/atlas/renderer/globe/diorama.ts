import * as THREE from "three"
import type { GeoPoint } from "../../domain"
import { enu, surfaceDistance, toEcef } from "./geo"

/**
 * The diorama: symbolic trees and houses on the terrain around a place, shown
 * only when the camera is low over it (RFD 1, "Terrain, vegetation, and
 * fields" and "Attested site"). The symbols are precomputed positions
 * (`static/dioramas/*.json`, from the renderer spike's placement rules) and
 * are drawn as a handful of instanced low-poly meshes, one draw call per kind
 * of symbol, so thousands of trees cost what one tree does.
 *
 * Nothing here is a reconstruction: the file says so itself ("symbolic, not
 * to scale"), and the workspace's plate states it to the reader. The file is
 * fetched lazily, the first time the camera comes down near the place, so a
 * reader who never zooms in never downloads it. Its colours are the file's
 * own palette (data, not interface colour).
 */

export type GlobeDiorama = {
  readonly id: string
  readonly url: string
  readonly center: GeoPoint
  readonly showBelowMeters: number
}

/** `[lon, lat, groundM, kind (0 conifer, 1 broadleaf), scale, rotRad]` */
export type DioramaTree = readonly [number, number, number, 0 | 1, number, number]
/** `[lon, lat, groundM, rotRad, scale, roof (0 tile, 1 thatch)]` */
export type DioramaHouse = readonly [number, number, number, number, number, 0 | 1]

export type DioramaData = {
  /** Metres per symbol unit: the symbols' size, which is symbolic. */
  readonly unitMetres: number
  readonly trees: readonly DioramaTree[]
  readonly houses: readonly DioramaHouse[]
  readonly palette: {
    readonly conifer: string
    readonly broadleaf: string
    readonly trunk: string
    readonly wall: string
    readonly roof: string
    readonly thatch: string
  }
}

const TREE_FIELDS = ["lon", "lat", "groundM", "kind(0 conifer,1 broadleaf)", "scale", "rotRad"]
const HOUSE_FIELDS = ["lon", "lat", "groundM", "rotRad", "scale", "roof(0 tile,1 thatch)"]
const PALETTE_KEYS = ["conifer", "broadleaf", "trunk", "wall", "roof", "thatch"] as const

/** The camera only fetches the file when the ground under it is this close to the place. */
const FETCH_RADIUS_M = 1_500_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function rows<T>(table: unknown, fields: readonly string[], flag: number): T[] | null {
  if (
    !isRecord(table) ||
    JSON.stringify(table.fields) !== JSON.stringify(fields) ||
    !Array.isArray(table.items)
  ) {
    return null
  }

  const valid = table.items.every(
    (item) =>
      Array.isArray(item) &&
      item.length === fields.length &&
      item.every((value) => typeof value === "number" && Number.isFinite(value)) &&
      (item[flag] === 0 || item[flag] === 1),
  )

  return valid ? (table.items as T[]) : null
}

/**
 * Reads a diorama file, or returns null when it is not one. The field lists
 * are checked by name, so a reordered column cannot plant a tree at its
 * scale instead of its latitude.
 */
export function parseDiorama(json: unknown): DioramaData | null {
  if (!isRecord(json) || typeof json.unitMetres !== "number" || !isRecord(json.palette)) {
    return null
  }

  const trees = rows<DioramaTree>(json.trees, TREE_FIELDS, 3)
  const houses = rows<DioramaHouse>(json.houses, HOUSE_FIELDS, 5)
  const palette = json.palette

  if (
    trees === null ||
    houses === null ||
    !PALETTE_KEYS.every((key) => typeof palette[key] === "string")
  ) {
    return null
  }

  return {
    unitMetres: json.unitMetres,
    trees,
    houses,
    palette: Object.fromEntries(
      PALETTE_KEYS.map((key) => [key, palette[key] as string]),
    ) as DioramaData["palette"],
  }
}

/** Whether a diorama should be drawn: the camera is low, and over or near its place. */
export function dioramaInView(
  diorama: GlobeDiorama,
  cameraHeightM: number,
  ground: GeoPoint,
): boolean {
  return (
    cameraHeightM < diorama.showBelowMeters &&
    surfaceDistance(ground, diorama.center) < FETCH_RADIUS_M
  )
}

/**
 * Builds the symbols in a local east-up-south frame at the place, so the
 * instance matrices hold metres near zero rather than Earth-centred values
 * that single-precision floats would round to the metre.
 */
export function buildDiorama(
  data: DioramaData,
  center: GeoPoint,
  exaggeration: number,
): THREE.Group {
  const unit = data.unitMetres
  const origin = new THREE.Vector3(...toEcef(center.lon, center.lat, 0))
  const frame = enu(center.lon, center.lat)
  const group = new THREE.Group()
  group.name = "diorama"
  group.matrixAutoUpdate = false
  group.matrix
    .makeBasis(
      new THREE.Vector3(...frame.e),
      new THREE.Vector3(...frame.u),
      new THREE.Vector3(...frame.n).negate(),
    )
    .setPosition(origin)
  group.matrixWorldNeedsUpdate = true
  const toLocal = new THREE.Matrix4().copy(group.matrix).invert()
  const local = (lon: number, lat: number, height: number) =>
    new THREE.Vector3(...toEcef(lon, lat, height)).applyMatrix4(toLocal)

  const matrix = new THREE.Matrix4()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)

  const instanced = (
    geometry: THREE.BufferGeometry,
    color: string,
    count: number,
    place: (index: number) => void,
  ) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.9 }),
      count,
    )

    for (let i = 0; i < count; i++) {
      place(i)
      mesh.setMatrixAt(i, matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    // The symbols are scenery for the eye, not pivots for the camera controls.
    mesh.raycast = () => {}
    group.add(mesh)
    return mesh
  }

  // Trees sit a little into the ground so a coarse terrain tile never shows
  // daylight under them. Heights are true metres times the terrain's
  // exaggeration, as the tiles draw them.
  const tree = (t: DioramaTree, size: number) =>
    matrix.compose(
      local(t[0], t[1], t[2] * exaggeration - 10),
      rotation.setFromAxisAngle(up, t[5]),
      scale.setScalar(size),
    )
  const conifers = data.trees.filter((t) => t[3] === 0)
  const broadleaves = data.trees.filter((t) => t[3] === 1)
  const cone = new THREE.ConeGeometry(0.95 * unit, 3.4 * unit, 6).translate(0, 1.9 * unit, 0)
  const crown = new THREE.SphereGeometry(1.25 * unit, 6, 5).translate(0, 2 * unit, 0)
  const trunk = new THREE.CylinderGeometry(0.18 * unit, 0.26 * unit, 1.6 * unit, 5).translate(
    0,
    0.8 * unit,
    0,
  )
  instanced(cone, data.palette.conifer, conifers.length, (i) => tree(conifers[i], conifers[i][4]))
  instanced(crown, data.palette.broadleaf, broadleaves.length, (i) =>
    tree(broadleaves[i], broadleaves[i][4]),
  )
  instanced(trunk, data.palette.trunk, data.trees.length, (i) =>
    tree(data.trees[i], 0.8 + (data.trees[i][4] % 0.1) * 4),
  )

  // Houses: walls and roofs share one matrix per house; the roof's colour is
  // per instance (tile or thatch), so a village is two draw calls.
  const house = (h: DioramaHouse) =>
    matrix.compose(
      local(h[0], h[1], h[2] * exaggeration - 5),
      rotation.setFromAxisAngle(up, h[3]),
      scale.setScalar(h[4]),
    )
  const walls = new THREE.BoxGeometry(1.4 * unit, 0.9 * unit, 1.1 * unit).translate(
    0,
    0.45 * unit,
    0,
  )
  const roof = new THREE.ConeGeometry(1.05 * unit, 0.8 * unit, 4)
    .rotateY(Math.PI / 4)
    .translate(0, 1.3 * unit, 0)
    .scale(1, 1, 0.8)
  instanced(walls, data.palette.wall, data.houses.length, (i) => house(data.houses[i]))
  const roofs = instanced(roof, data.palette.wall, data.houses.length, (i) => house(data.houses[i]))
  roofs.material.color.setScalar(1)
  const tile = new THREE.Color(data.palette.roof)
  const thatch = new THREE.Color(data.palette.thatch)
  data.houses.forEach((h, i) => roofs.setColorAt(i, h[5] === 1 ? thatch : tile))
  if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true

  group.updateMatrixWorld(true)
  return group
}

/** Releases a diorama's geometries and materials. */
export function disposeDiorama(group: THREE.Group): void {
  group.removeFromParent()

  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh) {
      child.geometry.dispose()
      ;(child.material as THREE.Material).dispose()
      child.dispose()
    }
  }

  group.clear()
}

type Entry = {
  readonly diorama: GlobeDiorama
  state: "idle" | "loading" | "ready" | "failed"
  group: THREE.Group | null
}

export type DioramaLayerOptions = {
  readonly scene: THREE.Scene
  readonly exaggeration: number
  readonly signal: AbortSignal
  /** Compiles the symbols' shaders before they are first shown, so they never cost a frame. */
  readonly compile: (object: THREE.Object3D) => Promise<unknown>
  /** A diorama finished loading; the view draws a frame. */
  readonly onReady: () => void
}

export class DioramaLayer {
  private readonly entries = new Map<string, Entry>()
  private disposed = false

  constructor(private readonly options: DioramaLayerOptions) {}

  /** Replaces the dioramas the scene offers, releasing any that left it. */
  set(dioramas: readonly GlobeDiorama[]): void {
    if (this.disposed) return
    const present = new Set<string>()

    for (const diorama of dioramas) {
      const key = `${diorama.id}|${diorama.url}`
      present.add(key)

      if (!this.entries.has(key)) {
        this.entries.set(key, { diorama, state: "idle", group: null })
      }
    }

    for (const [key, entry] of this.entries) {
      if (!present.has(key)) {
        if (entry.group) disposeDiorama(entry.group)
        this.entries.delete(key)
      }
    }
  }

  /** Shows the dioramas the camera is low over, fetching each the first time. */
  update(cameraHeightM: number, ground: GeoPoint): void {
    if (this.disposed) return

    for (const entry of this.entries.values()) {
      const show = dioramaInView(entry.diorama, cameraHeightM, ground)

      if (show && entry.state === "idle") {
        void this.load(entry)
      }

      if (entry.group) {
        entry.group.visible = show
      }
    }
  }

  private async load(entry: Entry): Promise<void> {
    entry.state = "loading"

    try {
      const url = new URL(entry.diorama.url, window.location.href)
      const response = await fetch(url, { signal: this.options.signal })

      if (!response.ok) {
        throw new Error(`${response.status} loading ${entry.diorama.url}`)
      }

      const data = parseDiorama(await response.json())

      if (data === null) {
        throw new Error(`${entry.diorama.url} is not a diorama file`)
      }

      if (this.disposed || this.entries.get(this.keyOf(entry)) !== entry) return
      const group = buildDiorama(data, entry.diorama.center, this.options.exaggeration)
      // Compilation skips hidden objects, so the group is hidden only after.
      await this.options.compile(group)
      group.visible = false

      // The view or the scene may have let go of the diorama while it compiled.
      if (this.disposed || this.entries.get(this.keyOf(entry)) !== entry) {
        disposeDiorama(group)
        return
      }

      entry.group = group
      entry.state = "ready"
      this.options.scene.add(group)
      this.options.onReady()
    } catch (error) {
      entry.state = "failed"
      if (!this.disposed) console.error("globe: the diorama did not load", error)
    }
  }

  private keyOf(entry: Entry): string {
    return `${entry.diorama.id}|${entry.diorama.url}`
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    for (const entry of this.entries.values()) {
      if (entry.group) disposeDiorama(entry.group)
    }

    this.entries.clear()
  }
}
