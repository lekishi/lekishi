import { expect, test } from "@playwright/test"

test("the Time door separates chart filtering from site search", async ({ page }) => {
  await page.goto("/about")
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Time" })
    .click()
  await expect(page.getByRole("heading", { name: "Regions in time" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Time", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  )

  const openingEra = (page.viewportSize()?.width ?? 1440) < 640 ? "800–200 BCE" : "All time"
  await expect(page.getByRole("button", { name: openingEra, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  const filter = page.getByRole("searchbox", { name: /Filter \d+ chapters/ })
  await filter.fill("753")
  await expect(page).toHaveURL(/\bq=753\b/)
  await page.getByRole("link", { name: "Time", exact: true }).click()
  await expect(page).toHaveURL(/\bq=753\b/)
  await page.reload()
  await expect(filter).toHaveValue("753")
  await filter.press("Escape")
  await expect(filter).toHaveValue("")
  await expect(page).not.toHaveURL(/\bq=/)

  await page.getByRole("heading", { name: "Regions in time" }).click()
  await page.keyboard.press("/")
  const search = page.getByRole("dialog", { name: "Search the atlas" })
  await expect(search).toBeVisible()
  await expect(filter).not.toBeFocused()
  await page.keyboard.press("Escape")
  await expect(search).toBeHidden()
})

test("phone search has a visible close button and returns focus to the trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/time")
  await expect(page.getByRole("searchbox", { name: /Filter \d+ chapters/ })).toBeEnabled()
  const trigger = page.getByRole("banner").getByRole("button", { name: "Search", exact: true })
  await trigger.click()
  const search = page.getByRole("dialog", { name: "Search the atlas" })
  const close = search.getByRole("button", { name: "Close search" })
  await expect(close).toBeVisible()
  await close.click()
  await expect(search).toBeHidden()
  await expect(trigger).toBeFocused()
})

test("Time opens World at the selected turn only when the board covers it", async ({ page }) => {
  await page.goto("/time?from=600&to=800&year=753")
  await page.getByRole("link", { name: "World in 753" }).click()
  await expect(page).toHaveURL(/\/world\?year=753$/)
  const board = page.getByRole("main", { name: "World campaign board" })
  await expect(board.locator("header").getByText("753", { exact: true })).toBeVisible()
  await expect(board.getByRole("link", { name: "Lekishi home" })).toHaveAttribute("href", "/")

  await page.goto("/time?year=-1299")
  await expect(page.getByRole("slider", { name: "Year" })).toHaveAttribute("aria-valuenow", "-1299")
  await expect(page.getByRole("link", { name: "Open the world" })).toHaveAttribute("href", "/world")
})

test("About links to the three ways in and the full map attribution", async ({ page }) => {
  await page.goto("/about")
  const about = page.getByRole("main")
  await expect(about.getByRole("link", { name: /^Time/ })).toHaveAttribute("href", "/time")
  await expect(about.getByRole("link", { name: /^World/ })).toHaveAttribute("href", "/world")
  await expect(about.getByRole("link", { name: /^Places/ })).toHaveAttribute("href", "/places")
  await expect(about.getByRole("heading", { name: "On this device" })).toBeVisible()
  await expect(about.getByRole("link", { name: "Full attribution" })).toHaveAttribute(
    "href",
    "/globe/ATTRIBUTION.txt",
  )
})
