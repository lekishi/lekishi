import type { GeoPoint } from "$lib/atlas/domain"
import { toEcef } from "$lib/atlas/renderer/globe/geo"

const radians = Math.PI / 180

/** Centre the occupied longitude interval, even when it crosses the date line. */
export function overviewCenter(points: readonly GeoPoint[]): GeoPoint {
  if (!points.length) return { lat: 0, lon: 0 }
  const lons = points.map(({ lon }) => (lon + 360) % 360).sort((a, b) => a - b)
  let largest = -1
  let start = 0
  for (const [i, lon] of lons.entries()) {
    const next = lons[i + 1] ?? lons[0] + 360
    if (next - lon > largest) {
      largest = next - lon
      start = next
    }
  }
  const lats = points.map(({ lat }) => lat)
  return {
    lon: ((start + (360 - largest) / 2 + 180) % 360) - 180,
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
  }
}

/** Under the board's overhead 40° vertical perspective, keep every point in
 * the clear area with room for its banner, and in front of the globe's limb. */
export function overviewRange(
  points: readonly GeoPoint[],
  center: GeoPoint,
  width: number,
  height: number,
  bottom: number,
): number {
  if (!width || !height || !points.length) return 9_000_000
  const [x0, y0, z0] = toEcef(center.lon, center.lat, 0)
  const a = center.lon * radians
  const b = center.lat * radians
  const scale = Math.tan(20 * radians) / (height / 2)
  const horizontal = Math.max(1, width / 2 - Math.min(70, width * 0.085)) * scale
  const vertical = Math.max(1, (height - bottom) / 2 - 35) * scale
  let range = 700_000
  for (const point of points) {
    const [x, y, z] = toEcef(point.lon, point.lat, 40_000)
    const dx = x - x0,
      dy = y - y0,
      dz = z - z0
    const east = -dx * Math.sin(a) + dy * Math.cos(a)
    const meridian = dx * Math.cos(a) + dy * Math.sin(a)
    const north = dz * Math.cos(b) - meridian * Math.sin(b)
    const up = dz * Math.sin(b) + meridian * Math.cos(b)
    const radial = (x * x0 + y * y0 + z * z0) / Math.hypot(x0, y0, z0)
    if (radial <= 0) continue // A globe cannot show more than one hemisphere.
    const horizon = (6_378_137 ** 2 - (x * x0 + y * y0 + z * z0)) / radial
    range = Math.max(
      range,
      up + Math.abs(east) / horizontal,
      up + Math.abs(north) / vertical,
      horizon,
    )
  }
  return Math.min(25_000_000, range)
}
