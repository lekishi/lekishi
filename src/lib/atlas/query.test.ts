import { beforeAll, describe, expect, it } from "vitest"
import { loadServedChapter } from "./chapter-catalog"
import { QIN_CHAPTER, TANG_CHAPTER } from "./chapter-registry"
import type { Chapter } from "./domain"
import {
  applyChapterQuery,
  chapterQuery,
  chooseStory,
  isEmptyQuery,
  readChapterQuery,
} from "./query"
import { createAtlasState, selectEvent, selectPlace, setTimeWindow } from "./state"

let tang: Chapter
let qin: Chapter

beforeAll(async () => {
  tang = await loadServedChapter(TANG_CHAPTER)
  qin = await loadServedChapter(QIN_CHAPTER)
})

function open(chapter: Chapter, search: string) {
  return applyChapterQuery(
    createAtlasState(chapter),
    chapter,
    readChapterQuery(new URLSearchParams(search)),
  )
}

describe("reading the chapter query", () => {
  it("treats empty and missing parameters alike", () => {
    expect(isEmptyQuery(readChapterQuery(new URLSearchParams("")))).toBe(true)
    expect(isEmptyQuery(readChapterQuery(new URLSearchParams("event=&place=")))).toBe(true)
    expect(isEmptyQuery(readChapterQuery(new URLSearchParams("step=2")))).toBe(false)
  })
})

describe("applying the chapter query", () => {
  it("opens a linked event with its card, its time and a camera flight", () => {
    const arrival = open(tang, "?event=akimeya-landfall-753")

    expect(arrival.opened).toEqual({ kind: "event", id: "lks:event:akimeya-landfall-753" })
    expect(arrival.state.selectedEventId).toBe("lks:event:akimeya-landfall-753")
    expect(arrival.state.playhead).toBe(753)
    expect(arrival.state.cameraFocus?.recordId).toBe("lks:event:akimeya-landfall-753")
    // A link frames the place, but it does not turn following on.
    expect(arrival.state.cameraFollow).toBe("manual")
    expect(arrival.state.storyStep).toBe(
      tang.story.findIndex((step) => step.recordId === "lks:event:akimeya-landfall-753"),
    )
    expect(arrival.widened).toBe(false)
    expect(arrival.notFound).toBeNull()
  })

  it("accepts the full record id as well as the short one", () => {
    expect(open(tang, "?event=lks:event:akimeya-landfall-753").opened?.kind).toBe("event")
  })

  it("widens the window to include a linked event outside it, and says so", () => {
    const arrival = open(tang, "?event=kiyokawa-honours-779")

    expect(arrival.widened).toBe(true)
    expect(arrival.state.timeWindow).toEqual({ start: 750, end: 779 })
    expect(arrival.state.playhead).toBe(779)
  })

  it("applies the window before the event, so the link's own window is checked", () => {
    const arrival = open(tang, "?event=appointment-750&from=752&to=754")

    expect(arrival.widened).toBe(true)
    expect(arrival.state.timeWindow).toEqual({ start: 750, end: 754 })
  })

  it("lets event win over place, and place over step", () => {
    expect(open(tang, "?event=appointment-750&place=akimeya&step=3").opened?.kind).toBe("event")
    expect(open(tang, "?place=akimeya&step=3").opened).toEqual({
      kind: "place",
      id: "lks:place:akimeya",
    })
    expect(open(tang, "?place=akimeya").state.selectedEventId).toBeNull()
  })

  it("opens a story step, including a summary step that selects nothing", () => {
    const eventStep = open(tang, "?step=1")

    expect(eventStep.opened).toEqual({ kind: "step", index: 0 })
    expect(eventStep.state.selectedEventId).toBe(tang.story[0]?.recordId)

    const summaryIndex = tang.story.findIndex((step) => step.kind === "summary")
    const summaryStep = open(tang, `?step=${summaryIndex + 1}`)

    expect(summaryStep.state.selectedEventId).toBeNull()
    expect(summaryStep.state.storyStep).toBe(summaryIndex)
  })

  it("keeps an undated summary step undated instead of moving the playhead", () => {
    const index = qin.story.findIndex(
      (step) => step.recordId === "lks:relationship:qin-han-conflict",
    )
    const arrival = open(qin, `?step=${index + 1}`)

    expect(arrival.state.storyStep).toBe(index)
    expect(arrival.state.playhead).toBe(qin.defaultWindow.start)
  })

  it("opens a stale id at the chapter's start and names it", () => {
    for (const [search, kind, value] of [
      ["?event=no-such-event", "event", "no-such-event"],
      ["?place=atlantis", "place", "atlantis"],
      ["?step=999", "step", "999"],
      ["?step=two", "step", "two"],
    ] as const) {
      const arrival = open(tang, search)

      expect(arrival.notFound).toEqual({ kind, value })
      expect(arrival.state).toEqual(createAtlasState(tang))
    }
  })

  it("ignores a half or malformed window", () => {
    expect(open(tang, "?from=751").state.timeWindow).toEqual(tang.defaultWindow)
    expect(open(tang, "?from=a&to=b").state.timeWindow).toEqual(tang.defaultWindow)
    expect(open(qin, "?from=-231&to=-229").state.timeWindow).toEqual({ start: -231, end: -229 })
  })
})

describe("writing the chapter query", () => {
  it("writes nothing for the chapter's opening state", () => {
    expect(chapterQuery(createAtlasState(tang), tang)).toBe("")
  })

  it("writes the selection by its short id and the window when it is not the default", () => {
    const selected = selectEvent(createAtlasState(tang), tang, "lks:event:akimeya-landfall-753")

    expect(chapterQuery(selected, tang)).toBe("?event=akimeya-landfall-753")
    expect(chapterQuery(setTimeWindow(selected, tang, { start: 751, end: 753 }), tang)).toBe(
      "?event=akimeya-landfall-753&from=751&to=753",
    )
    expect(chapterQuery(selectPlace(createAtlasState(tang), tang, "lks:place:yaku"), tang)).toBe(
      "?place=yaku",
    )
  })

  it("round-trips through the reader", () => {
    for (const search of [
      "?event=yaku-departure-753",
      "?place=heijo-palace&from=750&to=760",
      "?step=2",
    ]) {
      expect(chapterQuery(open(tang, search).state, tang)).toBe(search)
    }
  })
})

describe("a chapter with several stories", () => {
  // A second view made from the Tang chapter's own, holding three of its
  // events: a fixture for choosing a story, not a story the chapter has.
  const stories = () => {
    const options = [
      { key: TANG_CHAPTER, title: "The embassy", window: tang.defaultWindow },
      { key: "example-second", title: "A second story", window: { start: 753, end: 754 } },
    ]
    const kept = new Set([
      "lks:event:akimeya-landfall-753",
      "lks:event:dazaifu-entry-753",
      "lks:event:naniwa-754",
    ])
    const first: Chapter = { ...tang, stories: options }
    const second: Chapter = {
      ...tang,
      storyKey: "example-second",
      stories: options,
      defaultWindow: { start: 753, end: 754 },
      events: tang.events.filter((event) => kept.has(event.id)),
      story: tang.story.filter((step) => kept.has(step.recordId)),
    }

    return [first, second]
  }
  const query = (search: string) => readChapterQuery(new URLSearchParams(search))

  it("opens the story the address names, and the first when it names none", () => {
    const [first, second] = stories()

    expect(chooseStory([first, second], query("?story=example-second")).chapter).toBe(second)
    expect(chooseStory([first, second], query("")).chapter).toBe(first)
    expect(chooseStory([first, second], query("?step=2")).chapter).toBe(first)
    expect(chooseStory([first, second], query("?story=nope"))).toEqual({
      chapter: first,
      missing: "nope",
    })
  })

  it("opens a linked event in the reader's story when it holds it, else the first that does", () => {
    const [first, second] = stories()
    const shared = query("?event=naniwa-754")
    const firstOnly = query("?event=appointment-750")

    expect(chooseStory([first, second], shared, "example-second").chapter).toBe(second)
    expect(chooseStory([first, second], shared, null).chapter).toBe(first)
    expect(chooseStory([second, first], shared, null).chapter).toBe(second)
    expect(chooseStory([first, second], firstOnly, "example-second").chapter).toBe(first)
  })

  it("writes the story only when it is not the one the chapter opens on", () => {
    const [first, second] = stories()
    const selected = selectEvent(createAtlasState(second), second, "lks:event:naniwa-754")

    expect(chapterQuery(createAtlasState(first), first)).toBe("")
    expect(chapterQuery(createAtlasState(second), second)).toBe("?story=example-second")
    expect(chapterQuery(selected, second)).toBe("?story=example-second&event=naniwa-754")
  })
})
