import { readFileSync } from "node:fs"
import { createConnection } from "node:net"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"

/**
 * Browser checks for the static atlas.
 *
 * They cover direct navigation to `/atlas`, the single workspace mount, selection
 * and time-window behavior, camera-follow rules, workspace lifecycle, keyboard
 * access, the touch layouts, and the production asset surface: hashed bundles,
 * the prerendered shell, the copied Cesium workers, textures, and widget styles,
 * and no Cesium ion request.
 *
 * The default target is the built artifact served by the SvelteKit preview
 * server (`pnpm e2e`); `LEKISHI_E2E_MODE=dev pnpm e2e` runs the same checks
 * against the development server, and `LEKISHI_E2E_BASE_URL` points them at any
 * already-running server.
 */

/** Which server the checks run against; the development server reloads modules. */
const mode = process.env.LEKISHI_E2E_MODE ?? "static"

/**
 * True when the suite starts the server itself. The raw-socket regression below
 * speaks plaintext HTTP to the managed local file server, so an external
 * `LEKISHI_E2E_BASE_URL` target (possibly HTTPS, another host) is out of scope.
 */
const managedServer = process.env.LEKISHI_E2E_BASE_URL === undefined

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
  const boxes = await page.evaluate(
    (selectors) => {
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        )
      }

      return selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector))
          .filter(visible)
          .map((element) => {
            const rect = element.getBoundingClientRect()
            return { selector, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
          }),
      )
    },
    OVERLAY_SELECTORS as unknown as string[],
  )

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [a, b] = [boxes[i], boxes[j]]
      const overlaps = a.right > b.x && b.right > a.x && a.bottom > b.y && b.bottom > a.y

      expect(overlaps, `${a.selector} overlaps ${b.selector} (${state} at ${a.x}/${a.y})`).toBe(
        false,
      )
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

/**
 * Selects one published event by its record id. The checks assert on records the
 * chapter names, not on list positions, so a content correction cannot silently
 * point a check at a different event.
 */
async function selectEvent(page: Page, eventId: string): Promise<void> {
  await openEventList(page)
  await page.locator(`[data-event-id="${eventId}"]`).click()
  await expect(page.getByTestId("atlas-selection")).toBeVisible()
}

/** Sends one raw request line and returns the status line and body. */
function rawRequest(port: number, target: string): Promise<{ status: string; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
    })

    let data = ""
    socket.setEncoding("utf8")
    socket.on("data", (chunk: string) => (data += chunk))
    socket.on("end", () => {
      const [head = "", ...rest] = data.split("\r\n\r\n")

      resolve({ status: head.split("\r\n")[0] ?? "", body: rest.join("\r\n\r\n") })
    })
    socket.on("error", reject)
    socket.setTimeout(5_000, () => {
      socket.destroy()
      reject(new Error(`raw request to ${target} timed out`))
    })
  })
}

async function mountAtlas(page: Page): Promise<string[]> {
  const problems = collectProblems(page)

  await page.goto("/atlas")
  // The workspace renders its Cesium canvas once the renderer starts.
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

  return problems
}

test("serves a prerendered shell at /atlas before any script runs", async ({ request }) => {
  const response = await request.get("/atlas")

  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toContain("text/html")

  const html = await response.text()

  // Real HTML, not an empty SPA shell: the route, the mount point, and the
  // header are in the document a static host returns.
  expect(html.match(/id="atlas-workspace"/g)).toHaveLength(1)
  // The shell names the chapter it renders and carries no review category.
  expect(html).toContain("The embassy to Tang China")
  expect(html).not.toContain("Reviewed chapter")
  expect(html).toContain("The 750–754 embassy of 藤原朝臣清河")
  // The deployed shell is the reviewed chapter, not the retired synthetic
  // foundation fixture.
  expect(html).not.toContain("Synthetic")
  // The client bootstrap is inlined and imports the client entry. The built
  // artifact serves that entry under a hashed `_app/immutable` path, which is
  // what the deployment depends on; the development server imports the kit
  // source tree instead.
  expect(html).toContain("import(")

  if (mode === "static") {
    expect(html).toContain("_app/immutable/entry/start")
  }
})

test("mounts one workspace from the built artifact", async ({ page }) => {
  const requests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/_app/immutable/")) {
      requests.push(request.url())
    }
  })

  const problems = await mountAtlas(page)

  // The chapter, not a synthetic fixture: the notice names the chapter and its
  // recorded review status, and the list holds its in-window events.
  await expect(page.locator("#atlas-notice")).toContainText("The embassy to Tang China")
  await expect(page.locator("#atlas-notice")).toContainText("Self-review only")
  await expect(page.locator("#atlas-notice")).not.toContainText("Reviewed chapter")
  await expect(page.locator("#atlas-notice")).not.toContainText("Unapproved preparation")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(24)
  await expect(page.getByText("Synthetic", { exact: false })).toHaveCount(0)
  await expect(page.getByTestId("atlas-time-controls")).toBeVisible()
  await expect(page.getByTestId("atlas-globe")).toBeVisible()

  // One page has one workspace owner: a second evaluation of the atlas bootstrap
  // would render a second workspace, a second event list, and a second globe.
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)

  // Every client module is fetched once. The retired Phoenix build digested a
  // second URL for the workspace entry, which mounted two workspaces; nothing in
  // the built artifact may be requested under two URLs again. The development
  // server re-requests modules for hot updates, so the check is static-only.
  if (mode === "static") {
    expect(requests).toHaveLength(new Set(requests).size)
  }

  // The workspace reports itself as a single client-owned handle.
  expect(await page.evaluate(() => typeof window.__lekishiAtlas)).toBe("object")

  expect(problems).toEqual([])
})

test("loads /atlas directly and survives a reload", async ({ page }) => {
  const problems = await mountAtlas(page)

  await page.reload()

  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(24)

  expect(problems).toEqual([])
})

test("serves the root page with navigation into the atlas", async ({ page }) => {
  const problems = collectProblems(page)

  await page.goto("/")

  await expect(page.getByRole("heading", { name: /Explore events and connections/ })).toBeVisible()
  await expect(page.locator('a[href="/atlas"]').first()).toBeVisible()

  // The root page is not the atlas: it must not mount the workspace.
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(0)

  expect(problems).toEqual([])
})

test("serves the artifact as plain files, with clean URLs and a real 404 page", async ({
  request,
}) => {
  // The static target is a file-only server rooted at `build/`, so this test is
  // about the deployment: extension-less paths resolve to their `.html` file
  // (the rule `static/_redirects` states for `/atlas`), and every other path is
  // the artifact's own 404 page. The development server renders its own 404, so
  // the check is static-only.
  test.skip(mode === "dev", "the file-only server is the static target")

  for (const path of ["/atlas", "/atlas.html"]) {
    const response = await request.get(path)

    expect(response.status(), `${path} should be served from the artifact`).toBe(200)
    expect(await response.text()).toContain('id="atlas-workspace"')
  }

  // A trailing slash on the clean URL redirects to the slashless form instead of
  // serving the sibling `.html` in place: the page references its assets
  // relatively (`./_app/...`), so `/atlas/` would resolve them under `/atlas/`.
  const trailing = await request.get("/atlas/", { maxRedirects: 0 })

  expect(trailing.status()).toBe(308)
  expect(trailing.headers()["location"]).toBe("/atlas")

  // The redirect is built from the matched file, never from the request path. A
  // decoded path can hold a control character (which would throw when it reached
  // a header) or start with `//` (which a browser reads as another origin).
  for (const target of ["/%0a%2f..%2fatlas/", "/%2fattacker.example%2f..%2fatlas/"]) {
    const encoded = await request.get(target, { maxRedirects: 0 })

    expect(encoded.status(), target).toBe(308)
    expect(encoded.headers()["location"], target).toBe("/atlas")
  }

  const missing = await request.get("/no-such-page-in-the-atlas")

  expect(missing.status()).toBe(404)

  // The 404 body is the artifact's own `404.html`, byte for byte: no server
  // runtime rendered it, and it links a reader back into the site.
  const body = await missing.text()

  expect(body).toBe(
    readFileSync(fileURLToPath(new URL("../build/404.html", import.meta.url)), "utf8"),
  )
  expect(body).toContain('href="/atlas"')
  expect(body).not.toContain("_app/immutable")

  // Only `build/` is served. Build inputs and repository files are not part of
  // the artifact, and a path that tries to escape it is refused.
  for (const outside of [
    "/.svelte-kit/tsconfig.json",
    "/package.json",
    "/src/app.html",
    "/%2e%2e%2fpackage.json",
  ]) {
    expect((await request.get(outside)).status(), `${outside} must not be served`).toBe(404)
  }
})

test("mounts the workspace through the trailing-slash redirect", async ({ page }) => {
  test.skip(mode === "dev", "the redirect is the file-only server's clean-URL behavior")

  const problems = collectProblems(page)

  await page.goto("/atlas/")
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(24)

  // The browser ends on the clean URL, which is what makes the page's relative
  // asset references resolve.
  expect(new URL(page.url()).pathname).toBe("/atlas")
  expect(problems).toEqual([])
})

test("answers a malformed request target instead of ending the server", async ({
  request,
  baseURL,
}) => {
  test.skip(!managedServer || mode === "dev", "targets the managed local file server")

  const port = Number(new URL(baseURL ?? "").port)
  const response = await rawRequest(port, "//")

  expect(response.status).toContain("400")

  // The server is still serving: the malformed target is a response, not a crash.
  expect((await request.get("/atlas")).status()).toBe(200)
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

  // The runtime directories Cesium resolves through CESIUM_BASE_URL are part of
  // the artifact: workers, imagery, and the widget stylesheet.
  for (const entry of [
    "cesium/Workers/createTaskProcessorWorker.js",
    "cesium/Assets/Textures/NaturalEarthII/tilemapresource.xml",
    "cesium/Assets/Textures/NaturalEarthII/0/0/0.jpg",
    "cesium/Widgets/widgets.css",
  ]) {
    const response = await request.get(`/${entry}`)
    expect(response.status(), `${entry} should be served from the static artifact`).toBe(200)
  }

  // The site ships one stylesheet, and it carries the Cesium widget styles.
  const stylesheetHref = await page.evaluate(
    () => document.querySelector('link[rel="stylesheet"]')?.getAttribute("href") ?? "",
  )
  const stylesheet = await request.get(stylesheetHref)
  expect(await stylesheet.text()).toContain(".cesium-viewer")

  // Attribution is present in the workspace, and no provider account is implied.
  // The footer line is part of the wide layout (`hidden lg:block`), so a phone
  // viewport keeps it in the document without showing it; the overview page
  // carries the same attribution at every width.
  const attribution = page.getByText("CesiumJS (Apache-2.0)", { exact: false })

  await expect(attribution).toHaveCount(1)
  await expect(page.getByText("no Cesium ion account", { exact: false })).toHaveCount(1)

  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(attribution).toBeVisible()
  }
})

test("amplifies only the Firefox/Linux Ctrl-wheel trackpad pinch", async ({ page }) => {
  // The app replaces a Ctrl-modified wheel event with one whose deltas are
  // multiplied by five, because Firefox on Linux reports a trackpad pinch as a
  // very small Ctrl-wheel delta. Recording wheel events at the document during
  // capture sees both the original and the replacement, which is the actual
  // browser-level semantics: ordinary wheels and touchscreen pinches keep
  // Cesium's default response.
  await page.addInitScript(() => {
    const log: { deltaX: number; deltaY: number; ctrlKey: boolean }[] = []
    ;(window as unknown as { __wheelLog: typeof log }).__wheelLog = log

    document.addEventListener(
      "wheel",
      (event) => {
        log.push({ deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey })
      },
      { capture: true },
    )
  })

  await mountAtlas(page)

  const dispatchWheel = (init: { deltaX: number; deltaY: number; ctrlKey: boolean }) =>
    page.evaluate((wheelInit) => {
      const canvas = document.querySelector<HTMLCanvasElement>("#atlas-workspace canvas")

      canvas?.dispatchEvent(
        new WheelEvent("wheel", {
          ...wheelInit,
          bubbles: true,
          cancelable: true,
        }),
      )
    }, init)

  await dispatchWheel({ deltaX: 0.5, deltaY: -2, ctrlKey: true })

  let log = await page.evaluate(() => (window as unknown as { __wheelLog: unknown[] }).__wheelLog)

  expect(log).toContainEqual({ deltaX: 0.5, deltaY: -2, ctrlKey: true })
  expect(log).toContainEqual({ deltaX: 2.5, deltaY: -10, ctrlKey: true })

  // A plain wheel is left alone: no amplified event follows it.
  await dispatchWheel({ deltaX: 0.5, deltaY: -2, ctrlKey: false })

  log = await page.evaluate(() => (window as unknown as { __wheelLog: unknown[] }).__wheelLog)

  expect(log).toContainEqual({ deltaX: 0.5, deltaY: -2, ctrlKey: false })
  expect(log.filter((entry) => (entry as { deltaY: number }).deltaY === -10)).toHaveLength(1)
})

test("keeps a selection readable when the time window excludes it", async ({ page }) => {
  await mountAtlas(page)

  await selectEvent(page, "lks:event:appointment-750")
  await expect(page.getByTestId("atlas-selection")).toContainText("The court appoints the embassy")
  await expect(page.getByTestId("atlas-outside-time")).toHaveCount(0)

  // Move the window past the selected event: details stay, the map marker does not.
  await page.locator("#atlas-window-start").fill("753")
  await expect(page.getByTestId("atlas-outside-time")).toBeVisible()
  await expect(page.getByTestId("atlas-selection")).toContainText("The court appoints the embassy")
  await expect(page.getByTestId("atlas-event-list")).not.toContainText(
    "The court appoints the embassy",
  )

  await page.locator("#atlas-return-to-time").click()
  await expect(page.getByTestId("atlas-outside-time")).toHaveCount(0)
  await expect(page.locator("#atlas-window-start")).not.toHaveValue("753")
})

test("keeps an uncertain occurrence a possible match, never continuous activity", async ({
  page,
}) => {
  await mountAtlas(page)

  // The 753–754 drifts are occurrence windows: one occurrence at an unknown point
  // inside the span, so the atlas must not present them as activity across it.
  await selectEvent(page, "lks:event:kiyokawa-drift-753")

  await expect(page.getByTestId("atlas-selection")).toContainText(
    "753–754 · year precision · uncertain span",
  )
  await expect(page.getByTestId("atlas-selection")).toContainText(
    "does not treat the span as continuous activity",
  )

  // Move the playhead into the span with the keyboard, so the check also covers
  // real key input on the timeline.
  await page.locator("#atlas-playhead").focus()

  for (let year = 750; year < 753; year += 1) {
    await page.keyboard.press("ArrowRight")
  }

  await expect(page.locator("#atlas-playhead-value")).toHaveText("753")

  const driftRow = page.locator('[data-event-id="lks:event:kiyokawa-drift-753"]')
  const durationRow = page.locator('[data-event-id="lks:event:return-voyage-753"]')

  // The uncertain span is a possible match at the playhead; the duration that
  // contains the same year is active. The two do not read alike.
  await expect(driftRow).toContainText("possible at playhead")
  await expect(durationRow).toContainText("at playhead")
  await expect(durationRow).not.toContainText("possible")
})

test("steps chronologically and plays to the end of the window", async ({ page }) => {
  await mountAtlas(page)

  await page.locator("#atlas-step-forward").click()
  await expect(page.locator("#atlas-playhead-value")).toHaveText("751")

  await page.locator("#atlas-window-end").fill("752")
  await page.locator("#atlas-play-toggle").click()

  // Playback advances the playhead from 751 and stops at the window end instead
  // of looping into a new window. Software WebGL makes one interaction take
  // seconds, so this asserts the lasting outcome rather than the transient
  // "Pause" label: the chapter plays four years per second.
  await expect(page.locator("#atlas-playhead-value")).toHaveText("752", { timeout: 30_000 })
  await expect(page.locator("#atlas-play-toggle")).toHaveText("Play")
})

test("stops camera following on manual input without pausing playback", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Desktop pointer drag; the touch project covers taps.")
  // Software WebGL makes each interaction take seconds and the drag has to
  // outlast a playback window, so this check needs more than the default budget.
  test.setTimeout(120_000)

  await mountAtlas(page)

  // A placed event: following a selection the map cannot show has no target.
  await selectEvent(page, "lks:event:tang-new-year-audience-753")
  await page.locator("#atlas-follow-toggle").click()
  await expect(page.locator("#atlas-follow-toggle")).toHaveAttribute("aria-pressed", "true")

  // Programmatic movement while following must not cancel following.
  await page.waitForTimeout(4_000)
  await expect(page.locator("#atlas-follow-toggle")).toHaveAttribute("aria-pressed", "true")

  // Widen the window so playback outlasts the interactions below: software WebGL
  // makes one click take seconds, and a delayed tick advances the playhead by the
  // wall-clock time it missed. The chapter's default window plays for one second.
  await page.locator("#atlas-window-end").fill("2500")
  await page.locator("#atlas-play-toggle").click()
  await expect(page.locator("#atlas-play-toggle")).toHaveText("Pause")

  const before = Number(await page.locator("#atlas-playhead-value").textContent())
  const canvas = page.locator("#atlas-workspace canvas").first()
  const box = (await canvas.boundingBox())!

  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.68, { steps: 4 })
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

  await page.locator('[data-event-id="lks:event:yaku-arrival-753"]').tap()
  await expect(page.getByTestId("atlas-selection")).toBeVisible()
  await expect(page.getByTestId("atlas-selection")).toContainText("益救島")
})

test("keeps events the chapter cannot place in the list without a map position", async ({
  page,
}) => {
  await mountAtlas(page)

  // 驩州 is named by the published record, but no identification is sourced, so
  // the event is listable and unplaced.
  await selectEvent(page, "lks:event:kiyokawa-drift-753")

  await expect(page.getByTestId("atlas-selection")).toContainText("驩州")
  await expect(page.getByTestId("atlas-unplaced")).toContainText(
    "no identification is sourced for it",
  )
  await expect(page.locator("#atlas-follow-toggle")).toBeDisabled()

  // 多禰島 is named only as the second ship's intended destination, so the event
  // keeps no position either.
  await selectEvent(page, "lks:event:ships-separate-753")

  await expect(page.getByTestId("atlas-unplaced")).toContainText("named only as context")
  await expect(page.locator("#atlas-follow-toggle")).toBeDisabled()
})

test("anchors a court act at the court's seat without asserting a coordinate", async ({ page }) => {
  await mountAtlas(page)

  // The entry names no place, so the record anchors the act at the court's seat
  // (平城宮) as a display anchor: the row says which kind of placement it is, the
  // details surface names the place, and the map may show it.
  const row = page.locator('[data-event-id="lks:event:appointment-750"]')

  await expect(row).toContainText("平城宮 · display anchor only")

  await selectEvent(page, "lks:event:appointment-750")

  await expect(page.getByTestId("atlas-selection")).toContainText("平城宮 · display anchor only")
  await expect(page.getByTestId("atlas-unplaced")).toHaveCount(0)
  await expect(page.locator("#atlas-follow-toggle")).toBeEnabled()

  // The entry itself names 内裏, the inner palace, and the record says so.
  await selectEvent(page, "lks:event:sekito-752")

  await expect(page.getByTestId("atlas-selection")).toContainText("内裏")
})

test("keeps the coda nodes outside the primary window until it is widened", async ({ page }) => {
  await mountAtlas(page)

  // The chapter's default window is the primary 750–754 mission window: the five
  // coda nodes are outside it and must not be folded in. The list is the surface
  // under test, so the notice panel's own coverage sentence is out of scope.
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(24)
  await expect(page.getByTestId("atlas-event-list").getByText("coda node")).toHaveCount(0)

  await page.locator("#atlas-window-end").fill("779")

  await expect(page.getByTestId("atlas-event-item")).toHaveCount(29)
  await expect(page.getByTestId("atlas-event-list").getByText("coda node")).toHaveCount(5)
})

test("scrolls the event list inside its panel instead of spilling over the controls", async ({
  page,
}) => {
  await mountAtlas(page)
  await openEventList(page)

  // Software WebGL makes every Playwright round trip cost seconds, so the
  // measurement and the interaction happen in one evaluate: this is the same
  // layout and the same click handler the user gets.
  const state = await page.evaluate(async () => {
    const panel = document.querySelector("#atlas-event-panel")!
    const list = document.querySelector('[data-testid="atlas-event-list"]')!
    const controls = document.querySelector('[data-testid="atlas-time-controls"]')!
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="atlas-event-item"]'),
    )
    const last = items.at(-1)!
    const before = list.scrollTop
    const metrics = {
      overflowY: getComputedStyle(list).overflowY,
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      panelBottom: panel.getBoundingClientRect().bottom,
      controlsTop: controls.getBoundingClientRect().top,
    }

    list.scrollTop = list.scrollHeight

    // Read the scrolled state before the click: selecting closes the phone drawer,
    // and a hidden element reports zero for its scroll offsets.
    const after = list.scrollTop
    const lastRect = last.getBoundingClientRect()
    const hit = document.elementFromPoint(
      lastRect.left + lastRect.width / 2,
      lastRect.top + lastRect.height / 2,
    )

    last.click()
    // The selection is a Svelte state update; let its DOM land before reading it.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const selection = document.querySelector("#atlas-selection")

    return {
      ...metrics,
      before,
      after,
      lastInViewport: lastRect.top >= 0 && lastRect.bottom <= window.innerHeight,
      hitIsLastRow: hit === last || last.contains(hit),
      lastId: last.dataset.eventId,
      selectionVisible: selection !== null && selection.getBoundingClientRect().height > 0,
      currentIds: Array.from(document.querySelectorAll('[data-event-id][aria-current="true"]')).map(
        (element) => element.getAttribute("data-event-id"),
      ),
    }
  })

  // The list is the scroll container: 24 rows do not fit at any supported size, so
  // a list that cannot scroll hides every event below the fold.
  expect(state.overflowY).toBe("auto")
  expect(state.scrollHeight).toBeGreaterThan(state.clientHeight + 1)

  // The panel ends above the time controls, so no row is painted under them.
  expect(state.panelBottom).toBeLessThanOrEqual(state.controlsTop + 1)

  // Scrolling reaches the last published event, the row is on top, and selecting it
  // works from there.
  expect(state.before).toBe(0)
  expect(state.after).toBeGreaterThan(0)
  expect(state.lastInViewport).toBe(true)
  expect(state.hitIsLastRow).toBe(true)
  expect(state.lastId).toBe("lks:event:naniwa-754")
  expect(state.selectionVisible).toBe(true)
  expect(state.currentIds).toEqual(["lks:event:naniwa-754"])
})

test("reaches the controls with the keyboard", async ({ page }) => {
  await mountAtlas(page)

  await page.locator("#atlas-step-forward").focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("#atlas-playhead-value")).toHaveText("751")

  await page.locator("#atlas-step-back").focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("#atlas-playhead-value")).toHaveText("750")

  await page.locator("#atlas-window-end").focus()
  await page.keyboard.press("ArrowUp")
  await expect(page.locator("#atlas-window-end")).toHaveValue("755")
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
  // Two viewports, several overlay states each, and software WebGL: every click
  // and every resize costs seconds, so this check needs a budget the software
  // renderer can meet.
  test.setTimeout(240_000)

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
    }

    // A content-driven height change: editing the window into BCE years adds the
    // year label under the input, which grows the controls without a resize. The
    // overlay column follows the controls' measured height, so the panels stay
    // apart here too.
    await page.locator("#atlas-window-start").fill("0")
    await expect(page.locator('[data-testid="atlas-time-controls"]')).toContainText("1 BCE")
    await assertNoOverlappingPanels(page, `BCE window at ${viewport.width}`)
    await page.locator("#atlas-window-start").fill("750")
    await expect(page.locator('[data-testid="atlas-time-controls"]')).not.toContainText("BCE")

    if (await page.locator("#atlas-list-toggle").isVisible()) {
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
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(24)
})
