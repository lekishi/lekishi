import { expect, type Locator, type Page } from "@playwright/test"

/**
 * Shared steps for the browser checks of the atlas frame (RFD 5).
 *
 * The frame changes shape with the workspace's width (`data-layout` on the
 * workspace: `desktop`, `tablet`, `phone`), and the same reader action takes a
 * different path in each: the explore list is a rail on desktop, behind the
 * "Story and events" orb on a tablet, and in the bottom sheet on a phone. These
 * helpers take the path the current layout offers, so a check states the
 * behaviour once and runs it at every size. None of them waits on a clock: each
 * waits for the element or attribute the next step depends on.
 */

/** The two chapters the site serves, through one route. */
export const TANG = "/chapters/tang-mission-750-754"
export const QIN = "/chapters/qin-conquest-han-233-226"

export type Layout = "desktop" | "tablet" | "phone"
export type ExploreTab = "story" | "events" | "sources"

/** Collects page errors, console errors and (optionally) failed responses. */
export function collectProblems(page: Page, { http = true } = {}): string[] {
  const problems: string[] = []

  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`))
  page.on("console", (message) => {
    if (message.type() === "error") {
      problems.push(`console error: ${message.text()}`)
    }
  })

  if (http) {
    page.on("response", (response) => {
      if (response.status() >= 400) {
        problems.push(`HTTP ${response.status()} for ${response.url()}`)
      }
    })
  }

  return problems
}

/** Opens a chapter address and waits for its workspace and globe canvas. */
export async function openChapter(page: Page, address: string): Promise<void> {
  await page.goto(address)
  // The workspace renders its globe canvas once the renderer starts.
  await expect(page.locator("#atlas-workspace canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("atlas-workspace")).toHaveAttribute(
    "data-layout",
    /^(desktop|tablet|phone)$/,
  )
}

/** The frame the workspace chose for its current width. */
export async function layoutOf(page: Page): Promise<Layout> {
  return (await page.getByTestId("atlas-workspace").getAttribute("data-layout")) as Layout
}

/** The phone's bottom sheet. */
export function sheet(page: Page): Locator {
  return page.locator("section[data-detent]")
}

/** The sheet's handle: one button that steps peek → half → full → peek. */
export function sheetHandle(page: Page): Locator {
  return sheet(page).locator(":scope > button").first()
}

/**
 * Raises the phone sheet off its peek detent, so the timeline strip and the
 * card or the list are rendered. A no-op on the other layouts.
 */
export async function raiseSheet(page: Page): Promise<void> {
  if ((await layoutOf(page)) !== "phone") return

  if ((await sheet(page).getAttribute("data-detent")) === "peek") {
    await sheetHandle(page).click()
    await expect(sheet(page)).toHaveAttribute("data-detent", "half")
  }
}

/**
 * Shows the explore list on the given tab, by whatever path the layout offers:
 * it is always open on desktop, behind the "Story and events" orb on a tablet,
 * and in the raised sheet on a phone (where a selection's card takes the sheet
 * until the reader asks for the list).
 */
export async function openExplore(page: Page, tab: ExploreTab): Promise<void> {
  const panel = page.locator("#atlas-event-panel")
  const layout = await layoutOf(page)

  if (!(await panel.isVisible())) {
    if (layout === "tablet") {
      await page.getByRole("button", { name: "Story and events", exact: true }).click()
    } else if (layout === "phone") {
      await raiseSheet(page)

      if (!(await panel.isVisible())) {
        await sheet(page).getByRole("button", { name: "Story and events", exact: true }).click()
      }
    }
  }

  await expect(panel).toBeVisible()

  const tabButton = page.locator(`#atlas-explore-tab-${tab}`)

  if ((await tabButton.getAttribute("aria-selected")) !== "true") {
    await tabButton.click()
  }

  await expect(tabButton).toHaveAttribute("aria-selected", "true")
}

/**
 * Selects one published event from the explore list (or its search results)
 * by its record id. The checks name records, not list positions, so a content
 * correction cannot silently point a check at a different event.
 */
export async function selectEvent(page: Page, eventId: string): Promise<void> {
  const row = page.locator(`#atlas-event-panel [data-event-id="${eventId}"]`)

  if (!(await row.isVisible())) {
    await openExplore(page, "events")
  }

  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(page.locator("#atlas-selection")).toBeVisible()
}

/** Opens the chapter search in the explore list and types a query into it. */
export async function searchChapter(page: Page, query: string): Promise<void> {
  await openExplore(page, "events")
  await page.locator("#atlas-search").fill(query)
}

/** The selection card. */
export function card(page: Page): Locator {
  return page.locator("#atlas-selection")
}

/** The playhead year in the date bar: shown at every layout and every detent. */
export function playheadYear(page: Page): Locator {
  return page.getByTestId("atlas-playhead-year")
}

/**
 * Sets the time window. Where the strip has its chapter row (desktop and
 * tablet) the window handles are moved as a reader moves them; the phone's
 * compact strip has no handles, so there the window comes from the address, as
 * a shared link would set it. The phone path reloads the chapter, so callers
 * set the window before they select anything.
 */
export async function setWindow(
  page: Page,
  chapter: string,
  start: number,
  end: number,
): Promise<void> {
  const startInput = page.locator("#atlas-window-start")

  if ((await layoutOf(page)) !== "phone") {
    await expect(startInput).toBeAttached()
    // Widen first so neither handle is clamped by the other on the way.
    await page.locator("#atlas-window-end").fill(String(Math.max(end, start)))
    await startInput.fill(String(start))
    await page.locator("#atlas-window-end").fill(String(end))
    await expect(startInput).toHaveValue(String(start))
    await expect(page.locator("#atlas-window-end")).toHaveValue(String(end))
    return
  }

  await openChapter(page, `${chapter}?from=${start}&to=${end}`)
}

/** Opens the chapter switcher: the chapter name in the date bar, an icon on a phone. */
export async function openSwitcher(page: Page): Promise<void> {
  const named = page.locator("#atlas-chapter-switcher")

  if (await named.isVisible()) {
    await named.click()
  } else {
    await page
      .locator("#atlas-date-bar")
      .getByRole("button", { name: "Switch chapter", exact: true })
      .click()
  }

  await expect(page.locator("dialog#chapter-switcher")).toBeVisible()
}

/**
 * The regions of the frame. Each is fixed over the same globe, so any two that
 * overlap hide a control or a line of content. The left rail and the sheet
 * contain some of the others; a region is only compared with the regions it
 * does not contain.
 */
export const FRAME_REGIONS = [
  "#atlas-date-bar",
  '[data-testid="atlas-layers"]',
  'aside[aria-label="Layers"]',
  '[aria-label="People in this chapter"]',
  "#atlas-event-panel",
  "#atlas-selection",
  "#atlas-story-summary",
  '[data-testid="atlas-arrival"]',
  '[data-testid="atlas-legend"]',
  '[data-testid="atlas-dial"]',
  '[data-testid="atlas-timeline"]',
  '[data-testid="atlas-minimap"]',
  "section[data-detent]",
] as const

/**
 * Every pair of visible frame regions that overlap, and every region that runs
 * past the viewport. A region inside the phone sheet scrolls with the sheet,
 * so only the sheet itself is held to the viewport there.
 */
export async function frameProblems(page: Page): Promise<string[]> {
  return page.evaluate(
    (selectors) => {
      /**
       * The part of an element a reader can see: its box cut by every ancestor
       * that clips its overflow. A control scrolled out of the sheet's body is
       * hidden by the sheet, not painted over the date bar.
       */
      const visibleRect = (element: HTMLElement): DOMRect | null => {
        const box = element.getBoundingClientRect()
        let [left, top, right, bottom] = [box.left, box.top, box.right, box.bottom]

        for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
          const style = getComputedStyle(parent)

          if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            const clip = parent.getBoundingClientRect()
            left = Math.max(left, clip.left)
            top = Math.max(top, clip.top)
            right = Math.min(right, clip.right)
            bottom = Math.min(bottom, clip.bottom)
          }
        }

        return right - left > 0 && bottom - top > 0
          ? new DOMRect(left, top, right - left, bottom - top)
          : null
      }

      const regions = selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).flatMap((element) => {
          const style = getComputedStyle(element)
          const full = element.getBoundingClientRect()

          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            full.width === 0 ||
            full.height === 0
          ) {
            return []
          }

          // Inside the sheet a region is held to what the sheet shows of it;
          // elsewhere its whole box counts, so a region pushed past the screen
          // edge (and clipped by the workspace) is reported, not hidden.
          const inSheet = element.parentElement?.closest("section[data-detent]") !== null
          const rect = inSheet ? visibleRect(element) : full

          return rect === null ? [] : [{ selector, element, rect, inSheet }]
        }),
      )
      const problems: string[] = []
      const where = (rect: DOMRect) =>
        `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`

      for (const { selector, rect, inSheet } of regions) {
        if (
          !inSheet &&
          (rect.left < -1 ||
            rect.top < -1 ||
            rect.right > window.innerWidth + 1 ||
            rect.bottom > window.innerHeight + 1)
        ) {
          problems.push(`${selector} runs past the viewport (${where(rect)})`)
        }
      }

      for (let i = 0; i < regions.length; i += 1) {
        for (let j = i + 1; j < regions.length; j += 1) {
          const [a, b] = [regions[i]!, regions[j]!]

          if (a.element.contains(b.element) || b.element.contains(a.element)) continue

          const overlaps =
            a.rect.right > b.rect.left + 0.5 &&
            b.rect.right > a.rect.left + 0.5 &&
            a.rect.bottom > b.rect.top + 0.5 &&
            b.rect.bottom > a.rect.top + 0.5

          if (overlaps) {
            problems.push(
              `${a.selector} (${where(a.rect)}) overlaps ${b.selector} (${where(b.rect)})`,
            )
          }
        }
      }

      return problems
    },
    FRAME_REGIONS as unknown as string[],
  )
}

/**
 * Asserts the frame's regions stay apart. Some states settle over a few frames
 * (the sheet animates its height, the safe area is measured by a
 * ResizeObserver), so this polls for the settled layout rather than sampling
 * the frame in between.
 */
export async function expectFrameApart(page: Page, state: string): Promise<void> {
  await expect.poll(() => frameProblems(page), { message: state }).toEqual([])
}

/**
 * Waits until an element's box holds still for several animation frames: a
 * marker moves while the camera flies or the safe area changes, and a click
 * has to land where it is, not where it was.
 */
export async function settledCenter(locator: Locator): Promise<{ x: number; y: number }> {
  await expect(locator).toBeVisible()

  return locator.evaluate(async (element) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    let stable = 0
    let previous = ""

    while (stable < 10) {
      await frame()
      const rect = element.getBoundingClientRect()
      const current = `${rect.x.toFixed(1)},${rect.y.toFixed(1)}`
      stable = current === previous ? stable + 1 : 0
      previous = current
    }

    const rect = element.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })
}

/**
 * Folds the desktop legend, which sits open over the scene's lower left. On a
 * short desktop viewport (Safari's and Firefox's 1280×720) with a preview's
 * draft banner above the workspace, the scene is short enough that a selected
 * place can sit under the open legend; checks that press a mark fold it first.
 */
export async function foldLegend(page: Page): Promise<void> {
  const toggle = page.getByTestId("atlas-legend").getByRole("button", { name: "Legend" })

  if ((await toggle.getAttribute("aria-expanded")) === "true") {
    await toggle.click()
  }

  await expect(toggle).toHaveAttribute("aria-expanded", "false")
}

/**
 * The drawn mark of a place on the globe: the marker's third span, after the
 * controller's disc and the pulse.
 */
export function placeMark(page: Page, placeId: string): Locator {
  return page.locator(`[data-marker-id="${placeId}"] > span:nth-child(3)`)
}

/**
 * The point to press a place's mark at, once it has settled, checked to be the
 * globe canvas: markers are drawn over the canvas and never take the pointer
 * themselves, so the renderer picks the place under a press on the canvas.
 */
export async function markPoint(page: Page, placeId: string): Promise<{ x: number; y: number }> {
  const point = await settledCenter(placeMark(page, placeId))
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null,
    point,
  )

  expect(hit, `${placeId}'s mark is under the frame, not on the open globe`).toBe("CANVAS")

  return point
}
