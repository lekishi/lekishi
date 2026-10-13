import { defineConfig, devices } from "@playwright/test"

/**
 * Browser checks for the atlas.
 *
 * Two modes, both of which serve the real application:
 *
 * * `static` (default) builds the static artifact and serves it with
 *   `scripts/serve-static.mjs`, a file-only server rooted at `build/`: no SSR
 *   runtime, no `.svelte-kit` access, clean URLs, and a real 404 page. This is
 *   what a static host does, which is what the checks have to prove (RFD 4 AC4).
 * * `dev` runs the Vite development server, which is what `pnpm dev` starts.
 *
 * `LEKISHI_E2E_BASE_URL` points the checks at an already-running server and
 * disables the managed one; `LEKISHI_SKIP_BUILD=1` reuses an existing artifact
 * instead of rebuilding it.
 */
const mode = process.env.LEKISHI_E2E_MODE ?? "static"
const port = Number(process.env.LEKISHI_E2E_PORT ?? (mode === "dev" ? 5173 : 4111))
const baseURL = process.env.LEKISHI_E2E_BASE_URL ?? `http://127.0.0.1:${port}`

const build = process.env.LEKISHI_SKIP_BUILD === "1" ? "" : "pnpm build && "
const serve =
  mode === "dev"
    ? `pnpm sync:globe && pnpm exec vite dev --port ${port} --strictPort --host 127.0.0.1`
    : `${build}node scripts/serve-static.mjs --directory build --port ${port} --host 127.0.0.1`

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  // The software renderer in a headless container starves the page's animation
  // frames, so a single Playwright action can take seconds to become actionable.
  // The per-file budgets below are for the checks that measure many states; this
  // is the floor for every test.
  timeout: 120_000,
  // WebGL startup on a software renderer needs more than the default 5s to settle.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    // Software WebGL makes every interaction cost seconds, so record a trace only
    // for retried attempts instead of paying the tracing cost on every test.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      },
    },
    {
      // Tablet-class touch viewport. This is emulation, not physical-iPad
      // evidence; RFD 3 keeps physical-device acceptance as a separate gate.
      name: "tablet-touch-chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
    },
    {
      // Phone-class touch viewport: the responsive layout stays usable and free of
      // overlapping panels here, which RFD 4 AC5 asks of phones. The iPhone device
      // descriptor defaults to WebKit, so pin the browser the checks run in.
      name: "phone-chromium",
      use: {
        ...devices["iPhone 14"],
        browserName: "chromium",
      },
    },
    {
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      // Touch emulation exercises WebKit's mobile input/layout paths, not a
      // physical iPad or the Safari build shipped on it.
      name: "tablet-touch-webkit",
      use: {
        ...devices["iPad (gen 7)"],
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "phone-webkit",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "desktop-firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: process.env.LEKISHI_E2E_BASE_URL
    ? undefined
    : {
        command: serve,
        url: `${baseURL}/atlas`,
        // Reuse a server you already started locally; CI always starts one.
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
      },
})
