import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"

/**
 * Browser checks against the release server (`scripts/serve-release.sh`).
 *
 * They cover the atlas mount, selection and time-window behavior, camera-follow
 * rules, workspace lifecycle, keyboard access, and the production asset surface:
 * digested JS/CSS plus the Cesium workers, textures, and widget styles served
 * from `priv/static` with no Vite development server involved.
 *
 * The same checks can run against `make dev` by setting `LEKISHI_E2E_BASE_URL`,
 * in which case the asset-surface assertions fall back to the un-digested paths
 * the development server serves.
 */

type DigestManifest = {
  /** Logical static path to its digested file name. */
  latest: Record<string, string>
}

const manifestPath = fileURLToPath(new URL("../../priv/static/cache_manifest.json", import.meta.url))

function digestedPath(entry: string): string {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DigestManifest
  const digested = manifest.latest[entry]

  if (digested === undefined) {
    throw new Error(`The digest manifest has no entry for ${entry}. Run "mix assets.deploy" first.`)
  }

  return `/${digested}`
}

function digestManifest(): DigestManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as DigestManifest
}

function collectProblems(page: Page): string[] {
  const problems: string[] = []

  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console error: ${message.text()}`)
    }
  })
  page.on("response", (response) => {
    if (response.status() >= 400) {
      problems.push(`HTTP ${response.status()} for ${response.url()}`)
    }
  })

  return problems
}

/**
 * True when a release build serves the page: Phoenix rewrites static paths to
 * their digested names only while a cache manifest is loaded, and the `?vsn=d`
 * marker on the page's own assets distinguishes it from the development server.
 */
async function servesDigestedAssets(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("script[src], link[href]")).some((element) =>
      (element.getAttribute("src") ?? element.getAttribute("href") ?? "").includes("?vsn=d"),
    ),
  )
}

/**
 * The overlays a phone layout has to keep apart. They are all fixed to the same
 * small viewport, so any pair that overlaps hides content or a control.
 */
const OVERLAY_SELECTORS = [
  "#atlas-notice",
  "#atlas-follow-toggle",
  "#atlas-list-toggle",
  "#atlas-event-panel",
  "#atlas-selection",
  '[data-testid="atlas-time-controls"]',
] as const

async function assertNoOverlappingPanels(page: Page, state: string): Promise<void> {
  const boxes = await page.evaluate((selectors) => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0
    }

    return selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { selector, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
        }),
    )
  }, OVERLAY_SELECTORS as unknown as string[])

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [a, b] = [boxes[i], boxes[j]]
      const overlaps = a.right > b.x && b.right > a.x && a.bottom > b.y && b.bottom > a.y

      expect(overlaps, `${a.selector} overlaps ${b.selector} (${state} at ${a.x}/${a.y})`).toBe(false)
    }
  }
}

/**
 * Opens the event list when it is behind the phone drawer toggle. Selecting closes
 * the drawer again, so every test that picks an event from the list starts here.
 */
async function openEventList(page: Page): Promise<void> {
  const toggle = page.locator("#atlas-list-toggle")

  if (await toggle.isVisible()) {
    await toggle.click()
    await expect(page.getByTestId("atlas-event-item").first()).toBeVisible()
  }
}

async function mountAtlas(page: Page): Promise<string[]> {
  const problems = collectProblems(page)

  await page.goto("/atlas")
  // The workspace renders its Cesium canvas once the renderer starts.
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

  return problems
}

test("mounts one workspace from the built artifact", async ({ page }) => {
  const requests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/assets/js/")) {
      requests.push(request.url())
    }
  })

  const problems = await mountAtlas(page)

  await expect(page.getByText("Synthetic fixture", { exact: false }).first()).toBeVisible()
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(5)
  await expect(page.getByTestId("atlas-time-controls")).toBeVisible()
  await expect(page.getByTestId("atlas-globe")).toBeVisible()

  // One page has one workspace owner: a second evaluation of the atlas bootstrap
  // would render a second workspace, a second event list, and a second globe.
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)

  // The page loads each bundle once: the Phoenix bundle, and exactly one
  // workspace bundle.
  const bundles = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]')).map(
      (script) => script.src,
    ),
  )
  expect(bundles.filter((src) => src.includes("/assets/js/atlas"))).toHaveLength(1)
  expect(requests).toHaveLength(new Set(requests).size)

  // In production the entry is served from its digested name; a chunk importing
  // it by its unhashed name would fetch and evaluate it a second time.
  if (await servesDigestedAssets(page)) {
    expect(requests.filter((url) => /\/(app|atlas)\.js(\?|$)/.test(url))).toEqual([])
  }

  // The workspace reports itself as a single client-owned handle.
  expect(await page.evaluate(() => typeof window.__lekishiAtlas)).toBe("object")

  expect(problems).toEqual([])
})

test("keeps the Phoenix page working without the atlas bundle", async ({ page }) => {
  const problems = collectProblems(page)

  await page.goto("/")

  await expect(page.getByText("Peace of mind from prototype to production")).toBeVisible()
  const bundles = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="/assets/js/"]')).map(
      (script) => script.src,
    ),
  )
  expect(bundles).toHaveLength(1)
  expect(bundles[0]).not.toContain("/assets/js/atlas")

  expect(problems).toEqual([])
})

test("serves built assets and the Cesium runtime without Cesium ion", async ({ page, request }) => {
  const cesiumRequests: string[] = []
  const ionRequests: string[] = []

  page.on("request", (req) => {
    const url = req.url()

    if (url.includes("/cesium/")) {
      cesiumRequests.push(url)
    }

    if (/cesium\.com|api\.cesium|ion\.cesium/.test(url)) {
      ionRequests.push(url)
    }
  })

  await mountAtlas(page)
  // Let Cesium finish loading imagery and any worker it needs.
  await page.waitForTimeout(5_000)

  expect(ionRequests).toEqual([])
  expect(cesiumRequests.length).toBeGreaterThan(0)

  if (await servesDigestedAssets(page)) {
    // Digested entries must exist and be served from the production cache manifest.
    for (const entry of [
      "assets/js/app.js",
      "assets/js/atlas.js",
      "assets/css/app.css",
      "cesium/Widgets/widgets.css",
      "cesium/Assets/Textures/NaturalEarthII/tilemapresource.xml",
    ]) {
      const response = await request.get(digestedPath(entry))
      expect(response.status(), `${entry} should be served from its digested path`).toBe(200)
    }

    const workerEntry = Object.keys(digestManifest().latest).find((entry) =>
      entry.startsWith("cesium/Workers/"),
    )
    expect(workerEntry, "the digest manifest should include Cesium workers").toBeDefined()
    expect((await request.get(digestedPath(workerEntry!))).status()).toBe(200)

    // The atlas stylesheet carries the Cesium widget styles.
    const stylesheet = await request.get(digestedPath("assets/css/app.css"))
    expect(await stylesheet.text()).toContain(".cesium-viewer")
  } else {
    // Development server: the same entries are served un-digested from priv/static.
    for (const entry of ["assets/js/app.js", "assets/js/atlas.js", "assets/css/app.css"]) {
      expect((await request.get(`/${entry}`)).status(), `${entry} should be served`).toBe(200)
    }
  }
})

test("keeps a selection readable when the time window excludes it", async ({ page }) => {
  await mountAtlas(page)

  await openEventList(page)
  await page.getByTestId("atlas-event-item").first().click()
  await expect(page.getByTestId("atlas-selection")).toBeVisible()
  await expect(page.getByTestId("atlas-selection")).toContainText("Fixture assembly")
  await expect(page.getByTestId("atlas-outside-time")).toHaveCount(0)

  // Move the window past the selected event: details stay, the map marker does not.
  await page.locator("#atlas-window-start").fill("1230")
  await expect(page.getByTestId("atlas-outside-time")).toBeVisible()
  await expect(page.getByTestId("atlas-selection")).toContainText("Fixture assembly")
  await expect(page.getByTestId("atlas-event-list")).not.toContainText("Fixture assembly")

  await page.locator("#atlas-return-to-time").click()
  await expect(page.getByTestId("atlas-outside-time")).toHaveCount(0)
  await expect(page.locator("#atlas-window-start")).not.toHaveValue("1230")
})

test("steps chronologically and plays to the end of the window", async ({ page }) => {
  await mountAtlas(page)

  await page.locator("#atlas-step-forward").click()
  await expect(page.locator("#atlas-playhead-value")).toHaveText("1204")

  await page.locator("#atlas-window-end").fill("1210")
  await page.locator("#atlas-play-toggle").click()

  // Playback advances the playhead from 1204 and stops at the window end instead
  // of looping into a new window. Software WebGL makes one interaction take
  // seconds, so this asserts the lasting outcome rather than the transient
  // "Pause" label: the fixture plays four years per second.
  await expect(page.locator("#atlas-playhead-value")).toHaveText("1210", { timeout: 30_000 })
  await expect(page.locator("#atlas-play-toggle")).toHaveText("Play")
})

test("stops camera following on manual input without pausing playback", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Desktop pointer drag; the touch project covers taps.")

  await mountAtlas(page)

  await page.getByTestId("atlas-event-item").first().click()
  await page.locator("#atlas-follow-toggle").click()
  await expect(page.locator("#atlas-follow-toggle")).toHaveAttribute("aria-pressed", "true")

  // Programmatic movement while following must not cancel following.
  await page.waitForTimeout(4_000)
  await expect(page.locator("#atlas-follow-toggle")).toHaveAttribute("aria-pressed", "true")

  // Widen the window so playback outlasts the interactions below: software WebGL
  // makes one click take seconds, and the default window plays for twelve.
  await page.locator("#atlas-window-end").fill("1400")
  await page.locator("#atlas-play-toggle").click()
  await expect(page.locator("#atlas-play-toggle")).toHaveText("Pause")

  const before = Number(await page.locator("#atlas-playhead-value").textContent())
  const canvas = page.locator("#atlas-workspace canvas").first()
  const box = (await canvas.boundingBox())!

  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.68, { steps: 8 })
  await page.mouse.up()

  await expect(page.locator("#atlas-follow-toggle")).toHaveAttribute("aria-pressed", "false")
  // Time keeps playing; manual camera control only stops following.
  await expect(page.locator("#atlas-play-toggle")).toHaveText("Pause")
  await expect
    .poll(async () => Number(await page.locator("#atlas-playhead-value").textContent()))
    .toBeGreaterThan(before)

  // Following stays off until explicitly resumed, at the current position.
  await page.locator("#atlas-follow-toggle").click()
  await expect(page.locator("#atlas-follow-toggle")).toHaveAttribute("aria-pressed", "true")
  await page.locator("#atlas-play-toggle").click()
})

test("selects events by tap on touch input", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "Touch project only.")

  await mountAtlas(page)

  if (await page.locator("#atlas-list-toggle").isVisible()) {
    await page.locator("#atlas-list-toggle").tap()
  }

  await page.getByTestId("atlas-event-item").nth(3).tap()
  await expect(page.getByTestId("atlas-selection")).toBeVisible()
  await expect(page.getByTestId("atlas-selection")).toContainText("Fixture landfall")
})

test("reaches the controls with the keyboard", async ({ page }) => {
  await mountAtlas(page)

  await page.locator("#atlas-step-forward").focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("#atlas-playhead-value")).toHaveText("1204")

  await page.locator("#atlas-step-back").focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("#atlas-playhead-value")).toHaveText("1204")

  await page.locator("#atlas-window-end").focus()
  await page.keyboard.press("ArrowUp")
  await expect(page.locator("#atlas-window-end")).toHaveValue("1251")
})

test("disposes the globe when the workspace is torn down", async ({ page }) => {
  await mountAtlas(page)

  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible()

  await page.evaluate(() => window.__lekishiAtlas?.dispose())
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(0)
  await expect(page.locator("#atlas-workspace")).toBeEmpty()
  expect(await page.evaluate(() => window.__lekishiAtlas?.disposed)).toBe(true)

  // Disposal is idempotent.
  await page.evaluate(() => window.__lekishiAtlas?.dispose())
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(0)
})

test("keeps the phone layout free of overlapping panels", async ({ page }) => {
  await mountAtlas(page)

  // The two phone widths the responsive layout has to hold at: a large phone and a
  // small one. The device scale stays at the project's, so captures remain 2x.
  for (const viewport of [
    { width: 390, height: 664 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(500)

    await assertNoOverlappingPanels(page, `default at ${viewport.width}`)

    await openEventList(page)
    await assertNoOverlappingPanels(page, `list open at ${viewport.width}`)

    await page.getByTestId("atlas-event-item").first().click()
    await expect(page.getByTestId("atlas-selection")).toBeVisible()
    await assertNoOverlappingPanels(page, `selected at ${viewport.width}`)

    // The drawer can also be reopened over a selection; both stay apart.
    if (await page.locator("#atlas-list-toggle").isVisible()) {
      await page.locator("#atlas-list-toggle").click()
      await expect(page.locator("#atlas-event-panel")).toBeVisible()
      await assertNoOverlappingPanels(page, `selected with list open at ${viewport.width}`)
      await page.locator("#atlas-list-toggle").click()
    }

    await page.locator("#atlas-selection-close").click()
    await expect(page.getByTestId("atlas-selection")).toHaveCount(0)
  }
})

test("restores exactly one workspace after a page transition", async ({ page }) => {
  await mountAtlas(page)

  // `pagehide` is the teardown boundary before a page is frozen or discarded.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")))
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(0)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(0)

  // A restored page gets exactly one workspace, not a second one stacked on top.
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")))
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(5)
})
