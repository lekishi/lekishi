import { describe, expect, it } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import { normalizeForSearch, searchChapter } from "./search"

/**
 * Chapter search.
 *
 * Search is the discovery path that does not depend on the time window, so these
 * cases pin what it must find and what it must not invent: the local-script form
 * and the published romanization of a name, an event's own published text, and
 * nothing that is not published. A modern equivalent of a historical place is
 * deliberately not searchable, and a query that matches nothing returns nothing
 * rather than a fuzzy guess.
 */

const TANG = await loadServedChapter(TANG_CHAPTER)
const QIN = await loadServedChapter(QIN_CHAPTER)

const ids = (chapter: typeof TANG, query: string) =>
  searchChapter(chapter, query).map((result) => result.eventId)

describe("normalizeForSearch", () => {
  it("folds case, diacritics, and spacing so a romanization is findable as typed", () => {
    expect(normalizeForSearch("Ōtomo no Komaro")).toBe("otomo no komaro")
    expect(normalizeForSearch("Tōdai-ji")).toBe("todai-ji")
    expect(normalizeForSearch("  Fujiwara   no Kiyokawa ")).toBe("fujiwara no kiyokawa")
    expect(normalizeForSearch("雲陽")).toBe("雲陽")
  })
})

describe("searchChapter over the Tang chapter", () => {
  it("finds events by a participant's romanized name", () => {
    // 藤原朝臣清河's romanization is what the record publishes; a reader typing
    // it should not have to type the local-script form.
    const results = ids(TANG, "Fujiwara no Kiyokawa")

    expect(results.length).toBeGreaterThan(0)
    expect(results).toContain("lks:event:appointment-750")
    expect(searchChapter(TANG, "Fujiwara no Kiyokawa")[0]?.match).toBe("name")
  })

  it("finds the same events from the diacritic-free spelling", () => {
    expect(ids(TANG, "Ōtomo no Komaro")).toEqual(ids(TANG, "Otomo no Komaro"))
    expect(ids(TANG, "Otomo")).toEqual(ids(TANG, "Ōtomo"))
  })

  it("finds events by the local-script name form", () => {
    expect(ids(TANG, "藤原朝臣清河")).toContain("lks:event:appointment-750")
    expect(ids(TANG, "鑒眞")).toContain("lks:event:ordination-754")
  })

  it("finds an event by a place's published name", () => {
    expect(ids(TANG, "Tōdai-ji")).toContain("lks:event:todaiji-installation-754")
    expect(ids(TANG, "東大寺")).toContain("lks:event:todaiji-installation-754")
  })

  it("finds an event by its own published text and by its date", () => {
    // A year the atlas states is searchable, and so is the record's own date as
    // written.
    expect(ids(TANG, "753").length).toBeGreaterThan(0)
    expect(ids(TANG, "ordinations")).toContain("lks:event:ordination-754")
    expect(ids(TANG, "222-person")).toContain("lks:event:rewards-754")
  })

  it("finds an event through a place the map does not show it at", () => {
    // The return voyage's record references four places and the atlas shows it at
    // one of them. A reader looking for the second ship's island still has to find
    // the voyage, so every referenced place's published names are searchable.
    const voyage = ids(TANG, "Yakushima")

    expect(voyage).toContain("lks:event:return-voyage-753")
    expect(ids(TANG, "益救島")).toContain("lks:event:return-voyage-753")
    // The event is not placed at that island; the name comes from the record's own
    // reference, and the placement is unchanged.
    expect(
      TANG.events.find((event) => event.id === "lks:event:return-voyage-753")?.placeIds,
    ).toContain("lks:place:yaku")
  })

  it("does not treat a modern equivalent as a searchable name", () => {
    // 太地 is the modern town a cited source identifies 牟漏埼 with. The record
    // keeps it as a modern equivalent, which the contract forbids reading as an
    // identification, so search must not use it as an alias either.
    expect(ids(TANG, "太地")).toEqual([])
    expect(ids(TANG, "Taiji")).toEqual([])
  })

  it("returns nothing for an empty query and for a query nothing matches", () => {
    expect(searchChapter(TANG, "")).toEqual([])
    expect(searchChapter(TANG, "   ")).toEqual([])
    expect(searchChapter(TANG, "Xanadu")).toEqual([])
  })
})

describe("searchChapter over the Qin chapter", () => {
  it("finds the disputed death by the local-script place name", () => {
    expect(ids(QIN, "雲陽")).toContain("lks:event:hanfei-death-233")
  })

  it("finds events by romanized place and actor names", () => {
    expect(ids(QIN, "Yunyang")).toContain("lks:event:hanfei-death-233")
    expect(ids(QIN, "Han Fei")).toContain("lks:event:hanfei-death-233")
    expect(ids(QIN, "Nanyang")).toContain("lks:event:han-nanyang-cession-231")
  })

  it("does not treat a place's modern namesake as a searchable name", () => {
    // 雲陽鎮 is the modern town the record keeps as a modern equivalent for the
    // anchor's orientation. It is not an identification, so it is not an alias:
    // a reader who searches the modern town's name finds nothing.
    expect(ids(QIN, "Yunyangzhen")).toEqual([])
    expect(ids(QIN, "雲陽鎮")).toEqual([])
  })

  it("finds an event through its published dispute and locators", () => {
    // The accounts the record publishes are part of what a reader can search for,
    // so the disagreement itself is discoverable.
    expect(ids(QIN, "hereditary house")).toContain("lks:event:hanfei-death-233")
    expect(ids(QIN, "卷六十三")).toContain("lks:event:hanfei-death-233")
  })

  it("keeps the two chapters' search results separate", () => {
    // 雲陽 is named in the Qin chapter only; the Tang chapter has no such event.
    expect(ids(QIN, "雲陽").length).toBeGreaterThan(0)
    expect(ids(TANG, "雲陽")).toEqual([])
    // And a Tang name does not reach the Qin chapter.
    expect(ids(QIN, "Fujiwara")).toEqual([])
  })

  it("orders name matches before text matches", () => {
    // "Han" appears in many summaries; the places and actors whose published name
    // form matches come first, so the reader's own name is not buried.
    const results = searchChapter(QIN, "Han")

    expect(results.length).toBeGreaterThan(1)
    const firstText = results.findIndex((result) => result.match === "text")

    if (firstText !== -1) {
      expect(results.slice(firstText).every((result) => result.match === "text")).toBe(true)
    }
  })
})
