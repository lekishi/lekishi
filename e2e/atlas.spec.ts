import { readFileSync } from "node:fs"
import { createConnection } from "node:net"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"
import {
  TANG,
  card,
  collectProblems,
  expectFrameApart,
  layoutOf,
  markPoint,
  openChapter,
  openExplore,
  playheadYear,
  raiseSheet,
  selectEvent,
  setWindow,
  settledCenter,
  sheet,
  sheetHandle,
} from "./workspace"
import { TANG_DECISION, decisionElement } from "./approvals"

/**
 * Browser checks for the static atlas.
 *
 * They cover direct navigation to a chapter route, the single workspace mount,
 * selection and time-window behaviour, camera-follow rules, workspace
 * lifecycle, keyboard access, the touch layouts, and the production asset
 * surface: hashed bundles, the prerendered shell, the globe's tile worker and
 * tile bundles, the self-hosted fonts, and no request to any other origin.
 *
 * The chapter's own route and surfaces (both chapters, search, the story, the
 * dialogs, deep links and the home page) are covered by `e2e/chapters.spec.ts`;
 * these checks are about the workspace's behaviour and the artifact. The
 * layout-dependent paths (the explore rail, the tablet orb, the phone sheet)
 * live in `e2e/workspace.ts`.
 *
 * The default target is the built artifact served as files (`pnpm e2e`);
 * `LEKISHI_E2E_MODE=dev pnpm e2e` runs the same checks against the development
 * server, and `LEKISHI_E2E_BASE_URL` points them at any already-running server.
 */

/** Which server the checks run against; the development server reloads modules. */
const mode = process.env.LEKISHI_E2E_MODE ?? "static"

/**
 * True when the suite starts the server itself. The raw-socket regression below
 * speaks plaintext HTTP to the managed local file server, so an external
 * `LEKISHI_E2E_BASE_URL` target (possibly HTTPS, another host) is out of scope.
 */
const managedServer = process.env.LEKISHI_E2E_BASE_URL === undefined

/** The launch chapter's in-window events: the primary 750–754 mission window. */
const TANG_WINDOW_EVENTS = 24

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

  await openChapter(page, TANG)

  return problems
}

/**
 * Counts the globe's draw calls on its canvas, so a check can wait for the
 * renderer to go idle (it draws on demand) instead of waiting a fixed time.
 */
async function countDraws(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const draw = WebGL2RenderingContext.prototype.drawElements
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      draw.apply(this, args)
      const canvas = this.canvas as HTMLCanvasElement
      canvas.dataset.draws = String(Number(canvas.dataset.draws ?? 0) + 1)
    }
  })
}

/** Waits until the globe has drawn and then stopped drawing for 20 frames. */
async function globeIdle(page: Page): Promise<number> {
  const canvas = page.locator("[data-testid='atlas-globe'] canvas")

  await expect.poll(async () => Number(await canvas.getAttribute("data-draws"))).toBeGreaterThan(0)
  await canvas.evaluate(async (element) => {
    let stable = 0
    let previous = element.getAttribute("data-draws")
    while (stable < 20) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const current = element.getAttribute("data-draws")
      stable = current === previous ? stable + 1 : 0
      previous = current
    }
  })

  return Number(await canvas.getAttribute("data-draws"))
}

test("serves a prerendered chapter shell before any script runs", async ({ request }) => {
  const response = await request.get(TANG)

  expect(response.status()).toBe(200)
  expect(response.headers()["content-type"]).toContain("text/html")

  const html = await response.text()

  // Real HTML, not an empty SPA shell: the route, the mount point, and the
  // chapter's own scope are in the document a static host returns.
  expect(html.match(/id="atlas-workspace"/g)).toHaveLength(1)
  expect(html).toContain('id="chapter-scope"')
  // The shell names the chapter it renders, its window, and the decision its
  // manifest records, and it carries no review category.
  expect(html).toContain("The embassy to Tang China")
  expect(html).toContain("750–754")
  expect(html).toMatch(decisionElement(TANG_DECISION))
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

  // The chapter, not a synthetic fixture: the date bar names the chapter, the
  // About sheet states its recorded decision, and the list holds its in-window
  // events.
  await expect(page.locator("#atlas-date-bar")).toBeVisible()
  await expect(playheadYear(page)).toHaveText("750")
  await expect(page.locator("#atlas-about-decision")).toHaveText(TANG_DECISION)
  await expect(page.getByTestId("atlas-workspace")).not.toContainText("Reviewed chapter")
  await expect(page.getByTestId("atlas-workspace")).not.toContainText("Unapproved preparation")
  await expect(page.getByText("Synthetic", { exact: false })).toHaveCount(0)
  await expect(page.getByTestId("atlas-dial")).toBeVisible()
  await expect(page.getByTestId("atlas-globe")).toBeVisible()
  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(TANG_WINDOW_EVENTS)

  // One page has one workspace owner: a second evaluation of the atlas bootstrap
  // would render a second workspace, a second event list, and a second globe.
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
  await expect(page.getByTestId("atlas-event-list")).toHaveCount(1)

  // Every client module is fetched once. The retired Phoenix build digested a
  // second URL for the workspace entry, which mounted two workspaces; nothing in
  // the built artifact may be requested under two URLs again. The development
  // server re-requests modules for hot updates, so the check is static-only.
  // The globe's tile workers are the exception: each worker in the pool loads
  // the same worker script, so that one URL repeats, and it must stay one URL.
  if (mode === "static") {
    const modules = requests.filter((url) => !url.includes("/_app/immutable/workers/"))
    const workers = requests.filter((url) => url.includes("/_app/immutable/workers/"))
    expect(modules).toHaveLength(new Set(modules).size)
    expect(new Set(workers).size).toBe(1)
  }

  // The workspace reports itself as a single client-owned handle.
  expect(await page.evaluate(() => typeof window.__lekishiAtlas)).toBe("object")

  expect(problems).toEqual([])
})

test("loads /atlas directly and survives a reload", async ({ page }) => {
  const problems = collectProblems(page)

  // The legacy route redirects to the launch chapter it always rendered.
  await page.goto("/atlas")
  await expect(page).toHaveURL(new RegExp(`${TANG}$`))
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

  await page.reload()

  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(TANG_WINDOW_EVENTS)

  expect(problems).toEqual([])
})

test("serves the root page with navigation into the atlas", async ({ page }) => {
  const problems = collectProblems(page)

  await page.goto("/")

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.locator(`main a[href="${TANG}"]`).first()).toBeVisible()

  // The root page is not the atlas: it must not mount the workspace.
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(0)
  expect(await page.evaluate(() => window.__lekishiAtlas)).toBeUndefined()

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

  for (const path of [TANG, `${TANG}.html`]) {
    const response = await request.get(path)

    expect(response.status(), `${path} should be served from the artifact`).toBe(200)
    expect(await response.text()).toContain('id="atlas-workspace"')
  }

  // A trailing slash on the clean URL redirects to the slashless form instead of
  // serving the sibling `.html` in place: the page references its assets
  // relatively, so `/chapters/<id>/` would resolve them under that directory.
  const trailing = await request.get(`${TANG}/`, { maxRedirects: 0 })

  expect(trailing.status()).toBe(308)
  expect(trailing.headers()["location"]).toBe(TANG)

  // The legacy route is in the artifact too, as a redirect page that names the
  // chapter it now points at.
  const legacy = await request.get("/atlas")

  expect(legacy.status()).toBe(200)
  expect(await legacy.text()).toContain(TANG)
  expect(await legacy.text()).not.toContain('id="atlas-workspace"')

  // The redirect is built from the matched file, never from the request path. A
  // decoded path can hold a control character (which would throw when it reached
  // a header) or start with `//` (which a browser reads as another origin).
  for (const target of [
    `/%0a%2f..%2fchapters%2ftang-mission-750-754/`,
    `/%2fattacker.example%2f..%2fchapters%2ftang-mission-750-754/`,
  ]) {
    const encoded = await request.get(target, { maxRedirects: 0 })

    expect(encoded.status(), target).toBe(308)
    expect(encoded.headers()["location"], target).toBe(TANG)
  }

  const missing = await request.get("/no-such-page-in-the-atlas")

  expect(missing.status()).toBe(404)

  // The 404 body is the artifact's own `404.html`, byte for byte: no server
  // runtime rendered it, and it links a reader back into the site (search on
  // the home page, and the chapters).
  const body = await missing.text()

  expect(body).toBe(
    readFileSync(fileURLToPath(new URL("../build/404.html", import.meta.url)), "utf8"),
  )
  expect(body).toContain('href="/"')
  expect(body).toContain('href="/#chapters"')
  expect(body).not.toContain("_app/immutable")

  // An unknown chapter is not a page that renders nothing: it is the same 404.
  expect((await request.get("/chapters/no-such-chapter")).status()).toBe(404)

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

test("shows the not-found page as a way back into the atlas", async ({ page }) => {
  test.skip(mode === "dev", "the file-only server's 404 page is the static target")

  const response = await page.goto("/no-such-page-in-the-atlas")

  expect(response?.status()).toBe(404)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.getByRole("link", { name: "Chapters" }).click()
  await expect(page).toHaveURL(/\/#chapters$/)
  await expect(page.locator("[data-chapter-id]")).toHaveCount(2)
})

test("mounts the workspace through the trailing-slash redirect", async ({ page }) => {
  test.skip(mode === "dev", "the redirect is the file-only server's clean-URL behavior")

  const problems = collectProblems(page)

  await openChapter(page, `${TANG}/`)
  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(TANG_WINDOW_EVENTS)

  // The browser ends on the clean URL, which is what makes the page's relative
  // asset references resolve.
  expect(new URL(page.url()).pathname).toBe(TANG)
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
  expect((await request.get(TANG)).status()).toBe(200)
})

test("draws the globe from the artifact's own tiles, fonts and data, and nothing else", async ({
  page,
  request,
}) => {
  const tileRequests: string[] = []
  const foreignRequests: string[] = []
  const fonts: { url: string; status: number; type: string }[] = []
  const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1").origin

  // The tiles load in a worker; its requests are the page's too.
  page.context().on("request", (req) => {
    const url = req.url()

    if (url.includes("/globe/")) {
      tileRequests.push(url)
    }

    if (!url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:")) {
      foreignRequests.push(url)
    }
  })
  page.context().on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/fonts/")) {
      fonts.push({
        url: response.url(),
        status: response.status(),
        type: response.headers()["content-type"] ?? "",
      })
    }
  })

  await mountAtlas(page)
  // The first view needs the tileset and the root bundle, then a refinement.
  await expect.poll(() => tileRequests.some((url) => url.endsWith("/globe/b/root.bin"))).toBe(true)
  await expect
    .poll(() => tileRequests.some((url) => /\/globe\/b\/\d+\/\d+\/\d+\.bin$/.test(url)))
    .toBe(true)

  // The type is self-hosted: the faces come from the artifact's `/fonts/` as
  // WOFF2 files and are what the page renders with.
  await expect.poll(() => fonts.length).toBeGreaterThan(0)

  for (const font of fonts) {
    expect(new URL(font.url).pathname, font.url).toMatch(/^\/fonts\/[\w-]+\.woff2$/)
    expect(font.status, font.url).toBe(200)
    expect(font.type, font.url).toContain("font/woff2")
  }

  expect(
    await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].filter((face) => face.status === "loaded").length
    }),
  ).toBeGreaterThan(0)

  // The search index is a file in the artifact, fetched when search opens.
  const index = page.waitForResponse((response) => response.url().endsWith("/search-index.json"))
  await page.keyboard.press("/")
  await expect(page.locator("dialog#search-dialog")).toBeVisible()
  expect((await index).status()).toBe(200)
  await page.keyboard.press("Escape")
  await expect(page.locator("dialog#search-dialog")).toBeHidden()

  // No provider, token, tile service or font service: every request stays on
  // the site.
  expect(foreignRequests).toEqual([])

  // The tiles, their attribution and the dioramas are part of the artifact.
  for (const entry of [
    "globe/tileset.json",
    "globe/b/root.bin",
    "globe/ATTRIBUTION.txt",
    "dioramas/akimeya.json",
    "search-index.json",
  ]) {
    const response = await request.get(`/${entry}`)
    expect(response.status(), `${entry} should be served from the static artifact`).toBe(200)
  }

  const tileset = await (await request.get("/globe/tileset.json")).json()
  expect(tileset).toMatchObject({ format: "lekishi-globe-bundles", version: 1 })

  // Attribution is in the workspace's legend at every size. The legend folds to
  // its button on tablets and phones, so it is opened where it is folded.
  const legend = page.getByTestId("atlas-legend")
  const legendButton = legend.getByRole("button", { name: "Legend" })

  if ((await legendButton.getAttribute("aria-expanded")) !== "true") {
    await legendButton.click()
  }

  await expect(legend.getByText("Terrain Tiles", { exact: false })).toBeVisible()
  await expect(legend.getByText("ESA WorldCover", { exact: false })).toBeVisible()
  await expect(legend.getByRole("link", { name: "Full attribution" })).toHaveAttribute(
    "href",
    "/globe/ATTRIBUTION.txt",
  )
})

test("fetches the 秋妻屋浦 diorama from the artifact when the camera comes down to it", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Desktop wheel zoom; the diorama is the same file at every size.")

  const foreignRequests: string[] = []
  const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1").origin
  let diorama: { url: string; status: number } | null = null

  page.context().on("request", (req) => {
    const url = req.url()
    if (!url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:")) {
      foreignRequests.push(url)
    }
  })
  page.on("response", (response) => {
    if (response.url().includes("/dioramas/")) {
      diorama = { url: response.url(), status: response.status() }
    }
  })

  // The flight to the landfall is a programmatic flight; reduced motion makes
  // it land at once, so the wheel below zooms at a settled place.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await openChapter(page, `${TANG}?event=akimeya-landfall-753`)
  await expect(card(page)).toBeVisible()

  // The diorama is fetched only when the camera is low over the place, never
  // with the chapter: zoom in over the landfall until it is.
  // The first press point is checked to be the open globe; the zoom keeps the
  // landfall near the pointer, so later steps follow the mark as it moves.
  await markPoint(page, "lks:place:akimeya")
  const mark = page.locator('[data-marker-id="lks:place:akimeya"] > span:nth-child(2)')

  await expect(async () => {
    const box = await mark.boundingBox()
    if (box !== null) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    }
    await page.mouse.wheel(0, -800)
    expect(diorama).not.toBeNull()
  }).toPass({ timeout: 90_000 })

  expect(diorama).toEqual({ url: expect.stringMatching(/\/dioramas\/akimeya\.json$/), status: 200 })
  // The legend says what the close-up is once it is in view.
  await expect(page.getByTestId("atlas-legend")).toContainText("秋妻屋浦")

  // One press takes the reader from the harbour back to the whole chapter:
  // the close-up leaves the legend and 平城宮 is on the open globe again.
  await page.getByRole("button", { name: "Zoom out to the whole chapter" }).click()
  await expect(page.getByTestId("atlas-legend")).not.toContainText("秋妻屋浦")
  await markPoint(page, "lks:place:heijo-palace")
  expect(foreignRequests).toEqual([])
})

test("amplifies only the Firefox/Linux Ctrl-wheel trackpad pinch", async ({ page }) => {
  // The app replaces a Ctrl-modified wheel event with one whose deltas are
  // multiplied by five, because Firefox on Linux reports a trackpad pinch as a
  // very small Ctrl-wheel delta. Recording wheel events at the document during
  // capture sees both the original and the replacement, which is the actual
  // browser-level semantics: ordinary wheels and touchscreen pinches keep the
  // camera controls' default response.
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
  const appointment = "lks:event:appointment-750"

  if ((await layoutOf(page)) !== "phone") {
    // Select inside the window, then move the window past the selected event
    // with its start handle: the card stays, the map mark and the row do not.
    await selectEvent(page, appointment)
    await expect(card(page)).toContainText("The court appoints the embassy")
    await expect(page.locator("#atlas-outside-notice")).toHaveCount(0)

    await page.locator("#atlas-window-start").fill("753")
  } else {
    // The phone strip has no window handles: open the narrower window from the
    // address, and reach the event through the chapter search, which covers
    // the whole chapter rather than the window.
    await setWindow(page, TANG, 753, 754)
    await openExplore(page, "events")
    await page.locator("#atlas-search").fill("The court appoints")
    await expect(
      page.locator(`[data-testid="atlas-search-results"] [data-event-id="${appointment}"]`),
    ).toBeVisible()
    await selectEvent(page, appointment)
  }

  await expect(page.locator("#atlas-outside-notice")).toBeVisible()
  await expect(card(page)).toContainText("The court appoints the embassy")

  // The window's own list does not carry it; the chapter search still finds
  // it, marked as outside the window.
  await openExplore(page, "events")
  await page.locator("#atlas-search").fill("")
  await expect(page.getByTestId("atlas-event-list")).toBeVisible()
  await expect(
    page.locator(`[data-testid="atlas-event-list"] [data-event-id="${appointment}"]`),
  ).toHaveCount(0)
  await page.locator("#atlas-search").fill("The court appoints")
  await expect(
    page.locator(`[data-event-id="${appointment}"] [data-testid="atlas-outside-badge"]`),
  ).toBeVisible()

  // The explicit return changes the window to include the event: the playhead
  // lands on it and it is back in the window's list.
  await selectEvent(page, appointment)
  await expect(page.locator("#atlas-outside-notice")).toBeVisible()
  await page.locator("#atlas-return-to-time").click()
  await expect(page.locator("#atlas-outside-notice")).toHaveCount(0)
  await expect(playheadYear(page)).toHaveText("750")

  if ((await layoutOf(page)) !== "phone") {
    await expect(page.locator("#atlas-window-start")).not.toHaveValue("753")
  }

  await openExplore(page, "events")
  await page.locator("#atlas-search").fill("")
  await expect(
    page.locator(`[data-testid="atlas-event-list"] [data-event-id="${appointment}"]`),
  ).toBeVisible()
})

test("keeps an uncertain occurrence a possible match, never continuous activity", async ({
  page,
}) => {
  await mountAtlas(page)

  // The 753–754 drifts are occurrence windows: one occurrence at an unknown point
  // inside the span, so the atlas must not present them as activity across it.
  await selectEvent(page, "lks:event:kiyokawa-drift-753")

  await expect(card(page)).toContainText("753–754 · year precision")
  await expect(card(page).locator('[data-badge="possible"]')).toContainText("uncertain span")
  await expect(card(page)).toContainText("does not treat the span as continuous activity")

  // Move the playhead into the span with the keyboard, so the check also covers
  // real key input on the timeline. The phone's strip is in the raised sheet.
  await raiseSheet(page)
  await page.locator("#atlas-playhead").focus()

  for (let year = 750; year < 753; year += 1) {
    await page.keyboard.press("ArrowRight")
  }

  await expect(page.locator("#atlas-playhead-value")).toHaveText("753")
  await expect(playheadYear(page)).toHaveText("753")

  await openExplore(page, "events")

  const driftRow = page.locator('[data-event-id="lks:event:kiyokawa-drift-753"]')
  const durationRow = page.locator('[data-event-id="lks:event:return-voyage-753"]')

  // The uncertain span is a possible match at the playhead; the event dated to
  // the same year is active. The two do not read alike.
  await expect(driftRow.locator('[data-badge="possible"]')).toContainText(
    "possible at the playhead",
  )
  await expect(driftRow.locator('[data-badge="active"]')).toHaveCount(0)
  await expect(durationRow.locator('[data-badge="active"]')).toBeVisible()
  await expect(durationRow.locator('[data-badge="possible"]')).toHaveCount(0)
})

test("steps chronologically and plays to the end of the window", async ({ page }) => {
  await mountAtlas(page)

  await page.locator("#atlas-step-forward").click()
  await expect(playheadYear(page)).toHaveText("751")

  // Stepping walks event boundaries and never changes the window.
  await page.locator("#atlas-step-back").click()
  await expect(playheadYear(page)).toHaveText("750")
  await page.locator("#atlas-step-forward").click()
  await expect(playheadYear(page)).toHaveText("751")

  if ((await layoutOf(page)) !== "phone") {
    await page.locator("#atlas-window-end").fill("752")
  } else {
    // The phone strip has no window handles; the address sets the window, and
    // the step is taken again in it.
    await setWindow(page, TANG, 750, 752)
    await page.locator("#atlas-step-forward").click()
    await expect(playheadYear(page)).toHaveText("751")
  }

  await page.locator("#atlas-play-toggle").click()

  // Playback advances the playhead from 751 and stops at the window end instead
  // of looping into a new window: the chapter plays four years per second, and
  // the toggle returns to "play" on its own.
  await expect(playheadYear(page)).toHaveText("752", { timeout: 30_000 })
  await expect(page.locator("#atlas-play-toggle")).toHaveAttribute("aria-pressed", "false")
})

test("stops camera following on manual input without pausing playback", async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, "Desktop pointer drag; the touch projects cover taps.")

  await countDraws(page)
  const problems = collectProblems(page)

  // A window far wider than the chapter, so playback outlasts the interactions
  // below: the software renderer makes each of them take seconds, and the
  // chapter's own extent plays in a few. The strip's handles stop at the
  // chapter's extent, so the window comes from the address, as a shared link
  // would set it.
  await openChapter(page, `${TANG}?from=750&to=2500`)

  // A placed event: following a selection the map cannot show has no target.
  await selectEvent(page, "lks:event:tang-new-year-audience-753")
  const follow = page.locator("#atlas-follow-toggle")

  await expect(follow).toBeEnabled()
  await follow.click()
  await expect(follow).toHaveAttribute("aria-pressed", "true")

  // Programmatic movement while following must not cancel following: the
  // flight to the selection runs to the end and the renderer goes idle.
  await globeIdle(page)
  await expect(follow).toHaveAttribute("aria-pressed", "true")

  await page.locator("#atlas-play-toggle").click()
  await expect(page.locator("#atlas-play-toggle")).toHaveAttribute("aria-pressed", "true")

  const before = Number(await playheadYear(page).textContent())
  const canvas = page.locator("#atlas-workspace canvas").first()
  const box = (await canvas.boundingBox())!
  const start = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.45 }

  expect(
    await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, start),
    "the drag starts on the open globe",
  ).toBe("CANVAS")

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + box.width * 0.1, start.y + box.height * 0.1, { steps: 4 })
  await page.mouse.up()

  await expect(follow).toHaveAttribute("aria-pressed", "false")
  // Time keeps playing; manual camera control only stops following.
  await expect(page.locator("#atlas-play-toggle")).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(async () => Number(await playheadYear(page).textContent()))
    .toBeGreaterThan(before)

  // Following stays off until explicitly resumed, at the current position.
  await follow.click()
  await expect(follow).toHaveAttribute("aria-pressed", "true")
  await page.locator("#atlas-play-toggle").click()
  await expect(page.locator("#atlas-play-toggle")).toHaveAttribute("aria-pressed", "false")
  expect(problems).toEqual([])
})

test("selects events and places by tap on touch input", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "Touch projects only.")

  await page.emulateMedia({ reducedMotion: "reduce" })
  await mountAtlas(page)

  // A tap on the globe picks the place under the finger. 秋妻屋浦 has one event
  // in the window, so the tap opens that event.
  const point = await markPoint(page, "lks:place:akimeya")

  await page.touchscreen.tap(point.x, point.y)
  await expect(card(page)).toHaveAttribute("data-selection-kind", "event")
  await expect(card(page)).toContainText("The landfall at 秋妻屋浦")

  // A tap in the list selects the row's event.
  await openExplore(page, "events")
  await page.locator('[data-event-id="lks:event:yaku-arrival-753"]').tap()
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toContainText("益救島")
  await expect(card(page)).toContainText("The second ship reaches 益救島")
})

test("selects a place by clicking its mark on the globe", async ({ page, hasTouch }) => {
  test.skip(hasTouch, "Desktop pointer click; the touch projects cover taps.")

  // Picking is under test, not flight timing: keep the target stationary.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await mountAtlas(page)

  // The globe draws places, not events. A place with one event in the window
  // opens the event: 秋妻屋浦's landfall.
  let point = await markPoint(page, "lks:place:akimeya")

  await page.mouse.click(point.x, point.y)
  await expect(card(page)).toHaveAttribute("data-selection-kind", "event")
  await expect(card(page)).toContainText("The landfall at 秋妻屋浦")
  await openExplore(page, "events")
  await expect(page.locator('[data-event-id="lks:event:akimeya-landfall-753"]')).toHaveAttribute(
    "aria-current",
    "true",
  )
  // The mark of a place with seven of the window's events says how many.
  await expect(page.locator('[data-marker-id="lks:place:heijo-palace"]')).toContainText("7")

  // A place with several events opens the place's own card, which lists them.
  // The two 益救島 events share the place's coordinates; both stay reachable
  // from it, whichever was drawn on top. A choice in the card is a jump to the
  // event's time, which may move the window, so each round starts at the mark.
  await expect(page.locator('[data-marker-id="lks:place:yaku"]')).toContainText("3")

  for (const [title, id] of [
    ["The second ship leaves 益救島", "lks:event:yaku-departure-753"],
    ["The second ship reaches 益救島 (biography)", "lks:event:yaku-arrival-753"],
  ] as const) {
    point = await markPoint(page, "lks:place:yaku")
    await page.mouse.click(point.x, point.y)
    await expect(card(page)).toHaveAttribute("data-selection-kind", "place")
    await expect(card(page).getByRole("region", { name: "Events here" })).toBeVisible()
    await card(page)
      .getByRole("region", { name: "Events here" })
      .getByRole("button", { name: title })
      .click()
    await expect(card(page)).toHaveAttribute("data-selection-kind", "event")
    await expect(page.locator(`[data-event-id="${id}"]`)).toHaveAttribute("aria-current", "true")
  }

  // 平城宮's mark counts the window's events there; its card lists every event
  // the chapter places there, the later coda nodes included, so none is hidden
  // by the window. The jumps above framed 益救島 up close; the locator flies
  // back to the chapter's opening view, where 平城宮 is on the open globe.
  await page.getByTestId("atlas-minimap").click()
  point = await markPoint(page, "lks:place:heijo-palace")
  await page.mouse.click(point.x, point.y)
  await expect(card(page)).toHaveAttribute("data-selection-kind", "place")
  await expect(card(page)).toContainText("平城宮")
  await expect(
    card(page).getByRole("region", { name: "Events here" }).getByRole("button"),
  ).toHaveCount(10)
  await card(page)
    .getByRole("region", { name: "Events here" })
    .getByRole("button", { name: /The court appoints the embassy/ })
    .click()
  await expect(card(page)).toHaveAttribute("data-selection-kind", "event")
  await expect(page.locator('[data-event-id="lks:event:appointment-750"]')).toHaveAttribute(
    "aria-current",
    "true",
  )
})

test("redraws a settled globe after WebGL context restoration without input", async ({ page }) => {
  await countDraws(page)
  await mountAtlas(page)
  const canvas = page.locator("[data-testid='atlas-globe'] canvas")
  // Wait for genuine demand-rendering idle, not an arbitrary elapsed delay.
  const before = await globeIdle(page)

  await canvas.evaluate(async (element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")!
    const extension = gl.getExtension("WEBGL_lose_context")!
    const lost = new Promise<void>((resolve) =>
      element.addEventListener("webglcontextlost", () => resolve(), { once: true }),
    )
    extension.loseContext()
    await lost
    // Let the loss event finish dispatching before requesting restoration.
    // A microtask inside that dispatch is too early for Chromium to allow it.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const restored = new Promise<void>((resolve) =>
      element.addEventListener("webglcontextrestored", () => resolve(), { once: true }),
    )
    extension.restoreContext()
    await restored
  })
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-draws")))
    .toBeGreaterThan(before)
})

test("keeps events the chapter cannot place in the list without a map position", async ({
  page,
}) => {
  await mountAtlas(page)

  // 驩州 is named by the published record, but no identification is sourced, so
  // the event is listable and unplaced: the row and the card both say so.
  await openExplore(page, "events")
  await expect(
    page.locator('[data-event-id="lks:event:kiyokawa-drift-753"] [data-badge="unlocated"]'),
  ).toBeVisible()
  await selectEvent(page, "lks:event:kiyokawa-drift-753")

  await expect(card(page)).toContainText("驩州")
  await expect(card(page).locator('[data-empty="uncovered"]')).toContainText(
    "no identification is sourced for it",
  )
  await expect(page.locator("#atlas-follow-toggle")).toBeDisabled()
  // No mark is drawn for a place without a sourced position.
  await expect(page.locator("[data-marker-id]").filter({ hasText: "驩州" })).toHaveCount(0)

  // 多禰島 is named only as the second ship's intended destination, so the event
  // keeps no position either.
  await selectEvent(page, "lks:event:ships-separate-753")

  await expect(card(page).locator('[data-empty="uncovered"]')).toContainText(
    "named only as context",
  )
  await expect(page.locator("#atlas-follow-toggle")).toBeDisabled()
})

test("anchors a court act at the court's seat without asserting a coordinate", async ({ page }) => {
  await mountAtlas(page)

  // The entry names no place, so the record anchors the act at the court's seat
  // (平城宮) as a display anchor: the row names the place, the card says which
  // kind of placement it is, and the map draws it as an anchor, not a site.
  await openExplore(page, "events")
  await expect(page.locator('[data-event-id="lks:event:appointment-750"]')).toContainText("平城宮")
  await selectEvent(page, "lks:event:appointment-750")

  await expect(card(page).locator('[data-badge="anchor"]')).toContainText(
    "label anchor, no site asserted",
  )
  await expect(card(page).getByTestId("atlas-place-note")).toContainText("not an asserted")
  await expect(card(page).locator('[data-empty="uncovered"]')).toHaveCount(0)
  await expect(page.locator("#atlas-follow-toggle")).toBeEnabled()
  await expect(page.locator('[data-marker-id="lks:place:heijo-palace"]')).toHaveAttribute(
    "data-mark",
    "anchor",
  )

  // The entry itself names 内裏, the inner palace, and the record says so.
  await selectEvent(page, "lks:event:sekito-752")

  await expect(card(page)).toContainText("内裏")
})

test("keeps the coda nodes outside the primary window until it is widened", async ({ page }) => {
  await mountAtlas(page)

  // The chapter's default window is the primary 750–754 mission window: the five
  // coda nodes are outside it and must not be folded in.
  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(TANG_WINDOW_EVENTS)
  await expect(page.getByTestId("atlas-event-list").locator('[data-badge="coda"]')).toHaveCount(0)

  await setWindow(page, TANG, 750, 779)

  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(29)
  await expect(page.getByTestId("atlas-event-list").locator('[data-badge="coda"]')).toHaveCount(5)
})

test("scrolls the event list inside its panel instead of spilling over the controls", async ({
  page,
}) => {
  await mountAtlas(page)
  await openExplore(page, "events")

  // On a phone the full detent is the list's own height (RFD 5: full holds
  // the list with search).
  if ((await layoutOf(page)) === "phone") {
    await sheetHandle(page).click()
    await expect(sheet(page)).toHaveAttribute("data-detent", "full")
    // The sheet animates its height; measure the settled layout.
    await settledCenter(sheet(page))
  }

  // The measurement and the interaction happen in one evaluate: this is the
  // same layout and the same click handler the reader gets.
  const state = await page.evaluate(async () => {
    const panel = document.querySelector("#atlas-event-panel")!
    const list = document.querySelector('[data-testid="atlas-event-list"]')!
    const scroller = list.parentElement!
    const controls = ['[data-testid="atlas-dial"]', '[data-testid="atlas-timeline"]']
      .map((selector) => document.querySelector(selector))
      .filter((element): element is Element => element !== null)
      .map((element) => element.getBoundingClientRect())
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="atlas-event-item"]'),
    )
    const last = items.at(-1)!
    const panelBox = panel.getBoundingClientRect()
    const before = scroller.scrollTop
    const metrics = {
      overflowY: getComputedStyle(scroller).overflowY,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      panelBottom: panelBox.bottom,
      overControls: controls.some(
        (box) =>
          box.right > panelBox.left &&
          panelBox.right > box.left &&
          box.bottom > panelBox.top &&
          panelBox.bottom > box.top,
      ),
    }

    scroller.scrollTop = scroller.scrollHeight

    // Read the scrolled state before the click: selecting closes the tablet
    // and phone lists, and a hidden element reports zero for its scroll offsets.
    const after = scroller.scrollTop
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
      viewportHeight: window.innerHeight,
      before,
      after,
      lastInViewport: lastRect.top >= 0 && lastRect.bottom <= window.innerHeight,
      hitIsLastRow: hit === last || last.contains(hit),
      lastId: last.dataset.eventId,
      selectionVisible: selection !== null && selection.getBoundingClientRect().height > 0,
    }
  })

  // The list is the scroll container: the window's rows do not fit at any
  // supported size, so a list that cannot scroll hides every event below the fold.
  expect(state.overflowY).toBe("auto")
  expect(state.scrollHeight).toBeGreaterThan(state.clientHeight + 1)

  // The panel ends inside the viewport and is never painted over the dial or the
  // timeline.
  expect(state.panelBottom).toBeLessThanOrEqual(state.viewportHeight + 1)
  expect(state.overControls).toBe(false)

  // Scrolling reaches the last published event, the row is on top, and selecting it
  // works from there.
  expect(state.before).toBe(0)
  expect(state.after).toBeGreaterThan(0)
  expect(state.lastInViewport).toBe(true)
  expect(state.hitIsLastRow).toBe(true)
  expect(state.lastId).toBe("lks:event:naniwa-754")
  expect(state.selectionVisible).toBe(true)

  await openExplore(page, "events")
  await expect(page.locator('[data-event-id][aria-current="true"]')).toHaveCount(1)
  await expect(page.locator('[data-event-id="lks:event:naniwa-754"]')).toHaveAttribute(
    "aria-current",
    "true",
  )
})

test("reaches the controls with the keyboard", async ({ page }) => {
  await mountAtlas(page)

  await page.locator("#atlas-step-forward").focus()
  await page.keyboard.press("Enter")
  await expect(playheadYear(page)).toHaveText("751")

  await page.locator("#atlas-step-back").focus()
  await page.keyboard.press("Enter")
  await expect(playheadYear(page)).toHaveText("750")

  await page.locator("#atlas-play-toggle").focus()
  await page.keyboard.press("Space")
  await expect(page.locator("#atlas-play-toggle")).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Space")
  await expect(page.locator("#atlas-play-toggle")).toHaveAttribute("aria-pressed", "false")

  // The layer orbs are toggle buttons.
  const orb = page.getByTestId("atlas-layers").getByRole("button", { name: "Journeys" })
  await orb.focus()
  await page.keyboard.press("Enter")
  await expect(orb).toHaveAttribute("aria-pressed", "false")
  await page.keyboard.press("Enter")
  await expect(orb).toHaveAttribute("aria-pressed", "true")

  // The strip's handles and playhead are native range inputs.
  await raiseSheet(page)
  await page.locator("#atlas-playhead").focus()
  await page.keyboard.press("End")
  await expect(page.locator("#atlas-playhead-value")).toHaveText("754")

  if ((await layoutOf(page)) !== "phone") {
    await page.locator("#atlas-window-end").focus()
    await page.keyboard.press("ArrowUp")
    await expect(page.locator("#atlas-window-end")).toHaveValue("755")
  } else {
    // The phone's compact strip carries the window row only.
    await expect(page.locator("#atlas-window-end")).toHaveCount(0)
  }

  // Search is one key away from anywhere that is not a text field.
  await page.locator("#atlas-step-back").focus()
  await page.keyboard.press("/")
  await expect(page.locator("dialog#search-dialog")).toBeVisible()
  await expect(page.locator("#search-dialog-input")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.locator("dialog#search-dialog")).toBeHidden()
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
    await expect(page.getByTestId("atlas-workspace")).toHaveAttribute("data-layout", "phone")
    const at = `at ${viewport.width}`

    // Peek: the date bar, the orbs, the legend and the sheet with its dial.
    await expect(sheet(page)).toHaveAttribute("data-detent", "peek")
    await expect(page.getByTestId("atlas-legend")).toBeVisible()
    await expectFrameApart(page, `peek ${at}`)

    // The legend unfolds upward over nothing.
    const legendButton = page.getByTestId("atlas-legend").getByRole("button", { name: "Legend" })
    await legendButton.click()
    await expect(legendButton).toHaveAttribute("aria-expanded", "true")
    await expectFrameApart(page, `legend open ${at}`)
    await legendButton.click()

    await openExplore(page, "events")
    await expectFrameApart(page, `list open ${at}`)

    await page.getByTestId("atlas-event-item").first().click()
    await expect(card(page)).toBeVisible()
    await expect(sheet(page)).toHaveAttribute("data-detent", "half")
    await expectFrameApart(page, `selected ${at}`)

    // The list can be reopened over a selection; both stay apart.
    await openExplore(page, "story")
    await expectFrameApart(page, `selected with the story open ${at}`)

    // A story jump puts the card back.
    await page.getByTestId("atlas-story-step").nth(1).click()
    await expect(page.locator("#atlas-story-summary")).toBeVisible()
    await expectFrameApart(page, `story summary step ${at}`)

    // Back to peek: the handle collapses the sheet from full, and from half it
    // steps up once more first.
    while ((await sheet(page).getAttribute("data-detent")) !== "peek") {
      await sheetHandle(page).click()
    }

    await expectFrameApart(page, `back at peek with a story step ${at}`)
  }

  // A link's arrival plate takes its own row under the orbs.
  await page.setViewportSize({ width: 320, height: 568 })
  await openChapter(page, `${TANG}?event=no-such-event`)
  await expect(page.getByTestId("atlas-arrival")).toBeVisible()
  await expectFrameApart(page, "arrival at 320")
})

test("restores exactly one workspace after a page transition", async ({ page }) => {
  await mountAtlas(page)

  // `pagehide` is the teardown boundary before a page is frozen or discarded.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")))
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(0)
  await expect(page.locator("#atlas-workspace")).toBeEmpty()
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(0)

  // A restored page gets exactly one workspace, not a second one stacked on top.
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")))
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(TANG_WINDOW_EVENTS)
})
