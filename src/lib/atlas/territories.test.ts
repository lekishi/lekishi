import { beforeAll, describe, expect, it } from "vitest"
import { compileChapter } from "../historical/authoring/compile"
import { readTree } from "../historical/authoring/tree"
import * as Publication from "../historical/contract/publication"
import type { Chapter } from "./domain"
import { sceneTerritories } from "./overlays"
import { projectChapter } from "./projection"
import { buildScene } from "./scene"
import { createAtlasState, setLayer, setPlayhead } from "./state"

/**
 * The six states' control snapshots (rfd/0002/TERRITORIES.adoc), from the
 * record files through the contract and the projection to the scene. The draft
 * chapter is compiled as a preview, as the checks and previews compile it.
 */

const CHAPTER = "qin-unification-230-221"

let chapter: Chapter

beforeAll(() => {
  const bundle = compileChapter(readTree(), CHAPTER, { preview: true })
  const checked = Publication.checkAll(bundle.documents, bundle.sets)

  if (!checked.ok) throw new Error(JSON.stringify(checked.errors, null, 2))

  const projected = projectChapter(CHAPTER, bundle.documents, bundle.sets, {
    defaultWindow: bundle.window,
    stories: bundle.stories,
  })

  if (!projected.ok) throw new Error(projected.errors.join("\n"))

  chapter = projected.chapter
})

/** The snapshots drawn with the playhead at a BCE year. */
function drawn(bce: number): string[] {
  const state = setPlayhead(
    setLayer(createAtlasState(chapter), "territory", true),
    chapter,
    1 - bce,
  )

  return sceneTerritories(state, chapter).map((territory) =>
    territory.id.replace("lks:territory:", ""),
  )
}

describe("the six states' control snapshots", () => {
  it("publishes fifteen snapshots across the seven states", () => {
    expect(chapter.territories).toHaveLength(15)
    expect(new Set(chapter.territories.map((territory) => territory.controllerId)).size).toBe(7)
  })

  it("draws, at each year, only the snapshots whose range holds it", () => {
    expect(drawn(230)).toEqual(["qin-held-230"])
    expect(drawn(229).sort()).toEqual(
      [
        "chu-held-229",
        "qi-held-229",
        "qin-held-230",
        "wei-held-229",
        "yan-held-229",
        "zhao-held-229",
      ].sort(),
    )
    expect(drawn(225).sort()).toEqual(
      ["chu-held-229", "dai-held-228", "qi-held-229", "qin-held-225", "yan-held-226"].sort(),
    )
    expect(drawn(221)).toEqual(["qin-held-221"])
  })

  it("never shows one place held by two states in one year", () => {
    for (let bce = 230; bce >= 221; bce -= 1) {
      const state = setPlayhead(
        setLayer(createAtlasState(chapter), "territory", true),
        chapter,
        1 - bce,
      )
      const held = sceneTerritories(state, chapter).flatMap((territory) =>
        territory.places.map((place) => place.placeId),
      )

      expect(new Set(held).size, `${bce} BCE`).toBe(held.length)
    }
  })

  it("marks each state's seat, and Qin's gains as the years pass", () => {
    const state = setPlayhead(
      setLayer(createAtlasState(chapter), "territory", true),
      chapter,
      1 - 225,
    )
    const places = new Map(buildScene(state, chapter).places.map((place) => [place.id, place]))

    expect(places.get("lks:place:xianyang")?.control).toMatchObject({ label: "秦", seat: true })
    expect(places.get("lks:place:daliang")?.control).toMatchObject({ label: "秦", seat: false })
    expect(places.get("lks:place:shouchun")?.control).toMatchObject({ label: "楚", seat: true })
    expect(places.get("lks:place:linzi")?.control).toMatchObject({ label: "齊", seat: true })
  })

  it("keeps the dispute over the end of Chu on its last snapshot", () => {
    const last = chapter.territories.find((territory) => territory.id.endsWith("chu-held-224"))

    expect(last?.dispute?.summary).toContain("224 BCE")
    expect(last?.places.map((place) => place.placeId)).toEqual([
      "lks:place:shouchun",
      "lks:place:huainan",
    ])
  })
})
