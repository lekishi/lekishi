import { describe, expect, it } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import { nextStoryStep, openableSteps, previousStoryStep, storyCaption, storyIndex } from "./story"

/**
 * Story navigation.
 *
 * The chapter's published story is its own presentation order. These cases pin
 * that the navigator follows it: the steps are the story's own captions in the
 * story's own order, a step the atlas can open is an event, a step whose record
 * has no event surface stays in place as a summary, and "next" and "previous"
 * walk only the openable steps — a summary step is never treated as an event.
 */

const TANG = await loadServedChapter(TANG_CHAPTER)
const QIN = await loadServedChapter(QIN_CHAPTER)

describe("the published story order", () => {
  it("keeps every published step, in the story's own order", async () => {
    for (const chapter of [TANG, QIN]) {
      expect(chapter.story.length, chapter.id).toBeGreaterThan(0)

      const events = chapter.story.filter((step) => step.kind === "event")
      const summaries = chapter.story.filter((step) => step.kind === "summary")

      // Every published event is a step, and every step carries a caption: the
      // projection refuses a chapter that breaks either rule.
      expect(events.length, chapter.id).toBe(chapter.events.length)
      expect(summaries.length, chapter.id).toBeGreaterThan(0)

      for (const step of chapter.story) {
        expect(step.caption.trim(), step.recordId).not.toBe("")
      }
    }
  })

  it("marks the Tang chapter's relationship steps as summaries, not events", () => {
    const summaries = TANG.story.filter((step) => step.kind === "summary")

    expect(summaries.map((step) => step.recordId)).toContain("lks:relationship:japan-tang-embassy")
    expect(summaries.map((step) => step.recordId)).toContain("lks:relationship:jianzhen-travel")
    // A relationship is not an event the atlas can open, and it is not dropped
    // from the order either.
    expect(TANG.events.map((event) => event.id)).not.toContain(
      "lks:relationship:japan-tang-embassy",
    )
  })
})

describe("story navigation", () => {
  it("walks the openable steps and skips the summaries", () => {
    const steps = openableSteps(QIN)

    expect(steps.map((step) => step.recordId)).toEqual([
      "lks:event:han-submission-233",
      "lks:event:hanfei-death-233",
      "lks:event:han-nanyang-cession-231",
      "lks:event:han-conquest-230",
      "lks:event:xinzheng-revolt-226",
    ])

    expect(nextStoryStep(QIN, "lks:event:han-submission-233")?.recordId).toBe(
      "lks:event:hanfei-death-233",
    )
    expect(previousStoryStep(QIN, "lks:event:hanfei-death-233")?.recordId).toBe(
      "lks:event:han-submission-233",
    )
  })

  it("has no next step at the story's end and no previous step at its start", () => {
    const steps = openableSteps(TANG)
    const first = steps[0]?.recordId ?? ""
    const last = steps[steps.length - 1]?.recordId ?? ""

    expect(previousStoryStep(TANG, first)).toBeNull()
    expect(nextStoryStep(TANG, last)).toBeNull()
    // An event that is not a story step, or no selection at all, has neither.
    expect(nextStoryStep(TANG, null)).toBeNull()
    expect(nextStoryStep(TANG, "lks:event:no-such-event")).toBeNull()
    expect(previousStoryStep(TANG, null)).toBeNull()
  })

  it("reports where an event sits in the story, with the story's own caption", () => {
    expect(storyIndex(QIN, "lks:event:hanfei-death-233")).toBe(1)
    expect(storyCaption(QIN, "lks:event:hanfei-death-233")).toBe(
      "韓非 is detained and dies at 雲陽, 233 BCE — a disputed account",
    )
    expect(storyIndex(QIN, null)).toBe(-1)
    expect(storyCaption(QIN, null)).toBeNull()
  })
})
