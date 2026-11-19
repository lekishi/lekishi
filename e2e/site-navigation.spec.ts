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

  const filter = page.getByRole("searchbox", { name: /Filter \d+ chapters/ })
  await filter.fill("753")
  await expect(page).toHaveURL(/\bq=753\b/)
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

test("Time opens World at the selected turn only when the board covers it", async ({ page }) => {
  await page.goto("/time?from=600&to=800&year=753")
  await page.getByRole("link", { name: "World in 753" }).click()
  await expect(page).toHaveURL(/\/world\?year=753$/)
  const board = page.getByRole("main", { name: "World campaign board" })
  await expect(board.locator("header").getByText("753", { exact: true })).toBeVisible()
  await expect(board.getByRole("link", { name: "Lekishi home" })).toHaveAttribute("href", "/")

  await page.goto("/time?year=-1299")
  await expect(page.getByRole("link", { name: "Open the world" })).toHaveAttribute("href", "/world")
})
