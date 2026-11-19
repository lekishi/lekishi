// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { mount, tick, unmount } from "svelte"
import type { HomeChapter } from "$lib/atlas/home"
import { rememberPosition } from "$lib/atlas/memory"
import Home from "./+page.svelte"

function chapter(
  id: string,
  start: number,
  count: number,
  region: HomeChapter["region"] = "east-asia",
): HomeChapter {
  return {
    id,
    region,
    window: { start, end: start + 1 },
    href: `/chapters/${id}`,
    name: `${id} chapter`,
    summary: `${id} summary`,
    status: "",
    draft: false,
    places: 2,
    events: 5,
    stories: [
      { key: "opening", captions: Array.from({ length: count }, (_, i) => `Opening ${i + 1}`) },
      { key: "other", captions: ["First", "Second", "Next caption"] },
    ],
  }
}

const chapters = [
  chapter("a", 200, 2),
  chapter("b", 100, 4),
  chapter("c", 300, 8, "nile"),
  chapter("d", 90, 6),
  chapter("e", 80, 1),
]
let component: ReturnType<typeof mount> | undefined

async function render() {
  component = mount(Home, {
    target: document.body,
    props: {
      params: {},
      form: null,
      data: {
        chapters,
        stills: { chapterId: "a", world: true },
        world: { year: 753, start: 750, end: 762, players: [], turns: [] },
      },
    },
  })
  await tick()
}

afterEach(async () => {
  if (component) await unmount(component)
  component = undefined
  localStorage.clear()
  document.cookie = "lekishi_member=; Max-Age=0"
  vi.unstubAllGlobals()
})

test("starts with the three longest opening stories and lists every chapter by region and year", async () => {
  localStorage.setItem("lekishi:positions:v1", "not JSON")
  await render()
  expect(
    [...document.querySelectorAll('[data-testid="home-starters"] a')].map((a) =>
      a.getAttribute("href"),
    ),
  ).toEqual(["/chapters/c", "/chapters/d", "/chapters/b"])
  expect(
    [...document.querySelectorAll("[data-chapter-id]")].map((item) =>
      item.getAttribute("data-chapter-id"),
    ),
  ).toEqual(["e", "d", "b", "a", "c"])
  expect(document.querySelector('main [data-variant="primary"]')?.getAttribute("href")).toBe(
    "/world?year=750",
  )
  expect(document.querySelector('img[src="/home/world.jpg"][alt=""]')).not.toBeNull()
  expect(document.querySelector('img[src="/home/tang-mission.jpg"]')).toBeNull()
  expect(document.querySelector("main canvas, main input")).toBeNull()
})

test("resumes the actual named story and shows up to three other served chapters, newest first", async () => {
  for (const [chapterId, at] of [
    ["b", 3],
    ["e", 1],
    ["c", 4],
    ["unavailable", 6],
    ["d", 2],
  ] as const) {
    rememberPosition({ chapterId, search: "?place=here", label: "Place name", at })
  }
  // A backwards device clock must not change which chapter was opened last.
  rememberPosition({ chapterId: "a", search: "?story=other&step=2", label: "Second", at: 0 })
  await render()
  const resume = document.querySelector('[data-testid="home-continue"]')
  expect(resume?.getAttribute("href")).toBe("/chapters/a?story=other&step=2")
  expect(resume?.textContent).toContain("Resume at step 2")
  expect(document.querySelector('img[src="/home/tang-mission.jpg"][alt=""]')).not.toBeNull()
  expect(document.querySelector('[data-testid="home-resume"]')?.textContent).toContain(
    "Next caption",
  )
  expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuemax")).toBe("3")
  expect(
    [...document.querySelectorAll('[data-testid="home-recent"] a')].map((link) =>
      link.getAttribute("href"),
    ),
  ).toEqual(["/chapters/c?place=here", "/chapters/b?place=here", "/chapters/d?place=here"])
})

test("an event position gets a plain Resume and no empty recent plate", async () => {
  rememberPosition({
    chapterId: "a",
    search: "?step=1&event=arrival",
    label: "Arrival",
    at: Date.now(),
  })
  await render()
  expect(document.querySelector('[data-testid="home-continue"]')?.textContent?.trim()).toBe(
    "Resume",
  )
  expect(document.querySelector('[data-testid="home-resume"]')?.textContent).toContain(
    "Event · Arrival",
  )
  expect(document.querySelector('[role="progressbar"], [data-testid="home-recent"]')).toBeNull()
})

test.each([true, false])(
  "only exposes a saved draft after an authorized response (authorized: %s)",
  async (authorized) => {
    const draft = { ...chapter("draft", 250, 3, "nile"), draft: true, status: "Not published." }
    const { promise, resolve } = Promise.withResolvers<Response>()
    vi.stubGlobal("fetch", () => promise)
    document.cookie = "lekishi_member=1"
    rememberPosition({
      chapterId: "draft",
      search: "?place=private",
      label: "Private place",
      at: 100,
    })
    await render()

    const entry = () => document.querySelector('[data-region="nile"] [data-chapter-id="draft"]')
    const resume = () => document.querySelector('[data-testid="home-continue"]')
    expect(entry()).toBeNull()
    expect(resume()).toBeNull()
    expect(document.body.textContent).not.toContain("Private place")

    resolve(authorized ? Response.json([draft]) : new Response(null, { status: 404 }))
    await promise
    await tick()
    if (!authorized) {
      expect(entry()).toBeNull()
      expect(resume()).toBeNull()
      expect(document.body.textContent).not.toContain("Private place")
      return
    }

    await expect
      .poll(() => entry()?.querySelector("[data-chapter-draft]")?.textContent)
      .toBe("Draft")
    expect(entry()?.textContent).toContain("Not published.")
    expect(resume()?.getAttribute("href")).toBe("/chapters/draft?place=private")
    expect(entry()?.querySelector("a")?.getAttribute("href")).toBe("/chapters/draft")
    expect(document.querySelector("#time-heading")?.parentElement?.textContent).toContain(
      "6 chapters by region",
    )
    expect(document.querySelector("footer form")?.getAttribute("method")).toBe("POST")
  },
)
