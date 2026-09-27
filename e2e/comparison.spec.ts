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

  await expect(page).toHaveTitle(/The end of the state of Han · Lekishi/)
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
  await expect(notice).toContainText("The end of the state of Han")
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

test("keeps the Tang atlas on its own chapter and surface", async ({ page }) => {
  await page.goto(ATLAS)

  // The production surface names the chapter and its review status; it carries
  // no review category and never the Qin chapter's unapproved label.
  await expect(page.locator("#atlas-notice")).toContainText("The embassy to Tang China")
  await expect(page.locator("#atlas-notice")).toContainText("Self-review only")
  await expect(page.locator("#atlas-notice")).not.toContainText("Reviewed chapter")
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
  // Four viewports, several overlay states each, and software WebGL: every click
  // and every resize costs seconds, so this check needs more than the default
  // budget.
  test.setTimeout(180_000)

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
    { width: 1440, height: 900 },
    { width: 820, height: 634 },
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

test("keeps the selected event's explanation reachable at every reviewed size", async ({
  page,
}) => {
  // Four viewports, each with a fresh page load, a list open, a selection, and a
  // panel measurement, all on software WebGL: measured at 2.7 minutes alone, so
  // the default budget is too tight once the suite runs the whole file.
  test.setTimeout(300_000)

  // The details panel carries the record's own explanation of why an event has
  // no position. At a short viewport the panel used to render past the bottom of
  // the workspace, where nothing could scroll to it, so the explanation was the
  // text that fell off. The panel must stay inside the viewport, stay clear of
  // the time controls, and scroll to its own end.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 820, height: 634 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(COMPARISON)
    await openEventList(page)

    const row = page.locator(
      `[data-testid="atlas-event-item"][data-event-id="lks:event:han-nanyang-cession-231"]`,
    )

    await row.scrollIntoViewIfNeeded()
    await row.click()

    const panel = page.locator("#atlas-selection")

    await expect(panel).toBeVisible()

    const geometry = await panel.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const controls = document.querySelector('[data-testid="atlas-time-controls"]')
      const controlsBox = controls === null ? null : controls.getBoundingClientRect()

      return {
        bottom: box.bottom,
        viewportHeight: window.innerHeight,
        controlsTop: controlsBox === null ? null : controlsBox.top,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }
    })

    expect(geometry.bottom, `panel bottom at ${viewport.width}`).toBeLessThanOrEqual(
      geometry.viewportHeight,
    )
    expect(geometry.controlsTop, `controls at ${viewport.width}`).not.toBeNull()
    expect(geometry.bottom, `panel over the controls at ${viewport.width}`).toBeLessThanOrEqual(
      geometry.controlsTop ?? 0,
    )
    // Scroll the panel to its end: the explanation of why 南陽 has no position
    // is the last thing the panel carries, and it has to be reachable there —
    // either because the panel fits at this size or because it scrolls to it.
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })

    const reached = await panel.evaluate((element) => {
      const paragraphs = Array.from(element.querySelectorAll("p"))
      const last = paragraphs.at(-1)
      const panelBox = element.getBoundingClientRect()
      const lastBox = last === undefined ? null : last.getBoundingClientRect()

      return {
        text: (element as HTMLElement).innerText,
        lastInside:
          lastBox !== null &&
          lastBox.bottom <= panelBox.bottom + 1 &&
          lastBox.top >= panelBox.top - 1,
        scrollTop: element.scrollTop,
        maxScroll: element.scrollHeight - element.clientHeight,
      }
    })

    expect(reached.text, `explanation at ${viewport.width}`).toContain("state no extent or seat")
    expect(reached.text, `explanation at ${viewport.width}`).toContain("no position")
    expect(reached.scrollTop, `scroll reached the end at ${viewport.width}`).toBeCloseTo(
      reached.maxScroll,
      -1,
    )
    expect(reached.lastInside, `panel's end visible at ${viewport.width}`).toBe(true)
  }
})

test("presents both chapters from the root page as peer entries", async ({ page }) => {
  const problems = collectProblems(page)

  await page.goto("/")

  const cards = page.locator("[data-chapter-id]")

  await expect(cards).toHaveCount(2)

  const tang = page.locator('[data-chapter-id="tang-mission-750-754"]')
  const qin = page.locator('[data-chapter-id="qin-conquest-han-233-226"]')

  // Each card is a chapter entry: a name, its window, a story summary, and an
  // ordinary link to open it.
  await expect(tang).toContainText("The embassy to Tang China")
  await expect(tang).toContainText("750–754")
  await expect(tang).toContainText("藤原朝臣清河")
  await expect(tang.getByRole("link", { name: /Open the chapter/ })).toBeVisible()

  await expect(qin).toContainText("The end of the state of Han")
  await expect(qin).toContainText("233 BCE–226 BCE")
  await expect(qin).toContainText("韓非")
  await expect(qin.getByRole("link", { name: /Open the chapter/ })).toBeVisible()

  // Editorial state is secondary metadata in the card, never its pitch: the two
  // cards are peers, and neither the page nor the Qin card reads as release.
  await expect(tang).toContainText("Owner-approved for release, 2026-09-25")
  await expect(tang).toContainText("Not independent or specialist review")
  await expect(qin).toContainText("Unapproved preparation · self-review only")
  await expect(qin).not.toContainText("Owner-approved")
  await expect(qin).not.toContainText("approved for release")

  // The page is a reader's entry point: no review categories, no contract
  // records, and no comparison-harness rationale.
  const mainText = await page.locator("main").innerText()

  expect(mainText).not.toContain("Reviewed chapter")
  expect(mainText).not.toContain("Comparison chapter")
  expect(mainText).not.toContain("comparison harness")
  expect(mainText).not.toContain("map treatments")
  expect(mainText).not.toContain("lekishi-historical-contract")

  // The hero's atlas call to action stays the page's primary action, ahead of
  // the chapter entries.
  await expect(page.getByRole("link", { name: "Open the atlas" })).toBeVisible()

  const order = await page.evaluate(() => {
    const text = document.querySelector("main")?.textContent ?? ""

    return {
      atlas: text.indexOf("Open the atlas"),
      chapter: text.indexOf("Open the chapter"),
    }
  })

  expect(order.atlas).toBeGreaterThanOrEqual(0)
  expect(order.chapter).toBeGreaterThan(order.atlas)

  // The Qin entry opens the Qin chapter, and that page states the chapter's
  // unapproved status and names the chapter the card named.
  await qin.getByRole("link", { name: /Open the chapter/ }).click()

  await expect(page).toHaveURL(/\/compare\/qin$/)
  await expect(page).toHaveTitle(/The end of the state of Han/)
  await expect(page.locator("#comparison-status")).toHaveText("Unapproved preparation")

  // Discoverability holds at the reviewed sizes, with no horizontal overflow.
  await page.goto("/")

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 820, height: 634 },
    { width: 390, height: 844 },
    { width: 320, height: 640 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(cards).toHaveCount(2)
    await expect(tang).toBeVisible()
    await expect(qin).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )

    expect(overflow, `horizontal overflow at ${viewport.width}`).toBeLessThanOrEqual(1)
  }

  expect(problems).toEqual([])
})
