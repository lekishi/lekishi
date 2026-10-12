/**
 * WGS84 geodesy for the globe, in Earth-centred, Earth-fixed metres.
 *
 * The axes are the globe's world axes: z through the north pole, x through
 * longitude 0 on the equator, y through 90° E. Tiles, markers, and the camera
 * all live in these coordinates, so a geodetic point maps to the same place for
 * every one of them. Pure functions; nothing here depends on Three.js.
 */

export const WGS84 = {
  a: 6378137.0,
  b: 6356752.314245179,
  e2: 0.00669437999014133,
} as const

/** The mean Earth radius the camera and atmosphere use for altitude, in metres. */
export const MEAN_RADIUS_M = 6371000

export type Vec3 = readonly [number, number, number]

const radians = (degrees: number) => (degrees * Math.PI) / 180
const degrees = (radians: number) => (radians * 180) / Math.PI

/** Geodetic degrees and metres above the ellipsoid to ECEF metres. */
export function toEcef(lon: number, lat: number, height = 0): Vec3 {
  const l = radians(lon)
  const p = radians(lat)
  const s = Math.sin(p)
  const c = Math.cos(p)
  const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * s * s)
  return [
    (n + height) * c * Math.cos(l),
    (n + height) * c * Math.sin(l),
    (n * (1 - WGS84.e2) + height) * s,
  ]
}

/** ECEF metres to geodetic degrees and metres (Bowring's method; centimetres at the surface). */
export function fromEcef(
  x: number,
  y: number,
  z: number,
): { lon: number; lat: number; height: number } {
  const { a, b, e2 } = WGS84
  const ep2 = (a * a - b * b) / (b * b)
  const r = Math.hypot(x, y)
  const theta = Math.atan2(z * a, r * b)
  const lat = Math.atan2(z + ep2 * b * Math.sin(theta) ** 3, r - e2 * a * Math.cos(theta) ** 3)
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2)
  return { lon: degrees(Math.atan2(y, x)), lat: degrees(lat), height: r / Math.cos(lat) - n }
}

/** East, north, and up unit vectors at a geodetic point, in ECEF. */
export function enu(lon: number, lat: number): { e: Vec3; n: Vec3; u: Vec3 } {
  const l = radians(lon)
  const p = radians(lat)
  return {
    e: [-Math.sin(l), Math.cos(l), 0],
    n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)],
    u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)],
  }
}

/**
 * A camera looking at a ground point: the target, the range to it, the heading
 * (0 north, clockwise), and the pitch (-90 straight down).
 */
export type CameraPose = {
  readonly lon: number
  readonly lat: number
  readonly rangeM: number
  readonly headingDeg: number
  readonly pitchDeg: number
}

/** The eye position and up vector, in ECEF, for a pose. */
export function eyeFor(pose: CameraPose): { eye: Vec3; target: Vec3; up: Vec3 } {
  const target = toEcef(pose.lon, pose.lat, 0)
  const frame = enu(pose.lon, pose.lat)
  const h = radians(pose.headingDeg)
  const p = radians(pose.pitchDeg)
  // Direction and up in the local east, north, up frame, then to ECEF.
  const direction: Vec3 = [Math.sin(h) * Math.cos(p), Math.cos(h) * Math.cos(p), Math.sin(p)]
  const up: Vec3 = [-Math.sin(h) * Math.sin(p), -Math.cos(h) * Math.sin(p), Math.cos(p)]
  const toWorld = (v: Vec3): Vec3 => [
    frame.e[0] * v[0] + frame.n[0] * v[1] + frame.u[0] * v[2],
    frame.e[1] * v[0] + frame.n[1] * v[1] + frame.u[1] * v[2],
    frame.e[2] * v[0] + frame.n[2] * v[1] + frame.u[2] * v[2],
  ]
  const d = toWorld(direction)
  return {
    eye: [
      target[0] - d[0] * pose.rangeM,
      target[1] - d[1] * pose.rangeM,
      target[2] - d[2] * pose.rangeM,
    ],
    target,
    up: toWorld(up),
  }
}

/**
 * The pose of a camera already in flight, read back from its eye and view
 * direction, so a flight starts where the reader left the camera rather than
 * jumping. The target is where the view direction meets WGS84, or the
 * point under the camera when the view misses the Earth.
 */
export function poseOf(eye: Vec3, direction: Vec3): CameraPose {
  const [ex, ey, ez] = eye
  const length = Math.hypot(...direction) || 1
  const [dx, dy, dz] = direction.map((v) => v / length) as unknown as Vec3
  // Use the same surface as eyeFor: a mean-sphere hit causes kilometre-scale
  // jumps when a flight begins near the ground.
  const a2 = WGS84.a ** 2
  const b2 = WGS84.b ** 2
  const a = (dx * dx + dy * dy) / a2 + (dz * dz) / b2
  const b = (ex * dx + ey * dy) / a2 + (ez * dz) / b2
  const c = (ex * ex + ey * ey) / a2 + (ez * ez) / b2 - 1
  const discriminant = b * b - a * c
  const t = discriminant >= 0 ? (-b - Math.sqrt(discriminant)) / a : -1

  if (t <= 0) {
    const ground = fromEcef(ex, ey, ez)
    return {
      lon: ground.lon,
      lat: ground.lat,
      rangeM: Math.max(1, ground.height),
      headingDeg: 0,
      pitchDeg: -90,
    }
  }

  const hit: Vec3 = [ex + dx * t, ey + dy * t, ez + dz * t]
  const target = fromEcef(...hit)
  const frame = enu(target.lon, target.lat)
  const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const local: Vec3 = [
    dot([dx, dy, dz], frame.e),
    dot([dx, dy, dz], frame.n),
    dot([dx, dy, dz], frame.u),
  ]
  return {
    lon: target.lon,
    lat: target.lat,
    rangeM: t,
    headingDeg: degrees(Math.atan2(local[0], local[1])),
    pitchDeg: degrees(Math.asin(Math.max(-1, Math.min(1, local[2])))),
  }
}

const smoothstep = (u: number) => u * u * (3 - 2 * u)

/**
 * A pose between two poses. The range interpolates logarithmically so a zoom
 * feels uniform at every altitude, and the longitude takes the short way round.
 * When the two targets are far apart the flight climbs through `arcRangeM`, so
 * the reader sees where it is going instead of skimming the surface.
 */
export function interpolatePose(
  from: CameraPose,
  to: CameraPose,
  t: number,
  arcRangeM = 0,
): CameraPose {
  // The ends are exact, so a flight lands precisely where it was sent.
  if (t <= 0) return { ...from }
  if (t >= 1) return { ...to }

  const u = smoothstep(t)
  const lerp = (a: number, b: number) => a + (b - a) * u
  let dLon = to.lon - from.lon
  dLon -= 360 * Math.round(dLon / 360)
  let dHeading = to.headingDeg - from.headingDeg
  dHeading -= 360 * Math.round(dHeading / 360)
  const base = Math.exp(lerp(Math.log(from.rangeM), Math.log(to.rangeM)))
  // A bump that is zero at both ends and peaks mid-flight, only as high as needed.
  const peak = Math.max(0, arcRangeM - Math.max(from.rangeM, to.rangeM))
  return {
    lon: from.lon + dLon * u,
    lat: lerp(from.lat, to.lat),
    rangeM: base + peak * Math.sin(Math.PI * u),
    headingDeg: from.headingDeg + dHeading * u,
    pitchDeg: lerp(from.pitchDeg, to.pitchDeg),
  }
}

/** Great-circle distance between two geodetic points on the mean sphere, in metres. */
export function surfaceDistance(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
): number {
  const p1 = radians(a.lat)
  const p2 = radians(b.lat)
  const dp = p2 - p1
  const dl = radians(b.lon - a.lon)
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}
