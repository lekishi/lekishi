import { expect, test, type Page } from "@playwright/test"

/**
 * Browser checks for the comparison review route.
 *
 * The route renders the bounded Qin fixture through the same workspace as the
 * atlas, so the checks are the fixture's own contract in a real browser: the
 * page states that the content is unapproved preparation, the window and event
 * dates are printed as BCE years, the disputed death account is visible with its
 * conflicting accounts, and the reviewed Tang atlas is unchanged. The default
 * target is the built artifact served as files (`pnpm e2e`); the same checks run
 * against the development server with `LEKISHI_E2E_MODE=dev pnpm e2e`.
 */

const COMPARISON = "/compare/qin"
const ATLAS = "/atlas"
const DEATH_EVENT = "lks:event:hanfei-death-233"

function collectProblems(page: Page): string[] {
  const problems: string[] = []

  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console error: ${message.text()}`)
    }
  })

  return problems
}

/** Opens the event list when it is behind the phone drawer toggle. */
async function openEventList(page: Page): Promise<void> {
  const toggle = page.locator("#atlas-list-toggle")

  // The workspace mounts after the route's load resolves, so wait for the
  // toggle to exist before deciding whether the drawer needs opening.
  await toggle.waitFor({ state: "attached" })

  if (await toggle.isVisible()) {
    await toggle.click()
  }

  await expect(page.getByTestId("atlas-event-item").first()).toBeVisible()
}

test("serves the comparison fixture as unapproved preparation with BCE years", async ({ page }) => {
  const problems = collectProblems(page)

  await page.goto(COMPARISON)

  await expect(page).toHaveTitle(/Comparison fixture/)
  await expect(page.locator("#comparison-status")).toHaveText("Unapproved preparation")
  // The scope strip is hidden at phone widths (the badge and the workspace
  // notice carry the status there), so its content is asserted, not its box.
  await expect(page.locator("#comparison-scope")).toContainText("233 BCE–226 BCE")
  await expect(page.locator("#comparison-scope")).toContainText("no release decision exists")

  // The workspace names the chapter and its own review status; the status must
  // never read as approved content.
  const notice = page.locator("#atlas-notice")

  await expect(notice).toContainText("Unapproved preparation")
  await expect(notice).toContainText("Self-review only")
  await expect(notice).toContainText("The end of the state of Han under Qin")
  await expect(notice).not.toContainText("owner approved")

  await openEventList(page)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(5)

  // Astronomical ordinals stay in the inputs; the BCE year is what the atlas
  // states, including the playhead readout.
  await expect(page.locator("#atlas-window-start")).toHaveValue("-232")
  await expect(page.locator("#atlas-window-end")).toHaveValue("-225")
  await expect(page.getByTestId("atlas-time-controls")).toContainText("233 BCE")
  await expect(page.getByTestId("atlas-time-controls")).toContainText("226 BCE")
  await expect(page.locator("#atlas-playhead-value")).toHaveText("233 BCE")

  // Every event states its own BCE year, every placement is a label anchor
  // rather than an asserted coordinate, and none of them is presented with a day
  // or as a continuous span. The 231 BCE cession is named without a position,
  // because the sources state no extent or seat and the name covers two regions.
  const listText = await page.getByTestId("atlas-event-list").innerText()

  expect(listText).toContain("233 BCE")
  expect(listText).toContain("226 BCE")
  expect(listText).toContain("uncertain span")
  expect(listText).toContain("display anchor only")
  expect(listText).toContain("南陽 · no sourced position")
  expect(listText).not.toContain("drought")

  // Four of the five events are shown at label anchors; 南陽 is the one place
  // without a sourced map position, and the notice counts both.
  await expect(page.locator("#atlas-notice")).toContainText("1 of 5 in-window events")
  await expect(page.locator("#atlas-notice")).toContainText("1 of 4 places without a sourced map")

  expect(problems).toEqual([])
})

test("shows the disputed death account with the accounts that challenge it", async ({ page }) => {
  await page.goto(COMPARISON)
  await openEventList(page)

  const row = page.locator(`[data-testid="atlas-event-item"][data-event-id="${DEATH_EVENT}"]`)

  await expect(row).toContainText("disputed account")
  // The list is a scroll container at phone widths, so the row has to be
  // scrolled into its own viewport before it can be clicked.
  await row.scrollIntoViewIfNeeded()
  await row.click()

  const dispute = page.getByTestId("atlas-dispute")

  await expect(dispute).toBeVisible()
  await expect(dispute).toContainText("Disputed account")
  await expect(dispute).toContainText("王安五年")
  await expect(dispute).toContainText("韓王安六年")
  await expect(dispute).toContainText("hereditary house")
  await expect(dispute).toContainText("biography")
  // The accounts carry their locators, so the disagreement is checkable here.
  await expect(dispute).toContainText("卷四十五 韓世家")

  // The details panel keeps the record's own uncertainty alongside the dispute,
  // and states that the place is shown at a label anchor rather than a site.
  await expect(page.getByTestId("atlas-selection")).toContainText("uncertain span")
  await expect(page.getByTestId("atlas-selection")).toContainText("display anchor only")
})

test("keeps the reviewed Tang atlas on its own chapter and surface", async ({ page }) => {
  await page.goto(ATLAS)

  await expect(page.locator("#atlas-notice")).toContainText("Reviewed chapter")
  await expect(page.locator("#atlas-notice")).toContainText("Self-review only")
  await expect(page.locator("#atlas-notice")).not.toContainText("Unapproved preparation")

  await openEventList(page)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(24)

  // The launch chapter's surface does not show the comparison route's dispute
  // badge; its own disputed records keep the presentation the owner approved.
  await expect(page.getByTestId("atlas-dispute-badge")).toHaveCount(0)
  await expect(page.getByTestId("atlas-dispute")).toHaveCount(0)

  const listText = await page.getByTestId("atlas-event-list").innerText()

  expect(listText).not.toContain("BCE")
})

test("keeps the comparison overlays apart at phone widths", async ({ page }) => {
  await page.goto(COMPARISON)

  const selectors = [
    "#comparison-status",
    "#comparison-scope",
    "#atlas-notice",
    "#atlas-follow-toggle",
    "#atlas-list-toggle",
    "#atlas-event-panel",
    "#atlas-selection",
    '[data-testid="atlas-time-controls"]',
  ]

  async function assertNoOverlaps(width: number, state: string): Promise<void> {
    const boxes = await page.evaluate(
      (candidates) =>
        candidates.flatMap((selector) =>
          Array.from(document.querySelectorAll(selector))
            .filter((element) => {
              const rect = element.getBoundingClientRect()
              const style = getComputedStyle(element)
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                rect.width > 0 &&
                rect.height > 0
              )
            })
            .map((element) => {
              const rect = element.getBoundingClientRect()
              return { selector, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
            }),
        ),
      selectors,
    )

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const [a, b] = [boxes[i], boxes[j]]
        const overlaps = a.right > b.x && b.right > a.x && a.bottom > b.y && b.bottom > a.y

        expect(overlaps, `${a.selector} overlaps ${b.selector} (${state} at ${width})`).toBe(false)
      }
    }
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(page.locator("#comparison-status")).toBeVisible()
    await assertNoOverlaps(viewport.width, "default")

    // The phone layout puts the event list behind the drawer toggle, so the
    // states that matter here are the list open and an event selected.
    await openEventList(page)
    await assertNoOverlaps(viewport.width, "list open")

    const row = page.locator(`[data-testid="atlas-event-item"][data-event-id="${DEATH_EVENT}"]`)

    await row.scrollIntoViewIfNeeded()
    await row.click()
    await expect(page.getByTestId("atlas-dispute")).toBeVisible()
    await assertNoOverlaps(viewport.width, "selected")
  }
})
