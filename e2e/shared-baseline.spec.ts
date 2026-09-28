import { expect, test, type Page } from "@playwright/test"

/**
 * Gate 2: the shared runnable baseline.
 *
 * RFD 4's Gate 2 asks whether both scenarios run on the shared baseline with
 * comparable content, chapter routing, controls, search, selection, sources,
 * visible uncertainty and disputes, and time behavior — and it keeps the
 * treatment comparison behind that gate. These checks are the executed evidence:
 * the same criteria, run against both served chapters through the same route and
 * the same workspace, on the built artifact.
 *
 * Every check below is written twice — once per chapter — from one list, so a
 * criterion cannot be satisfied for one scenario and quietly skipped for the
 * other. The chapters differ in content (their own counts, windows, and
 * records); what must not differ is the behavior.
 */

type ChapterCase = {
  readonly id: string
  readonly name: string
  readonly decision: string
  readonly window: { readonly start: number; readonly end: number }
  /** The atlas's own year text for the window's ends, as the controls state them. */
  readonly windowLabels: { readonly start: string; readonly end: string }
  readonly counts: { readonly events: number; readonly story: number; readonly sources: number }
  readonly search: { readonly query: string; readonly eventId: string }
  readonly disputed: string
  /** A selection the window excludes: the record, how to find it, and the window that excludes it. */
  readonly outside: {
    readonly eventId: string
    readonly query: string
    readonly window: { readonly start: string; readonly end: string }
  }
}

const CHAPTERS: readonly ChapterCase[] = [
  {
    id: "tang-mission-750-754",
    name: "The embassy to Tang China",
    decision: "Owner-approved for release, 2026-09-25",
    window: { start: 750, end: 754 },
    windowLabels: { start: "750", end: "754" },
    counts: { events: 24, story: 37, sources: 11 },
    search: { query: "Fujiwara no Kiyokawa", eventId: "lks:event:appointment-750" },
    disputed: "lks:event:yaku-arrival-753",
    outside: {
      eventId: "lks:event:kiyokawa-honours-779",
      query: "posthumous honours",
      window: { start: "753", end: "754" },
    },
  },
  {
    id: "qin-conquest-han-233-226",
    name: "The end of the state of Han",
    decision: "Owner-approved for release, 2026-09-27",
    window: { start: -232, end: -225 },
    windowLabels: { start: "233 BCE", end: "226 BCE" },
    counts: { events: 5, story: 9, sources: 4 },
    search: { query: "Yunyang", eventId: "lks:event:hanfei-death-233" },
    disputed: "lks:event:hanfei-death-233",
    outside: {
      eventId: "lks:event:xinzheng-revolt-226",
      query: "revolt",
      window: { start: "-232", end: "-230" },
    },
  },
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

/** Opens the exploration panel when it is behind the phone drawer toggle. */
async function openPanel(page: Page): Promise<void> {
  const toggle = page.locator("#atlas-list-toggle")

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

async function selectRow(page: Page, eventId: string): Promise<void> {
  const row = page.locator(`[data-event-id="${eventId}"]`)

  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(page.getByTestId("atlas-selection")).toBeVisible()
}

/** The chapter's shell, before any script runs: the route and its own content. */
async function expectChapterShell(page: Page, chapter: ChapterCase): Promise<void> {
  await expect(page).toHaveTitle(new RegExp(`${chapter.name} · Lekishi`))
  await expect(page.locator("#chapter-decision")).toHaveText(chapter.decision)
  await expect(page.locator("#chapter-scope")).toContainText(chapter.windowLabels.start)
  await expect(page.locator("#chapter-scope")).toContainText("Not independent or specialist review")
}

/** One workspace, the chapter's own name, and the chapter's own event list. */
async function expectWorkspace(page: Page, chapter: ChapterCase): Promise<void> {
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("atlas-workspace")).toHaveCount(1)
  await expect(page.locator("#atlas-workspace canvas")).toHaveCount(1)

  const notice = page.locator("#atlas-notice")

  await expect(notice).toContainText(chapter.decision)
  await expect(notice).toContainText(chapter.name)

  await openPanel(page)
  await expect(page.getByTestId("atlas-event-item")).toHaveCount(chapter.counts.events)
}

test.describe("the shared baseline, chapter by chapter", () => {
  for (const chapter of CHAPTERS) {
    test(`${chapter.id} runs the baseline: content, controls, search, selection, sources, disputes`, async ({
      page,
    }) => {
      // One page load per chapter, then the whole criterion list in sequence:
      // the software renderer makes each load cost seconds, and the point of the
      // check is that both chapters behave the same way.
      test.setTimeout(300_000)

      const problems = collectProblems(page)

      await page.goto(`/chapters/${chapter.id}`)
      await expectChapterShell(page, chapter)
      await expectWorkspace(page, chapter)

      // --- content shape ------------------------------------------------------
      // Comparable content is the same contract shape, not the same size: each
      // chapter carries events, a story, and sources, and its own counts are the
      // counts the tabs state.
      const tabs = page.getByTestId("atlas-tab")

      await expect(tabs).toHaveCount(3)
      await expect(tabs.nth(0)).toHaveText(`Events (${chapter.counts.events})`)
      await expect(tabs.nth(1)).toHaveText(`Story (${chapter.counts.story})`)
      await expect(tabs.nth(2)).toHaveText(`Sources (${chapter.counts.sources})`)

      // --- controls -----------------------------------------------------------
      await expect(page.locator("#atlas-window-start")).toHaveValue(String(chapter.window.start))
      await expect(page.locator("#atlas-window-end")).toHaveValue(String(chapter.window.end))
      await expect(page.locator("#atlas-playhead-value")).toHaveText(chapter.windowLabels.start)
      await expect(page.locator("#atlas-play-toggle")).toHaveText("Play")
      await expect(page.locator("#atlas-step-forward")).toBeVisible()
      await expect(page.locator("#atlas-step-back")).toBeVisible()

      // --- search -------------------------------------------------------------
      // A published name form finds the record it names, through the chapter's
      // own text, and clearing the query restores the window's list.
      await page.locator("#atlas-search").fill(chapter.search.query)
      await expect(page.getByTestId("atlas-search-results")).toBeVisible()
      await expect(page.locator(`[data-event-id="${chapter.search.eventId}"]`)).toBeVisible()

      // --- selection, sources, and the dispute --------------------------------
      // The query is cleared first: while a search is active the panel lists
      // results, and the disputed record is not necessarily among them.
      await page.locator("#atlas-search").fill("")
      await expect(page.getByTestId("atlas-event-list")).toBeVisible()

      await selectRow(page, chapter.disputed)

      const details = page.getByTestId("atlas-selection")

      await expect(details).toContainText("Place")
      await expect(details).toContainText("Occurrence")
      await expect(details).toContainText("As written")
      await expect(page.getByTestId("atlas-citations")).toBeVisible()
      await expect(page.getByTestId("atlas-dispute")).toBeVisible()
      await expect(page.getByTestId("atlas-dispute")).toContainText("Disputed account")

      // The dispute is marked in the list too, not only in the panel.
      await openPanel(page)
      await expect(
        page
          .locator(`[data-testid="atlas-event-list"] [data-event-id="${chapter.disputed}"]`)
          .getByTestId("atlas-dispute-badge"),
      ).toBeVisible()

      // The sources surface states the chapter's sources with their attribution.
      await page.locator("#atlas-tab-sources").click()
      await expect(page.getByTestId("atlas-source")).toHaveCount(chapter.counts.sources)
      await expect(page.getByTestId("atlas-sources")).toContainText("·")

      expect(problems).toEqual([])
    })

    test(`${chapter.id} runs the baseline's time behavior: playback, stepping, and an excluded selection`, async ({
      page,
    }) => {
      test.setTimeout(300_000)

      const problems = collectProblems(page)

      await page.goto(`/chapters/${chapter.id}`)
      await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })

      // --- chronological stepping --------------------------------------------
      // Stepping moves the playhead to an event boundary in the window and never
      // changes the window itself.
      const windowBefore = await page.locator("#atlas-window-start").inputValue()

      await page.locator("#atlas-step-forward").click()
      await expect(page.locator("#atlas-playhead-value")).not.toHaveText(chapter.windowLabels.start)
      await expect(page.locator("#atlas-window-start")).toHaveValue(windowBefore)

      // --- playback advances and stops at the window's end --------------------
      // The durable outcome is where the playhead lands: on a loaded machine a
      // delayed interval tick can advance the whole window at once, so asserting
      // the transient "Pause" state would race the behavior instead of checking
      // it. Clicking play from the window's end restarts at its start, so a
      // playhead that never moves cannot pass this.
      await page.locator("#atlas-play-toggle").click()

      // The playhead moves within the fixed window: the window itself never moves.
      await expect
        .poll(async () => page.locator("#atlas-playhead-value").innerText(), { timeout: 60_000 })
        .toBe(chapter.windowLabels.end)

      await expect(page.locator("#atlas-play-toggle")).toHaveText("Play")
      await expect(page.locator("#atlas-play-toggle")).toHaveAttribute("aria-pressed", "false")
      await expect(page.locator("#atlas-window-start")).toHaveValue(windowBefore)
      await expect(page.locator("#atlas-window-end")).toHaveValue(String(chapter.window.end))

      // --- a selection the window excludes ------------------------------------
      // Search reaches the whole chapter; selecting a record the window excludes
      // keeps its details with the outside-time notice and the explicit return,
      // and the map keeps no marker for it.
      await page.locator("#atlas-window-start").fill(chapter.outside.window.start)
      await page.locator("#atlas-window-end").fill(chapter.outside.window.end)
      await openPanel(page)
      await page.locator("#atlas-search").fill(chapter.outside.query)

      const outsideRow = page.locator(`[data-event-id="${chapter.outside.eventId}"]`)

      await expect(outsideRow).toBeVisible()
      await expect(outsideRow.getByTestId("atlas-outside-badge")).toBeVisible()
      await outsideRow.click()

      await expect(page.getByTestId("atlas-selection")).toBeVisible()
      await expect(page.getByTestId("atlas-outside-time")).toBeVisible()
      await expect(page.locator("#atlas-return-to-time")).toBeVisible()

      // With the search cleared, the excluded record is not in the window's list:
      // its details stay, its marker does not.
      await openPanel(page)
      await page.locator("#atlas-search").fill("")
      await expect(
        page.locator(
          `[data-testid="atlas-event-list"] [data-event-id="${chapter.outside.eventId}"]`,
        ),
      ).toHaveCount(0)

      // The return action moves the window explicitly and the record is listed.
      await closePanel(page)
      await page.locator("#atlas-return-to-time").click()
      await expect(page.getByTestId("atlas-outside-time")).toHaveCount(0)
      await openPanel(page)
      await expect(
        page.locator(
          `[data-testid="atlas-event-list"] [data-event-id="${chapter.outside.eventId}"]`,
        ),
      ).toBeVisible()

      expect(problems).toEqual([])
    })
  }

  test("both chapters are the same product surface, mounted the same way", async ({ page }) => {
    // The comparability claim itself: the two chapters expose the same surfaces,
    // the same controls, and the same search field, with only their own content
    // differing. This is what lets the treatment comparison read its differences
    // as the treatment's rather than as a chapter's.
    test.setTimeout(300_000)

    const surfaces: string[][] = []

    for (const chapter of CHAPTERS) {
      await page.goto(`/chapters/${chapter.id}`)
      await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
      await openPanel(page)

      surfaces.push(
        await page.evaluate(() => {
          const ids = [
            "#atlas-search",
            "#atlas-tab-events",
            "#atlas-tab-story",
            "#atlas-tab-sources",
            "#atlas-window-start",
            "#atlas-window-end",
            "#atlas-playhead",
            "#atlas-play-toggle",
            "#atlas-step-back",
            "#atlas-step-forward",
            "#atlas-follow-toggle",
          ]

          return ids.map((id) => (document.querySelector(id) === null ? `missing:${id}` : id))
        }),
      )
    }

    // Every control exists on both chapters, and the two lists are the same: a
    // control missing from both would satisfy equality alone.
    for (const id of [
      "#atlas-search",
      "#atlas-tab-events",
      "#atlas-tab-story",
      "#atlas-tab-sources",
      "#atlas-window-start",
      "#atlas-window-end",
      "#atlas-playhead",
      "#atlas-play-toggle",
      "#atlas-step-back",
      "#atlas-step-forward",
      "#atlas-follow-toggle",
    ]) {
      expect(surfaces[0], id).toContain(id)
    }

    expect(surfaces[1]).toEqual(surfaces[0])
  })
})
