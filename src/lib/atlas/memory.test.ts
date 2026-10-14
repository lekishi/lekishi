// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import { chapterPosition, forgetPositions, lastPosition, rememberPosition } from "./memory"

afterEach(() => {
  forgetPositions()
  vi.restoreAllMocks()
})

describe("reading positions", () => {
  test("remembers the last position and each chapter's own", () => {
    rememberPosition({ chapterId: "a", search: "?event=x", label: "X", at: 1 })
    rememberPosition({ chapterId: "b", search: "", label: "B", at: 2 })

    expect(lastPosition()?.chapterId).toBe("b")
    expect(chapterPosition("a")?.search).toBe("?event=x")
  })

  test("treats corrupt storage as no memory", () => {
    localStorage.setItem("lekishi:positions:v1", "{not json")
    expect(lastPosition()).toBeNull()

    localStorage.setItem(
      "lekishi:positions:v1",
      JSON.stringify({ last: "a", chapters: { a: { chapterId: "other" } } }),
    )
    expect(lastPosition()).toBeNull()
    expect(chapterPosition("a")).toBeNull()
  })

  test("a storage that throws is the same as none", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })

    expect(() => rememberPosition({ chapterId: "a", search: "", label: "", at: 0 })).not.toThrow()
    expect(lastPosition()).toBeNull()
  })
})
