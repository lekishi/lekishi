/**
 * Cesium resolves `Workers/`, `Assets/`, and `Widgets/` at runtime through the
 * global `CESIUM_BASE_URL`, so it must be set before any Cesium module runs.
 * This module is imported first by the renderer; do not reorder that import.
 *
 * The directory is produced by `scripts/sync-cesium-runtime.mjs`, which copies
 * the Cesium runtime into `static/cesium`; SvelteKit then copies it into the
 * static build unchanged, so the same value works in development and in the
 * deployed artifact.
 */
export const CESIUM_BASE_URL = "/cesium/"

declare global {
  var CESIUM_BASE_URL: string | undefined
}

globalThis.CESIUM_BASE_URL = globalThis.CESIUM_BASE_URL ?? CESIUM_BASE_URL
