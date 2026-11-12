import * as THREE from "three"
import type { SceneBoard } from "../../scene"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { BORDERED, GRID } from "./tile-mesh"

/**
 * The campaign board the atlas's globe is drawn as (`rfd/0003/CAMPAIGN_BOARD.adoc`;
 * first the `/dev/world` prototype, direction B1 of the 2026-11-09 design
 * review): the world as a game board of raised hex tiles, and the story's
 * reach as fog of war. A hex is lit where a story is at the playhead, drawn
 * as an old paper map where a story has been, and dark elsewhere. Each
 * player's lit hexes get an edge in its tint: where its story is, never a
 * territory.
 *
 * The grid lives in a flat plane over longitude and latitude (`x = lon · K`,
 * `y = lat`, pointy-top hexes of `HEX_SIZE` degrees), so the shaders and this
 * module agree on every cell. Two layers draw it:
 *
 * - The terrain tiles are flattened to sea level and painted per hex: water
 *   in its class's colour, unexplored ground dark. Only tile materials made
 *   with a board are patched; the atlas's terrain shader is untouched.
 * - Every explored land hex is a prism standing on them, its height and
 *   colour from its terrain class: grassland, plains, forest, desert, tundra
 *   or snow, and higher where the ground is rough.
 *
 * Both read the terrain from one world image the loaded tiles paint into
 * (finer tiles over coarser), so a hex's class is the same in both layers and
 * on every tile. Terrain classes are a reading of today's imagery, never a
 * claim about the land in the year of a turn.
 */

/** The grid's horizontal scale: degrees of longitude to grid units, true at 35°. */
export const HEX_K = Math.cos((35 * Math.PI) / 180)
/** Centre to corner, in grid units (degrees of latitude). */
export const HEX_SIZE = 0.5
/** How far a place's light reaches, in hexes: a chapter alive now, then an earlier one. */
export const LIT_RADIUS = 5
export const REMEMBERED_RADIUS = 3

const TEX_W = 1440
const TEX_H = 720
/**
 * The tints a player can wear: the eight controller tokens, then the
 * design system's gold, which the atlas gives a chapter's own story so it is
 * never mistaken for a controller's colour (`STORY_TINT` in `scene.ts`).
 */
const TINTS = 9
/** The world image's size: about 0.18° a pixel, five pixels across a hex. */
const WORLD_W = 2048
const WORLD_H = 1024
/** The world elevation's resolution (about 0.35° a sample) and its step, in metres. */
const RELIEF_W = 1024
const RELIEF_H = 512
const RELIEF_STEP_M = 32
/**
 * The finest tile level painted into the world image and elevation. A level-3
 * tile's 256-pixel imagery (0.09° a pixel) and 65-sample heights (0.35°) are
 * already as fine as the world image and elevation; a finer tile would only
 * reclassify hexes, and move their banners, while the reader zooms.
 */
const PAINT_MAX_LEVEL = 3
/** How long tile paint gathers before the world image is uploaded again. */
const WORLD_UPLOAD_MS = 400

type Axial = { readonly q: number; readonly r: number }

/** The hex holding a point, in axial coordinates. */
export function hexOf(lon: number, lat: number): Axial {
  const x = lon * HEX_K
  const y = lat
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / HEX_SIZE
  const r = ((2 / 3) * y) / HEX_SIZE
  return roundAxial(q, r)
}

function roundAxial(q: number, r: number): Axial {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs
  return { q: rq, r: rr }
}

/** A hex's centre in degrees. */
export function hexCenter({ q, r }: Axial): { lon: number; lat: number } {
  return { lon: (HEX_SIZE * Math.sqrt(3) * (q + r / 2)) / HEX_K, lat: HEX_SIZE * 1.5 * r }
}

/** The texel a hex's centre samples, or -1 off the texture. */
function texel(cell: Axial): number {
  const { lon, lat } = hexCenter(cell)
  if (lat < -90 || lat >= 90 || lon < -180 || lon >= 180) return -1
  // A hex centre can fall exactly on a texel boundary; the nudge keeps this
  // and the shader's float arithmetic on the same side of it.
  const x = Math.floor(((lon + 180) / 360) * TEX_W + 0.01)
  const y = Math.floor(((lat + 90) / 180) * TEX_H + 0.01)
  return y * TEX_W + x
}

/** One explored hex: its centre, its state (lit or remembered) and owner. */
export type BoardCell = {
  readonly lon: number
  readonly lat: number
  readonly lit: boolean
  /** The owning player plus one, or 0. */
  readonly owner: number
}

/**
 * The reach texture's RGBA bytes: red is the state (255 lit, 128 remembered,
 * 0 dark), green the player owning a lit hex plus one. Where two players
 * light one hex, the nearer place wins it. Also every explored hex, for the
 * prisms.
 */
export function boardTexels(
  board: SceneBoard,
  data = new Uint8Array(TEX_W * TEX_H * 4),
): { data: Uint8Array; cells: BoardCell[] } {
  // The board's own texels are rewritten in place: a playing atlas changes
  // the board every turn, and a fresh 4 MB array each time is garbage.
  data.fill(0)
  const nearest = new Map<number, number>()
  const hexes = new Map<number, Axial>()
  const stamp = (
    lon: number,
    lat: number,
    radius: number,
    apply: (i: number, d: number) => void,
  ) => {
    const c = hexOf(lon, lat)
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
        const cell = { q: c.q + dq, r: c.r + dr }
        const i = texel(cell)
        if (i < 0) continue
        hexes.set(i, cell)
        apply(i, Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)))
      }
    }
  }

  for (const point of board.remembered) {
    stamp(point.lon, point.lat, REMEMBERED_RADIUS, (i) => {
      data[i * 4] = Math.max(data[i * 4], 128)
      data[i * 4 + 3] = 255
    })
  }

  for (const point of board.lit) {
    stamp(point.lon, point.lat, LIT_RADIUS, (i, distance) => {
      data[i * 4] = 255
      data[i * 4 + 3] = 255
      if (distance < (nearest.get(i) ?? Infinity)) {
        nearest.set(i, distance)
        data[i * 4 + 1] = (point.player % TINTS) + 1
      }
    })
  }

  const cells = [...hexes].map(([i, cell]) => ({
    ...hexCenter(cell),
    lit: data[i * 4] === 255,
    owner: data[i * 4 + 1],
  }))
  return { data, cells }
}

/**
 * One prism: a hexagonal top (a fan around its centre) and six walls. Each
 * vertex carries its corner's offset from the centre in units of `HEX_SIZE`
 * (xy), whether it is on the top (z) and whether it belongs to a wall (w); the
 * vertex shader places it from its instance's hex.
 */
function prismGeometry(): THREE.InstancedBufferGeometry {
  const corner = (i: number) => {
    const a = ((60 * i - 30) * Math.PI) / 180
    return [Math.cos(a), Math.sin(a)]
  }
  const shape: number[] = []
  for (let i = 0; i < 6; i++) {
    const [ax, ay] = corner(i)
    const [bx, by] = corner(i + 1)
    // Top, counter-clockwise seen from above.
    shape.push(0, 0, 1, 0, ax, ay, 1, 0, bx, by, 1, 0)
    // Wall, facing out.
    shape.push(ax, ay, 0, 1, bx, by, 0, 1, bx, by, 1, 1)
    shape.push(ax, ay, 0, 1, bx, by, 1, 1, ax, ay, 1, 1)
  }
  const geometry = new THREE.InstancedBufferGeometry()
  const vertices = shape.length / 4
  geometry.setAttribute("aHex", new THREE.Float32BufferAttribute(shape, 4))
  // The material's vertex stage reads these; the board's shader replaces both.
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(vertices * 3), 3),
  )
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(new Float32Array(vertices * 3), 3),
  )
  return geometry
}

// The pieces' parts, each painted in the fragment stage: 0 stone, 1 the
// player's tint, 2 wood, 3 cloth, 4 skin.
const STONE = 0
const TINT = 1
const WOOD = 2
const CLOTH = 3
const SKIN = 4

/**
 * A piece's model from three's primitives, merged into one geometry. Sizes
 * are metres in a local frame (x east, y north, z up), a game piece's and not
 * any real building's or ship's: a hex is about 95 km across.
 */
function piece(parts: readonly [THREE.BufferGeometry, number][]): THREE.InstancedBufferGeometry {
  const prepared = parts.map(([geometry, part]) => {
    // three's primitives stand along y; the board's up is z.
    const g = geometry.rotateX(Math.PI / 2)
    const count = g.getAttribute("position").count
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(new Array(count).fill(part), 1))
    return g
  })
  const merged = mergeGeometries(prepared)
  for (const g of prepared) g.dispose()
  // The merged parts' attributes, in an instanced geometry the pieces' own
  // per-instance attributes join.
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setIndex(merged.getIndex())
  for (const [name, attribute] of Object.entries(merged.attributes)) {
    geometry.setAttribute(name, attribute)
  }
  return geometry
}

/** A walled town: houses roofed in the player's tint round a keep with its banner. */
function cityGeometry(): THREE.InstancedBufferGeometry {
  const k = 1000
  const parts: [THREE.BufferGeometry, number][] = [
    [
      new THREE.CylinderGeometry(25 * k, 26 * k, 4.5 * k, 6, 1, true).translate(0, 2.25 * k, 0),
      STONE,
    ],
    [new THREE.CylinderGeometry(26 * k, 26 * k, 1.2 * k, 6).translate(0, 4.5 * k, 0), STONE],
  ]
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    const r = (i % 2 === 0 ? 15 : 12) * k
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const w = (i % 3 === 0 ? 9 : 7) * k
    parts.push([
      new THREE.BoxGeometry(w, 7 * k, w * 0.8).rotateY(a).translate(x, 3.5 * k, z),
      STONE,
    ])
    parts.push([
      new THREE.ConeGeometry(w * 0.78, 5 * k, 4).rotateY(a + Math.PI / 4).translate(x, 9.5 * k, z),
      TINT,
    ])
  }
  parts.push([new THREE.BoxGeometry(10 * k, 15 * k, 10 * k).translate(0, 7.5 * k, 0), STONE])
  parts.push([
    new THREE.ConeGeometry(8.5 * k, 8 * k, 4).rotateY(Math.PI / 4).translate(0, 19 * k, 0),
    TINT,
  ])
  parts.push([
    new THREE.CylinderGeometry(0.5 * k, 0.5 * k, 12 * k, 4).translate(0, 29 * k, 0),
    WOOD,
  ])
  parts.push([new THREE.BoxGeometry(7 * k, 4.5 * k, 0.6 * k).translate(3.7 * k, 32.5 * k, 0), TINT])
  return piece(parts)
}

/** A ship: a hull, a mast and a sail in the player's tint, on its flag base. */
function shipGeometry(): THREE.InstancedBufferGeometry {
  const k = 1000
  return piece([
    [new THREE.CylinderGeometry(11 * k, 11 * k, 1 * k, 6).translate(0, 0.5 * k, 0), TINT],
    [new THREE.BoxGeometry(24 * k, 5 * k, 8 * k).translate(0, 4.5 * k, 0), WOOD],
    [new THREE.BoxGeometry(6 * k, 4 * k, 7 * k).translate(-10 * k, 8.5 * k, 0), WOOD],
    [
      new THREE.ConeGeometry(4 * k, 7 * k, 4).rotateZ(-Math.PI / 2).translate(14.5 * k, 4.5 * k, 0),
      WOOD,
    ],
    [new THREE.CylinderGeometry(0.6 * k, 0.6 * k, 24 * k, 4).translate(1 * k, 17 * k, 0), WOOD],
    // The sail broadside to a camera looking north, so it reads as a sail.
    [new THREE.BoxGeometry(15 * k, 14 * k, 1 * k).translate(1 * k, 18 * k, -1.2 * k), CLOTH],
    [new THREE.BoxGeometry(15.4 * k, 3 * k, 1.2 * k).translate(1 * k, 22 * k, -1.2 * k), TINT],
    [new THREE.BoxGeometry(5 * k, 3 * k, 0.5 * k).translate(3.5 * k, 27.5 * k, 0), TINT],
  ])
}

/** A travelling party: three figures cloaked in the player's tint, a banner beside them. */
function partyGeometry(): THREE.InstancedBufferGeometry {
  const k = 1000
  const parts: [THREE.BufferGeometry, number][] = [
    [new THREE.CylinderGeometry(11 * k, 11 * k, 1 * k, 6).translate(0, 0.5 * k, 0), TINT],
  ]
  for (const [x, z, h] of [
    [-4.5, 2, 1],
    [4.5, 2.5, 0.92],
    [0, -3.5, 1.08],
  ] as const) {
    parts.push([
      new THREE.CylinderGeometry(1.9 * k, 3.4 * k, 8.5 * h * k, 6).translate(
        x * k,
        (1 + 4.25 * h) * k,
        z * k,
      ),
      TINT,
    ])
    parts.push([
      new THREE.SphereGeometry(2.3 * k, 8, 6).translate(x * k, (1 + 10.6 * h) * k, z * k),
      SKIN,
    ])
    parts.push([
      new THREE.CylinderGeometry(0.35 * k, 0.35 * k, 15 * k, 4).translate(
        (x + 3.2) * k,
        8.5 * k,
        z * k,
      ),
      WOOD,
    ])
  }
  parts.push([
    new THREE.CylinderGeometry(0.5 * k, 0.5 * k, 22 * k, 4).translate(8 * k, 12 * k, -4 * k),
    WOOD,
  ])
  parts.push([
    new THREE.BoxGeometry(7 * k, 5 * k, 0.6 * k).translate(11.6 * k, 20 * k, -4 * k),
    TINT,
  ])
  return piece(parts)
}

/**
 * A terrain class for a mean linear colour, by hue and lightness: blue for
 * water (light near shore, dark in the deep), white for snow, green for grass
 * (dark green for forest), yellow for plains, warm and light for desert, dull
 * ground toward the poles for tundra.
 */
function biomeOf([lr, lg, lb]: readonly [number, number, number], lat: number): number {
  const [r, g, b] = [lr, lg, lb].map((v) => Math.max(0, v) ** (1 / 2.2))
  const l = 0.3 * r + 0.59 * g + 0.11 * b
  const sat = Math.max(r, g, b) - Math.min(r, g, b)
  if (b > r * 1.12 && b > g * 0.82) return l < 0.33 ? 0 : 1
  if (l > 0.8 && sat < 0.12) return 7
  if (Math.abs(lat) > 58 && sat < 0.18) return 6
  if (r > g * 1.02 && l > 0.5) return 5
  if (g > r * 1.08) return l < 0.45 ? 4 : 2
  return 3
}

/** The board's two layers, and the uniforms every patched tile material shares. */
export class BoardLayer {
  /** The prisms and pieces, added to the globe by the view. */
  readonly object = new THREE.Group()
  private readonly prisms: THREE.Mesh
  private readonly texture: THREE.DataTexture
  /** The texture's texels, held typed: one RGBA texel a hex. */
  private readonly texels = new Uint8Array(TEX_W * TEX_H * 4)
  private readonly world: HTMLCanvasElement
  private readonly worldContext: CanvasRenderingContext2D
  /**
   * Each hex's class, at its reach texel: red the terrain (0 ocean to 7 snow),
   * green the relief (0 flat, 1 hills, 2 mountains). Classified once on the
   * CPU when imagery arrives, so a frame reads one texel a hex instead of the
   * fourteen samples a per-pixel classification took: a software renderer
   * spent most of each frame on those.
   */
  private readonly classTexture: THREE.DataTexture
  private readonly classes = new Uint8Array(TEX_W * TEX_H * 2)
  /** The tiles painted since the last classification. */
  private dirty: { w: number; s: number; e: number; n: number }[] = []
  /** The relief texture's samples, held typed. */
  private readonly reliefData = new Uint8Array(RELIEF_W * RELIEF_H)
  private readonly painted = new Map<
    string,
    { w: number; s: number; e: number; n: number; z: number }
  >()
  private readonly geometry: THREE.InstancedBufferGeometry
  private readonly material: THREE.MeshStandardMaterial
  private readonly pieceMaterial: THREE.MeshStandardMaterial
  private readonly pieces: {
    readonly city: THREE.Mesh<THREE.InstancedBufferGeometry>
    readonly ship: THREE.Mesh<THREE.InstancedBufferGeometry>
    readonly party: THREE.Mesh<THREE.InstancedBufferGeometry>
  }
  /** Hexes with a piece on them, by reach texel, so markers stand above it. */
  private pieceHexes = new Set<number>()
  private readonly uniforms: {
    readonly uBoard: { value: number }
    readonly uReach: { value: THREE.DataTexture }
    readonly uClass: { value: THREE.DataTexture }
    readonly uTints: { value: THREE.Color[] }
  }
  private last: SceneBoard | null = null
  private lastKey = ""
  private upload: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly onChange: () => void = () => {}) {
    this.texture = new THREE.DataTexture(this.texels, TEX_W, TEX_H)
    this.texture.magFilter = THREE.NearestFilter
    this.texture.minFilter = THREE.NearestFilter
    this.texture.needsUpdate = true

    this.world = document.createElement("canvas")
    this.world.width = WORLD_W
    this.world.height = WORLD_H
    const context = this.world.getContext("2d", { willReadFrequently: true })
    if (context === null) throw new Error("The board needs a 2D canvas to classify its hexes")
    this.worldContext = context
    this.classTexture = new THREE.DataTexture(this.classes, TEX_W, TEX_H, THREE.RGFormat)
    this.classTexture.magFilter = THREE.NearestFilter
    this.classTexture.minFilter = THREE.NearestFilter
    this.classTexture.needsUpdate = true

    // The tints are the design system's controller tokens, resolved from the
    // stylesheet, so the board's edges and the legend use the same colours.
    const style = getComputedStyle(document.documentElement)
    const tints = Array.from({ length: TINTS }, (_, i) => {
      const token = i < TINTS - 1 ? `--color-control-${i + 1}` : "--color-gold"
      const value = style.getPropertyValue(token).trim()
      return new THREE.Color(value === "" ? "white" : value)
    })
    this.uniforms = {
      uBoard: { value: 0 },
      uReach: { value: this.texture },
      uClass: { value: this.classTexture },
      uTints: { value: tints },
    }

    this.geometry = prismGeometry()
    this.material = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
    })
    this.material.customProgramCacheKey = () => "lekishi-board-prism"
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${PRISM_VERTEX}`)
        .replace("#include <begin_vertex>", "vec3 transformed = boardPrism();")
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${PRISM_FRAGMENT}`)
        .replace("#include <map_fragment>", "boardPrismShade(diffuseColor);")
    }
    this.prisms = new THREE.Mesh(this.geometry, this.material)
    this.prisms.name = "board-prisms"

    this.pieceMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.8,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
    })
    this.pieceMaterial.customProgramCacheKey = () => "lekishi-board-piece"
    this.pieceMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${PIECE_VERTEX}`)
        .replace("#include <begin_vertex>", "vec3 transformed = boardPiece();")
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${PIECE_FRAGMENT}`)
        .replace("#include <map_fragment>", "boardPieceShade(diffuseColor);")
    }
    const mesh = (geometry: THREE.InstancedBufferGeometry, name: string) => {
      const m = new THREE.Mesh(geometry, this.pieceMaterial)
      m.name = name
      return m
    }
    this.pieces = {
      city: mesh(cityGeometry(), "board-cities"),
      ship: mesh(shipGeometry(), "board-ships"),
      party: mesh(partyGeometry(), "board-parties"),
    }

    for (const m of [this.prisms, this.pieces.city, this.pieces.ship, this.pieces.party]) {
      // Placed in the shader, so no bounds three could cull by.
      m.frustumCulled = false
      // Nor any the camera controls could raycast: on the CPU the geometry
      // sits round the earth's centre, which would anchor a drag or a zoom.
      m.raycast = () => {}
      this.object.add(m)
    }
    this.object.visible = false
  }

  /** Each piece mesh's instances: hex point, player, scale, and a shift within the hex. */
  private setPieces(
    mesh: THREE.Mesh<THREE.InstancedBufferGeometry>,
    items: readonly {
      lon: number
      lat: number
      player: number
      scale: number
      shift: [number, number]
    }[],
  ): void {
    const piece = new Float32Array(items.length * 4)
    const shift = new Float32Array(items.length * 2)
    items.forEach((item, i) => {
      piece.set([item.lon, item.lat, item.player, item.scale], i * 4)
      shift.set(item.shift, i * 2)
    })
    mesh.geometry.setAttribute("aPiece", new THREE.InstancedBufferAttribute(piece, 4))
    mesh.geometry.setAttribute("aShift", new THREE.InstancedBufferAttribute(shift, 2))
    mesh.geometry.instanceCount = items.length
    mesh.visible = items.length > 0
  }

  /** Shows a board, or hides it with null; returns whether anything changed. */
  set(board: SceneBoard | null): boolean {
    // The atlas derives a new scene on every selection or hover change; the
    // board is a few dozen points, so compare its content and rebuild the
    // textures and instances only when the board itself changed.
    const key = board === null ? "" : JSON.stringify(board)
    if (board === this.last || key === this.lastKey) return false
    this.last = board
    this.lastKey = key
    this.uniforms.uBoard.value = board === null ? 0 : 1
    this.object.visible = board !== null
    if (board !== null) {
      const { cells } = boardTexels(board, this.texels)
      this.texture.needsUpdate = true
      const instances = new Float32Array(cells.length * 4)
      cells.forEach((cell, i) => {
        instances.set([cell.lon, cell.lat, cell.lit ? 1 : 0.5, cell.owner], i * 4)
      })
      this.geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(instances, 4))
      this.geometry.instanceCount = cells.length

      // One city a hex: the first named wins, and the ones a story is at this
      // turn come first. A unit stands toward the hex's south-west corner, in
      // front of any city there as the camera looks north.
      const taken = new Set<number>()
      const cities = (board.cities ?? []).filter((city) => {
        const i = texel(hexOf(city.lon, city.lat))
        if (i < 0 || taken.has(i)) return false
        taken.add(i)
        return true
      })
      this.setPieces(
        this.pieces.city,
        cities.map((city) => ({ ...city, scale: city.active ? 1.75 : 1.4, shift: [0, 0] })),
      )
      const units = board.units ?? []
      for (const kind of ["ship", "party"] as const) {
        this.setPieces(
          this.pieces[kind],
          units
            .filter((unit) => unit.kind === kind)
            .map((unit) => ({ ...unit, scale: 2.4, shift: [-26000, -32000] })),
        )
      }
      for (const unit of units) taken.add(texel(hexOf(unit.lon, unit.lat)))
      this.pieceHexes = taken
    }
    return true
  }

  /**
   * How high a place's marker stands with the board on: on its hex's tile,
   * and above the piece when one stands there, so the name reads over the
   * city as a strategy game's city banner does. The tile's height is read
   * from the same classes the shaders draw (`boardTop`).
   */
  heightAt(lon: number, lat: number): number | null {
    if (this.last === null) return null
    const cell = hexOf(lon, lat)
    const i = texel(cell)
    if (i < 0) return null
    const state = this.texels[i * 4]
    const piece = this.pieceHexes.has(i) ? 62000 : 0
    if (state === 0) return piece
    const biome = this.classes[i * 2]
    const relief = this.classes[i * 2 + 1]
    if (biome <= 1) return piece
    return (relief === 2 ? 40000 : relief === 1 ? 22000 : 10000) + piece
  }

  /**
   * A hex's class (the shaders' `boardClass`): the mean colour of seven
   * samples across it picks the terrain, and the ground's height over the
   * same samples, its mean and its highest, picks the relief. Unpainted
   * ground reads as ocean, so nothing stands up before its imagery arrives.
   */
  private classify(pixels: Uint8ClampedArray, cell: Axial): [number, number] {
    const c = hexCenter(cell)
    const relief = this.reliefData
    const toLinear = (v: number) => (v / 255) ** 2.2
    const inner = HEX_SIZE * 0.8660254
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    let mean = 0
    let top = 0
    for (let k = -1; k < 6; k++) {
      const ang = ((k * 60 + 30) * Math.PI) / 180
      const off = k < 0 ? 0 : inner * 0.6
      const sLon = c.lon + (Math.cos(ang) * off) / HEX_K
      const sLat = c.lat + Math.sin(ang) * off
      const u = ((((sLon + 180) / 360) % 1) + 1) % 1
      const v = Math.min(0.9999, Math.max(0, (90 - sLat) / 180))
      const p = (Math.floor(v * WORLD_H) * WORLD_W + Math.floor(u * WORLD_W)) * 4
      r += toLinear(pixels[p])
      g += toLinear(pixels[p + 1])
      b += toLinear(pixels[p + 2])
      a += pixels[p + 3] / 255
      const h =
        relief[Math.floor(v * RELIEF_H) * RELIEF_W + Math.floor(u * RELIEF_W)] * RELIEF_STEP_M
      mean += h
      top = Math.max(top, h)
    }
    if (a < 3.5) return [0, 0]
    const biome = biomeOf([r / 7, g / 7, b / 7], c.lat)
    if (biome <= 1) return [biome, 0]
    // The elevation is read from coarse tiles, which average a range's peaks
    // down, so the thresholds sit low: the Alps' hexes average about 1,500 m.
    mean /= 7
    return [biome, mean > 1300 || top > 2100 ? 2 : mean > 450 || top > 900 ? 1 : 0]
  }

  /** Classifies every hex whose centre lies in (or a hex beside) a painted tile. */
  private classifyPainted(pixels: Uint8ClampedArray): void {
    const step = HEX_SIZE * 1.5
    const width = HEX_SIZE * Math.sqrt(3)
    for (const { w, s, e, n } of this.dirty) {
      for (let r = Math.floor(s / step) - 1; r <= Math.ceil(n / step) + 1; r++) {
        const q0 = Math.floor((w * HEX_K) / width - r / 2) - 1
        const q1 = Math.ceil((e * HEX_K) / width - r / 2) + 1
        for (let q = q0; q <= q1; q++) {
          const cell = { q, r }
          const i = texel(cell)
          if (i < 0) continue
          const [biome, relief] = this.classify(pixels, cell)
          this.classes[i * 2] = biome
          this.classes[i * 2 + 1] = relief
        }
      }
    }
    this.dirty = []
    this.classTexture.needsUpdate = true
  }

  /**
   * Paints a loaded tile's imagery and heights into the world image and
   * elevation, which both layers classify the terrain from. A tile coarser
   * than one already painted over it is skipped, so a coarse tile reloaded
   * later never blurs finer detail.
   */
  paint(
    bounds: { w: number; s: number; e: number; n: number; z: number },
    imagery: CanvasImageSource,
    heights: Float32Array | null,
  ): void {
    if (bounds.z > PAINT_MAX_LEVEL) return
    const key = `${bounds.z}/${bounds.w}/${bounds.s}`
    if (this.painted.has(key)) return
    for (const other of this.painted.values()) {
      if (
        other.z > bounds.z &&
        other.w < bounds.e &&
        other.e > bounds.w &&
        other.s < bounds.n &&
        other.n > bounds.s
      )
        return
    }
    this.painted.set(key, bounds)
    this.dirty.push(bounds)
    const x = ((bounds.w + 180) / 360) * WORLD_W
    const y = ((90 - bounds.n) / 180) * WORLD_H
    const w = ((bounds.e - bounds.w) / 360) * WORLD_W
    const h = ((bounds.n - bounds.s) / 180) * WORLD_H
    this.worldContext.drawImage(imagery, x, y, w, h)
    if (heights !== null) this.paintRelief(bounds, heights)
    this.upload ??= setTimeout(() => {
      this.upload = null
      this.classifyPainted(this.worldContext.getImageData(0, 0, WORLD_W, WORLD_H).data)
      this.onChange()
    }, WORLD_UPLOAD_MS)
  }

  /** The tile's bordered height grid (row 0 north) into the world elevation, nearest sample. */
  private paintRelief(
    bounds: { w: number; s: number; e: number; n: number },
    heights: Float32Array,
  ): void {
    const data = this.reliefData
    const x0 = Math.max(0, Math.floor(((bounds.w + 180) / 360) * RELIEF_W))
    const x1 = Math.min(RELIEF_W, Math.ceil(((bounds.e + 180) / 360) * RELIEF_W))
    const y0 = Math.max(0, Math.floor(((90 - bounds.n) / 180) * RELIEF_H))
    const y1 = Math.min(RELIEF_H, Math.ceil(((90 - bounds.s) / 180) * RELIEF_H))
    for (let y = y0; y < y1; y++) {
      const lat = 90 - ((y + 0.5) / RELIEF_H) * 180
      const r = Math.round(((bounds.n - lat) / (bounds.n - bounds.s)) * (GRID - 1)) + 1
      if (r < 1 || r > GRID) continue
      for (let x = x0; x < x1; x++) {
        const lon = ((x + 0.5) / RELIEF_W) * 360 - 180
        const c = Math.round(((lon - bounds.w) / (bounds.e - bounds.w)) * (GRID - 1)) + 1
        if (c < 1 || c > GRID) continue
        const metres = heights[r * BORDERED + c]
        data[y * RELIEF_W + x] = Math.max(0, Math.min(255, Math.round(metres / RELIEF_STEP_M)))
      }
    }
  }

  /** Adds the board to a tile material's shader: flattened, painted per hex. */
  patch(material: THREE.MeshStandardMaterial): void {
    material.customProgramCacheKey = () => "lekishi-board"
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${TILE_VERTEX}`)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nboardFlatten(transformed);")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvBoardPoint = vec2(boardLonLat.x * HEX_K, boardLonLat.y);",
        )
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${TILE_FRAGMENT}`)
        .replace(
          "#include <map_fragment>",
          "if (uBoard < 0.5) {\n#include <map_fragment>\n} else { boardShade(diffuseColor); }",
        )
    }
  }

  dispose(): void {
    if (this.upload !== null) clearTimeout(this.upload)
    this.texture.dispose()
    this.classTexture.dispose()
    this.geometry.dispose()
    this.material.dispose()
    for (const m of Object.values(this.pieces)) m.geometry.dispose()
    this.pieceMaterial.dispose()
  }
}

const f = (n: number) => n.toFixed(6)

// The grid, the reach and the terrain classes, shared by every board shader.
// Mirrors `hexOf`, `hexCenter` and `texel` above.
const BOARD_COMMON = /* glsl */ `
uniform float uBoard;
uniform sampler2D uReach;
uniform sampler2D uClass;
uniform vec3 uTints[${TINTS}];
const float HEX_K = ${f(HEX_K)};
const float HEX_S = ${f(HEX_SIZE)};
const float HEX_INNER = ${f(HEX_SIZE * 0.8660254)};
const float WGS84_A = 6378137.0;
const float WGS84_E2 = 0.00669438;

vec4 boardCell(vec2 c) {
  vec2 ll = vec2(c.x / HEX_K, c.y);
  vec2 size = vec2(${TEX_W}.0, ${TEX_H}.0);
  vec2 t = floor(vec2((ll.x + 180.0) / 360.0, (ll.y + 90.0) / 180.0) * size + 0.01);
  return textureLod(uReach, (t + 0.5) / size, 0.0);
}

// A hex's class (\`BoardLayer.classify\`): x its terrain, 0 ocean, 1 coast,
// 2 grassland, 3 plains, 4 forest, 5 desert, 6 tundra, 7 snow; y its relief,
// 0 flat, 0.5 hills, 1 mountains.
vec2 boardClass(vec2 c) {
  vec2 ll = vec2(c.x / HEX_K, c.y);
  vec2 size = vec2(${TEX_W}.0, ${TEX_H}.0);
  vec2 t = floor(vec2((ll.x + 180.0) / 360.0, (ll.y + 90.0) / 180.0) * size + 0.01);
  vec2 k = textureLod(uClass, (t + 0.5) / size, 0.0).rg * 255.0;
  return vec2(floor(k.x + 0.5), floor(k.y + 0.5) * 0.5);
}

// The painted colour of each class, from sRGB.
vec3 biomeColour(int i) {
  vec3 c = vec3(0.92, 0.94, 0.95);
  if (i == 0) c = vec3(0.10, 0.25, 0.43);
  else if (i == 1) c = vec3(0.20, 0.48, 0.64);
  else if (i == 2) c = vec3(0.42, 0.62, 0.24);
  else if (i == 3) c = vec3(0.64, 0.66, 0.3);
  else if (i == 4) c = vec3(0.25, 0.45, 0.19);
  else if (i == 5) c = vec3(0.87, 0.74, 0.47);
  else if (i == 6) c = vec3(0.58, 0.57, 0.47);
  return pow(c, vec3(2.2));
}

// A remembered hex: an old paper map's sepia, from the colour's lightness.
vec3 boardPaper(vec3 col) {
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  return vec3(l * 0.55 + 0.20, l * 0.48 + 0.16, l * 0.36 + 0.10);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// The nearest of a hex's six edges to a point d from its centre: its outward
// normal (xy) and the distance to it (z).
vec3 boardEdge(vec2 d) {
  float best = -1e9;
  vec2 bn = vec2(1.0, 0.0);
  for (int i = 0; i < 6; i++) {
    float a = radians(float(i) * 60.0);
    vec2 n = vec2(cos(a), sin(a));
    float t = dot(d, n);
    if (t > best) { best = t; bn = n; }
  }
  return vec3(bn, HEX_INNER - best);
}

// A player's edge where its lit hexes stop: the tint, by coverage.
vec4 boardOwnerEdge(vec4 cell, vec2 c, vec3 e, float px) {
  int owner = int(cell.g * 255.0 + 0.5);
  if (owner == 0) return vec4(0.0);
  int other = int(boardCell(c + e.xy * 2.0 * HEX_INNER).g * 255.0 + 0.5);
  if (other == owner) return vec4(0.0);
  vec3 tint = uTints[0];
  for (int i = 1; i < ${TINTS}; i++) if (i == owner - 1) tint = uTints[i];
  return vec4(tint, 1.0 - smoothstep(px * 1.6, px * 3.4, e.z));
}

// The centre of the hex holding a grid point.
vec2 boardHex(vec2 hp) {
  vec2 ax = vec2((0.57735027 * hp.x - hp.y / 3.0) / HEX_S, (2.0 / 3.0 * hp.y) / HEX_S);
  vec3 cube = vec3(ax.x, ax.y, -ax.x - ax.y);
  vec3 rc = floor(cube + 0.5);
  vec3 df = abs(rc - cube);
  if (df.x > df.y && df.x > df.z) rc.x = -rc.y - rc.z;
  else if (df.y > df.z) rc.y = -rc.x - rc.z;
  return vec2(HEX_S * 1.7320508 * (rc.x + rc.y * 0.5), HEX_S * 1.5 * rc.y);
}

// How high a hex's tile stands, in metres: a game piece's height, far beyond
// any terrain's, so the tiles read at the distance a turn is played from;
// hills and mountains a step higher each. Water lies at sea level.
float boardTop(vec2 cls) {
  if (int(cls.x + 0.5) <= 1) return 0.0;
  return cls.y > 0.75 ? 40000.0 : cls.y > 0.25 ? 22000.0 : 10000.0;
}

vec3 boardEcef(vec2 lonLat, float h) {
  float lon = radians(lonLat.x);
  float lat = radians(lonLat.y);
  float s = sin(lat);
  float n = WGS84_A / sqrt(1.0 - WGS84_E2 * s * s);
  return vec3((n + h) * cos(lat) * cos(lon), (n + h) * cos(lat) * sin(lon), (n * (1.0 - WGS84_E2) + h) * s);
}
`

// The tiles' vertex stage: flattened to sea level, so nothing of the
// terrain's own relief stands through the prisms. A vertex below sea level is
// a tile's skirt, which hides cracks between tiles, and keeps its depth.
const TILE_VERTEX = /* glsl */ `
attribute vec2 boardLonLat;
varying vec2 vBoardPoint;
${BOARD_COMMON}
void boardFlatten(inout vec3 p) {
  if (uBoard < 0.5) return;
  vec3 w = (modelMatrix * vec4(p, 1.0)).xyz;
  float lat = atan(w.z, length(w.xy) * (1.0 - WGS84_E2));
  float s = sin(lat);
  float n = WGS84_A / sqrt(1.0 - WGS84_E2 * s * s);
  float altitude = length(w.xy) / max(cos(lat), 1e-4) - n;
  vec3 level = boardEcef(vec2(degrees(atan(w.y, w.x)), degrees(lat)), min(altitude, 0.0));
  // The tile's model matrix only translates, so a world offset is a local one.
  p += level - w;
}
`

// The tiles' fragment stage: water in its class's colour, land under the
// prisms dark (it shows only in the seams between them, as the board's grid),
// unexplored ground darker still.
const TILE_FRAGMENT = /* glsl */ `
varying vec2 vBoardPoint;
${BOARD_COMMON}
void boardShade(inout vec4 diffuse) {
  if (uBoard < 0.5) return;
  vec2 hp = vBoardPoint;
  vec2 c = boardHex(hp);
  vec4 cell = boardCell(c);
  vec3 e = boardEdge(hp - c);
  float px = max(fwidth(hp.y), 1e-6);
  float cellPx = HEX_INNER / px;

  vec2 cls = boardClass(c);
  int biome = int(cls.x + 0.5);
  vec3 col = biome <= 1
    ? biomeColour(biome) * (0.94 + 0.12 * hash12(c * 7.0))
    : vec3(0.02, 0.016, 0.012);
  if (cell.r < 0.25) col = mix(col, vec3(0.05, 0.07, 0.09), 0.84);
  else if (cell.r < 0.75 && biome <= 1) col = boardPaper(col);

  float gridA = smoothstep(5.0, 16.0, cellPx) * (cell.r < 0.25 ? 0.10 : 0.32);
  col = mix(col, vec3(0.0), (1.0 - smoothstep(0.0, px * 1.3, e.z)) * gridA);
  vec4 edge = boardOwnerEdge(cell, c, e, px);
  diffuse.rgb = mix(col, edge.rgb, edge.a);
}
`

// The prisms' vertex stage: each instance is one explored hex. Its class sets
// its height and colour; a water hex collapses to nothing, the tiles draw it.
const PRISM_VERTEX = /* glsl */ `
attribute vec4 aHex;
attribute vec4 aCell;
varying vec2 vLocal;
varying vec2 vCentre;
varying float vTop;
varying float vWall;
varying vec4 vClass;
${BOARD_COMMON}
vec3 boardPrism() {
  vec2 c = vec2(aCell.x * HEX_K, aCell.y);
  vec2 cls = boardClass(c);
  int biome = int(cls.x + 0.5);
  vLocal = aHex.xy;
  vCentre = c;
  vTop = aHex.z;
  vWall = aHex.w;
  vClass = vec4(cls, aCell.z, aCell.w);
  if (uBoard < 0.5 || biome <= 1) return vec3(0.0);
  float top = boardTop(cls);
  // A hair narrower than the hex, so a dark seam parts neighbouring tiles.
  vec2 g = c + aHex.xy * HEX_S * 0.95;
  return boardEcef(vec2(g.x / HEX_K, g.y), aHex.z > 0.5 ? top : -2000.0);
}
`

// The prisms' fragment stage: the top in its class's colour with its pieces
// (trees on forest, peaks on rough ground), the walls in earth, darker toward
// the foot; a remembered hex is paper, and a player's edge runs along its lit
// hexes' rims.
const PRISM_FRAGMENT = /* glsl */ `
varying vec2 vLocal;
varying vec2 vCentre;
varying float vTop;
varying float vWall;
varying vec4 vClass;
${BOARD_COMMON}

// Coverage of an upright triangle (a peak) in hex-local units.
float peak(vec2 p, vec2 base, float w, float h, float aa) {
  vec2 q = p - base;
  float t = q.y / h;
  float hw = w * (1.0 - t);
  float inside = min(min(q.y, h - q.y), hw - abs(q.x));
  return smoothstep(-aa, aa, inside) * step(0.0, t) * step(t, 1.0);
}

void boardPrismShade(inout vec4 diffuse) {
  int biome = int(vClass.x + 0.5);
  vec2 c = vCentre;
  vec2 d = vLocal * HEX_S;
  vec3 e = boardEdge(d);
  float px = max(fwidth(d.y), 1e-6);
  float cellPx = HEX_INNER / px;
  vec3 col = biomeColour(biome) * (0.92 + 0.16 * hash12(c * 7.0));

  if (vWall > 0.5) {
    // Earth under the turf: a band of the top's colour, then soil.
    vec3 soil = vec3(0.16, 0.10, 0.055);
    col = mix(soil * mix(0.45, 1.0, vTop), col * 0.8, smoothstep(0.86, 0.9, vTop));
  } else {
    float show = smoothstep(10.0, 20.0, cellPx);
    vec2 lp = d / HEX_INNER;
    float aa = 1.5 / cellPx;
    if (show > 0.0 && biome == 4) {
      for (int i = 0; i < 4; i++) {
        float a = float(i) * 1.7 + hash12(c + float(i)) * 1.2;
        vec2 o = vec2(cos(a), sin(a)) * (0.25 + 0.3 * hash12(c * 3.1 + float(i)));
        float r = length(lp - o - vec2(0.0, 0.08));
        float canopy = 1.0 - smoothstep(0.17 - aa, 0.17 + aa, r);
        float shadow = 1.0 - smoothstep(0.19 - aa, 0.19 + aa, length(lp - o - vec2(0.05, -0.02)));
        col = mix(col, col * 0.45, shadow * 0.6 * show);
        vec3 leaf = vec3(0.07, 0.24, 0.05) * (1.0 + 0.6 * smoothstep(0.17, -0.1, length(lp - o - vec2(-0.05, 0.13))));
        col = mix(col, leaf, canopy * show);
      }
    } else if (show > 0.0 && vClass.y > 0.25 && vClass.y < 0.75 && biome != 7) {
      // Hills: two low mounds.
      for (int i = 0; i < 2; i++) {
        vec2 o = vec2(i == 0 ? -0.24 : 0.26, i == 0 ? -0.22 : -0.34);
        vec2 q = (lp - o) / vec2(0.34, 0.24);
        float mound = (1.0 - smoothstep(1.0 - aa * 4.0, 1.0 + aa * 4.0, length(q))) * step(0.0, q.y);
        float sunlit = step(q.x, 0.15);
        col = mix(col, col * mix(0.62, 1.18, sunlit), mound * show);
      }
    } else if (show > 0.0 && (vClass.y > 0.75 || biome == 7)) {
      for (int i = 0; i < 2; i++) {
        vec2 base = vec2(i == 0 ? -0.22 : 0.26, i == 0 ? -0.4 : -0.46);
        float h = i == 0 ? 0.85 : 0.65;
        float m = peak(lp, base, 0.42, h, aa);
        float lit = step(lp.x, base.x + 0.06 * (lp.y - base.y));
        vec3 rock = mix(vec3(0.16, 0.12, 0.08), vec3(0.36, 0.30, 0.22), lit);
        float cap = step(base.y + h * 0.62, lp.y);
        rock = mix(rock, vec3(0.86, 0.9, 0.92) * mix(0.7, 1.0, lit), cap * (biome == 7 || i == 0 ? 1.0 : 0.0));
        col = mix(col, rock, m * show);
      }
    }
    // A lit rim along the top's edge.
    col *= 1.0 + (1.0 - smoothstep(0.0, HEX_INNER * 0.08, e.z)) * 0.25;
  }

  if (vClass.z < 0.75) col = boardPaper(col);
  if (vWall < 0.5) {
    vec4 edge = boardOwnerEdge(boardCell(c), c, e, px);
    col = mix(col, edge.rgb, edge.a);
  }
  diffuse.rgb = col;
}
`

// The pieces' vertex stage: each instance stands on its hex's tile (or on the
// water), in a frame of east, north and up at the hex's centre.
const PIECE_VERTEX = /* glsl */ `
attribute vec4 aPiece;
attribute vec2 aShift;
attribute float aPart;
varying float vPart;
varying float vPlayer;
varying float vPaper;
${BOARD_COMMON}
vec3 boardPiece() {
  vPart = aPart;
  vPlayer = aPiece.z;
  vec2 c = boardHex(vec2(aPiece.x * HEX_K, aPiece.y));
  float state = boardCell(c).r;
  vPaper = state < 0.75 ? 1.0 : 0.0;
  float base = state < 0.25 ? 0.0 : boardTop(boardClass(c));
  vec2 ll = vec2(c.x / HEX_K, c.y);
  float lon = radians(ll.x);
  float lat = radians(ll.y);
  vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec3 east = vec3(-sin(lon), cos(lon), 0.0);
  vec3 north = cross(up, east);
  vec3 p = position * aPiece.w + vec3(aShift, 0.0);
  return boardEcef(ll, base) + east * p.x + north * p.y + up * p.z;
}
`

// The pieces' fragment stage: stone, the player's tint, wood and cloth. A
// piece on a remembered hex is washed toward the paper's sepia, as the story
// has moved on from it.
const PIECE_FRAGMENT = /* glsl */ `
varying float vPart;
varying float vPlayer;
varying float vPaper;
uniform vec3 uTints[${TINTS}];
void boardPieceShade(inout vec4 diffuse) {
  int part = int(vPart + 0.5);
  vec3 tint = uTints[0];
  for (int i = 1; i < ${TINTS}; i++) if (i == int(vPlayer + 0.5)) tint = uTints[i];
  vec3 col = pow(vec3(0.80, 0.74, 0.62), vec3(2.2));
  if (part == 1) col = tint * 0.85;
  else if (part == 2) col = pow(vec3(0.40, 0.26, 0.14), vec3(2.2));
  else if (part == 3) col = pow(vec3(0.94, 0.90, 0.80), vec3(2.2));
  else if (part == 4) col = pow(vec3(0.86, 0.66, 0.48), vec3(2.2));
  if (vPaper > 0.5) {
    float l = dot(col, vec3(0.3, 0.59, 0.11));
    col = mix(col, vec3(l * 0.9 + 0.08, l * 0.8 + 0.06, l * 0.6 + 0.04), 0.55);
  }
  diffuse.rgb = col;
}
`
