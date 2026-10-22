import { beforeAll, describe, expect, it } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, SERVED_CHAPTERS, TANG_CHAPTER } from "./chapter-registry"
import { buildSearchIndex, searchIndex, type SearchIndex } from "./search-index"

let index: SearchIndex

beforeAll(async () => {
  index = buildSearchIndex(
    await Promise.all(SERVED_CHAPTERS.map((served) => loadServedChapter(served.id))),
  )
})

function titles(query: string, options = {}) {
  return searchIndex(index, query, options).flatMap((group) =>
    group.hits.map((hit) => `${group.chapter.id}:${hit.entry.kind}:${hit.entry.title}`),
  )
}

describe("the search index", () => {
  it("covers every served chapter, oldest first", () => {
    // Drafts are served too, so the list is the registry's, oldest window first;
    // the two approved chapters pin that the order is by window, not by name.
    const oldestFirst = [...SERVED_CHAPTERS]
      .sort((a, b) => a.coverage.defaultWindow.start - b.coverage.defaultWindow.start)
      .map((served) => served.id)
    const ids = index.chapters.map((chapter) => chapter.id)

    expect(ids).toEqual(oldestFirst)
    expect(ids.indexOf(QIN_CHAPTER)).toBeLessThan(ids.indexOf(TANG_CHAPTER))
    for (const chapter of index.chapters) {
      expect(index.entries.some((entry) => entry.chapterId === chapter.id)).toBe(true)
    }
  })

  it("links every entry to a chapter URL with the query that opens it", () => {
    for (const entry of index.entries) {
      expect(entry.href).toMatch(
        /^\/chapters\/[\w-]+(\?(story=[\w-]+&)?(event|place|step)=[\w-]+)?$/,
      )
    }
  })

  it("finds the same person by every published name form", () => {
    const byScript = titles("韓非").filter((title) => title.includes(":person:"))
    const byRomanization = titles("han fei").filter((title) => title.includes(":person:"))

    expect(byScript).toEqual([`${QIN_CHAPTER}:person:韓非`])
    expect(byRomanization).toEqual(byScript)
  })

  it("folds diacritics, so a plain keyboard finds a romanization", () => {
    expect(titles("todaiji").some((title) => title.endsWith(":place:東大寺"))).toBe(true)
  })

  it("puts the current chapter first and narrows to it when scoped", () => {
    const groups = searchIndex(index, "han", { current: TANG_CHAPTER })

    expect(groups[0]?.chapter.id).toBe(TANG_CHAPTER)
    expect(
      searchIndex(index, "han", { scope: TANG_CHAPTER }).map((group) => group.chapter.id),
    ).toEqual([TANG_CHAPTER])
  })

  it("keeps a disputed account's flag on its row", () => {
    const hit = searchIndex(index, "雲陽")
      .flatMap((group) => group.hits)
      .find((candidate) => candidate.entry.kind === "event")

    expect(hit?.entry.disputed).toBe(true)
  })

  it("finds the story's own captions for steps that are not events", () => {
    expect(titles("encounter at")).toContain(`${TANG_CHAPTER}:step:The encounter at 延光寺`)
  })

  it("matches nothing for an empty query", () => {
    expect(searchIndex(index, "  ")).toEqual([])
  })
})

describe("a chapter with several stories", () => {
  it("lists each record once, from the first story that reaches it, and says which story", async () => {
    const tang = await loadServedChapter(TANG_CHAPTER)
    // A fixture split of the Tang chapter's own records into two stories.
    const options = [
      { key: TANG_CHAPTER, title: "The embassy", window: tang.defaultWindow },
      { key: "example-second", title: "A second story", window: { start: 753, end: 754 } },
    ]
    const moved = new Set(["lks:event:akimeya-landfall-753", "lks:event:naniwa-754"])
    const first = {
      ...tang,
      stories: options,
      events: tang.events.filter((event) => !moved.has(event.id)),
    }
    const second = {
      ...tang,
      storyKey: "example-second",
      stories: options,
      events: tang.events.filter(
        (event) => moved.has(event.id) || event.id === "lks:event:dazaifu-entry-753",
      ),
    }
    const built = buildSearchIndex([[first, second]])
    const entries = (id: string) => built.entries.filter((entry) => entry.id === id)

    expect(built.chapters).toHaveLength(1)
    expect(entries(TANG_CHAPTER)).toHaveLength(1)
    expect(entries("lks:event:dazaifu-entry-753")).toHaveLength(1)
    expect(entries("lks:event:dazaifu-entry-753")[0].detail).toContain("in “The embassy”")
    expect(entries("lks:event:naniwa-754")[0]).toMatchObject({
      href: `/chapters/${TANG_CHAPTER}?event=naniwa-754`,
    })
    expect(entries("lks:event:naniwa-754")[0].detail).toContain("in “A second story”")
    expect(
      built.entries.filter((entry) => entry.kind === "step" && entry.href.includes("story=")),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: expect.stringMatching(/\?story=example-second&step=\d+$/),
        }),
      ]),
    )
  })
})
