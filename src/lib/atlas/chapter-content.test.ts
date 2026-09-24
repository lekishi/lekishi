import { describe, expect, it } from "vitest"
import { loadChapter } from "../historical/chapter"
import { CHAPTER } from "./chapter-content"
import { projectChapter } from "./projection"

/**
 * The browser-safe content boundary.
 *
 * `chapter-content.ts` bundles the chapter with Vite's `import.meta.glob`, so
 * this test also runs through Vite's module graph: it proves the browser sees
 * the same published revisions the Node-side loader and the contract validate,
 * and that the atlas carries no synthetic fixture content.
 */

describe("the bundled chapter content", () => {
  it("matches what the Node-side loader reads from the content tree", () => {
    const tree = loadChapter(CHAPTER.id)
    const projected = projectChapter(CHAPTER.id, tree.documents, tree.sets)

    if (!projected.ok) {
      throw new Error(projected.errors.join("\n"))
    }

    expect(CHAPTER).toEqual(projected.chapter)
  })

  it("is the reviewed Tang chapter, not a synthetic fixture", () => {
    expect(CHAPTER.id).toBe("tang-mission-750-754")
    expect(CHAPTER.title).toBe("The 750–754 embassy of 藤原朝臣清河")
    expect(CHAPTER.events).toHaveLength(29)
    expect(CHAPTER.places).toHaveLength(15)
    expect(CHAPTER.defaultWindow).toEqual({ start: 750, end: 754 })
    expect(CHAPTER.publication.setIds[0]).toBe("lks:set:tang-mission-750-754-v1")

    const serialized = JSON.stringify(CHAPTER)

    for (const synthetic of [
      "Synthetic foundation fixture",
      "Fixture assembly",
      "Sample harbor",
      "event-harbor-assembly",
    ]) {
      expect(serialized).not.toContain(synthetic)
    }
  })
})
