// The custom globe's tile engine, as a module: a quadtree over the shared
// geographic tiling, chosen by screen-space error, with full-grid heights,
// skirts, imagery mapped one to one, and parent quadrants where the tileset
// stops (see the globe phase's custom/main.js for the first version).
//
// What the follow-up adds:
// - `maxSSE` is a parameter, so the level-of-detail budget can be tuned.
// - Draped overlays: an overlay source returns a texture for a tile (or null);
//   it is sampled with a second, per-tile UV set, so polygons stay sharp on
//   tiles that borrow a parent's imagery quadrant.
// - Tiles are ordinary meshes in `group`, so camera controls and picking can
//   raycast the surface the reader actually sees.
import * as THREE from "three"
import { toEcef } from "../shared/flight.js"

const LEVEL0_ERROR = 77067 // Cesium's level-0 geometric error for 65-sample tiles, metres
const G = 65

export class Globe {
  constructor({ tilesUrl, tileset, exaggeration, maxSSE = 2, overlay = null, maxInflight = 10 }) {
    this.url = tilesUrl; this.avail = tileset.available; this.maxLevel = tileset.maxLevel
    this.K = exaggeration; this.maxSSE = maxSSE; this.overlay = overlay; this.maxInflight = maxInflight
    this.MAXH = 9000 * exaggeration   // above any terrain on Earth: the roots' bound before they load
    this.tiles = new Map(); this.queue = []; this.inflight = 0
    this.group = new THREE.Group(); this.group.name = "globe"
    this.materials = new Map()
    this.frustum = new THREE.Frustum(); this.projView = new THREE.Matrix4()
    this.frameId = 0; this.selected = []; this.pendingRefine = 0; this.failed = 0
    this.roots = [this.tile(0, 0, 0, null), this.tile(0, 1, 0, null)]
  }

  isAvailable(z, x, y) { return z < this.avail.length && this.avail[z].some(r => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY) }
  hasDeeper(t) { const z = t.z + 1, x = t.x * 2, y = t.y * 2; return this.isAvailable(z, x, y) || this.isAvailable(z, x + 1, y) || this.isAvailable(z, x, y + 1) || this.isAvailable(z, x + 1, y + 1) }
  static bounds(z, x, y) { const s = 180 / (1 << z); return { w: -180 + x * s, s: -90 + y * s, e: -180 + (x + 1) * s, n: -90 + (y + 1) * s } }

  tile(z, x, y, parent) {
    const k = `${z}/${x}/${y}`; let t = this.tiles.get(k)
    if (t) return t
    const b = Globe.bounds(z, x, y)
    t = { z, x, y, b, key: k, parent, sphere: new THREE.Sphere(), horizonPts: [], available: this.isAvailable(z, x, y), state: "new", mesh: null, heights: null, texture: null, lastUsed: 0 }
    // Tight height bounds decide how far away a tile is, so they decide how much
    // gets fetched: with every tile assumed to reach the highest possible terrain
    // (19.8 km after exaggeration) the sea tiles looked near and over-refined.
    // Roots start from that worst case; children start from the parent's samples
    // over their quadrant plus the parent's geometric error (the parent grid can
    // miss a peak between samples); a loaded tile then uses its own heights.
    const r = parent?.heights ? this.quadrantRange(parent, x - parent.x * 2, y - parent.y * 2, LEVEL0_ERROR / (1 << parent.z)) : [0, this.MAXH]
    this.setBounds(t, r[0], r[1])
    this.tiles.set(k, t); return t
  }
  // [min, max] rendered height (exaggerated, sea clamped to 0) over a quadrant of a loaded tile
  quadrantRange(p, qx, qy, margin) {
    const r0 = qy === 1 ? 0 : 32, c0 = qx * 32
    let lo = Infinity, hi = -Infinity
    for (let r = r0; r <= r0 + 32; r++) for (let c = c0; c <= c0 + 32; c++) { const v = p.heights[r * G + c]; if (v < lo) lo = v; if (v > hi) hi = v }
    return [Math.max(0, lo - margin) * this.K, (Math.max(0, hi) + margin) * this.K]
  }
  ownRange(t) {
    let lo = Infinity, hi = -Infinity
    for (const v of t.heights) { if (v < lo) lo = v; if (v > hi) hi = v }
    return [Math.max(0, lo) * this.K, Math.max(0, hi) * this.K]
  }
  setBounds(t, minH, maxH) {
    const { b } = t
    // bounds from a 5x5 sample at the lowest and highest terrain: corners alone
    // miss the bulge of large, curved tiles
    const grid = []
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) grid.push([b.w + (b.e - b.w) * i / 4, Math.max(-89.9, Math.min(89.9, b.s + (b.n - b.s) * j / 4))])
    const high = grid.map(([lo, la]) => new THREE.Vector3(...toEcef(lo, la, maxH)))
    const low = grid.map(([lo, la]) => new THREE.Vector3(...toEcef(lo, la, minH)))
    t.sphere.setFromPoints([...high, ...low]); t.horizonPts = high; t.minH = minH; t.maxH = maxH
  }

  // ---- loading ----
  async decodeHeights(url) {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" })
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, bmp.width, bmp.height).data
    const h = new Float32Array(bmp.width * bmp.height)
    for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768
    return h
  }
  async loadTexture(url) {
    const bmp = await createImageBitmap(await (await fetch(url)).blob())
    const tex = new THREE.Texture(bmp); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true
    return tex
  }
  request(t, priority) {
    if (t.state !== "new") return
    if (!t.available) { this.buildVirtual(t); return }
    t.state = "queued"; t.priority = priority; this.queue.push(t)
  }
  pump() {
    this.queue.sort((a, b) => b.priority - a.priority)
    while (this.inflight < this.maxInflight && this.queue.length) {
      const t = this.queue.shift()
      if (this.frameId - t.lastUsed > 2) { t.state = "new"; continue }   // no longer wanted: drop, it will be re-queued if needed
      t.state = "loading"; this.inflight++
      Promise.all([this.decodeHeights(`${this.url}height/${t.key}.png`), this.loadTexture(`${this.url}imagery/${t.key}.jpg`)])
        .then(([h, tex]) => { t.heights = h; t.texture = tex; t.uv = [0, 0, 1, 1]; this.buildMesh(t); t.state = "ready" })
        .catch(e => { console.error("tile failed", t.key, e.message); t.state = "failed"; this.failed++ })
        .finally(() => { this.inflight-- })
    }
  }
  buildVirtual(t) {
    const p = t.parent
    if (!p || p.state !== "ready") return
    const qx = t.x - p.x * 2, qy = t.y - p.y * 2, h = new Float32Array(G * G)
    const r0 = qy === 1 ? 0 : 32, c0 = qx * 32
    const at = (rr, cc) => p.heights[Math.min(64, rr) * G + Math.min(64, cc)]
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const pr = r0 + r / 2, pc = c0 + c / 2, ir = Math.floor(pr), ic = Math.floor(pc), fr = pr - ir, fc = pc - ic
      h[r * G + c] = (at(ir, ic) * (1 - fc) + at(ir, ic + 1) * fc) * (1 - fr) + (at(ir + 1, ic) * (1 - fc) + at(ir + 1, ic + 1) * fc) * fr
    }
    const [u0, v0, u1, v1] = p.uv, du = (u1 - u0) / 2, dv = (v1 - v0) / 2
    t.heights = h; t.texture = p.texture; t.uv = [u0 + qx * du, v0 + (1 - qy) * dv, u0 + (qx + 1) * du, v0 + (2 - qy) * dv]
    t.virtual = true; this.buildMesh(t); t.state = "ready"
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

  buildMesh(t) {
    const { b } = t, h = t.heights, K = this.K
    const [minH, maxH] = this.ownRange(t); this.setBounds(t, minH, maxH)
    const center = new THREE.Vector3(...toEcef((b.w + b.e) / 2, (b.s + b.n) / 2, 0))
    const skirt = Math.max(50, LEVEL0_ERROR / (1 << t.z) * 2)
    const n = G * G, ring = 4 * (G - 1)
    const pos = new Float32Array((n + ring) * 3), uv = new Float32Array((n + ring) * 2), ouv = new Float32Array((n + ring) * 2), nor = new Float32Array((n + ring) * 3)
    const P = new Array(n), [u0, v0, u1, v1] = t.uv
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const lon = b.w + (b.e - b.w) * c / (G - 1), lat = Math.max(-89.99, Math.min(89.99, b.n - (b.n - b.s) * r / (G - 1)))
      const i = r * G + c, p = toEcef(lon, lat, Math.max(0, h[i]) * K)
      P[i] = p; pos.set([p[0] - center.x, p[1] - center.y, p[2] - center.z], i * 3)
      uv.set([u0 + (u1 - u0) * c / (G - 1), v0 + (v1 - v0) * r / (G - 1)], i * 2)
      ouv.set([c / (G - 1), r / (G - 1)], i * 2)
    }
    for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
      const a = P[r * G + Math.max(0, c - 1)], bb = P[r * G + Math.min(G - 1, c + 1)], cc = P[Math.max(0, r - 1) * G + c], d = P[Math.min(G - 1, r + 1) * G + c]
      const ex = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], ny = [cc[0] - d[0], cc[1] - d[1], cc[2] - d[2]]
      const nx = ex[1] * ny[2] - ex[2] * ny[1], nyy = ex[2] * ny[0] - ex[0] * ny[2], nz = ex[0] * ny[1] - ex[1] * ny[0], l = Math.hypot(nx, nyy, nz) || 1
      nor.set([nx / l, nyy / l, nz / l], (r * G + c) * 3)
    }
    const edge = []
    for (let c = 0; c < G - 1; c++) edge.push(c)
    for (let r = 0; r < G - 1; r++) edge.push(r * G + G - 1)
    for (let c = G - 1; c > 0; c--) edge.push((G - 1) * G + c)
    for (let r = G - 1; r > 0; r--) edge.push(r * G)
    const up = new THREE.Vector3()
    edge.forEach((i, k) => {
      const j = n + k, p = P[i]; up.set(p[0], p[1], p[2]).normalize()
      pos.set([p[0] - up.x * skirt - center.x, p[1] - up.y * skirt - center.y, p[2] - up.z * skirt - center.z], j * 3)
      uv.set([uv[i * 2], uv[i * 2 + 1]], j * 2); ouv.set([ouv[i * 2], ouv[i * 2 + 1]], j * 2); nor.set([nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]], j * 3)
    })
    const idx = []
    for (let r = 0; r < G - 1; r++) for (let c = 0; c < G - 1; c++) { const a = r * G + c, bq = a + G; idx.push(a, bq, a + 1, a + 1, bq, bq + 1) }
    for (let k = 0; k < ring; k++) { const a = edge[k], b2 = edge[(k + 1) % ring], sa = n + k, sb = n + (k + 1) % ring; idx.push(a, sa, b2, b2, sa, sb) }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
    geo.setAttribute("ouv", new THREE.BufferAttribute(ouv, 2)); geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3))
    geo.setIndex(idx); geo.computeBoundingSphere(); geo.computeBoundingBox()
    t.overlayTex = this.overlay ? this.overlay.textureFor(t.b, t.z) : null
    t.mesh = new THREE.Mesh(geo, this.material(t.texture, t.overlayTex))
    t.mesh.position.copy(center); t.mesh.matrixAutoUpdate = false; t.mesh.updateMatrix(); t.mesh.updateMatrixWorld(true)
    t.mesh.receiveShadow = true; t.mesh.frustumCulled = false; t.mesh.userData.tile = t
  }

  // ---- selection ----
  update(camera, viewportHeight) {
    this.frameId++; this.selected = []; this.pendingRefine = 0
    camera.updateMatrixWorld(); this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.projView)
    const eye = camera.position, pxPerRad = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
    const R2 = 6356752 * 6356752 * 0.999
    const visit = t => {
      t.lastUsed = this.frameId
      if (t.z > 1 && (!this.frustum.intersectsSphere(t.sphere) || !(t.horizonPts.some(p => p.dot(eye) > R2)))) return
      if (t.state !== "ready") { this.request(t, 100 - t.z); this.pendingRefine++; return }
      const err = (LEVEL0_ERROR / (1 << t.z)) * pxPerRad / Math.max(1, t.sphere.distanceToPoint(eye))
      if (err > this.maxSSE && t.z < this.maxLevel && (t.available || t.virtual) && this.hasDeeper(t)) {
        const kids = [0, 1].flatMap(dx => [0, 1].map(dy => this.tile(t.z + 1, t.x * 2 + dx, t.y * 2 + dy, t)))
        kids.forEach(k => { k.lastUsed = this.frameId; if (k.state === "new") this.request(k, err) })
        if (kids.every(k => k.state === "ready" || k.state === "failed")) { kids.forEach(k => k.state === "ready" && visit(k)); return }
        this.pendingRefine++
      }
      this.selected.push(t)
    }
    this.roots.forEach(visit)
    this.pump(); this.evict()
    // keep anything that is not a tile (the controls' pivot marker lives here)
    const extras = this.group.children.filter(c => !c.userData.tile)
    this.group.children.length = 0
    for (const s of this.selected) { this.group.children.push(s.mesh); s.mesh.parent = this.group }
    for (const c of extras) this.group.children.push(c)
  }
  get settled() { return this.inflight === 0 && this.queue.every(t => this.frameId - t.lastUsed > 2) && this.pendingRefine === 0 }
  evict() {
    if (this.tiles.size < 900) return
    const old = [...this.tiles.values()].filter(t => t.z > 0 && this.frameId - t.lastUsed > 120 && t.state === "ready").sort((a, b) => a.lastUsed - b.lastUsed).slice(0, this.tiles.size - 700)
    for (const t of old) {
      t.mesh?.geometry.dispose()
      if (!t.virtual && t.texture) {
        for (const [k, m] of this.materials) if (m.map === t.texture) { m.dispose(); this.materials.delete(k) }
        t.texture.dispose()
      }
      t.overlayTex?.dispose?.()
      this.tiles.delete(t.key)
    }
    for (const t of [...this.tiles.values()]) if (t.virtual && !this.tiles.has(t.parent.key)) { t.mesh?.geometry.dispose(); this.tiles.delete(t.key) }
  }
  // Re-skins loaded tiles when the overlay changes (no refetch).
  refreshOverlay() {
    for (const t of this.tiles.values()) if (t.mesh) { t.overlayTex?.dispose?.(); t.overlayTex = this.overlay ? this.overlay.textureFor(t.b, t.z) : null; t.mesh.material = this.material(t.texture, t.overlayTex) }
  }
  get loadedCount() { let n = 0; for (const t of this.tiles.values()) if (t.state === "ready" && !t.virtual) n++; return n }
}
