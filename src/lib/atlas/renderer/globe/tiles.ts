import * as THREE from "three"
import { childrenBundlePath, ROOT_BUNDLE_PATH } from "./bundle"
import { toEcef } from "./geo"
import {
  BORDERED,
  GRID,
  LEVEL0_ERROR_M,
  TILE_INDEX,
  tileBounds,
  type TileBounds,
} from "./tile-mesh"
import type { BuiltTile, TileKey, WorkerRequest, WorkerResponse } from "./tile-worker"

/**
 * The globe's tile engine: a quadtree over the geographic tiling, refined by
 * screen-space error, loading tiles in workers and evicting them under a GPU
 * memory budget. Ported from the renderer spike's custom globe
 * (`spikes/renderer/globe/followup/globe.js`), which the owner chose on
 * 2026-10-12, with one change: tiles arrive in bundles.
 *
 * A tile is refined into all four of its children at once, and none of them is
 * drawn until all four are ready (otherwise the parent and a child would
 * overlap). So the four children travel together, in one bundle per parent
 * (`bundle.ts`): one request per refinement, and the same tiles fetched as
 * before. A child outside the built coverage is subdivided from its parent's
 * heights instead, and borrows a quadrant of its parent's imagery.
 *
 * Tile meshes are ordinary Three.js meshes in `group`, so the camera controls
 * raycast the surface the reader actually sees.
 */

/** The tileset description `scripts/globe/build-tiles.py` writes. */
export type Tileset = {
  readonly format: "lekishi-globe-bundles"
  readonly version: number
  readonly maxLevel: number
  readonly available: readonly (readonly {
    readonly startX: number
    readonly startY: number
    readonly endX: number
    readonly endY: number
  }[])[]
  readonly attribution: string
  readonly attributionFile: string
}

type TileState = "new" | "queued" | "loading" | "ready" | "failed" | "evicted"

type Tile = {
  readonly z: number
  readonly x: number
  readonly y: number
  readonly key: string
  readonly bounds: TileBounds
  parent: Tile | null
  readonly sphere: THREE.Sphere
  horizonPoints: THREE.Vector3[]
  readonly available: boolean
  state: TileState
  mesh: THREE.Mesh | null
  heights: Float32Array | null
  texture: THREE.Texture | null
  uv: [number, number, number, number]
  virtual: boolean
  /** The pending request that will deliver this tile, if any. */
  request: number | null
  lastUsed: number
  lastUsedTime: number
  bytes: number
}

/** One bundle request: the children of `parent`, or the roots when `parent` is null. */
type Load = {
  readonly id: number
  readonly key: string
  readonly parent: Tile | null
  readonly tiles: Tile[]
  priority: number
  network: boolean
  worker: Worker | null
}

export type TileStats = {
  readonly requests: number
  readonly bytes: number
  readonly loaded: number
  readonly drawn: number
  readonly memoryMB: number
  readonly failed: number
}

/** An imagery texture with its mipmaps. */
const TEXTURE_BYTES = (256 * 256 * 4 * 4) / 3
/** Above any terrain on Earth: the roots' bound before they load. */
const MAX_TERRAIN_M = 9000
/** Within this many CSS pixels of geometric error a tile is good enough. */
const DEFAULT_MAX_SSE = 4.5

// Ray against a tile: the 64 block boxes first, then only the triangles of
// blocks the ray crosses (skirts are left out; they hang below the surface).
// About a hundredth of the triangle tests of three's default raycast, which
// matters because the camera controls raycast the terrain every frame.
const rayLocal = new THREE.Ray()
const box = new THREE.Box3()
const sphere = new THREE.Sphere()
const va = new THREE.Vector3()
const vb = new THREE.Vector3()
const vc = new THREE.Vector3()
const hit = new THREE.Vector3()
const best = new THREE.Vector3()

function tileRaycast(
  this: THREE.Mesh,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[],
): void {
  const blocks = this.userData.blocks as Float32Array
  const position = (this.geometry.attributes.position as THREE.BufferAttribute)
    .array as Float32Array
  const bounding = this.geometry.boundingSphere

  if (bounding === null) {
    return
  }

  sphere.copy(bounding).translate(this.position)

  if (!raycaster.ray.intersectsSphere(sphere)) {
    return
  }

  // Tile meshes are only translated, never rotated or scaled.
  rayLocal.copy(raycaster.ray)
  rayLocal.origin.sub(this.position)
  let nearest = Infinity
  const triangle = (i: number, j: number, k: number) => {
    va.fromArray(position, i * 3)
    vb.fromArray(position, j * 3)
    vc.fromArray(position, k * 3)

    if (rayLocal.intersectTriangle(va, vb, vc, false, hit)) {
      const distance = hit.distanceTo(rayLocal.origin)

      if (distance < nearest) {
        nearest = distance
        best.copy(hit)
      }
    }
  }

  for (let k = 0; k < 64; k++) {
    box.min.fromArray(blocks, k * 6).subScalar(1)
    box.max.fromArray(blocks, k * 6 + 3).addScalar(1)

    if (!rayLocal.intersectsBox(box)) {
      continue
    }

    const r0 = (k >> 3) * 8
    const c0 = (k & 7) * 8

    for (let r = r0; r < r0 + 8; r++) {
      for (let c = c0; c < c0 + 8; c++) {
        const a = r * GRID + c
        const b = a + GRID
        triangle(a, b, a + 1)
        triangle(a + 1, b, b + 1)
      }
    }
  }

  if (nearest === Infinity || nearest < raycaster.near || nearest > raycaster.far) {
    return
  }

  intersects.push({ distance: nearest, point: best.clone().add(this.position), object: this })
}

export type GlobeTilesOptions = {
  /** The directory holding `tileset.json` and the bundles, ending in `/`. */
  readonly baseUrl: string
  readonly tileset: Tileset
  readonly exaggeration: number
  readonly maxSSE?: number
  readonly maxInflight?: number
  readonly memoryBudgetMB: number
  /** Called when tiles arrive, so the view knows to draw a frame. */
  readonly onChange: () => void
}

export class GlobeTiles {
  readonly group = new THREE.Group()
  /** The haze density the view applies; distant hazy tiles need less detail. */
  fogDensity = 0
  private readonly options: GlobeTilesOptions
  private readonly maxSSE: number
  private readonly maxInflight: number
  private readonly budgetBytes: number
  private readonly maxRenderedHeight: number
  private readonly tiles = new Map<string, Tile>()
  private readonly loads = new Map<number, Load>()
  private readonly loadsByKey = new Map<string, Load>()
  private queue: Load[] = []
  private inflight = 0
  private nextId = 1
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly frustum = new THREE.Frustum()
  private readonly projectionView = new THREE.Matrix4()
  private workers: Worker[]
  private readonly roots: Tile[]
  private frameId = 0
  private now = 0
  private selected: Tile[] = []
  private pendingRefine = 0
  private memoryBytes = 0
  private requests = 0
  private bytes = 0
  private failed = 0
  private disposed = false

  constructor(options: GlobeTilesOptions) {
    this.options = options
    this.maxSSE = options.maxSSE ?? DEFAULT_MAX_SSE
    this.maxInflight = options.maxInflight ?? 8
    this.budgetBytes = options.memoryBudgetMB * 1048576
    this.maxRenderedHeight = MAX_TERRAIN_M * options.exaggeration
    this.group.name = "globe-tiles"
    const count = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
    this.workers = Array.from({ length: count }, () => {
      const worker = new Worker(new URL("./tile-worker.ts", import.meta.url), { type: "module" })
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data)
      return worker
    })
    this.roots = [this.tile(0, 0, 0, null), this.tile(0, 1, 0, null)]
  }

  /** True once both root tiles are drawn: the whole globe has its first imagery. */
  get rootsReady(): boolean {
    return this.roots.every((root) => root.state === "ready")
  }

  /** True when nothing is loading or waiting to refine: the view has all it asked for. */
  get settled(): boolean {
    return this.loads.size === 0 && this.queue.length === 0 && this.pendingRefine === 0
  }

  stats(): TileStats {
    let loaded = 0

    for (const tile of this.tiles.values()) {
      if (tile.state === "ready" && !tile.virtual) loaded++
    }

    return {
      requests: this.requests,
      bytes: this.bytes,
      loaded,
      drawn: this.selected.length,
      memoryMB: Math.round(this.memoryBytes / 1048576),
      failed: this.failed,
    }
  }

  private isAvailable(z: number, x: number, y: number): boolean {
    const levels = this.options.tileset.available
    return (
      z < levels.length &&
      levels[z].some((r) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY)
    )
  }

  private hasDeeper(tile: Tile): boolean {
    const z = tile.z + 1
    const x = tile.x * 2
    const y = tile.y * 2
    return (
      this.isAvailable(z, x, y) ||
      this.isAvailable(z, x + 1, y) ||
      this.isAvailable(z, x, y + 1) ||
      this.isAvailable(z, x + 1, y + 1)
    )
  }

  private tile(z: number, x: number, y: number, parent: Tile | null): Tile {
    const key = `${z}/${x}/${y}`
    const existing = this.tiles.get(key)

    if (existing) {
      // A parent evicted and reloaded is a new object; its children follow it.
      if (parent && existing.parent !== parent) existing.parent = parent
      return existing
    }

    const tile: Tile = {
      z,
      x,
      y,
      key,
      bounds: tileBounds(z, x, y),
      parent,
      sphere: new THREE.Sphere(),
      horizonPoints: [],
      available: this.isAvailable(z, x, y),
      state: "new",
      mesh: null,
      heights: null,
      texture: null,
      uv: [0, 0, 1, 1],
      virtual: false,
      request: null,
      lastUsed: 0,
      lastUsedTime: 0,
      bytes: 0,
    }
    // Tight height bounds decide how far away a tile is, so they decide how much
    // gets fetched. Roots start from the worst case; children start from the
    // parent's samples over their quadrant plus the parent's geometric error (the
    // parent grid can miss a peak between samples); a loaded tile then uses its
    // own heights.
    const range =
      parent?.heights != null
        ? this.quadrantRange(
            parent,
            x - parent.x * 2,
            y - parent.y * 2,
            LEVEL0_ERROR_M / (1 << parent.z),
          )
        : [0, this.maxRenderedHeight]
    this.setBounds(tile, range[0], range[1])
    this.tiles.set(key, tile)
    return tile
  }

  /** [min, max] rendered height (exaggerated, sea clamped to 0) over a quadrant of a loaded tile. */
  private quadrantRange(parent: Tile, qx: number, qy: number, margin: number): [number, number] {
    const heights = parent.heights as Float32Array
    const half = (GRID - 1) / 2
    const r0 = qy === 1 ? 0 : half
    const c0 = qx * half
    let low = Infinity
    let high = -Infinity

    for (let r = r0; r <= r0 + half; r++) {
      for (let c = c0; c <= c0 + half; c++) {
        const v = heights[(r + 1) * BORDERED + c + 1]
        low = Math.min(low, v)
        high = Math.max(high, v)
      }
    }

    const k = this.options.exaggeration
    return [Math.max(0, low - margin) * k, (Math.max(0, high) + margin) * k]
  }

  private setBounds(tile: Tile, minHeight: number, maxHeight: number): void {
    const { bounds } = tile
    // Bounds from a 5x5 sample at the lowest and highest terrain: corners alone
    // miss the bulge of large, curved tiles.
    const grid: [number, number][] = []

    for (let i = 0; i <= 4; i++) {
      for (let j = 0; j <= 4; j++) {
        grid.push([
          bounds.w + ((bounds.e - bounds.w) * i) / 4,
          Math.max(-89.9, Math.min(89.9, bounds.s + ((bounds.n - bounds.s) * j) / 4)),
        ])
      }
    }

    const high = grid.map(([lon, lat]) => new THREE.Vector3(...toEcef(lon, lat, maxHeight)))
    const low = grid.map(([lon, lat]) => new THREE.Vector3(...toEcef(lon, lat, minHeight)))
    tile.sphere.setFromPoints([...high, ...low])
    tile.horizonPoints = high
  }

  // ---- loading, in the workers ----

  /** Queues the bundle that delivers `tiles` (all children of `parent`, or the roots). */
  private requestLoad(parent: Tile | null, priority: number): void {
    const key = parent === null ? "root" : parent.key
    const pending = this.loadsByKey.get(key)

    if (pending) {
      pending.priority = Math.max(pending.priority, priority)
      return
    }

    const siblings =
      parent === null
        ? this.roots
        : [0, 1].flatMap((dx) =>
            [0, 1].map((dy) =>
              this.tile(parent.z + 1, parent.x * 2 + dx, parent.y * 2 + dy, parent),
            ),
          )
    const wanted = siblings.filter((t) => t.available && t.state === "new")

    if (wanted.length === 0) {
      return
    }

    const load: Load = {
      id: this.nextId++,
      key,
      parent,
      tiles: wanted,
      priority,
      network: true,
      worker: null,
    }
    wanted.forEach((t) => {
      t.state = "queued"
      t.request = load.id
    })
    this.loads.set(load.id, load)
    this.loadsByKey.set(key, load)
    this.queue.push(load)
  }

  private buildVirtual(tile: Tile): void {
    const parent = tile.parent

    if (parent === null || parent.state !== "ready" || parent.heights === null) {
      return
    }

    const qx = tile.x - parent.x * 2
    const qy = tile.y - parent.y * 2
    const [u0, v0, u1, v1] = parent.uv
    const du = (u1 - u0) / 2
    const dv = (v1 - v0) / 2
    // Texture rows run north to south while TMS rows run south to north, so the
    // northern child (qy 1) takes the top half of the parent's texture.
    tile.uv = [u0 + qx * du, v0 + (1 - qy) * dv, u0 + (qx + 1) * du, v0 + (2 - qy) * dv]
    tile.virtual = true
    const load: Load = {
      id: this.nextId++,
      key: `virtual:${tile.key}`,
      parent,
      tiles: [tile],
      priority: 0,
      network: false,
      worker: null,
    }
    tile.state = "loading"
    tile.request = load.id
    this.loads.set(load.id, load)
    this.send(load, {
      type: "virtual",
      id: load.id,
      tile: { z: tile.z, x: tile.x, y: tile.y },
      parentHeights: parent.heights,
      qx,
      qy,
      uv: tile.uv,
      exaggeration: this.options.exaggeration,
    })
  }

  private send(load: Load, request: WorkerRequest): void {
    const worker = this.workers[load.id % this.workers.length]
    load.worker = worker
    worker.postMessage(request)
  }

  private pump(): void {
    this.queue.sort((a, b) => b.priority - a.priority)

    while (this.inflight < this.maxInflight && this.queue.length > 0) {
      const load = this.queue.shift() as Load

      // No longer wanted: drop it; it is queued again if the camera comes back.
      if (load.tiles.every((t) => this.frameId - t.lastUsed > 2)) {
        this.forget(load)
        continue
      }

      this.inflight++
      this.requests++
      load.tiles.forEach((t) => (t.state = "loading"))
      const path =
        load.parent === null
          ? ROOT_BUNDLE_PATH
          : childrenBundlePath(load.parent.z, load.parent.x, load.parent.y)
      const tiles: TileKey[] = load.tiles.map((t) => ({ z: t.z, x: t.x, y: t.y }))
      this.send(load, {
        type: "load",
        id: load.id,
        url: new URL(path, this.options.baseUrl).href,
        tiles,
        exaggeration: this.options.exaggeration,
      })
    }
  }

  /** Puts a load's tiles back to `new` and forgets the load. */
  private forget(load: Load): void {
    for (const t of load.tiles) {
      if (t.request === load.id && t.state !== "ready") {
        t.state = "new"
        t.request = null
      }
    }

    this.loads.delete(load.id)

    if (this.loadsByKey.get(load.key) === load) {
      this.loadsByKey.delete(load.key)
    }
  }

  private stale(tile: Tile, ms: number): boolean {
    // Wall time, so the rule means the same at 60 fps and at 1 fps; frames, so
    // one slow frame does not make every tile look abandoned.
    return this.frameId - tile.lastUsed > 3 && this.now - tile.lastUsedTime > ms
  }

  /** A load the camera has not wanted for half a second is cancelled, freeing bandwidth for what is on screen. */
  private cancelStale(): void {
    for (const load of [...this.loads.values()]) {
      if (!load.network || load.worker === null || !load.tiles.every((t) => this.stale(t, 500))) {
        continue
      }

      load.worker.postMessage({ type: "cancel", id: load.id } satisfies WorkerRequest)
      this.inflight--
      this.forget(load)
    }
  }

  private receive(message: WorkerResponse): void {
    if (this.disposed) {
      if (message.type === "done") message.tiles.forEach((t) => t.imagery?.close())
      return
    }

    const load = this.loads.get(message.id)

    if (load === undefined) {
      // Cancelled meanwhile.
      if (message.type === "done") message.tiles.forEach((t) => t.imagery?.close())
      return
    }

    if (load.network) this.inflight--

    if (message.type === "aborted") {
      this.forget(load)
      return
    }

    if (message.type === "error") {
      console.error("globe tiles failed", load.key, message.message)
      this.failed++
      load.tiles.forEach((t) => {
        if (t.request === load.id) t.state = "failed"
      })
      this.loads.delete(load.id)
      this.loadsByKey.delete(load.key)
      return
    }

    this.bytes += message.bytes
    this.loads.delete(load.id)
    this.loadsByKey.delete(load.key)

    for (const built of message.tiles) {
      const tile = this.tiles.get(`${built.z}/${built.x}/${built.y}`)

      if (tile === undefined || tile.request !== load.id || tile.state === "evicted") {
        built.imagery?.close()
        continue
      }

      this.apply(tile, built)
    }

    // Any tile the bundle did not carry is not coming: mark it failed rather
    // than leave its siblings waiting forever.
    for (const tile of load.tiles) {
      if (tile.request === load.id && tile.state === "loading") {
        tile.state = "failed"
        this.failed++
      }
    }

    this.options.onChange()
  }

  private apply(tile: Tile, built: BuiltTile): void {
    tile.request = null

    if (built.imagery === null) {
      // A subdivided tile borrows its parent's texture, which must still be there.
      if (tile.parent?.state !== "ready" || tile.parent.texture === null) {
        tile.state = "new"
        return
      }

      tile.texture = tile.parent.texture
    } else {
      const texture = new THREE.Texture(built.imagery as unknown as HTMLImageElement)
      texture.flipY = false
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.needsUpdate = true
      tile.texture = texture
      tile.uv = [0, 0, 1, 1]
    }

    tile.heights = built.heights
    this.setBounds(tile, built.geometry.minHeight, built.geometry.maxHeight)
    this.buildMesh(tile, built)
    tile.state = "ready"
  }

  private material(texture: THREE.Texture): THREE.MeshStandardMaterial {
    let material = this.materials.get(texture.uuid)

    if (material === undefined) {
      material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 })
      this.materials.set(texture.uuid, material)
    }

    return material
  }

  private buildMesh(tile: Tile, built: BuiltTile): void {
    const { geometry: g } = built
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(g.positions, 3))
    geometry.setAttribute("normal", new THREE.BufferAttribute(g.normals, 3, true))
    geometry.setAttribute("uv", new THREE.BufferAttribute(g.uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(TILE_INDEX.slice(), 1))
    geometry.boundingSphere = tile.sphere.clone()
    geometry.boundingSphere.center.sub(new THREE.Vector3(...g.center))
    const mesh = new THREE.Mesh(geometry, this.material(tile.texture as THREE.Texture))
    mesh.position.set(...g.center)
    mesh.matrixAutoUpdate = false
    mesh.updateMatrix()
    mesh.updateMatrixWorld(true)
    mesh.frustumCulled = false
    mesh.userData.tile = tile.key
    mesh.userData.blocks = g.blocks
    mesh.raycast = tileRaycast
    tile.mesh = mesh
    tile.bytes =
      g.blocks.byteLength +
      g.positions.byteLength +
      g.normals.byteLength +
      g.uvs.byteLength +
      TILE_INDEX.byteLength +
      (tile.virtual ? 0 : TEXTURE_BYTES)
  }

  // ---- selection ----

  /**
   * Chooses the tiles to draw for this camera and asks for the ones it lacks.
   * `viewportHeight` is in CSS pixels, so the error target means the same on
   * every screen density.
   */
  update(camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.frameId++
    this.now = performance.now()
    this.selected = []
    this.pendingRefine = 0
    camera.updateMatrixWorld()
    this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projectionView)
    const eye = camera.position
    const pixelsPerRadian =
      viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    const polar2 = 6356752 * 6356752 * 0.999
    const fog = this.fogDensity
    // The ground point under the camera: a tile containing it is never behind
    // the horizon, even when the camera is so low that none of the tile's sample
    // points rise above it (large tiles at low altitude).
    const nadirLat = (Math.asin(eye.z / eye.length()) * 180) / Math.PI
    const nadirLon = (Math.atan2(eye.y, eye.x) * 180) / Math.PI
    const underCamera = (b: TileBounds) =>
      nadirLon >= b.w && nadirLon <= b.e && nadirLat >= b.s && nadirLat <= b.n

    const touch = (tile: Tile) => {
      tile.lastUsed = this.frameId
      tile.lastUsedTime = this.now
    }

    const visit = (tile: Tile): void => {
      touch(tile)

      if (
        tile.z > 0 &&
        (!this.frustum.intersectsSphere(tile.sphere) ||
          !(underCamera(tile.bounds) || tile.horizonPoints.some((p) => p.dot(eye) > polar2)))
      ) {
        return
      }

      if (tile.state !== "ready") {
        if (tile.z === 0 && tile.state === "new") this.requestLoad(null, 100)
        this.pendingRefine++
        return
      }

      const distance = Math.max(1, tile.sphere.distanceToPoint(eye))
      // Under the haze a tile needs less detail: subtract up to two pixels of
      // error as the haze thickens (Cesium does the same under its fog).
      const haze = fog > 0 ? 1 - Math.exp(-((distance * fog) ** 2)) : 0
      const error = ((LEVEL0_ERROR_M / (1 << tile.z)) * pixelsPerRadian) / distance - 2 * haze

      if (error > this.maxSSE && (tile.available || tile.virtual) && this.hasDeeper(tile)) {
        const children = [0, 1].flatMap((dx) =>
          [0, 1].map((dy) => this.tile(tile.z + 1, tile.x * 2 + dx, tile.y * 2 + dy, tile)),
        )
        children.forEach(touch)

        if (children.some((c) => c.available && c.state === "new")) this.requestLoad(tile, error)
        children
          .filter((c) => !c.available && c.state === "new")
          .forEach((c) => this.buildVirtual(c))

        if (children.every((c) => c.state === "ready" || c.state === "failed")) {
          children.forEach((c) => c.state === "ready" && visit(c))
          return
        }

        this.pendingRefine++
      }

      this.selected.push(tile)
    }

    this.roots.forEach(visit)
    this.cancelStale()
    this.pump()
    this.evict()
    // Keep anything that is not a tile (the controls' pivot marker lives here).
    const extras = this.group.children.filter((c) => c.userData.tile === undefined)
    this.group.children.length = 0

    for (const tile of this.selected) {
      const mesh = tile.mesh as THREE.Mesh
      this.group.children.push(mesh)
      mesh.parent = this.group
    }

    for (const extra of extras) this.group.children.push(extra)
  }

  /**
   * Least recently used tiles go first once the estimated GPU memory passes the
   * budget. A tile used in the last 1.5 s is never evicted, and neither is a
   * parent of one (visiting a child visits its parent, so it stays fresh).
   */
  private evict(): void {
    let used = 0

    for (const tile of this.tiles.values()) used += tile.bytes

    if (used > this.budgetBytes) {
      const old = [...this.tiles.values()]
        .filter((t) => t.z > 0 && t.state === "ready" && this.stale(t, 1500))
        .sort((a, b) => a.lastUsedTime - b.lastUsedTime)

      for (const tile of old) {
        if (used <= this.budgetBytes * 0.85) break
        if (tile.state !== "ready") continue // dropped already, with its parent
        used -= this.drop(tile)

        // Subdivided tiles borrow their parent's heights and texture; they go with it.
        for (const child of this.tiles.values()) {
          if (child.virtual && child.parent === tile && child.state === "ready")
            used -= this.drop(child)
        }
      }
    }

    this.memoryBytes = used

    if (this.frameId % 120 === 0) {
      // Tiles never loaded and long unused are only bookkeeping; forget them.
      for (const tile of this.tiles.values()) {
        if (tile.z > 0 && tile.state === "new" && this.stale(tile, 10000))
          this.tiles.delete(tile.key)
      }
    }
  }

  private drop(tile: Tile): number {
    tile.mesh?.geometry.dispose()

    if (!tile.virtual && tile.texture) {
      const material = this.materials.get(tile.texture.uuid)
      material?.dispose()
      this.materials.delete(tile.texture.uuid)
      const image = tile.texture.image as ImageBitmap | null
      tile.texture.dispose()
      image?.close?.()
    }

    this.tiles.delete(tile.key)
    const bytes = tile.bytes
    tile.bytes = 0
    tile.state = "evicted"
    tile.mesh = null
    tile.heights = null
    tile.texture = null
    return bytes
  }

  /**
   * Rendered height (exaggerated metres) at a point, from the finest loaded tile
   * that covers it, so markers sit on the terrain. Zero before any tile loads.
   */
  heightAt(lon: number, lat: number): number {
    for (let z = this.options.tileset.maxLevel + 4; z >= 0; z--) {
      const size = 180 / (1 << z)
      const tile = this.tiles.get(
        `${z}/${Math.floor((lon + 180) / size)}/${Math.floor((lat + 90) / size)}`,
      )

      if (tile?.state === "ready" && tile.heights) {
        const { bounds: b, heights } = tile
        const fc = ((lon - b.w) / (b.e - b.w)) * (GRID - 1) + 1
        const fr = ((b.n - lat) / (b.n - b.s)) * (GRID - 1) + 1
        const c = Math.min(BORDERED - 2, Math.max(0, Math.floor(fc)))
        const r = Math.min(BORDERED - 2, Math.max(0, Math.floor(fr)))
        const u = fc - c
        const v = fr - r
        const h = (i: number, j: number) => Math.max(0, heights[i * BORDERED + j])
        return (
          ((h(r, c) * (1 - u) + h(r, c + 1) * u) * (1 - v) +
            (h(r + 1, c) * (1 - u) + h(r + 1, c + 1) * u) * v) *
          this.options.exaggeration
        )
      }
    }

    return 0
  }

  /** Terminates the workers and releases every tile's geometry and texture. Idempotent. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.workers.forEach((w) => w.terminate())
    this.workers = []

    for (const tile of [...this.tiles.values()]) {
      if (tile.state === "ready") this.drop(tile)
    }

    this.materials.forEach((m) => m.dispose())
    this.materials.clear()
    this.tiles.clear()
    this.loads.clear()
    this.loadsByKey.clear()
    this.queue = []
    this.group.clear()
  }
}
