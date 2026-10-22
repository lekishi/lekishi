import { describe, expect, it } from "vitest"
import { parse, stringify } from "yaml"
import { compileChapter } from "../historical/authoring/compile"
import { buildTree, readFiles } from "../historical/authoring/tree"
import type { JsonObject } from "../historical/contract/types"
import type { Chapter } from "./domain"
import { projectChapter, projectStories, type ChapterCoverage } from "./projection"

/**
 * A chapter with several stories (rfd/0002/CHAPTER_STORIES.adoc), projected one
 * story at a time.
 *
 * The tree is the real one with the Tang manifest rewritten in memory into two
 * stories: the embassy as it stands, and a short second story through four of
 * 鑒眞's earlier attempts. The second story is a fixture for the projection, not
 * the chapter's content, so its key contains `example-`.
 */

const TANG = "tang-mission-750-754"

const SECOND = "example-crossings"

type Edit = (second: JsonObject) => void

function compiled(edit: Edit = () => {}, include: string[] = []) {
  const files = readFiles().map((file) => {
    if (file.path !== `chapters/${TANG}.yaml`) return file

    const { story, stories, approval, ...manifest } = parse(file.text) as JsonObject
    void approval
    const opening = (stories as JsonObject[] | undefined)?.[0] ?? {
      key: TANG,
      title: "The embassy",
      ...(story as JsonObject),
    }
    const second: JsonObject = {
      key: SECOND,
      title: "The attempts to cross",
      summary: "Four of 鑒眞's earlier attempts, as a fixture for the projection.",
      span: "742..748",
      window: "743..748",
      coverage: "A fixture: four steps only.",
      steps: [
        { "daming-invitation-742": "Coda — 742: the invitation at 大明寺" },
        { "langgou-wreck-743": "The ship breaks at 狼溝浦, 743" },
        { "ayuwang-lodging-743": "The party lodges at 阿育王寺" },
        { "south-drift-748": "The drift south, 748" },
      ],
    }

    edit(second)

    return {
      ...file,
      text: stringify({
        ...manifest,
        include: [...((manifest["include"] as string[] | undefined) ?? []), ...include],
        stories: [{ ...opening, title: "The embassy" }, second],
      }),
    }
  })

  return compileChapter(buildTree(files), TANG, { preview: true })
}

function coverageOf(bundle: ReturnType<typeof compiled>): ChapterCoverage {
  return { defaultWindow: bundle.window, stories: bundle.stories }
}

function views(edit?: Edit, include?: string[]) {
  const bundle = compiled(edit, include)

  return projectStories(TANG, bundle.documents, bundle.sets, coverageOf(bundle))
}

function ok(result: ReturnType<typeof views>): Chapter[] {
  if (!result.ok) throw new Error(result.errors.join("\n"))

  return result.chapters
}

describe("a chapter with several stories", () => {
  const [embassy, crossings] = ok(views())

  it("projects one view per story, in the manifest's order, each listing every story", () => {
    expect([embassy.storyKey, crossings.storyKey]).toEqual([TANG, SECOND])
    expect(crossings.stories.map((story) => [story.key, story.title, story.window])).toEqual([
      [TANG, "The embassy", { start: 750, end: 754 }],
      [SECOND, "The attempts to cross", { start: 743, end: 748 }],
    ])
    expect(crossings.title).toBe(embassy.title)
    expect(crossings.summary).toContain("as a fixture for the projection")
    expect(crossings.publication.coverageNote).toBe("A fixture: four steps only.")
  })

  it("opens each view on its story's window", () => {
    expect(embassy.defaultWindow).toEqual({ start: 750, end: 754 })
    expect(crossings.defaultWindow).toEqual({ start: 743, end: 748 })
  })

  it("keeps each story's events and places to itself, sharing what both reach", () => {
    const ids = (chapter: Chapter) => chapter.events.map((event) => event.id)
    const places = (chapter: Chapter) => chapter.places.map((place) => place.id)

    expect(ids(crossings)).toEqual(
      expect.arrayContaining([
        "lks:event:daming-invitation-742",
        "lks:event:langgou-wreck-743",
        "lks:event:ayuwang-lodging-743",
        "lks:event:south-drift-748",
      ]),
    )
    expect(ids(crossings)).toHaveLength(4)
    expect(ids(embassy)).not.toContain("lks:event:langgou-wreck-743")
    expect(places(crossings)).toContain("lks:place:langgou-pu")
    expect(places(crossings)).not.toContain("lks:place:akimeya")
    expect(places(embassy)).not.toContain("lks:place:langgou-pu")
    expect(places(embassy)).toContain("lks:place:yangzhou")
    expect(places(crossings)).toContain("lks:place:yangzhou")
  })

  it("keeps the embassy's journeys and diorama in its own view", () => {
    expect(embassy.overlays.journeys.map((journey) => journey.id)).toContain(
      "lks:journey:jianzhen-to-nara-753",
    )
    expect(embassy.overlays.dioramas.map((diorama) => diorama.id)).toEqual(["akimeya"])
    expect(crossings.overlays.journeys).toEqual([])
    expect(crossings.overlays.dioramas).toEqual([])
  })

  it("keeps a record only `include` reaches in the first story", () => {
    expect(embassy.relationships.map((relationship) => relationship.id)).toContain(
      "lks:relationship:komaro-tang-contact",
    )
    expect(crossings.relationships).toEqual([])
  })

  it("projects one story by its key, and the first by default", () => {
    const bundle = compiled()
    const one = projectChapter(TANG, bundle.documents, bundle.sets, coverageOf(bundle), SECOND)
    const first = projectChapter(TANG, bundle.documents, bundle.sets, coverageOf(bundle))
    const none = projectChapter(TANG, bundle.documents, bundle.sets, coverageOf(bundle), "nope")

    expect(one.ok && one.chapter.storyKey).toBe(SECOND)
    expect(first.ok && first.chapter.storyKey).toBe(TANG)
    expect(none).toEqual({ ok: false, errors: ["the chapter has no story nope"] })
  })

  it("checks a coda step against its own story's window", () => {
    const unlabelled = views((second) => {
      second["steps"] = [
        { "daming-invitation-742": "The invitation at 大明寺, 742" },
        ...(second["steps"] as JsonObject[]).slice(1),
      ]
    })
    const inside = views((second) => {
      second["window"] = "742..748"
    })

    expect(unlabelled.ok ? [] : unlabelled.errors).toEqual([
      "lks:event:daming-invitation-742 falls outside the primary 743–748 window and is not presented as a coda node",
    ])
    expect(inside.ok ? [] : inside.errors).toEqual([
      "lks:event:daming-invitation-742 is presented as a coda node but its published date falls inside the primary 742–748 window",
    ])
  })

  it("still fails an event that no story captions", () => {
    const result = views(undefined, ["sangshi-wreck-743"])

    expect(result.ok ? [] : result.errors).toEqual([
      "lks:event:sangshi-wreck-743 has no story caption, and the atlas does not invent event titles",
    ])
  })

  it("refuses a chapter with several stories and no list of them", () => {
    const bundle = compiled()
    const result = projectStories(TANG, bundle.documents, bundle.sets, {
      defaultWindow: bundle.window,
    })

    expect(result.ok ? [] : result.errors).toEqual([
      "the chapter publishes 2 stories, but its index lists none, so the atlas cannot order them",
    ])
  })
})
