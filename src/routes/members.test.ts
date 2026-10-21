import { describe, expect, it, vi } from "vitest"
import { isHttpError } from "@sveltejs/kit"
import { SERVED_CHAPTERS } from "../lib/atlas/chapter-registry"
import type { Chapter } from "../lib/atlas/domain"

/**
 * What the Pages worker gives whom (RFD 6). A signed-in member of the lekishi
 * organization gets a draft at its own address and in the drafts' cards and
 * search; anyone else gets the same 404 as an address that does not exist, so a
 * draft's existence is never confirmed to them. The drafts module is replaced
 * with one draft, because a test build serves every chapter publicly and so has
 * none of its own.
 */

const DRAFT = "members-probe"
const draftChapter = { id: DRAFT, title: "Story title" } as unknown as Chapter

vi.mock("$lib/server/drafts", () => ({
  memberDraft: (id: string) =>
    id === DRAFT
      ? {
          chapter: draftChapter,
          heading: { name: "Probe", decision: "Draft", status: "Draft.", draft: true },
          scope: "Visible to signed-in lekishi members; not published.",
        }
      : undefined,
  memberDraftCards: () => [{ id: DRAFT, name: "Probe", draft: true }],
  memberDraftChapters: () => [],
  memberDraftName: () => "Probe",
}))

const { load } = await import("./chapters/[chapter]/+page.server")
const cards = await import("./drafts.json/+server")
const search = await import("./drafts/search-index.json/+server")

const member: App.Locals = { user: { login: "darwin67" } }
const stranger: App.Locals = { user: null }

async function status(run: () => unknown): Promise<number> {
  try {
    const result = await run()
    return result instanceof Response ? result.status : 200
  } catch (error) {
    if (isHttpError(error)) return error.status
    throw error
  }
}

describe("the chapter route", () => {
  it("prerenders exactly the served chapters and leaves the rest to the worker", async () => {
    const route = await import("./chapters/[chapter]/+page.server")

    expect(route.prerender).toBe("auto")
    expect(route.entries()).toEqual(SERVED_CHAPTERS.map((chapter) => ({ chapter: chapter.id })))
  })

  it("gives a member the draft with its own heading", async () => {
    const data = await load({ params: { chapter: DRAFT }, locals: member })

    expect(data.chapter).toBe(draftChapter)
    expect(data.heading?.draft).toBe(true)
    expect(data.scope).toContain("signed-in lekishi members")
  })

  it("answers anyone else as if the draft did not exist", async () => {
    expect(await status(() => load({ params: { chapter: DRAFT }, locals: stranger }))).toBe(404)
    expect(await status(() => load({ params: { chapter: "no-such" }, locals: stranger }))).toBe(404)
    expect(await status(() => load({ params: { chapter: "no-such" }, locals: member }))).toBe(404)
  })
})

describe("the drafts' cards and search", () => {
  it("are a member's only", async () => {
    expect(await status(() => cards.GET({ locals: member }))).toBe(200)
    expect(await status(() => search.GET({ locals: member }))).toBe(200)
    expect(await status(() => cards.GET({ locals: stranger }))).toBe(404)
    expect(await status(() => search.GET({ locals: stranger }))).toBe(404)
  })

  it("are never prerendered", () => {
    expect(cards.prerender).toBe(false)
    expect(search.prerender).toBe(false)
  })
})
