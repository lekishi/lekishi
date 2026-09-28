import { expect, test, type Page } from "@playwright/test"

/**
 * Browser checks for the chapter routes.
 *
 * Every chapter the site serves renders through one route and one workspace, so
 * these checks are the shared reader loop in a real browser: the chapter's own
 * name, window, and recorded decision before any script runs, the same tabs,
 * search, story navigation, sources, and dispute cues for both chapters, the
 * legacy routes still resolving, and the responsive layouts staying apart at
 * every reviewed size. The default target is the built artifact served as files
 * (`pnpm e2e`); the same checks run against the development server with
 * `LEKISHI_E2E_MODE=dev pnpm e2e`.
 */

const TANG = "/chapters/tang-mission-750-754"
const QIN = "/chapters/qin-conquest-han-233-226"
const DEATH_EVENT = "lks:event:hanfei-death-233"
const DRIFT_EVENT = "lks:event:kiyokawa-drift-753"
const HONOURS_EVENT = "lks:event:kiyokawa-honours-779"

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 820, height: 634 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]

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

/**
 * Opens the exploration panel when it is behind the phone drawer toggle.
 *
 * The toggle's `aria-expanded` decides whether it has to be clicked: at `md` and
 * up the panel is always open and the toggle is hidden, and clicking it again
 * while the drawer is open would close it.
 */
async function openPanel(page: Page): Promise<void> {
  const toggle = page.locator("#atlas-list-toggle")

  // The workspace mounts after the route's load resolves, so wait for the
  // toggle to exist before deciding whether the drawer needs opening.
  await toggle.waitFor({ state: "attached" })

  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click()
  }

  await expect(page.locator('[data-testid="atlas-tab"]').first()).toBeVisible()
}

/** Closes the panel when it is the phone drawer, so the details are on screen. */
async function closePanel(page: Page): Promise<void> {
  const toggle = page.locator("#atlas-list-toggle")

  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "true") {
    await toggle.click()
  }
}

/** Opens the panel and switches it to one of its surfaces. */
async function openTab(page: Page, tab: "events" | "story" | "sources"): Promise<void> {
  await openPanel(page)
  await page.locator(`#atlas-tab-${tab}`).click()
}

/** Selects an event from the panel's list or its search results. */
async function selectRow(page: Page, eventId: string): Promise<void> {
  const row = page.locator(`[data-event-id="${eventId}"]`)

  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(page.getByTestId("atlas-selection")).toBeVisible()
}

test("serves the Tang chapter as an ordinary chapter page", async ({ page }) => {
  const problems = collectProblems(page)

  await page.goto(TANG)

  await expect(page).toHaveTitle(/The embassy to Tang China · Lekishi/)
  await expect(page.locator("#chapter-decision")).toHaveText(
    "Owner-approved for release, 2026-09-25",
  )
  await expect(page.locator("#chapter-scope")).toContainText("750–754")
  await expect(page.locator("#chapter-scope")).toContainText("Not independent or specialist review")

  // The workspace names the chapter and states the decision recorded on it.
  const notice = page.locator("#atlas-notice")

  await expect(notice).toContainText("Owner-approved for release, 2026-09-25")
  await expect(notice).toContainText("The embassy to Tang China")

  await openPanel(page)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(24)

  // A chapter's own year text: the CE window prints as years, never as BCE.
  const listText = await page.getByTestId("atlas-event-list").innerText()

  expect(listText).not.toContain("BCE")

  expect(problems).toEqual([])
})

test("serves the Qin chapter through the same route with its own window and BCE years", async ({
  page,
}) => {
  const problems = collectProblems(page)

  await page.goto(QIN)

  await expect(page).toHaveTitle(/The end of the state of Han · Lekishi/)
  await expect(page.locator("#chapter-decision")).toHaveText(
    "Owner-approved for release, 2026-09-27",
  )
  await expect(page.locator("#chapter-scope")).toContainText("233 BCE–226 BCE")
  await expect(page.locator("#chapter-scope")).toContainText("Not independent or specialist review")

  const notice = page.locator("#atlas-notice")

  await expect(notice).toContainText("Owner-approved for release, 2026-09-27")
  await expect(notice).toContainText("The end of the state of Han")

  await openPanel(page)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(5)

  // Astronomical ordinals stay in the inputs; the BCE year is what the atlas
  // states, including the playhead readout.
  await expect(page.locator("#atlas-window-start")).toHaveValue("-232")
  await expect(page.locator("#atlas-window-end")).toHaveValue("-225")
  await expect(page.getByTestId("atlas-time-controls")).toContainText("233 BCE")
  await expect(page.getByTestId("atlas-time-controls")).toContainText("226 BCE")
  await expect(page.locator("#atlas-playhead-value")).toHaveText("233 BCE")

  // Every event states its own BCE year, every placement is a label anchor
  // rather than an asserted coordinate, and the cession is named without a
  // position because the entries state no extent or seat.
  const listText = await page.getByTestId("atlas-event-list").innerText()

  expect(listText).toContain("233 BCE")
  expect(listText).toContain("226 BCE")
  expect(listText).toContain("uncertain span")
  expect(listText).toContain("display anchor only")
  expect(listText).toContain("南陽 · no sourced position")
  expect(listText).not.toContain("drought")

  await expect(notice).toContainText("1 of 5 in-window events")
  await expect(notice).toContainText("1 of 4 places without a sourced map")

  expect(problems).toEqual([])
})

test("redirects the legacy routes to the chapters they served", async ({ page }) => {
  await page.goto("/atlas")
  await expect(page).toHaveURL(new RegExp(`${TANG}$`))
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

  await page.goto("/compare/qin")
  await expect(page).toHaveURL(new RegExp(`${QIN}$`))
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("#atlas-notice")).toContainText("The end of the state of Han")
})

test("replaces the workspace when the router moves between two chapters", async ({ page }) => {
  // SvelteKit reuses the page component for two values of the same dynamic route,
  // so this is the path where a mount-once workspace would leave the first
  // chapter's events and globe under the second chapter's name. The link is
  // injected because no surface links the chapters to each other yet; the router
  // intercepts it exactly as it would a real one.
  await page.goto(TANG)
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await openPanel(page)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(24)

  await page.evaluate((target) => {
    const link = document.createElement("a")

    link.id = "injected-chapter-link"
    link.href = target
    link.textContent = "The end of the state of Han"
    document.body.append(link)
  }, QIN)

  await page.locator("#injected-chapter-link").click()

  await expect(page).toHaveURL(new RegExp(`${QIN}$`))
  await expect(page.locator("#chapter-decision")).toHaveText(
    "Owner-approved for release, 2026-09-27",
  )
  await expect(page.locator("#atlas-notice")).toContainText("The end of the state of Han")
  // One workspace, and it is the chapter the URL names.
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
  await openPanel(page)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(5)
  await expect(page.locator(`[data-event-id="${DEATH_EVENT}"]`)).toBeVisible()
  await expect(page.locator('[data-event-id="lks:event:appointment-750"]')).toHaveCount(0)
  await expect(page.locator("#atlas-window-start")).toHaveValue("-232")
})

test("keeps the workspace single and the chapter records on their own page", async ({ page }) => {
  for (const route of [TANG, QIN]) {
    await page.goto(route)
    await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
    await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
    await expect(page.getByText("Synthetic", { exact: false })).toHaveCount(0)
  }

  // The two chapters' events do not mix: the Tang chapter's list never carries a
  // Qin record and the other way round.
  await page.goto(TANG)
  await openPanel(page)
  await expect(page.locator(`[data-event-id="${DEATH_EVENT}"]`)).toHaveCount(0)

  await page.goto(QIN)
  await openPanel(page)
  await expect(page.locator('[data-event-id="lks:event:appointment-750"]')).toHaveCount(0)
})

test("searches both chapters by local script and romanized name", async ({ page }) => {
  // The Tang chapter: a romanized actor name, the local-script form, and a place
  // whose published reading aid is a diacritic-bearing romanization.
  await page.goto(TANG)
  await openPanel(page)

  const search = page.locator("#atlas-search")

  await search.fill("Fujiwara no Kiyokawa")
  await expect(page.getByTestId("atlas-search-results")).toBeVisible()
  await expect(page.locator('[data-event-id="lks:event:appointment-750"]')).toBeVisible()

  await search.fill("東大寺")
  await expect(page.locator('[data-event-id="lks:event:todaiji-installation-754"]')).toBeVisible()

  // The diacritic-free spelling finds the same events as the published one.
  const resultIds = () =>
    page
      .getByTestId("atlas-search-results")
      .locator("[data-event-id]")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))

  await search.fill("Otomo no Komaro")
  const withoutDiacritics = await resultIds()

  expect(withoutDiacritics.length).toBeGreaterThan(0)
  await search.fill("Ōtomo no Komaro")
  await expect.poll(resultIds).toEqual(withoutDiacritics)

  // A place the record names but the map does not show the event at is still
  // searchable: the return voyage's record references four places.
  await search.fill("Yakushima")
  await expect(page.locator('[data-event-id="lks:event:return-voyage-753"]')).toBeVisible()

  // Clearing the search brings the window's own list back.
  await search.fill("")
  await expect(page.getByTestId("atlas-event-list")).toBeVisible()

  // The Qin chapter searches the same way, including its own dispute text.
  await page.goto(QIN)
  await openPanel(page)
  await page.locator("#atlas-search").fill("Yunyang")
  await expect(page.locator(`[data-event-id="${DEATH_EVENT}"]`)).toBeVisible()

  await page.locator("#atlas-search").fill("hereditary house")
  await expect(page.locator(`[data-event-id="${DEATH_EVENT}"]`)).toBeVisible()

  // A query nothing matches says so instead of showing the whole chapter.
  await page.locator("#atlas-search").fill("Xanadu")
  await expect(page.getByTestId("atlas-search-empty")).toContainText("No published event")
})

test("finds an event outside the window and keeps its details with the outside-time notice", async ({
  page,
}) => {
  // 藤原清河's posthumous honours are a 779 coda node, outside the chapter's
  // 750–754 window. Search reaches it, and selecting it keeps the details
  // readable while the window still excludes it.
  await page.goto(TANG)
  await openPanel(page)
  await page.locator("#atlas-window-start").fill("753")
  await page.locator("#atlas-window-end").fill("754")
  await page.locator("#atlas-search").fill("posthumous honours")

  const row = page.locator(`[data-event-id="${HONOURS_EVENT}"]`)

  await expect(row).toBeVisible()
  await expect(row.getByTestId("atlas-outside-badge")).toBeVisible()
  await row.click()

  const panel = page.getByTestId("atlas-selection")

  await expect(panel).toBeVisible()
  await expect(panel).toContainText("posthumous honours")
  await expect(page.getByTestId("atlas-outside-time")).toBeVisible()

  // The event keeps no map marker while the window excludes it: with the search
  // cleared, the window's own list is what is left, and the event is not in it.
  await openPanel(page)
  await page.locator("#atlas-search").fill("")
  await expect(
    page.locator(`[data-testid="atlas-event-list"] [data-event-id="${HONOURS_EVENT}"]`),
  ).toHaveCount(0)

  // The explicit return moves the window instead of silently undoing the change,
  // and the event is in the window's list afterwards.
  await closePanel(page)
  await page.locator("#atlas-return-to-time").click()
  await expect(page.getByTestId("atlas-outside-time")).toHaveCount(0)
  await openPanel(page)
  await expect(
    page.locator(`[data-testid="atlas-event-list"] [data-event-id="${HONOURS_EVENT}"]`),
  ).toBeVisible()
})

test("navigates the chapter's story with explicit jumps", async ({ page }) => {
  await page.goto(QIN)
  await openTab(page, "story")

  const steps = page.getByTestId("atlas-story-step")

  await expect(steps).toHaveCount(5)
  await expect(page.getByTestId("atlas-story-summary-step")).toHaveCount(4)

  // The story's own caption is the step's label, and the summary steps stay in
  // the sequence without being openable: no button, no link, nothing to activate.
  await expect(page.getByTestId("atlas-story")).toContainText("The submission request to Qin")

  const summaryStep = page.getByTestId("atlas-story-summary-step").first()

  await expect(summaryStep).toContainText("The submission request to Qin")
  await expect(summaryStep.locator("button")).toHaveCount(0)
  await expect(summaryStep.locator("a")).toHaveCount(0)

  await steps.nth(1).click()

  const panel = page.getByTestId("atlas-selection")

  await expect(panel).toBeVisible()
  await expect(panel).toContainText("韓非 is detained and dies at 雲陽")
  // The jump moved the window to the event's own time: the playhead lands in the
  // event's span.
  await expect(page.locator("#atlas-playhead-value")).toHaveText("233 BCE")

  // The jump selected the event, so the events surface now lists it as current.
  await openTab(page, "events")
  await expect(
    page.locator(`[data-testid="atlas-event-list"] [data-event-id="${DEATH_EVENT}"]`),
  ).toHaveAttribute("aria-current", "true")

  // "Next in story" is an explicit jump, separate from chronological stepping.
  await closePanel(page)
  await page.locator("#atlas-story-next").click()
  await expect(panel).toContainText("Han cedes 南陽")
  await page.locator("#atlas-story-previous").click()
  await expect(panel).toContainText("韓非 is detained and dies at 雲陽")
})

test("shows the sources and locators behind a selected event", async ({ page }) => {
  await page.goto(QIN)
  await openPanel(page)

  await selectRow(page, DEATH_EVENT)

  const citations = page.getByTestId("atlas-citations")

  await expect(citations).toBeVisible()
  // The locator is the record's own, and the quoted passage is shown where the
  // source's recorded terms permit quoting.
  await expect(citations).toContainText("卷六 秦始皇本紀")
  await expect(citations).toContainText("韓非使秦，秦用李斯謀，留非，非死雲陽。")
  await expect(citations).toContainText("Wikisource")

  // The chapter's source list states each source's kind, attribution, and reuse
  // terms, and links only the identifier the record carries.
  await openTab(page, "sources")

  const sources = page.getByTestId("atlas-sources")

  await expect(page.getByTestId("atlas-source")).toHaveCount(4)
  await expect(sources).toContainText("史記")
  await expect(sources).toContainText("Public domain")
  await expect(sources).toContainText("CC0 1.0")
  await expect(sources.locator("a", { hasText: "zh.wikisource.org" }).first()).toBeVisible()

  // The Tang chapter's own source list states its sources' recorded terms too,
  // including the one whose rights are reserved: the atlas states them and links
  // only the identifiers the records carry.
  await page.goto(TANG)
  await openTab(page, "sources")

  const tangSources = page.getByTestId("atlas-sources")

  await expect(tangSources).toContainText("All rights reserved")
  await expect(tangSources).toContainText("井上賢一")
  await expect(tangSources.locator("a", { hasText: "kotobank.jp" }).first()).toBeVisible()
  await expect(tangSources.locator("a", { hasText: "wikipedia.org" })).toHaveCount(0)
})

test("shows the disputed account on both chapters", async ({ page }) => {
  // The Qin chapter's disputed death: the badge in the list and the accounts
  // with their locators in the details panel.
  await page.goto(QIN)
  await openPanel(page)

  const qinRow = page.locator(`[data-event-id="${DEATH_EVENT}"]`)

  await expect(qinRow.getByTestId("atlas-dispute-badge")).toBeVisible()
  await selectRow(page, DEATH_EVENT)

  const dispute = page.getByTestId("atlas-dispute")

  await expect(dispute).toBeVisible()
  await expect(dispute).toContainText("Disputed account")
  await expect(dispute).toContainText("王安五年")
  await expect(dispute).toContainText("韓王安六年")
  await expect(dispute).toContainText("hereditary house")
  await expect(dispute).toContainText("卷四十五 韓世家")

  // The details panel keeps the record's own uncertainty alongside the dispute,
  // and states that the place is shown at a label anchor rather than a site.
  await expect(page.getByTestId("atlas-selection")).toContainText("uncertain span")
  await expect(page.getByTestId("atlas-selection")).toContainText("display anchor only")

  // The Tang chapter shows its own disputed record the same way. 鑒眞's death is
  // a coda node at 763, outside the chapter's 750–754 window.
  await page.goto(TANG)
  await openPanel(page)
  await page.locator("#atlas-window-end").fill("779")

  const tangRow = page.locator('[data-event-id="lks:event:jianzhen-death-763"]')

  await expect(tangRow.getByTestId("atlas-dispute-badge")).toBeVisible()
  await selectRow(page, "lks:event:jianzhen-death-763")
  await expect(page.getByTestId("atlas-dispute")).toBeVisible()
  await expect(page.getByTestId("atlas-dispute")).toContainText("Disputed account")
})

test("keeps an unplaced event listable and explains why it has no position", async ({ page }) => {
  await page.goto(TANG)
  await openPanel(page)

  // 驩州 is named by the published record, but no identification is sourced.
  await selectRow(page, DRIFT_EVENT)

  const panel = page.getByTestId("atlas-selection")

  await expect(panel).toContainText("驩州")
  await expect(page.getByTestId("atlas-unplaced")).toContainText(
    "no identification is sourced for it",
  )
  await expect(page.locator("#atlas-follow-toggle")).toBeDisabled()

  // A label anchor states the record's own note instead of an unplaced reason.
  await openPanel(page)
  await page.locator("#atlas-search").fill("節刀")
  await selectRow(page, "lks:event:sekito-752")
  await expect(page.getByTestId("atlas-placement-note")).toContainText("平城宮")
})

test("reaches search, the story, and a story jump with the keyboard", async ({ page }) => {
  // Keyboard-only exploration: the search field, the panel's tabs, the story's
  // steps, and the details panel's own story jumps are all reachable without a
  // pointer (RFD 4 AC6).
  await page.goto(QIN)
  await openPanel(page)

  await page.locator("#atlas-search").focus()
  await page.keyboard.type("Yunyang")

  const row = page.locator(`[data-event-id="${DEATH_EVENT}"]`)

  await expect(row).toBeVisible()
  await row.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("atlas-selection")).toBeVisible()
  await expect(page.getByTestId("atlas-selection")).toContainText("韓非 is detained")

  // The panel's tabs are buttons with a role: a keyboard user can move to the
  // story surface and open a step.
  await openPanel(page)
  await page.locator("#atlas-tab-story").focus()
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("atlas-story-step").first()).toBeVisible()

  await page.getByTestId("atlas-story-step").first().focus()
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("atlas-selection")).toContainText(
    "The Han king's submission and 韓非's embassy",
  )

  // And the details panel's own jumps work from the keyboard.
  await expect(page.locator("#atlas-story-next")).toBeVisible()
  await page.locator("#atlas-story-next").focus()
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("atlas-selection")).toContainText("韓非 is detained")
})

test("keeps the chapter overlays apart at every reviewed size", async ({ page }) => {
  // Four viewports, several overlay states each, and software WebGL: every click
  // and every resize costs seconds, so this check needs more than the default
  // budget.
  test.setTimeout(420_000)

  await page.goto(QIN)

  const selectors = [
    "#chapter-decision",
    "#chapter-scope",
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

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await expect(page.locator("#chapter-decision")).toBeVisible()
    await assertNoOverlaps(viewport.width, "default")

    // The phone layout puts the panel behind the drawer toggle, so the states
    // that matter here are the panel open, each tab, and an event selected.
    await openPanel(page)
    await assertNoOverlaps(viewport.width, "panel open")

    for (const tab of ["story", "sources", "events"] as const) {
      await page.locator(`#atlas-tab-${tab}`).click()
      await assertNoOverlaps(viewport.width, `${tab} tab`)
    }

    await selectRow(page, DEATH_EVENT)
    await expect(page.getByTestId("atlas-dispute")).toBeVisible()
    await assertNoOverlaps(viewport.width, "selected")

    // The story and sources surfaces are reachable with a selection too, and
    // their content stays inside the panel. Selecting closed the phone drawer, so
    // the panel is opened again for them.
    for (const tab of ["story", "sources", "events"] as const) {
      await openTab(page, tab)
      await assertNoOverlaps(viewport.width, `${tab} tab with selection`)
    }
  }
})

test("keeps the selected event's explanation reachable at every reviewed size", async ({
  page,
}) => {
  // Four viewports, each with a fresh page load, a panel open, a selection, and a
  // panel measurement, all on software WebGL: measured at 2.7 minutes alone, so
  // the default budget is too tight once the suite runs the whole file.
  test.setTimeout(360_000)

  // The details panel carries the record's own explanation of why an event has
  // no position. At a short viewport the panel used to render past the bottom of
  // the workspace, where nothing could scroll to it, so the explanation was the
  // text that fell off. The panel must stay inside the viewport, stay clear of
  // the time controls, and scroll to its own end.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await page.goto(QIN)
    await openPanel(page)

    await selectRow(page, "lks:event:han-nanyang-cession-231")

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

    // Scroll the panel to its end: the explanation of why 南陽 has no position is
    // in the panel, and the chapter's recorded decision and review status are the
    // last thing it carries. Both have to be reachable — either because the panel
    // fits at this size or because it scrolls to them.
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
    expect(reached.text, `status at ${viewport.width}`).toContain("Owner-approved for release")
    expect(reached.text, `review status at ${viewport.width}`).toContain("Self-reviewed by")
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
  // cards are peers, and each states the decision its ledger row records.
  await expect(tang).toContainText("Owner-approved for release, 2026-09-25")
  await expect(tang).toContainText("Not independent or specialist review")
  await expect(qin).toContainText("Owner-approved for release, 2026-09-27")
  await expect(qin).toContainText("Not independent or specialist review")

  // The page is a reader's entry point: no review categories, no contract
  // records, and no comparison-harness rationale.
  const mainText = await page.locator("main").innerText()

  expect(mainText).not.toContain("Reviewed chapter")
  expect(mainText).not.toContain("Comparison chapter")
  expect(mainText).not.toContain("comparison fixture")
  expect(mainText).not.toContain("comparison harness")
  expect(mainText).not.toContain("map treatments")
  expect(mainText).not.toContain("treatment comparison")
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
  // recorded decision and names the chapter the card named.
  await qin.getByRole("link", { name: /Open the chapter/ }).click()

  await expect(page).toHaveURL(new RegExp(`${QIN}$`))
  await expect(page).toHaveTitle(/The end of the state of Han/)
  await expect(page.locator("#chapter-decision")).toHaveText(
    "Owner-approved for release, 2026-09-27",
  )

  // Discoverability holds at the reviewed sizes, with no horizontal overflow.
  await page.goto("/")

  for (const viewport of VIEWPORTS) {
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
