import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { buildDiorama, dioramaInView, disposeDiorama, parseDiorama } from "./diorama"
import { toEcef } from "./geo"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..")
const shipped = JSON.parse(readFileSync(path.join(ROOT, "static/dioramas/akimeya.json"), "utf8"))
const akimeya = {
  id: "akimeya",
  url: "/dioramas/akimeya.json",
  center: { lon: 130.2269, lat: 31.2672 },
  showBelowMeters: 220_000,
}

describe("the shipped diorama file", () => {
  it("reads, and says itself that it is symbolic", () => {
    const data = parseDiorama(shipped)

    expect(data).not.toBeNull()
    expect(shipped.note).toMatch(/symbolic, not to scale/)
    expect(data?.trees.length).toBeGreaterThan(1000)
    expect(data?.houses.length).toBeGreaterThan(0)
  })

  it("lies around the place it is set at", () => {
    const data = parseDiorama(shipped)!

    for (const [lon, lat] of [...data.trees, ...data.houses]) {
      expect(Math.abs(lon - akimeya.center.lon)).toBeLessThan(0.5)
      expect(Math.abs(lat - akimeya.center.lat)).toBeLessThan(0.3)
    }
  })
})

describe("reading a diorama file", () => {
  it("refuses a file whose columns are not the ones it names", () => {
    const reordered = {
      ...shipped,
      trees: { ...shipped.trees, fields: [...shipped.trees.fields].reverse() },
    }

    expect(parseDiorama(reordered)).toBeNull()
    expect(parseDiorama({ ...shipped, palette: {} })).toBeNull()
    expect(parseDiorama(null)).toBeNull()
    expect(parseDiorama([])).toBeNull()
  })

  it("refuses a row with a value that is not a finite number", () => {
    const broken = {
      ...shipped,
      houses: { ...shipped.houses, items: [[130, 31, "high", 0, 1, 0]] },
    }

    expect(parseDiorama(broken)).toBeNull()
  })
})

describe("showing the diorama", () => {
  it("appears only when the camera is low and near the place", () => {
    expect(dioramaInView(akimeya, 150_000, { lon: 130.3, lat: 31.3 })).toBe(true)
    expect(dioramaInView(akimeya, 400_000, { lon: 130.3, lat: 31.3 })).toBe(false)
    // Low over 長安, two thousand kilometres away: nothing to fetch.
    expect(dioramaInView(akimeya, 150_000, { lon: 108.9, lat: 34.3 })).toBe(false)
  })

  it("instances every symbol in a local frame at the place", () => {
    const data = parseDiorama(shipped)!
    const group = buildDiorama(data, akimeya.center, 2.2)
    const meshes = group.children.filter(
      (child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh,
    )

    // Conifers, broadleaves, trunks, walls and roofs: five draw calls.
    expect(meshes).toHaveLength(5)
    expect(meshes.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(
      data.trees.length * 2 + data.houses.length * 2,
    )

    // A house's instance, carried through the frame, lands at its own
    // geodetic position on the exaggerated terrain.
    const house = data.houses[0]
    const walls = meshes[3]
    const matrix = new THREE.Matrix4()
    walls.getMatrixAt(0, matrix)
    const world = new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(group.matrixWorld)
    const expected = new THREE.Vector3(...toEcef(house[0], house[1], house[2] * 2.2 - 5))

    expect(world.distanceTo(expected)).toBeLessThan(1)

    // Local coordinates stay small enough for single-precision floats.
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).length()).toBeLessThan(100_000)

    disposeDiorama(group)
    expect(group.children).toHaveLength(0)
  })
})
