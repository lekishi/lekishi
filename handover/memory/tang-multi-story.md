---
name: tang-multi-story
description: Several stories per chapter manifest are built (PR #27); Tang has embassy, 鑒眞 crossings and 圓仁's diary (PR #65 merged 2026-10-23); missions network still to wire in
metadata:
  type: project
  modified: 2026-10-21T14:53:44.749Z
---

On 2026-10-21 Darwin picked "several stories per manifest" over "a new chapter manifest" for 鑒眞's five failed crossings (743–748). This matches RFD 1's "widen the Tang chapter to its network" decision: missions network, the crossings and 圓仁's diary become stories inside `tang-mission-750-754`.

On 2026-10-22 Darwin chose "Build it as proposed" for rfd/0002/CHAPTER_STORIES.adoc (stories: list, ?story=, switcher, per-story coda window, one approval per chapter), and "Masters in the repo" for media v1 files (rfd/0002/MEDIA.adoc). The build goes on PR #27's branch.

**Why:** RFD 1 says the Tang chapter adds the crossings as a second story. Darwin preferred to keep Tang growing in one place toward 200 events.

**How to apply:**
- Crossing records live in the world-first tree and do not depend on this choice.
- Changing the Tang manifest makes its approval stale until Darwin re-approves it.
- The parallel voyage thread also edits Tang, so coordinate with it.

Related: [[authoring-format-decisions-2026-10-18]], [[content-layout-world-first]]

Update 2026-10-21: PR #27 (branch claude/project-thread-8lbb62) adds the crossings' records (33 events 742–753, 28 places, 13 actors under historical/*/tang/) reached by no chapter yet, and proposes rfd/0002/CHAPTER_STORIES.adoc (stories: list, ?story=, switcher, one approval per chapter) and rfd/0002/MEDIA.adoc (media v1). Both are awaiting Darwin's cards. Shared place ids other threads reuse: yuezhou, fuzhou, hangzhou, guangzhou, jiangning, ayuwang-temple. 振州/萬安州/崖州 have unknown geometry until a reference places them. Wikimedia APIs rate-limit the cloud IP; WDQS SPARQL with `schema:version` gives item revisions in one query.

Missions network (630–894) records merged in PR #43 on 2026-10-22, under `historical/*/tang-missions/` with feasibility note `rfd/0002/TANG_MISSIONS_NETWORK.adoc`. No story manifest was added, so wiring the records into `tang-mission-750-754` is still open.

Merged 2026-10-22 (PR #27, squash 67199db): multi-story is built. Manifest `stories:` (first story has no `window`, it opens on the chapter's), story keys unique project-wide, `?story=` (left out for the first story), StoryChoice switcher above the journal, search across stories, per-story coda check. Tang now has two stories: `tang-mission-750-754` ("The embassy of 750–754") and `jianzhen-crossings-742-753` (window 742..750, coda = yangzhou-invitation-753). Chapter title kept; retitling is Darwin's call. Tang approval is STALE until Darwin re-approves. To add 圓仁 (#36 records) or the missions network as further stories, append to `stories:` in historical/chapters/tang-mission-750-754.yaml and extend the coverage fixtures in projection.test.ts / chapter-catalog.test.ts; tang-chapter.test.ts reads the embassy's rules from the first story only. Gotcha: `scripts/check-worker.mjs` appends " (worker check)" to Qin's title, so tests must not hardcode a single-story chapter's title.

2026-10-23: 圓仁's diary added as Tang's third story `ennin-diary-838-847` (PR #65, merged 2026-10-23; Tang approval STALE until Darwin re-approves; 113 steps, window 838..847, five ennin journeys in `include`). Projection rule added: a journey belongs to every story whose steps reach all its stops (else it falls to the first story and fails there). Test fixtures that rewrite the Tang manifest down to fewer stories must drop the `ennin-*` includes. Missions network (#43) is the remaining Tang story.
