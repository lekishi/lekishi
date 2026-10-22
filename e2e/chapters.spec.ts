import { expect, test, type Page } from "@playwright/test"
import {
  QIN,
  TANG,
  card,
  collectProblems,
  expectFrameApart,
  layoutOf,
  openChapter,
  openExplore,
  openSwitcher,
  playheadYear,
  raiseSheet,
  searchChapter,
  selectEvent,
  setWindow,
  sheet,
  sheetHandle,
} from "./workspace"
import {
  TANG_DECISION,
  QIN_DECISION,
  approved,
  decisionElement,
  servedChapters,
  sortedAttribute,
} from "./approvals"

/**
 * Browser checks for the chapter routes and the screens around the atlas.
 *
 * Every chapter the site serves renders through one route and one workspace, so
 * these checks are the shared reader loop in a real browser: the chapter's own
 * name, window, and recorded decision before any script runs, the same explore
 * list, search, story navigation, sources, and dispute cues for both chapters,
 * the address that links any view (RFD 5's URL contract) and Back and Forward
 * through it, the search dialog, the chapter switcher, the About sheet, the
 * phone sheet, the home page, the legacy routes still resolving, and the frame
 * staying apart at every reviewed size. The default target is the built
 * artifact served as files (`pnpm e2e`); the same checks run against the
 * development server with `LEKISHI_E2E_MODE=dev pnpm e2e`.
 */

const DEATH_EVENT = "lks:event:hanfei-death-233"
const DRIFT_EVENT = "lks:event:kiyokawa-drift-753"
const HONOURS_EVENT = "lks:event:kiyokawa-honours-779"
const CESSION_EVENT = "lks:event:han-nanyang-cession-231"

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 820, height: 634 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]

/** The About sheet: the one place the chapter's editorial status is stated. */
async function openAbout(page: Page): Promise<void> {
  await page.locator("#atlas-about-open").click()
  await expect(page.locator("dialog#atlas-about")).toBeVisible()
}

async function closeAbout(page: Page): Promise<void> {
  await page.locator("dialog#atlas-about").getByRole("button", { name: "Close About" }).click()
  await expect(page.locator("dialog#atlas-about")).toBeHidden()
}

/** The card's title, which names the selected record. */
function cardTitle(page: Page) {
  return page.locator("#atlas-selection-title")
}

test("serves the Tang chapter as an ordinary chapter page", async ({ page, request }) => {
  // Before any script runs, the page is the chapter: its name, its window, and
  // the decision its manifest records, with the review it has not had.
  const html = await (await request.get(TANG)).text()

  expect(html).toMatch(decisionElement(TANG_DECISION))

  // An approval keeps the specialist caveat; a draft says it is a preview instead.
  if (approved("tang-mission-750-754")) {
    expect(html).toContain("Not independent or specialist review")
  }

  const problems = collectProblems(page)

  await openChapter(page, TANG)

  await expect(page).toHaveTitle(/The embassy to Tang China · Lekishi/)
  // Once the workspace is up, the prerendered scope gives way to it.
  await expect(page.locator("#chapter-scope")).toHaveCount(0)

  // The workspace names the chapter in the date bar (the switcher on wide
  // layouts), and states the decision recorded on it once, in About.
  if ((await layoutOf(page)) !== "phone") {
    await expect(page.locator("#atlas-chapter-switcher")).toContainText("The embassy to Tang China")
  }

  // The frame itself (everything outside its dialogs) never repeats it.
  const frameText = await page.getByTestId("atlas-workspace").evaluate((root) => {
    const copy = root.cloneNode(true) as HTMLElement
    copy.querySelectorAll("dialog").forEach((dialog) => dialog.remove())
    return copy.textContent ?? ""
  })

  expect(frameText).not.toContain("Owner-approved")
  await openAbout(page)
  await expect(page.locator("#atlas-about-decision")).toHaveText(TANG_DECISION)
  await expect(page.locator("dialog#atlas-about")).toContainText("750–754")
  await closeAbout(page)

  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(25)

  // A chapter's own year text: the CE window prints as years, never as BCE.
  const listText = await page.getByTestId("atlas-event-list").innerText()

  expect(listText).not.toContain("BCE")
  await expect(playheadYear(page)).toHaveText("750")

  expect(problems).toEqual([])
})

test("serves the Qin chapter through the same route with its own window and BCE years", async ({
  page,
  request,
}) => {
  const html = await (await request.get(QIN)).text()

  expect(html).toMatch(decisionElement(QIN_DECISION))
  expect(html).toContain("233 BCE–226 BCE")

  const problems = collectProblems(page)

  await openChapter(page, QIN)

  await expect(page).toHaveTitle(/The end of the state of Han · Lekishi/)
  await openAbout(page)
  await expect(page.locator("#atlas-about-decision")).toHaveText(QIN_DECISION)

  // The About sheet's counts come from the records: one of the five events and
  // one of the four places have no sourced position.
  const about = page.locator("dialog#atlas-about")

  await expect(about).toContainText("233 BCE–226 BCE")
  await expect(about).toContainText("Self-reviewed by")
  await expect(about).toContainText("1 events · 1 places")
  await closeAbout(page)

  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(5)

  // Astronomical ordinals stay in the inputs; the BCE year is what the atlas
  // states, including the playhead.
  await expect(playheadYear(page)).toHaveText("233 BCE")

  if ((await layoutOf(page)) !== "phone") {
    await expect(page.locator("#atlas-window-start")).toHaveValue("-232")
    await expect(page.locator("#atlas-window-end")).toHaveValue("-225")
    await expect(page.locator("#atlas-window-start")).toHaveAttribute("aria-valuetext", "233 BCE")
    await expect(page.locator("#atlas-window-end")).toHaveAttribute("aria-valuetext", "226 BCE")
  }

  await raiseSheet(page)
  await expect(page.locator("#atlas-playhead-value")).toHaveText("233 BCE")

  // Every event states its own BCE year; the uncertain spans are possible at
  // the playhead rather than active; the cession is listed without a position
  // because the entries state no extent or seat.
  await openExplore(page, "events")

  const list = page.getByTestId("atlas-event-list")
  const listText = await list.innerText()

  expect(listText).toContain("233 BCE")
  expect(listText).toContain("226 BCE")
  expect(listText).not.toContain("drought")
  await expect(list.locator('[data-badge="possible"]').first()).toBeVisible()
  await expect(
    page.locator(`[data-event-id="${CESSION_EVENT}"] [data-badge="unlocated"]`),
  ).toBeVisible()
  await expect(page.locator(`[data-event-id="${CESSION_EVENT}"]`)).toContainText("南陽")

  expect(problems).toEqual([])
})

test("redirects the legacy routes to the chapters they served", async ({ page }) => {
  await page.goto("/atlas")
  await expect(page).toHaveURL(new RegExp(`${TANG}$`))
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

  await page.goto("/compare/qin")
  await expect(page).toHaveURL(new RegExp(`${QIN}$`))
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(playheadYear(page)).toHaveText("233 BCE")
})

test("replaces the workspace when the router moves between two chapters", async ({ page }) => {
  // SvelteKit reuses the page component for two values of the same dynamic route,
  // so this is the path where a mount-once workspace would leave the first
  // chapter's events and globe under the second chapter's name. The chapter
  // switcher's links are ordinary links the router intercepts.
  const problems = collectProblems(page)

  await openChapter(page, TANG)
  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(25)

  await openSwitcher(page)

  const switcher = page.locator("dialog#chapter-switcher")

  await expect(
    switcher.getByRole("link", { name: "The embassy to Tang China", exact: true }),
  ).toHaveAttribute("aria-current", "page")
  await switcher.getByRole("link", { name: "The end of the state of Han", exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`${QIN}$`))
  await expect(page).toHaveTitle(/The end of the state of Han/)
  await expect(playheadYear(page)).toHaveText("233 BCE")
  // One workspace, and it is the chapter the URL names.
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
  await openAbout(page)
  await expect(page.locator("#atlas-about-decision")).toHaveText(QIN_DECISION)
  await closeAbout(page)
  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(5)
  await expect(page.locator(`[data-event-id="${DEATH_EVENT}"]`)).toBeVisible()
  await expect(page.locator('[data-event-id="lks:event:appointment-750"]')).toHaveCount(0)

  if ((await layoutOf(page)) !== "phone") {
    await expect(page.locator("#atlas-window-start")).toHaveValue("-232")
  }

  // The globe moved too: it draws the Qin chapter's places, not Tang's.
  await expect(page.locator('[data-marker-id="lks:place:yunyang"]')).toHaveCount(1)
  await expect(page.locator('[data-marker-id="lks:place:heijo-palace"]')).toHaveCount(0)

  expect(problems).toEqual([])
})

test("keeps the workspace single and the chapter records on their own page", async ({ page }) => {
  for (const route of [TANG, QIN]) {
    await openChapter(page, route)
    await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
    await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
    await expect(page.getByText("Synthetic", { exact: false })).toHaveCount(0)
  }

  // The two chapters' events do not mix: the Tang chapter's list never carries a
  // Qin record and the other way round.
  await openChapter(page, TANG)
  await openExplore(page, "events")
  await expect(page.locator(`[data-event-id="${DEATH_EVENT}"]`)).toHaveCount(0)

  await openChapter(page, QIN)
  await openExplore(page, "events")
  await expect(page.locator('[data-event-id="lks:event:appointment-750"]')).toHaveCount(0)
})

test("searches both chapters by local script and romanized name", async ({ page }) => {
  // The Tang chapter: a romanized actor name, the local-script form, and a place
  // whose published reading aid is a diacritic-bearing romanization.
  await openChapter(page, TANG)
  await searchChapter(page, "Fujiwara no Kiyokawa")

  const results = page.getByTestId("atlas-search-results")

  await expect(results).toBeVisible()
  await expect(results.locator('[data-event-id="lks:event:appointment-750"]')).toBeVisible()

  await page.locator("#atlas-search").fill("東大寺")
  await expect(
    results.locator('[data-event-id="lks:event:todaiji-installation-754"]'),
  ).toBeVisible()

  // The diacritic-free spelling finds the same events as the published one.
  const resultIds = () =>
    results
      .locator("[data-event-id]")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))

  await page.locator("#atlas-search").fill("Otomo no Komaro")
  await expect.poll(async () => (await resultIds()).length).toBeGreaterThan(0)
  const withoutDiacritics = await resultIds()

  await page.locator("#atlas-search").fill("Ōtomo no Komaro")
  await expect.poll(resultIds).toEqual(withoutDiacritics)

  // A place the record names but the map does not show the event at is still
  // searchable: the return voyage's record references four places.
  await page.locator("#atlas-search").fill("Yakushima")
  await expect(results.locator('[data-event-id="lks:event:return-voyage-753"]')).toBeVisible()

  // Clearing the search brings the window's own list back.
  await page.locator("#atlas-search").fill("")
  await expect(page.getByTestId("atlas-event-list")).toBeVisible()
  await expect(results).toHaveCount(0)

  // The Qin chapter searches the same way, including its own dispute text.
  await openChapter(page, QIN)
  await searchChapter(page, "Yunyang")
  await expect(results.locator(`[data-event-id="${DEATH_EVENT}"]`)).toBeVisible()

  await page.locator("#atlas-search").fill("hereditary house")
  await expect(results.locator(`[data-event-id="${DEATH_EVENT}"]`)).toBeVisible()

  // A query nothing matches says so instead of showing the whole chapter.
  await page.locator("#atlas-search").fill("Xanadu")
  await expect(page.locator('#atlas-event-panel [data-empty="filtered"]')).toBeVisible()
  await expect(results).toHaveCount(0)
  await expect(page.getByTestId("atlas-event-list")).toHaveCount(0)
})

test("finds an event outside the window and keeps its details with the outside-time notice", async ({
  page,
}) => {
  // 藤原清河's posthumous honours are a 779 coda node, outside the chapter's
  // 750–754 window. Search reaches it, and selecting it keeps the details
  // readable while the window still excludes it.
  await openChapter(page, TANG)
  await setWindow(page, TANG, 753, 754)
  await searchChapter(page, "posthumous honours")

  const row = page.locator(
    `[data-testid="atlas-search-results"] [data-event-id="${HONOURS_EVENT}"]`,
  )

  await expect(row).toBeVisible()
  await expect(row.getByTestId("atlas-outside-badge")).toBeVisible()
  await selectEvent(page, HONOURS_EVENT)

  await expect(card(page)).toContainText("posthumous honours")
  await expect(page.locator("#atlas-outside-notice")).toBeVisible()

  // The event keeps no map mark while the window excludes it: with the search
  // cleared, the window's own list is what is left, and the event is not in it.
  await openExplore(page, "events")
  await page.locator("#atlas-search").fill("")
  await expect(
    page.locator(`[data-testid="atlas-event-list"] [data-event-id="${HONOURS_EVENT}"]`),
  ).toHaveCount(0)

  // The explicit return moves the window instead of silently undoing the change,
  // and the event is in the window's list afterwards.
  await page.locator("#atlas-search").fill("posthumous honours")
  await selectEvent(page, HONOURS_EVENT)
  await page.locator("#atlas-return-to-time").click()
  await expect(page.locator("#atlas-outside-notice")).toHaveCount(0)
  await expect(playheadYear(page)).toHaveText("779")
  await openExplore(page, "events")
  await page.locator("#atlas-search").fill("")
  await expect(
    page.locator(`[data-testid="atlas-event-list"] [data-event-id="${HONOURS_EVENT}"]`),
  ).toBeVisible()
})

test("navigates the chapter's story with explicit jumps", async ({ page }) => {
  await openChapter(page, QIN)
  await openExplore(page, "story")

  const steps = page.getByTestId("atlas-story-step")

  // The story keeps its own order: five event steps and four steps that
  // narrate a relationship, marked as such.
  await expect(steps).toHaveCount(9)
  await expect(steps.getByRole("img", { name: "Relationship" })).toHaveCount(4)

  await steps.nth(2).click()

  await expect(card(page)).toBeVisible()
  await expect(cardTitle(page)).toHaveText(
    "韓非 is detained and dies at 雲陽, 233 BCE — a disputed account",
  )
  // The jump moved the window to the event's own time: the playhead lands in the
  // event's span.
  await expect(playheadYear(page)).toHaveText("233 BCE")

  // The jump selected the event, so the events surface lists it as current.
  await openExplore(page, "events")
  await expect(
    page.locator(`[data-testid="atlas-event-list"] [data-event-id="${DEATH_EVENT}"]`),
  ).toHaveAttribute("aria-current", "true")

  // "Next in story" is an explicit jump, separate from chronological stepping.
  // The phone list gives the sheet back to the card when an event is chosen.
  await selectEvent(page, DEATH_EVENT)
  await page.locator("#atlas-story-next").click()
  await expect(cardTitle(page)).toContainText("Han cedes 南陽")
  await page.locator("#atlas-story-previous").click()
  await expect(cardTitle(page)).toContainText("韓非 is detained and dies at 雲陽")

  // A step that narrates a relationship is a jump too: it selects nothing, and
  // shows the story's caption with the same previous and next.
  await page.locator("#atlas-story-previous").click()
  const summary = page.locator("#atlas-story-summary")

  await expect(summary).toBeVisible()
  await expect(summary).toContainText("The submission request to Qin")
  await expect(summary).toContainText("2 of 9")
  await expect(card(page)).toHaveCount(0)
  await page.locator("#atlas-story-previous").click()
  await expect(cardTitle(page)).toContainText("The Han king's submission")
  await expect(page.locator("#atlas-story-previous")).toBeDisabled()
})

test("moves Back and Forward through story jumps", async ({ page }) => {
  await openChapter(page, TANG)
  await openExplore(page, "story")

  // A story jump is a new history entry, written into the address (with the
  // window it moved to, when that is not the chapter's default).
  await page.getByTestId("atlas-story-step").nth(2).click()
  await expect(cardTitle(page)).toContainText("吉備真備 is appointed vice-envoy")
  await expect(page).toHaveURL(/\?event=kibi-appointment-751(&|$)/)

  await page.locator("#atlas-story-next").click()
  await expect(cardTitle(page)).toContainText("The envoys pay court")
  await expect(page).toHaveURL(/\?event=court-audience-752(&|$)/)

  // Back returns to the previous step without a page load.
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1))
  await page.goBack()
  await expect(page).toHaveURL(/\?event=kibi-appointment-751(&|$)/)
  await expect(cardTitle(page)).toContainText("吉備真備 is appointed vice-envoy")
  await expect(playheadYear(page)).toHaveText("751")

  // And once more to where the chapter opened, with nothing selected.
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`${TANG}$`))
  await expect(card(page)).toHaveCount(0)

  await page.goForward()
  await expect(page).toHaveURL(/\?event=kibi-appointment-751(&|$)/)
  await expect(cardTitle(page)).toContainText("吉備真備 is appointed vice-envoy")
  await page.goForward()
  await expect(cardTitle(page)).toContainText("The envoys pay court")

  // The same document throughout: Back and Forward moved the workspace, not
  // the page.
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)
})

test("opens the view a link names", async ({ page }) => {
  // An event: the card is open, the arrival plate names it, and the playhead
  // is at the event's time.
  await openChapter(page, `${TANG}?event=akimeya-landfall-753`)
  await expect(cardTitle(page)).toHaveText("The landfall at 秋妻屋浦")
  await expect(page.getByTestId("atlas-arrival")).toContainText("The landfall at 秋妻屋浦")
  await expect(playheadYear(page)).toHaveText("753")

  // The reader's next action retires the arrival plate.
  await page.locator("#atlas-step-forward").click()
  await expect(page.getByTestId("atlas-arrival")).toHaveCount(0)

  // A story step, counted from one as a reader counts it.
  await openChapter(page, `${TANG}?step=7`)
  await expect(cardTitle(page)).toHaveText("The envoys invite 鑒眞 at 延光寺, 753")
  await expect(page.getByTestId("atlas-arrival")).toContainText("Story 7 of 38")
  await expect(card(page)).toContainText("7 of 38")

  // A place: its own card.
  await openChapter(page, `${TANG}?place=heijo-palace`)
  await expect(card(page)).toHaveAttribute("data-selection-kind", "place")
  await expect(page.getByTestId("atlas-arrival")).toContainText("平城宮")

  // A window: the list holds that window's events.
  await openChapter(page, `${TANG}?from=753&to=754`)
  await openExplore(page, "events")
  await expect(page.locator('[data-event-id="lks:event:appointment-750"]')).toHaveCount(0)
  await expect(page.locator('[data-event-id="lks:event:naniwa-754"]')).toBeVisible()
  await expect(playheadYear(page)).toHaveText("753")

  // An event outside the linked window widens it, and the plate says to what:
  // the event is in the window's list, with no outside-time notice.
  await openChapter(page, `${TANG}?from=753&to=754&event=appointment-750`)
  await expect(cardTitle(page)).toContainText("The court appoints the embassy")
  await expect(page.locator("#atlas-outside-notice")).toHaveCount(0)
  await expect(page.getByTestId("atlas-arrival")).toContainText("750–754")
  await openExplore(page, "events")
  await expect(
    page.locator('[data-testid="atlas-event-list"] [data-event-id="lks:event:appointment-750"]'),
  ).toBeVisible()

  // A coda node outside the default window widens it just as far.
  await openChapter(page, `${TANG}?event=jianzhen-death-763`)
  await expect(page.locator("#atlas-outside-notice")).toHaveCount(0)
  await expect(page.getByTestId("atlas-arrival")).toContainText("750–763")

  if ((await layoutOf(page)) !== "phone") {
    await expect(page.locator("#atlas-window-end")).toHaveValue("763")
  }
})

test("says so when a link names a record the chapter does not have", async ({ page }) => {
  const problems = collectProblems(page)

  for (const query of ["?event=no-such-event", "?place=no-such-place", "?step=99"]) {
    await openChapter(page, `${TANG}${query}`)

    // The chapter opens at its start, and the plate says what was not found
    // instead of silently showing something else.
    const arrival = page.getByTestId("atlas-arrival")

    await expect(arrival, query).toBeVisible()
    await expect(arrival, query).toContainText(query.split("=")[1]!)
    await expect(card(page), query).toHaveCount(0)
    await expect(playheadYear(page), query).toHaveText("750")

    // The stale address stays as the reader followed it until they move.
    expect(new URL(page.url()).search).toBe(query)
  }

  // Dismissing the plate keeps the chapter where it is.
  await page.getByTestId("atlas-arrival").getByRole("button", { name: "Dismiss" }).click()
  await expect(page.getByTestId("atlas-arrival")).toHaveCount(0)
  await expect(playheadYear(page)).toHaveText("750")
  await openExplore(page, "events")
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(25)

  expect(problems).toEqual([])
})

test("searches every chapter from the search dialog", async ({ page }) => {
  const problems = collectProblems(page)

  // From the home page: `/` opens search, a name in the record's own script and
  // its romanization find the same person, and Enter opens the active result.
  await page.goto("/")
  await expect(page.getByTestId("home-search")).toBeVisible()

  const dialog = page.locator("dialog#search-dialog")
  const input = page.locator("#search-dialog-input")
  const hits = page.getByTestId("search-hit")
  const hrefs = () => hits.evaluateAll((links) => links.map((link) => link.getAttribute("href")))

  // The home search is prerendered, so it is visible before the page hydrates
  // and the `/` shortcut exists; a press in that gap does nothing. Press again
  // until the dialog opens, skipping the press once it is visible. A stray `/`
  // in the input would be harmless: the search below fills, not appends.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press("/")
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass()
  await expect(input).toBeFocused()

  // The person leads both result lists. The script form also matches the
  // records' own text, where the name is written that way, so its list is the
  // longer one; every romanized result is among it.
  await input.fill("鑒眞")
  await expect(hits.first()).toContainText("Person")
  await expect(hits.first()).toContainText("Jianzhen")
  const byScript = await hrefs()
  const person = await hits.first().innerText()

  await input.fill("Jianzhen")
  await expect(hits.first()).toHaveText(person)
  const byRomanization = await hrefs()

  expect(byRomanization.length).toBeGreaterThan(1)
  expect(byScript).toEqual(expect.arrayContaining(byRomanization))
  await expect(hits.first()).toHaveAttribute("aria-selected", "true")

  // The arrow keys move the active result; every result is a real link.
  await input.press("ArrowDown")
  await expect(hits.nth(1)).toHaveAttribute("aria-selected", "true")
  await expect(input).toHaveAttribute("aria-activedescendant", "search-hit-1")
  await input.press("ArrowUp")
  await expect(hits.first()).toHaveAttribute("aria-selected", "true")

  const target = await hits.first().getAttribute("href")

  expect(target).toMatch(new RegExp(`^${TANG}\\?event=`))
  await input.press("Enter")
  await expect(page).toHaveURL(new RegExp(`${target!.replace("?", "\\?")}$`))
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toContainText("鑒眞")

  // Inside a chapter, a result in another chapter navigates to it; results are
  // grouped by chapter, the open chapter first, and can be scoped to it.
  await page.keyboard.press("Escape")
  await page.locator("#atlas-step-back").focus()
  await page.keyboard.press("/")
  await expect(dialog).toBeVisible()
  await input.fill("韓非")

  const qinHit = hits.filter({ hasText: "韓非 is detained" })

  await expect(qinHit).toHaveAttribute("href", `${QIN}?event=hanfei-death-233`)

  // Scoped to the open chapter, the Qin results are gone.
  await dialog.getByRole("radio", { name: "The embassy to Tang China" }).click()
  await expect(qinHit).toHaveCount(0)
  await dialog.getByRole("radio", { name: "All chapters" }).click()

  await qinHit.click()
  await expect(page).toHaveURL(new RegExp(`${QIN}\\?event=hanfei-death-233$`))
  await expect(cardTitle(page)).toContainText("韓非 is detained and dies at 雲陽")
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)

  // A result in the chapter already open moves the workspace without a load.
  await page.keyboard.press("/")
  await expect(dialog).toBeVisible()
  await input.fill("南陽")
  await hits.filter({ hasText: "Han cedes 南陽" }).click()
  await expect(dialog).toBeHidden()
  await expect(cardTitle(page)).toContainText("Han cedes 南陽")
  await expect(page).toHaveURL(/\?event=han-nanyang-cession-231(&|$)/)

  // The date bar's search button opens the same dialog; nothing matching says so.
  await page.getByTestId("atlas-open-search").click()
  await expect(dialog).toBeVisible()
  await input.fill("Xanadu")
  await expect(page.getByTestId("search-empty")).toBeVisible()
  await expect(hits).toHaveCount(0)

  expect(problems).toEqual([])
})

test("switches chapters and offers to continue where the reader was", async ({ page }) => {
  // Leave the Qin chapter at a story step, then open the switcher from Tang.
  await openChapter(page, `${QIN}?event=hanfei-death-233`)
  await expect(card(page)).toBeVisible()
  await openChapter(page, TANG)
  await openSwitcher(page)

  const switcher = page.locator("dialog#chapter-switcher")

  // Every chapter, on the time ribbon and in the list, the open one marked.
  const served = (await servedChapters(page.request)).map((id) => `/chapters/${id}`)

  await expect
    .poll(() => sortedAttribute(switcher.getByTestId("time-ribbon").getByRole("link"), "href"))
    .toEqual(served)
  await expect(switcher.locator("ul > li")).toHaveCount(served.length)
  await expect
    .poll(() => sortedAttribute(switcher.locator("ul > li > div > a"), "href"))
    .toEqual(served)
  await expect(switcher.locator('a[aria-current="page"]')).toHaveAttribute("href", TANG)

  // The chapter the reader left offers to continue at that position.
  const resume = switcher.getByRole("link", { name: /Continue at/ })

  await expect(resume).toHaveCount(1)
  await expect(resume).toHaveAttribute("href", `${QIN}?event=hanfei-death-233`)
  await expect(resume).toContainText("韓非 is detained")

  // Escape closes it and leaves the chapter as it was.
  await page.keyboard.press("Escape")
  await expect(switcher).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${TANG}$`))

  await openSwitcher(page)
  await resume.click()
  await expect(page).toHaveURL(new RegExp(`${QIN}\\?event=hanfei-death-233$`))
  await expect(cardTitle(page)).toContainText("韓非 is detained")
})

test("explains the chapter once, in the About sheet", async ({ page }) => {
  await openChapter(page, TANG)
  await openAbout(page)

  const about = page.locator("dialog#atlas-about")

  await expect(page.locator("#atlas-about-decision")).toHaveText(TANG_DECISION)
  await expect(about).toContainText("Self-reviewed by")
  // The coverage statement is the chapter's own, and the counts are the records'.
  await expect(about).toContainText("Primary mission window 750–754")
  await expect(about).toContainText("25 + 5 coda")
  await expect(about.getByRole("link", { name: "Full attribution" })).toHaveAttribute(
    "href",
    "/globe/ATTRIBUTION.txt",
  )

  // It is modal: the page behind is inert, and Escape closes it.
  await page.keyboard.press("Escape")
  await expect(about).toBeHidden()
  await expect(page.locator("#atlas-about-open")).toBeVisible()

  // The card never repeats the decision beside an event.
  await selectEvent(page, "lks:event:appointment-750")
  await expect(card(page)).not.toContainText("Owner-approved")
})

test("steps the phone sheet through its detents", async ({ page }) => {
  await openChapter(page, TANG)
  test.skip((await layoutOf(page)) !== "phone", "The bottom sheet is the phone layout.")

  const handle = sheetHandle(page)

  // Peek: the dial and the legend, nothing else.
  await expect(sheet(page)).toHaveAttribute("data-detent", "peek")
  await expect(page.getByTestId("atlas-dial")).toBeVisible()
  await expect(page.getByTestId("atlas-legend")).toBeVisible()
  await expect(page.getByTestId("atlas-timeline")).toHaveCount(0)
  await expect(handle).toHaveAccessibleName(/^Expand/)

  // Half: the strip and the list; the legend gives way.
  await handle.click()
  await expect(sheet(page)).toHaveAttribute("data-detent", "half")
  await expect(page.getByTestId("atlas-timeline")).toBeVisible()
  await expect(page.locator("#atlas-event-panel")).toBeVisible()
  await expect(page.getByTestId("atlas-legend")).toHaveCount(0)

  // Full, then the handle collapses it back to peek.
  await handle.click()
  await expect(sheet(page)).toHaveAttribute("data-detent", "full")
  await expect(handle).toHaveAccessibleName(/^Collapse/)
  const full = await sheet(page).boundingBox()
  const viewport = page.viewportSize()!

  expect(full!.y + full!.height).toBeLessThanOrEqual(viewport.height + 1)
  await handle.click()
  await expect(sheet(page)).toHaveAttribute("data-detent", "peek")
  await expect(page.getByTestId("atlas-legend")).toBeVisible()

  // Choosing an event raises the sheet to half with its card.
  await openExplore(page, "events")
  await page.locator('[data-event-id="lks:event:yaku-arrival-753"]').click()
  await expect(sheet(page)).toHaveAttribute("data-detent", "half")
  await expect(card(page)).toBeVisible()
  await expect(sheet(page).getByRole("heading", { level: 2 }).first()).toContainText("益救島")

  // The Sources orb opens the sources list at full.
  await page.getByTestId("atlas-layers").getByRole("button", { name: "Sources" }).click()
  await expect(sheet(page)).toHaveAttribute("data-detent", "full")
  await expect(page.getByTestId("atlas-sources")).toBeVisible()
})

test("shows the sources and locators behind a selected event", async ({ page }) => {
  await openChapter(page, QIN)
  await selectEvent(page, DEATH_EVENT)

  const citations = page.getByTestId("atlas-citations")

  await expect(citations).toBeVisible()
  // The locator is the record's own, and the quoted passage is shown where the
  // source's recorded terms permit quoting.
  await expect(citations).toContainText("卷六 秦始皇本紀")
  await expect(citations).toContainText("Public domain")
  await expect(card(page).locator("blockquote")).toContainText(
    "韓非使秦，秦用李斯謀，留非，非死雲陽。",
  )

  // The chapter's source list states each source's kind, attribution, and reuse
  // terms, links only the identifier the record carries, and marks what the
  // selection cites.
  await openExplore(page, "sources")

  const sources = page.getByTestId("atlas-sources")

  await expect(page.getByTestId("atlas-source")).toHaveCount(4)
  await expect(sources).toContainText("史記")
  await expect(sources).toContainText("Public domain")
  await expect(sources).toContainText("CC0 1.0")
  await expect(sources.locator("a", { hasText: "zh.wikisource.org" }).first()).toBeVisible()
  await expect(sources.locator('[data-cited="true"]').first()).toBeVisible()

  // The Tang chapter's own source list states its sources' recorded terms too,
  // including the one whose rights are reserved: the atlas states them and links
  // only the identifiers the records carry.
  await openChapter(page, TANG)
  await openExplore(page, "sources")

  const tangSources = page.getByTestId("atlas-sources")

  await expect(tangSources).toContainText("All rights reserved")
  await expect(tangSources).toContainText("井上賢一")
  await expect(tangSources.locator("a", { hasText: "kotobank.jp" }).first()).toBeVisible()
  await expect(tangSources.locator("a", { hasText: "wikipedia.org" })).toHaveCount(0)
})

test("shows the disputed account on both chapters", async ({ page }) => {
  // The Qin chapter's disputed death: the badge in the list and the accounts
  // with their locators in the card.
  await openChapter(page, QIN)
  await openExplore(page, "events")

  const qinRow = page.locator(`[data-event-id="${DEATH_EVENT}"]`)

  await expect(qinRow.getByTestId("atlas-dispute-badge")).toBeVisible()
  await selectEvent(page, DEATH_EVENT)

  const dispute = page.getByTestId("atlas-dispute")

  await expect(dispute).toBeVisible()
  await expect(dispute.locator('[data-badge="disputed"]')).toBeVisible()
  await expect(dispute).toContainText("王安五年")
  await expect(dispute).toContainText("韓王安六年")
  await expect(dispute).toContainText("hereditary house")
  await expect(dispute).toContainText("卷四十五 韓世家")

  // The card keeps the record's own uncertainty alongside the dispute, and
  // states that the place is shown at a label anchor rather than a site.
  await expect(card(page).locator('[data-badge="possible"]')).toContainText("uncertain span")
  await expect(card(page).locator('[data-badge="anchor"]')).toBeVisible()
  // The disputed event's place keeps its mark on the map.
  await expect(page.locator('[data-marker-id="lks:place:yunyang"]')).toHaveCount(1)

  // The Tang chapter shows its own disputed record the same way. 鑒眞's death is
  // a coda node at 763, outside the chapter's 750–754 window.
  await openChapter(page, TANG)
  await setWindow(page, TANG, 750, 779)
  await openExplore(page, "events")

  const tangRow = page.locator('[data-event-id="lks:event:jianzhen-death-763"]')

  await expect(tangRow.getByTestId("atlas-dispute-badge")).toBeVisible()
  await selectEvent(page, "lks:event:jianzhen-death-763")
  await expect(page.getByTestId("atlas-dispute")).toBeVisible()
  await expect(page.getByTestId("atlas-dispute").locator('[data-badge="disputed"]')).toBeVisible()
})

test("keeps an unplaced event listable and explains why it has no position", async ({ page }) => {
  await openChapter(page, TANG)

  // 驩州 is named by the published record, but no identification is sourced.
  await selectEvent(page, DRIFT_EVENT)

  await expect(card(page)).toContainText("驩州")
  await expect(card(page).locator('[data-empty="uncovered"]')).toContainText(
    "no identification is sourced for it",
  )
  await expect(page.locator("#atlas-follow-toggle")).toBeDisabled()

  // A label anchor states the record's own note instead of an unplaced reason.
  await searchChapter(page, "節刀")
  await selectEvent(page, "lks:event:sekito-752")
  await expect(card(page).getByTestId("atlas-place-note")).toContainText("平城宮")
  await expect(card(page).locator('[data-empty="uncovered"]')).toHaveCount(0)
})

test("reaches search, the story, and a story jump with the keyboard", async ({ page }) => {
  // Keyboard-only exploration: the search field, the list's tabs, the story's
  // steps, and the card's own story jumps are all reachable without a pointer
  // (RFD 4 AC6).
  await openChapter(page, QIN)
  await openExplore(page, "events")

  await page.locator("#atlas-search").focus()
  await page.keyboard.type("Yunyang")

  const row = page.locator(`[data-testid="atlas-search-results"] [data-event-id="${DEATH_EVENT}"]`)

  await expect(row).toBeVisible()
  await row.focus()
  await page.keyboard.press("Enter")
  await expect(cardTitle(page)).toContainText("韓非 is detained")

  // The list's tabs are a tablist with roving focus: the arrow keys move
  // between them and select as they go.
  await openExplore(page, "events")
  await page.locator("#atlas-explore-tab-events").focus()
  await page.keyboard.press("ArrowLeft")
  await expect(page.locator("#atlas-explore-tab-story")).toBeFocused()
  await expect(page.locator("#atlas-explore-tab-story")).toHaveAttribute("aria-selected", "true")
  await expect(page.getByTestId("atlas-story-step").first()).toBeVisible()

  await page.getByTestId("atlas-story-step").first().focus()
  await page.keyboard.press("Enter")
  await expect(cardTitle(page)).toContainText("The Han king's submission and 韓非's embassy")

  // And the card's own jumps work from the keyboard, through the summary step.
  await expect(page.locator("#atlas-story-next")).toBeVisible()
  await page.locator("#atlas-story-next").focus()
  await page.keyboard.press("Enter")
  await expect(page.locator("#atlas-story-summary")).toContainText("The submission request to Qin")
  await page.locator("#atlas-story-next").focus()
  await page.keyboard.press("Enter")
  await expect(cardTitle(page)).toContainText("韓非 is detained")
})

test("keeps the chapter overlays apart at every reviewed size", async ({ page }) => {
  // Four viewports, several states each, on software WebGL: every click and
  // every resize costs seconds, so this check needs more than the default budget.
  test.setTimeout(420_000)

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await openChapter(page, QIN)
    const at = `at ${viewport.width}`

    await expectFrameApart(page, `default ${at}`)

    // The legend folds on tablets and phones; unfolded it still stays apart.
    const legendButton = page.getByTestId("atlas-legend").getByRole("button", { name: "Legend" })

    if ((await legendButton.getAttribute("aria-expanded")) !== "true") {
      await legendButton.click()
      await expectFrameApart(page, `legend open ${at}`)
      await legendButton.click()
    }

    // The explore list on each tab.
    for (const tab of ["story", "sources", "events"] as const) {
      await openExplore(page, tab)
      await expectFrameApart(page, `${tab} tab ${at}`)
    }

    await selectEvent(page, DEATH_EVENT)
    await expect(page.getByTestId("atlas-dispute")).toBeVisible()
    await expectFrameApart(page, `selected ${at}`)

    // The story and sources surfaces are reachable with a selection too.
    for (const tab of ["story", "sources", "events"] as const) {
      await openExplore(page, tab)
      await expectFrameApart(page, `${tab} tab with selection ${at}`)
    }

    // A summary step's card.
    await openExplore(page, "story")
    await page.getByTestId("atlas-story-step").nth(1).click()
    await expect(page.locator("#atlas-story-summary")).toBeVisible()
    await expectFrameApart(page, `story summary ${at}`)

    // A link's arrival plate with its card.
    await openChapter(page, `${QIN}?event=hanfei-death-233`)
    await expect(page.getByTestId("atlas-arrival")).toBeVisible()
    await expectFrameApart(page, `arrival ${at}`)
  }
})

test("keeps the selected event's explanation reachable at every reviewed size", async ({
  page,
}) => {
  test.setTimeout(360_000)

  // The card carries the record's own explanation of why an event has no
  // position. At a short viewport a card used to render past the bottom of the
  // workspace, where nothing could scroll to it, so the explanation was the text
  // that fell off. The card must stay inside the viewport, clear of the dial and
  // the strip, and scroll to its own end; the chapter's decision and review
  // status are in About, which is reachable at every size too.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await openChapter(page, QIN)
    await selectEvent(page, CESSION_EVENT)

    const geometry = await card(page).evaluate((element) => {
      const box = element.getBoundingClientRect()
      const controls = ['[data-testid="atlas-dial"]', '[data-testid="atlas-timeline"]']
        .map((selector) => document.querySelector(selector))
        .filter((found): found is Element => found !== null)
        .filter((found) => !found.closest("section[data-detent]"))
        .map((found) => found.getBoundingClientRect())

      return {
        bottom: box.bottom,
        viewportHeight: window.innerHeight,
        overControls: controls.some(
          (control) =>
            control.right > box.left &&
            box.right > control.left &&
            control.bottom > box.top &&
            box.bottom > control.top,
        ),
      }
    })

    expect(geometry.overControls, `card over the controls at ${viewport.width}`).toBe(false)

    // The explanation and the card's footer are reachable: scrolled into view,
    // each is inside the viewport and on top where it is drawn.
    for (const [what, target] of [
      ["no-position explanation", card(page).locator('[data-empty="uncovered"]')],
      ["record note", card(page).getByTestId("atlas-selection-note")],
      ["sources", card(page).getByTestId("atlas-citations")],
      ["story footer", page.locator("#atlas-story-next")],
    ] as const) {
      // Scrolled the way a reader reads it, from its first line. Playwright's
      // `scrollIntoViewIfNeeded` centres in Chromium but aligns the end in
      // Firefox, and an element taller than the phone sheet's visible part then
      // has its first line above the sheet, so the check judged the scroll
      // rather than the layout.
      await target.evaluate((element) =>
        element.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" }),
      )
      const reached = await target.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const x = box.left + Math.min(box.width / 2, 20)
        const y = box.top + Math.min(box.height / 2, 10)
        const hit = document.elementFromPoint(x, y)

        return {
          inside: box.top >= -1 && box.top + Math.min(box.height, 20) <= window.innerHeight + 1,
          onTop: hit !== null && (hit === element || element.contains(hit)),
        }
      })

      expect(reached, `${what} at ${viewport.width}`).toEqual({ inside: true, onTop: true })
    }

    await expect(card(page).getByTestId("atlas-selection-note")).toContainText(
      "state no extent or seat",
    )
    await expect(card(page).locator('[data-empty="uncovered"]')).toContainText("no position")

    // The card's frame stays inside the viewport.
    const box = (await card(page).boundingBox())!
    const inSheet = (await layoutOf(page)) === "phone"

    if (!inSheet) {
      expect(box.y + box.height, `card bottom at ${viewport.width}`).toBeLessThanOrEqual(
        geometry.viewportHeight + 1,
      )
    }

    // The decision and review status: one press away, and the dialog fits.
    await openAbout(page)
    const about = page.locator("dialog#atlas-about")
    const aboutBox = (await about.boundingBox())!

    expect(aboutBox.y + aboutBox.height).toBeLessThanOrEqual(viewport.height + 1)
    expect(aboutBox.x + aboutBox.width).toBeLessThanOrEqual(viewport.width + 1)
    await expect(page.locator("#atlas-about-decision")).toHaveText(QIN_DECISION)
    await expect(about).toContainText("Self-reviewed by")
    const attribution = about.getByRole("link", { name: "Full attribution" })

    await attribution.scrollIntoViewIfNeeded()
    await expect(attribution).toBeInViewport()
    await closeAbout(page)
  }
})

test("presents both chapters from the root page as peer entries", async ({ page }) => {
  const problems = collectProblems(page)

  await page.goto("/")

  // Every served chapter has a card, drafts included when the build serves them.
  const served = await servedChapters(page.request)
  const cards = page.locator("[data-chapter-id]")

  await expect.poll(() => sortedAttribute(cards, "data-chapter-id")).toEqual(served)

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

  // An approved chapter's card states no decision (the owner's decision of
  // 2026-10-20); the chapter's page and About sheet state it. A draft's card
  // says it is a draft.
  for (const [card, id, decision] of [
    [tang, "tang-mission-750-754", TANG_DECISION],
    [qin, "qin-conquest-han-233-226", QIN_DECISION],
  ] as const) {
    if (approved(id)) {
      await expect(card).not.toContainText(decision)
    } else {
      await expect(card).toContainText(decision)
    }
  }

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

  // Search is the page's primary action, ahead of the chapter entries; the time
  // ribbon places every chapter on one line of time.
  const order = await page.evaluate(() => {
    const search = document.querySelector('[data-testid="home-search"]')
    const chapter = document.querySelector("[data-chapter-id]")

    return search !== null && chapter !== null
      ? Boolean(search.compareDocumentPosition(chapter) & Node.DOCUMENT_POSITION_FOLLOWING)
      : null
  })

  expect(order).toBe(true)
  await expect
    .poll(() => sortedAttribute(page.getByTestId("time-ribbon").getByRole("link"), "href"))
    .toEqual(served.map((id) => `/chapters/${id}`))

  // A first visit offers nothing to continue.
  await expect(page.getByTestId("home-continue")).toHaveCount(0)

  // The Qin entry opens the Qin chapter, and that page names the chapter the
  // card named.
  await qin.getByRole("link", { name: /Open the chapter/ }).click()

  await expect(page).toHaveURL(new RegExp(`${QIN}$`))
  await expect(page).toHaveTitle(/The end of the state of Han/)
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

  // Discoverability holds at the reviewed sizes, with no horizontal overflow.
  // The chapter globe is drawn only where it is seen: wide screens with WebGL.
  await page.goto("/")

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await expect(cards).toHaveCount(served.length)
    await expect(tang).toBeVisible()
    await expect(qin).toBeVisible()
    await expect(page.getByTestId("home-search")).toBeVisible()

    if (viewport.width >= 1024) {
      await expect(page.getByTestId("chapter-globe")).toBeVisible()
    } else {
      await expect(page.getByTestId("chapter-globe")).toBeHidden()
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )

    expect(overflow, `horizontal overflow at ${viewport.width}`).toBeLessThanOrEqual(1)
  }

  expect(problems).toEqual([])
})

test("offers to continue where the reader left off", async ({ page }) => {
  // The position is kept on this device only, and the home page offers the
  // last one.
  await openChapter(page, `${QIN}?event=hanfei-death-233`)
  await expect(card(page)).toBeVisible()

  // A story jump moves the position; the remembered one is the latest.
  await page.locator("#atlas-story-next").click()
  await expect(cardTitle(page)).toContainText("Han cedes 南陽")

  await page.goto("/")

  const resume = page.getByTestId("home-continue")

  await expect(resume).toBeVisible()
  // The jump moved the window to the event's time, so the address carries it.
  await expect(resume).toHaveAttribute(
    "href",
    new RegExp(`^${QIN}\\?event=han-nanyang-cession-231(&|$)`),
  )
  await expect(resume).toContainText("Han cedes 南陽")
  await expect(resume).toContainText("The end of the state of Han")

  await resume.click()
  await expect(page).toHaveURL(new RegExp(`${QIN}\\?event=han-nanyang-cession-231(&|$)`))
  await expect(cardTitle(page)).toContainText("Han cedes 南陽")
})

test("switches between the Tang chapter's stories, with the story in the address", async ({
  page,
}) => {
  const crossings = "jianzhen-crossings-742-753"
  const option = (key: string) =>
    page.locator(`[data-testid="atlas-story-option"][data-story="${key}"]`)

  await openChapter(page, TANG)
  await openExplore(page, "story")

  await expect(page.getByTestId("atlas-story-option")).toHaveCount(2)
  await expect(option("tang-mission-750-754")).toHaveAttribute("aria-current", "true")

  await option(crossings).click()

  await expect(page).toHaveURL(new RegExp(`[?&]story=${crossings}(&|$)`))
  await expect(option(crossings)).toHaveAttribute("aria-current", "true")
  await expect(page.getByTestId("atlas-story-step").first()).toContainText("大明寺")

  // The first story is the chapter's own address, without `?story=`.
  await page.goBack()
  await expect(page).not.toHaveURL(/[?&]story=/)
  await expect(option("tang-mission-750-754")).toHaveAttribute("aria-current", "true")

  // The address alone opens the story it names.
  await openChapter(page, `${TANG}?story=${crossings}`)
  await openExplore(page, "story")
  await expect(option(crossings)).toHaveAttribute("aria-current", "true")
})
