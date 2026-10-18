<script lang="ts">
  import { focusRing, handled, transition } from "$lib/ui"
  import type { GeoPoint } from "../domain"
  import type { SceneJourney } from "../overlays"
  import type { ScenePlace } from "../scene"

  /**
   * The locator (RFD 5, bottom right): a small orthographic globe centred on
   * the chapter's home view, with the chapter's places, its journeys, and the
   * part of the Earth the camera is looking at. It answers "where on Earth am
   * I" after a reader has zoomed into a harbour, and a press flies back to the
   * chapter's opening view.
   *
   * It is schematic on purpose: no coastline is drawn, so it never competes
   * with the terrain as a map, and it draws only from the scene and the
   * camera's reported view.
   */
  let {
    home,
    places,
    journeys,
    camera,
    onHome,
  }: {
    home: GeoPoint
    places: readonly ScenePlace[]
    journeys: readonly SceneJourney[]
    /** The camera's reported centre and height, or null before the first report. */
    camera: { readonly center: GeoPoint; readonly heightMeters: number } | null
    onHome: () => void
  } = $props()

  const R = 44
  const C = 48
  const RAD = Math.PI / 180
  const EARTH_M = 6_371_000

  type XY = { x: number; y: number; visible: boolean }

  function project(point: GeoPoint): XY {
    const lon0 = home.lon * RAD
    const lat0 = home.lat * RAD
    const lon = point.lon * RAD
    const lat = point.lat * RAD
    const cosC =
      Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lon - lon0)

    return {
      x: C + R * Math.cos(lat) * Math.sin(lon - lon0),
      y:
        C -
        R *
          (Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lon - lon0)),
      visible: cosC >= 0,
    }
  }

  /** A path through the visible part of a line, broken where it crosses the limb. */
  function path(points: readonly GeoPoint[]): string {
    let d = ""
    let drawing = false

    for (const point of points) {
      const at = project(point)

      if (!at.visible) {
        drawing = false
        continue
      }

      d += `${drawing ? "L" : "M"}${at.x.toFixed(1)} ${at.y.toFixed(1)}`
      drawing = true
    }

    return d
  }

  const graticule = $derived.by(() => {
    const lines: string[] = []

    for (let lon = -180; lon < 180; lon += 30) {
      lines.push(path(Array.from({ length: 37 }, (_, i) => ({ lon, lat: -90 + i * 5 }))))
    }

    for (let lat = -60; lat <= 60; lat += 30) {
      lines.push(path(Array.from({ length: 73 }, (_, i) => ({ lon: -180 + i * 5, lat }))))
    }

    return lines.filter((d) => d !== "")
  })

  /** The small circle the camera sees, at its angular radius from the centre. */
  const footprint = $derived.by(() => {
    if (camera === null) {
      return null
    }

    const radius = Math.min(80, Math.atan(camera.heightMeters / EARTH_M) / RAD + 0.4)
    const lat1 = camera.center.lat * RAD
    const lon1 = camera.center.lon * RAD
    const d = radius * RAD
    const ring = Array.from({ length: 49 }, (_, i) => {
      const bearing = (i / 48) * 2 * Math.PI
      const lat = Math.asin(
        Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
      )
      const lon =
        lon1 +
        Math.atan2(
          Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
          Math.cos(d) - Math.sin(lat1) * Math.sin(lat),
        )

      return { lat: lat / RAD, lon: lon / RAD }
    })

    return { ring: path(ring), center: project(camera.center) }
  })
</script>

<button
  type="button"
  onclick={onHome}
  aria-label="Back to the chapter's view"
  title="Back to the chapter's view"
  data-testid="atlas-minimap"
  class={[
    handled,
    "group pointer-events-auto relative size-24 shrink-0 cursor-pointer rounded-full border border-frame bg-lacquer-glass shadow-plate backdrop-blur-md hover:border-gold",
    transition,
    focusRing,
  ]}
>
  <svg viewBox="0 0 96 96" class="size-full" aria-hidden="true">
    <circle cx={C} cy={C} r={R} class="fill-abyss stroke-rule" stroke-width="1" />
    {#each graticule as d, index (index)}
      <path {d} fill="none" class="stroke-rule" stroke-width="0.6" />
    {/each}
    {#each journeys as journey (journey.id)}
      <path
        d={path(journey.stops.map((stop) => stop.position))}
        fill="none"
        class="stroke-gold"
        stroke-width="1"
        stroke-dasharray="2 1.5"
      />
    {/each}
    {#each places as place (place.id)}
      {@const at = project(place.position)}
      {#if at.visible}
        <circle
          cx={at.x}
          cy={at.y}
          r={place.selected ? 2.2 : 1.3}
          class={place.selected ? "fill-gold-bright" : "fill-ink-dim"}
        />
      {/if}
    {/each}
    {#if footprint}
      <path d={footprint.ring} fill="none" class="stroke-gold-bright" stroke-width="1.2" />
      {#if footprint.center.visible}
        <circle cx={footprint.center.x} cy={footprint.center.y} r="1.6" class="fill-gold-bright" />
      {/if}
    {/if}
  </svg>
  <span
    class="pointer-events-none absolute inset-x-0 bottom-1.5 text-center text-label font-semibold uppercase text-ink-faint opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
    >Home</span
  >
</button>
