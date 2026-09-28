import { expect, test, type Page } from "@playwright/test"

/**
 * Browser checks for the treatment comparison's surface.
 *
 * The comparison is internal product work: the illustrated-local treatment has to
 * be inspectable beside the shipped geographic/symbolic one without reaching a
 * reader. These checks pin that boundary and the treatment's own contract — the
 * page says what it is, nothing links it, the toggle re-mounts one workspace
 * rather than stacking two, the two treatments differ only in the local-detail
 * surface, and the scene card stays inside the details panel's own bound at every
 * reviewed viewport.
 */

const TANG = "tang-mission-750-754"
const QIN = "qin-conquest-han-233-226"
const DEATH = "lks:event:hanfei-death-233"

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 820, height: 634 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]

async function openPanel(page: Page): Promise<void> {
  const toggle = page.locator("#atlas-list-toggle")

  await toggle.waitFor({ state: "attached" })

  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click()
  }

  await expect(page.locator('[data-testid="atlas-tab"]').first()).toBeVisible()
}

async function selectRow(page: Page, eventId: string): Promise<void> {
  await openPanel(page)

  const row = page.locator(`[data-event-id="${eventId}"]`)

  await row.scrollIntoViewIfNeeded()

  // The workspace re-measures the time controls when it mounts, and the overlay
  // column's bottom offset follows that measurement, so a click issued right after
  // a treatment switch can chase a row that is still moving. Playwright then never
  // sees the row stable and the click times out on a loaded machine. The poll
  // compares two readings taken at its own interval — no fixed sleep — and only
  // then is the row clicked.
  let previous: string | null = null

  await expect
    .poll(
      async () => {
        const box = await row.boundingBox()
        const reading = box === null ? "missing" : `${Math.round(box.y)}:${Math.round(box.height)}`
        const settled = reading !== "missing" && reading === previous

        previous = reading

        return settled
      },
      { timeout: 30_000, intervals: [200, 300, 400] },
    )
    .toBe(true)

  await row.click()
  await expect(page.getByTestId("atlas-selection")).toBeVisible()
}

async function openReview(page: Page, chapter: string): Promise<void> {
  await page.goto(`/review/local-treatment/${chapter}`)
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
}

test("states what the comparison surface is and is not linked from a reader page", async ({
  page,
}) => {
  test.setTimeout(240_000)

  await openReview(page, TANG)

  await expect(page.locator("#review-status")).toHaveText(
    "Internal comparison surface · not a reader page",
  )
  await expect(page.getByTestId("review-treatment")).toHaveCount(2)
  await expect(page.locator("#review-treatment-geographic-symbolic")).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  // The page states the chapter's own recorded decision, so the comparison cannot
  // be mistaken for a different revision of the content.
  await expect(page.locator("#review-scope")).toContainText(
    "Owner-approved for release, 2026-09-25",
  )

  // The reader surfaces carry no link to it and none of its framing. Each one is
  // mounted and an event is selected first: the workspace mounts in the browser,
  // so a page that handed it the illustrated treatment would still have clean
  // HTML, and only a live selection would show the card.
  for (const route of ["/", `/chapters/${TANG}`, `/chapters/${QIN}`]) {
    await page.goto(route)

    const text = () => page.locator("body").innerText()

    expect(await text(), route).not.toContain("Internal comparison surface")
    expect(await text(), route).not.toContain("Illustrated local")
    expect(await text(), route).not.toContain("Geographic/symbolic")
    expect(await text(), route).not.toContain("Local scene")
    expect(await page.locator('a[href*="/review/local-treatment"]').count(), route).toBe(0)
    await expect(page.getByTestId("review-treatment")).toHaveCount(0)
  }

  for (const chapter of [TANG, QIN]) {
    await page.goto(`/chapters/${chapter}`)
    await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
    await openPanel(page)

    const row = page.locator('[data-testid="atlas-event-item"]').first()

    await row.click()
    await expect(page.getByTestId("atlas-selection")).toBeVisible()

    await expect(page.getByTestId("atlas-local-scene")).toHaveCount(0)
    await expect(page.getByTestId("review-treatment")).toHaveCount(0)
    expect(await page.locator("body").innerText(), chapter).not.toContain("Local scene")
  }
})

test("switches treatments through the one mount owner, without stacking workspaces", async ({
  page,
}) => {
  test.setTimeout(240_000)

  await openReview(page, QIN)
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)

  await selectRow(page, DEATH)
  // The shipped treatment: the details, no scene card.
  await expect(page.getByTestId("atlas-local-scene")).toHaveCount(0)

  const before = await page.getByTestId("atlas-event-list").innerText()

  await page.locator("#review-treatment-illustrated-local").click()
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("#review-treatment-illustrated-local")).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  // One workspace after the switch, not two.
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)

  // The same chapter, the same window, and the same event list: the treatment is
  // the only difference.
  await expect(page.locator("#atlas-window-start")).toHaveValue("-232")
  expect(await page.getByTestId("atlas-event-list").innerText()).toBe(before)

  // The illustrated treatment adds the scene card for the same selection, and the
  // card carries the record's own place and the statements that keep it honest.
  await selectRow(page, DEATH)

  const scene = page.getByTestId("atlas-local-scene")

  await expect(scene).toBeVisible()
  await expect(scene).toContainText("Local scene · illustrative")
  await expect(scene).toContainText("雲陽")
  await expect(scene).toContainText("not a reconstruction")
  await expect(scene).toContainText("no position, extent, or distance")
  // The disputed record's own details are still there, below the card.
  await expect(page.getByTestId("atlas-dispute")).toBeVisible()

  // Switching back removes the card and keeps the details.
  await page.locator("#review-treatment-geographic-symbolic").click()
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await selectRow(page, DEATH)
  await expect(page.getByTestId("atlas-local-scene")).toHaveCount(0)
  await expect(page.getByTestId("atlas-dispute")).toBeVisible()
})

test("draws no scene where the record names no place, and keeps the record's own note", async ({
  page,
}) => {
  test.setTimeout(240_000)

  await openReview(page, TANG)
  await page.locator("#review-treatment-illustrated-local").click()
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

  // 鑒眞's death is a coda node at 763, outside the chapter's default window, and
  // its record names no place at all: the illustrated treatment must draw nothing
  // rather than attach a scene to a place the record does not name.
  await page.locator("#atlas-window-end").fill("779")
  await selectRow(page, "lks:event:jianzhen-death-763")

  await expect(page.getByTestId("atlas-selection")).toBeVisible()
  await expect(page.getByTestId("atlas-unplaced")).toBeVisible()
  await expect(page.getByTestId("atlas-local-scene")).toHaveCount(0)

  // A record that names a place only as context gets a scene, and the card keeps
  // the record's own statement that the atlas claims no position for it.
  await page.locator("#atlas-window-start").fill("753")
  await page.locator("#atlas-window-end").fill("753")
  await selectRow(page, "lks:event:ships-separate-753")

  await expect(page.getByTestId("atlas-local-scene")).toBeVisible()
  await expect(page.getByTestId("atlas-local-scene")).toContainText("named only as context")
})

test("keeps the illustrated scene inside the details panel at every reviewed size", async ({
  page,
}) => {
  test.setTimeout(420_000)

  // The card is part of the details panel's scroll area, so the treatment cannot
  // be the thing that overflows the overlay column or crosses the time controls:
  // the panel keeps the bound it already had, and the card scrolls inside it.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await openReview(page, TANG)
    await page.locator("#review-treatment-illustrated-local").click()
    await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

    await selectRow(page, "lks:event:return-voyage-753")

    const geometry = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>("#atlas-selection")
      const scene = document.querySelector<HTMLElement>('[data-testid="atlas-local-scene"]')
      const controls = document.querySelector<HTMLElement>('[data-testid="atlas-time-controls"]')

      if (panel === null || scene === null || controls === null) {
        return null
      }

      return {
        cardInsidePanel: panel.contains(scene),
        panelBottom: panel.getBoundingClientRect().bottom,
        panelTop: panel.getBoundingClientRect().top,
        controlsTop: controls.getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
        cardTop: scene.getBoundingClientRect().top,
      }
    })

    expect(geometry, `geometry at ${viewport.width}`).not.toBeNull()
    expect(geometry?.cardInsidePanel, `card bound at ${viewport.width}`).toBe(true)
    expect(
      geometry?.panelBottom,
      `panel over the controls at ${viewport.width}`,
    ).toBeLessThanOrEqual(geometry?.controlsTop ?? 0)
    expect(
      geometry?.panelBottom,
      `panel past the viewport at ${viewport.width}`,
    ).toBeLessThanOrEqual(geometry?.viewportHeight ?? 0)
    // The card is the first thing in the panel, so a reader meets it without
    // scrolling; the details follow it inside the same scroll area.
    expect(geometry?.cardTop, `card visible at ${viewport.width}`).toBeGreaterThanOrEqual(
      geometry?.panelTop ?? 0,
    )
  }
})
