import { defineConfig, devices } from "@playwright/test"

/**
 * Browser checks for the atlas run against the *release* server: a production
 * Vite build, digested static assets, and a Mix release with no Vite development
 * server running (RFD 4 AC4). `scripts/serve-release.sh` builds and serves it.
 *
 * Point `LEKISHI_E2E_BASE_URL` at an already-running server to reuse it.
 */
const port = Number(process.env.LEKISHI_E2E_PORT ?? 4111)
const baseURL = process.env.LEKISHI_E2E_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  // WebGL startup and 4 MB of Cesium need more than the default 5s to settle.
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
  ],
  webServer: process.env.LEKISHI_E2E_BASE_URL
    ? undefined
    : {
        command: "bash ../scripts/serve-release.sh",
        url: `${baseURL}/atlas`,
        // Reuse a release server you already started locally; CI always builds one.
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
      },
})
