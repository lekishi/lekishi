// The custom globe's tile engine: a quadtree over the shared geographic tiling,
// chosen by screen-space error, with full-grid heights, skirts, imagery mapped
// one to one, and parent quadrants where the tileset stops (see the globe
// phase's custom/main.js for the first version).
//
// What the follow-up adds:
// - Tiles load in web workers (tile-worker.js): fetching, decoding and mesh
//   building never block a frame. Loads the camera has left are cancelled.
// - Bordered heights, so normals are seamless across tile edges.
// - Tight bounds from each tile's real heights (a bound at the highest
//   terrain on Earth made sea tiles look near and over-refined).
// - Screen-space error in CSS pixels, relaxed under the distance haze the
//   way Cesium relaxes it under fog: a 2x or 3x screen gets the same tiles as
//   a 1x one, and the horizon is not refined where the haze hides it.
// - Eviction by an estimated GPU memory budget rather than a tile count.
// - Draped overlays: an overlay source returns a texture for a tile (or null),
//   sampled with a second, per-tile UV set, so fills stay sharp on tiles that
//   borrow a parent's imagery quadrant.
// - Tiles are ordinary meshes in `group`, so camera controls and picking can
//   raycast the surface the reader actually sees.
import * as THREE from "three"
import { toEcef } from "../shared/flight.js"

const LEVEL0_ERROR = 77067 // Cesium's level-0 geometric error for 65-sample tiles, metres
const G = 65, B = G + 2
const TEXTURE_BYTES = 256 * 256 * 4 * 4 / 3   // an imagery texture with its mipmaps

// One index buffer layout serves every tile: the grid, then the skirt ring
// (edge vertices in ring order, matching tile-worker.js).
const INDEX = (() => {
  const edge = []
  for (let c = 0; c < G - 1; c++) edge.push(c)
  for (let r = 0; r < G - 1; r++) edge.push(r * G + G - 1)
  for (let c = G - 1; c > 0; c--) edge.push((G - 1) * G + c)
  for (let r = G - 1; r > 0; r--) edge.push(r * G)
  const n = G * G, ring = edge.length, idx = []
  for (let r = 0; r < G - 1; r++) for (let c = 0; c < G - 1; c++) { const a = r * G + c, b = a + G; idx.push(a, b, a + 1, a + 1, b, b + 1) }
  for (let k = 0; k < ring; k++) { const a = edge[k], b = edge[(k + 1) % ring], sa = n + k, sb = n + (k + 1) % ring; idx.push(a, sa, b, b, sa, sb) }
  return new Uint16Array(idx)
})()

// Ray against a tile: the 64 block boxes first, then only the triangles of
// blocks the ray crosses (skirts are left out; they hang below the surface).
// About a hundredth of the triangle tests of three's default raycast, which
// matters because the camera controls raycast the terrain every frame.
const _ray = new THREE.Ray(), _box = new THREE.Box3(), _sph = new THREE.Sphere(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _hit = new THREE.Vector3(), _best = new THREE.Vector3()
function tileRaycast(raycaster, intersects) {
  const blocks = this.userData.blocks, pos = this.geometry.attributes.position.array
  _sph.copy(this.geometry.boundingSphere).translate(this.position)
  if (!raycaster.ray.intersectsSphere(_sph)) return
  _ray.copy(raycaster.ray); _ray.origin.sub(this.position)   // tile meshes are only translated
  let best = Infinity
  const tri = (i, j, k) => {
    _a.fromArray(pos, i * 3); _b.fromArray(pos, j * 3); _c.fromArray(pos, k * 3)
    if (_ray.intersectTriangle(_a, _b, _c, false, _hit)) { const d = _hit.distanceTo(_ray.origin); if (d < best) { best = d; _best.copy(_hit) } }
  }
  for (let k = 0; k < 64; k++) {
    _box.min.fromArray(blocks, k * 6).subScalar(1); _box.max.fromArray(blocks, k * 6 + 3).addScalar(1)
    if (!_ray.intersectsBox(_box)) continue
    const r0 = (k >> 3) * 8, c0 = (k & 7) * 8
    for (let r = r0; r < r0 + 8; r++) for (let c = c0; c < c0 + 8; c++) { const a = r * G + c, b = a + G; tri(a, b, a + 1); tri(a + 1, b, b + 1) }
  }
  if (best === Infinity || best < raycaster.near || best > raycaster.far) return
  intersects.push({ distance: best, point: _best.clone().add(this.position), object: this })
}

export class Globe {
  constructor({ tilesUrl, tileset, exaggeration, maxSSE = 3, overlay = null, maxInflight = 12, memoryBudgetMB = 160 }) {
    this.url = tilesUrl; this.avail = tileset.available; this.maxLevel = tileset.maxLevel
    this.K = exaggeration; this.maxSSE = maxSSE; this.overlay = overlay; this.maxInflight = maxInflight
    this.budget = memoryBudgetMB * 1048576
    this.MAXH = 9000 * exaggeration   // above any terrain on Earth: the roots' bound before they load
    this.tiles = new Map(); this.queue = []; this.inflight = 0; this.pending = new Map(); this.nextId = 1
    this.group = new THREE.Group(); this.group.name = "globe"
    this.materials = new Map()
    this.frustum = new THREE.Frustum(); this.projView = new THREE.Matrix4()
    this.frameId = 0; this.selected = []; this.pendingRefine = 0; this.failed = 0; this.cancelled = 0
    this.fogDensity = 0; this.version = 0; this.memoryBytes = 0
    this.traffic = { height: { n: 0, bytes: 0, unique: 0 }, imagery: { n: 0, bytes: 0, unique: 0 } }; this.seen = new Set()
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL("./tile-worker.js", import.meta.url), { type: "module" })
      w.onmessage = e => this.receive(e.data)
      return w
    })
    this.roots = [this.tile(0, 0, 0, null), this.tile(0, 1, 0, null)]
  }

  isAvailable(z, x, y) { return z < this.avail.length && this.avail[z].some(r => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY) }
  hasDeeper(t) { const z = t.z + 1, x = t.x * 2, y = t.y * 2; return this.isAvailable(z, x, y) || this.isAvailable(z, x + 1, y) || this.isAvailable(z, x, y + 1) || this.isAvailable(z, x + 1, y + 1) }
  static bounds(z, x, y) { const s = 180 / (1 << z); return { w: -180 + x * s, s: -90 + y * s, e: -180 + (x + 1) * s, n: -90 + (y + 1) * s, z } }

  tile(z, x, y, parent) {
    const k = `${z}/${x}/${y}`; let t = this.tiles.get(k)
    // a parent evicted and reloaded is a new object; its children follow it
    if (t) { if (parent && t.parent !== parent) t.parent = parent; return t }
    const b = Globe.bounds(z, x, y)
    t = { z, x, y, b, key: k, parent, sphere: new THREE.Sphere(), horizonPts: [], available: this.isAvailable(z, x, y), state: "new", mesh: null, heights: null, texture: null, lastUsed: 0, lastUsedT: 0, bytes: 0 }
    // Tight height bounds decide how far away a tile is, so they decide how much
    // gets fetched. Roots start from the worst case; children start from the
    // parent's samples over their quadrant plus the parent's geometric error
    // (the parent grid can miss a peak between samples); a loaded tile then
    // uses its own heights.
    const r = parent?.heights ? this.quadrantRange(parent, x - parent.x * 2, y - parent.y * 2, LEVEL0_ERROR / (1 << parent.z)) : [0, this.MAXH]
    this.setBounds(t, r[0], r[1])
    this.tiles.set(k, t); return t
  }
  // [min, max] rendered height (exaggerated, sea clamped to 0) over a quadrant of a loaded tile
  quadrantRange(p, qx, qy, margin) {
    const r0 = qy === 1 ? 0 : 32, c0 = qx * 32
    let lo = Infinity, hi = -Infinity
    for (let r = r0; r <= r0 + 32; r++) for (let c = c0; c <= c0 + 32; c++) { const v = p.heights[(r + 1) * B + c + 1]; if (v < lo) lo = v; if (v > hi) hi = v }
    return [Math.max(0, lo - margin) * this.K, (Math.max(0, hi) + margin) * this.K]
  }
  setBounds(t, minH, maxH) {
    const { b } = t
    // bounds from a 5x5 sample at the lowest and highest terrain: corners alone
    // miss the bulge of large, curved tiles
    const grid = []
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) grid.push([b.w + (b.e - b.w) * i / 4, Math.max(-89.9, Math.min(89.9, b.s + (b.n - b.s) * j / 4))])
    const high = grid.map(([lo, la]) => new THREE.Vector3(...toEcef(lo, la, maxH)))
    const low = grid.map(([lo, la]) => new THREE.Vector3(...toEcef(lo, la, minH)))
    t.sphere.setFromPoints([...high, ...low]); t.horizonPts = high
  }

  // ---- loading, in the workers ----
  request(t, priority) {
    if (t.state !== "new") return
    if (!t.available) { this.buildVirtual(t); return }
    t.state = "queued"; t.priority = priority; this.queue.push(t)
  }
  send(t, msg) {
    const id = this.nextId++, w = this.workers[id % this.workers.length]
    t.reqId = id; t.worker = w; t.state = "loading"; this.pending.set(id, t)
    w.postMessage({ ...msg, id, b: t.b, K: this.K })
  }
  pump() {
    this.queue.sort((a, b) => b.priority - a.priority)
    while (this.inflight < this.maxInflight && this.queue.length) {
      const t = this.queue.shift()
      if (this.frameId - t.lastUsed > 2) { t.state = "new"; continue }   // no longer wanted: drop, it is re-queued if needed
      this.inflight++; t.network = true
      this.send(t, { type: "load", heightUrl: `${this.url}heightb/${t.key}.png`, imageryUrl: `${this.url}imagery/${t.key}.jpg`, uv: [0, 0, 1, 1] })
    }
  }
  buildVirtual(t) {
    const p = t.parent
    if (!p || p.state !== "ready") return
    const qx = t.x - p.x * 2, qy = t.y - p.y * 2, [u0, v0, u1, v1] = p.uv, du = (u1 - u0) / 2, dv = (v1 - v0) / 2
    t.uv = [u0 + qx * du, v0 + (1 - qy) * dv, u0 + (qx + 1) * du, v0 + (2 - qy) * dv]
    t.virtual = true; t.network = false
    this.send(t, { type: "virtual", parentHeights: p.heights, qx, qy, uv: t.uv })
  }
  // Unused for at least `ms` of wall time and a few frames: time, so the rule
  // means the same at 60 fps and at 1 fps; frames, so one slow frame does not
  // make every tile look abandoned.
  stale(t, ms) { return this.frameId - t.lastUsed > 3 && this.now - t.lastUsedT > ms }
  // A load the camera has not wanted for half a second is cancelled, so its
  // bandwidth goes to tiles that are on screen now.
  cancelStale() {
    for (const [id, t] of this.pending) {
      if (!t.network || !this.stale(t, 500)) continue
      t.worker.postMessage({ type: "cancel", id })
      this.pending.delete(id); this.inflight--; this.cancelled++
      t.state = "new"; t.reqId = null
    }
  }
  receive(m) {
    const t = this.pending.get(m.id)
    if (!t || t.reqId !== m.id || t.state === "evicted") { m.imagery?.close(); return }   // cancelled meanwhile
    this.pending.delete(m.id)
    if (t.network) this.inflight--
    if (m.type === "aborted") { t.state = "new"; return }
    if (m.type === "error") { console.error("tile failed", t.key, m.message); t.state = "failed"; this.failed++; return }
    if (m.bytes) {
      // requests, and distinct tiles: a tile evicted and needed again is a second
      // request, which a deployed site answers from the browser's HTTP cache
      this.traffic.height.n++; this.traffic.height.bytes += m.bytes.height; this.traffic.imagery.n++; this.traffic.imagery.bytes += m.bytes.imagery
      if (!this.seen.has(t.key)) { this.seen.add(t.key); this.traffic.height.unique++; this.traffic.imagery.unique++ }
    }
    if (!m.imagery && t.parent?.state !== "ready") { t.state = "new"; return }   // its parent was evicted meanwhile
    t.heights = m.heights
    if (m.imagery) {
      const tex = new THREE.Texture(m.imagery); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true
      t.texture = tex; t.uv = [0, 0, 1, 1]
    } else t.texture = t.parent.texture
    this.setBounds(t, m.minH, m.maxH)
    this.buildMesh(t, m)
    t.state = "ready"; this.version++
  }

  // ---- materials: imagery, plus an optional draped overlay on its own UV set ----
  material(imagery, overlayTex) {
    const key = imagery.uuid + (overlayTex ? overlayTex.uuid : "")
    let m = this.materials.get(key)
    if (m) return m
    m = new THREE.MeshStandardMaterial({ map: imagery, roughness: 0.95, metalness: 0 })
    if (overlayTex) {
      m.userData.overlay = overlayTex
      m.onBeforeCompile = sh => {
        sh.uniforms.overlayMap = { value: overlayTex }
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 ouv; varying vec2 vOuv;").replace("#include <uv_vertex>", "#include <uv_vertex>\nvOuv = ouv;")
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D overlayMap; varying vec2 vOuv;")
          .replace("#include <map_fragment>", "#include <map_fragment>\nvec4 ov = texture2D(overlayMap, vOuv); diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb, ov.a);")
      }
      m.customProgramCacheKey = () => "draped-overlay"
    }
    this.materials.set(key, m); return m
  }

  buildMesh(t, m) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(m.pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(m.nor, 3, true))
    geo.setAttribute("uv", new THREE.BufferAttribute(m.uv, 2)); geo.setAttribute("ouv", new THREE.BufferAttribute(m.ouv, 2))
    geo.setIndex(new THREE.BufferAttribute(INDEX.slice(), 1))
    geo.boundingSphere = t.sphere.clone(); geo.boundingSphere.center.sub(new THREE.Vector3(...m.center))
    t.overlayTex = this.overlay ? this.overlay.textureFor(t.b, t.z) : null
    t.mesh = new THREE.Mesh(geo, this.material(t.texture, t.overlayTex))
    t.mesh.position.set(...m.center); t.mesh.matrixAutoUpdate = false; t.mesh.updateMatrix(); t.mesh.updateMatrixWorld(true)
    t.mesh.receiveShadow = true; t.mesh.frustumCulled = false; t.mesh.userData.tile = t
    t.mesh.userData.blocks = m.blocks; t.mesh.raycast = tileRaycast
    t.bytes = m.blocks.byteLength + m.pos.byteLength + m.nor.byteLength + m.uv.byteLength + m.ouv.byteLength + INDEX.byteLength + (t.virtual ? 0 : TEXTURE_BYTES) + (t.overlayTex ? 256 * 256 * 4 : 0)
  }

  // ---- selection ----
  // viewportHeight is in CSS pixels: the error target means the same on every screen.
  update(camera, viewportHeight) {
    this.frameId++; this.now = performance.now(); this.selected = []; this.pendingRefine = 0
    camera.updateMatrixWorld(); this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.projView)
    const eye = camera.position, pxPerRad = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    const R2 = 6356752 * 6356752 * 0.999, fog = this.fogDensity
    // The ground point under the camera: a tile containing it is never behind
    // the horizon, even when the camera is so low that none of the tile's
    // sample points rise above it (large tiles at low altitude).
    const nadirLat = Math.asin(eye.z / eye.length()) * 180 / Math.PI, nadirLon = Math.atan2(eye.y, eye.x) * 180 / Math.PI
    const underCamera = b => nadirLon >= b.w && nadirLon <= b.e && nadirLat >= b.s && nadirLat <= b.n
    const visit = t => {
      t.lastUsed = this.frameId; t.lastUsedT = this.now
      if (t.z > 0 && (!this.frustum.intersectsSphere(t.sphere) || !(underCamera(t.b) || t.horizonPts.some(p => p.dot(eye) > R2)))) return
      if (t.state !== "ready") { this.request(t, 100 - t.z); this.pendingRefine++; return }
      const d = Math.max(1, t.sphere.distanceToPoint(eye))
      // Under the haze a tile needs less detail: subtract up to two pixels of
      // error as the haze thickens (Cesium does the same under its fog).
      const haze = fog > 0 ? 1 - Math.exp(-((d * fog) ** 2)) : 0
      const err = (LEVEL0_ERROR / (1 << t.z)) * pxPerRad / d - 2 * haze
      if (err > this.maxSSE && t.z < this.maxLevel && (t.available || t.virtual) && this.hasDeeper(t)) {
        const kids = [0, 1].flatMap(dx => [0, 1].map(dy => this.tile(t.z + 1, t.x * 2 + dx, t.y * 2 + dy, t)))
        kids.forEach(k => { k.lastUsed = this.frameId; k.lastUsedT = this.now; if (k.state === "new") this.request(k, err) })
        if (kids.every(k => k.state === "ready" || k.state === "failed")) { kids.forEach(k => k.state === "ready" && visit(k)); return }
        this.pendingRefine++
      }
      this.selected.push(t)
    }
    this.roots.forEach(visit)
    this.cancelStale(); this.pump(); this.evict()
    // keep anything that is not a tile (the controls' pivot marker lives here)
    const extras = this.group.children.filter(c => !c.userData.tile)
    this.group.children.length = 0
    for (const s of this.selected) { this.group.children.push(s.mesh); s.mesh.parent = this.group }
    for (const c of extras) this.group.children.push(c)
  }
  get settled() { return this.pending.size === 0 && this.queue.every(t => this.frameId - t.lastUsed > 2) && this.pendingRefine === 0 }

  // Least recently used tiles go first once the estimated GPU memory passes the
  // budget. A tile used in the last 1.5 s is never evicted, and neither is a
  // parent of one (visiting a child visits its parent, so it stays fresh).
  evict() {
    let used = 0
    for (const t of this.tiles.values()) used += t.bytes
    this.memoryBytes = used; this.memoryPeak = Math.max(this.memoryPeak ?? 0, used)
    if (used > this.budget) {
      const old = [...this.tiles.values()].filter(t => t.z > 0 && t.state === "ready" && this.stale(t, 1500)).sort((a, b) => a.lastUsedT - b.lastUsedT)
      for (const t of old) {
        if (used <= this.budget * 0.85) break
        if (t.state !== "ready") continue   // dropped already, with its parent
        used -= this.drop(t)
        // virtual tiles borrow their parent's heights and texture; they go with it
        for (const v of this.tiles.values()) if (v.virtual && v.parent === t) used -= this.drop(v)
      }
      this.memoryBytes = used
    }
    if (this.frameId % 120 === 0) this.pruneEmpty()
  }
  drop(t) {
    t.mesh?.geometry.dispose()
    if (!t.virtual && t.texture) {
      for (const [k, m] of this.materials) if (m.map === t.texture) { m.dispose(); this.materials.delete(k) }
      t.texture.dispose(); t.texture.image?.close?.()
    }
    t.overlayTex?.dispose?.()
    this.tiles.delete(t.key)
    const b = t.bytes; t.bytes = 0; t.state = "evicted"; t.mesh = null; t.heights = null
    return b
  }
  // Tiles never loaded and long unused are only bookkeeping; forget them.
  pruneEmpty() {
    for (const t of this.tiles.values()) if (t.z > 0 && t.state === "new" && this.stale(t, 10000)) this.tiles.delete(t.key)
  }

  // Re-skins loaded tiles when the overlay changes (no refetch).
  refreshOverlay() {
    for (const t of this.tiles.values()) if (t.mesh) { t.overlayTex?.dispose?.(); t.overlayTex = this.overlay ? this.overlay.textureFor(t.b, t.z) : null; t.mesh.material = this.material(t.texture, t.overlayTex) }
  }
  get loadedCount() { let n = 0; for (const t of this.tiles.values()) if (t.state === "ready" && !t.virtual) n++; return n }

  // Rendered height (exaggerated metres) at a point, from the finest loaded tile
  // that covers it, for lines that follow the terrain. Null before any loads.
  heightAt(lon, lat) {
    let best = null
    for (let z = this.maxLevel; z >= 0 && !best; z--) {
      const s = 180 / (1 << z), x = Math.floor((lon + 180) / s), y = Math.floor((lat + 90) / s)
      const t = this.tiles.get(`${z}/${x}/${y}`)
      if (t?.state === "ready" && t.heights) best = t
    }
    if (!best) return null
    const { b } = best, fc = (lon - b.w) / (b.e - b.w) * (G - 1) + 1, fr = (b.n - lat) / (b.n - b.s) * (G - 1) + 1
    const c = Math.min(B - 2, Math.max(0, Math.floor(fc))), r = Math.min(B - 2, Math.max(0, Math.floor(fr))), u = fc - c, v = fr - r
    const h = (i, j) => Math.max(0, best.heights[i * B + j])
    return ((h(r, c) * (1 - u) + h(r, c + 1) * u) * (1 - v) + (h(r + 1, c) * (1 - u) + h(r + 1, c + 1) * u) * v) * this.K
  }

  trafficKB() {
    const kb = o => ({ n: o.n, kb: Math.round(o.bytes / 1024), unique: o.unique })
    return { height: kb(this.traffic.height), imagery: kb(this.traffic.imagery) }
  }
  dispose() {
    this.workers.forEach(w => w.terminate()); this.workers = []
    for (const t of [...this.tiles.values()]) if (t.state === "ready") this.drop(t)
  }
}
