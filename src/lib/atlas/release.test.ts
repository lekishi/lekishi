import { describe, expect, it } from "vitest"
import { chapterBundle } from "../historical/chapter"
import { objectOf } from "../historical/contract/types"
import { CHAPTER_MANIFESTS, SERVED_CHAPTERS } from "./chapter-registry"
import { chapterRelease } from "./release"

/**
 * The chapter cards' release statements against the approvals that decide them.
 *
 * Each card states a date and a decision in its secondary metadata. The
 * chapter manifest's approval is the authority for that decision and the
 * compiled set is the authority for what was reviewed, so this test reads both:
 * a card cannot state an approval date its manifest does not record, and it
 * cannot describe the approved set as reviewed beyond the self-review the set
 * actually carries.
 */

describe("the chapter cards' release statements", () => {
  it("states the decision and date each chapter's approval records", () => {
    expect(SERVED_CHAPTERS.length).toBeGreaterThan(0)

    for (const { id } of SERVED_CHAPTERS) {
      const manifest = CHAPTER_MANIFESTS.find((entry) => entry.id === id)
      const release = chapterRelease(id)

      expect(manifest?.state, id).toBe("approved")
      expect(release, id).toBeDefined()
      expect(release?.decidedOn, id).toBe(manifest?.approval?.on)
      // The card's own line carries the date, so the two cannot drift apart.
      expect(release?.status, id).toContain(String(release?.decidedOn))
      expect(release?.decision, id).toContain(String(release?.decidedOn))
      expect(release?.status, id).toContain("Owner-approved for release")
      // The short decision line is the start of the card's full status line, so a
      // page cannot state one decision and a card another.
      expect(release?.status, id).toContain(String(release?.decision))
    }
  })

  it("describes each approved set as it is: self-review, not independent or specialist review", () => {
    for (const { id } of SERVED_CHAPTERS) {
      const bundle = chapterBundle(id)
      const release = chapterRelease(id)

      expect(bundle.state, id).toBe("approved")
      expect(bundle.sets, id).toHaveLength(1)
      expect(String(objectOf(bundle.sets[0]["review"])["independence"]), id).toBe("self_review")

      // The approval is an owner decision, not a review of the content: the line
      // must keep saying so, and must keep the specialist reviews open.
      expect(release?.status, id).toContain("Not independent or specialist review")
      expect(release?.status, id).toContain("remain unperformed")
      expect(release?.status, id).not.toContain("Independent review recorded")
      expect(release?.status, id).not.toContain("Specialist review recorded")
    }
  })

  it("states nothing for a chapter without an approval", () => {
    expect(chapterRelease("not-a-chapter")).toBeUndefined()

    for (const manifest of CHAPTER_MANIFESTS.filter((entry) => entry.state !== "approved")) {
      expect(chapterRelease(manifest.id), manifest.id).toBeUndefined()
    }
  })
})
