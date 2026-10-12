// Shared by every globe spike: the flight's camera at time t, and WGS84 helpers.
// Each engine converts the returned target/range/heading/pitch into its own camera,
// so all three fly exactly the same path.
// Browsers keep only 250 resource-timing entries by default; a flight fetches
// thousands of tiles, so raise the cap or tileTraffic() silently undercounts.
if (typeof performance !== "undefined" && performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(100000)

export const WGS84 = { a: 6378137.0, b: 6356752.314245179, e2: 0.00669437999014133 }
const rad = d => d * Math.PI / 180
const smooth = u => u * u * (3 - 2 * u)

// Camera pose along the flight: { lon, lat, rangeM, headingDeg, pitchDeg }.
// Range interpolates logarithmically so a zoom feels uniform at every altitude.
export function cameraAt(flight, t) {
  const k = flight.keys
  if (t <= k[0].t) return { ...k[0] }
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i].t) {
      const a = k[i - 1], b = k[i]
      let u = (t - a.t) / Math.max(1e-9, b.t - a.t)
      if (b.ease !== false) u = smooth(u)
      const lerp = (x, y) => x + (y - x) * u
      return { lon: lerp(a.lon, b.lon), lat: lerp(a.lat, b.lat), rangeM: Math.exp(lerp(Math.log(a.rangeM), Math.log(b.rangeM))), headingDeg: lerp(a.headingDeg, b.headingDeg), pitchDeg: lerp(a.pitchDeg, b.pitchDeg) }
    }
  }
  return { ...k[k.length - 1] }
}

// Geodetic (degrees, metres) to Earth-centred, Earth-fixed metres (Cesium's axes: z north, x at lon 0).
export function toEcef(lon, lat, h = 0) {
  const l = rad(lon), p = rad(lat), s = Math.sin(p), c = Math.cos(p)
  const n = WGS84.a / Math.sqrt(1 - WGS84.e2 * s * s)
  return [(n + h) * c * Math.cos(l), (n + h) * c * Math.sin(l), (n * (1 - WGS84.e2) + h) * s]
}

// East, north, up unit vectors at a geodetic point, in ECEF.
export function enu(lon, lat) {
  const l = rad(lon), p = rad(lat)
  return { e: [-Math.sin(l), Math.cos(l), 0], n: [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)], u: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)] }
}

// Eye position and up vector (ECEF) for a camera looking at the ground target.
export function eyeFor(pose) {
  const t = toEcef(pose.lon, pose.lat, 0), f = enu(pose.lon, pose.lat)
  const h = rad(pose.headingDeg), p = rad(pose.pitchDeg)
  const dirL = [Math.sin(h) * Math.cos(p), Math.cos(h) * Math.cos(p), Math.sin(p)]   // east, north, up
  const upL = [-Math.sin(h) * Math.sin(p), -Math.cos(h) * Math.sin(p), Math.cos(p)]
  const toW = v => [0, 1, 2].map(i => f.e[i] * v[0] + f.n[i] * v[1] + f.u[i] * v[2])
  const dir = toW(dirL), up = toW(upL)
  return { eye: [0, 1, 2].map(i => t[i] - dir[i] * pose.rangeM), target: t, dir, up }
}

// The sun as an ECEF unit vector, from azimuth/elevation at a point.
export function sunDirection(sun) {
  const f = enu(sun.atLon, sun.atLat), az = rad(sun.azimuthDeg), el = rad(sun.elevationDeg)
  const l = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)]
  return [0, 1, 2].map(i => f.e[i] * l[0] + f.n[i] * l[1] + f.u[i] * l[2])
}

// Tile bytes and requests the page has fetched from the shared tileset, by kind.
export function tileTraffic() {
  const out = { terrain: { n: 0, kb: 0 }, height: { n: 0, kb: 0 }, imagery: { n: 0, kb: 0 }, other: { n: 0, kb: 0 } }
  for (const e of performance.getEntriesByType("resource")) {
    if (!e.name.includes("/globe/tiles/")) continue
    const k = e.name.includes("/terrain/") ? "terrain" : e.name.includes("/height/") ? "height" : e.name.includes("/imagery/") ? "imagery" : "other"
    out[k].n++; out[k].kb += (e.encodedBodySize || e.transferSize || 0) / 1024
  }
  for (const k in out) out[k].kb = Math.round(out[k].kb)
  return out
}
