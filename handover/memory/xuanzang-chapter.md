---
name: xuanzang-chapter
description: 玄奘 journey chapter (draft PR #32): ids, folders, sources, open follow-ups, Wikidata rate-limit fact
metadata:
  type: project
  modified: 2026-10-21T15:32:25.247Z
---

Draft chapter `xuanzang-journey-629-645` (玄奘's journey to India), PR #32, MERGED 2026-10-22 06:15 UTC. It was opened 2026-10-21 on branch claude/project-thread-o83o18, stacked on the 圓仁 branch commit 3d6b7d2 (rebased onto main after #26 on 2026-10-21; was 2c0f5ab7), which holds the shared `changan` and `luoyang`. It has no approval yet.

- Records live in {places,actors,events,relationships}/xuanzang/. There are 77 places (55 Wikidata display anchors and 22 unknown), 16 actors, 98 events and 9 relationships.
- Sources: `cien-zhuan` (慈恩傳, the spine), `xiyu-ji` (names), and `jiu-tangshu-fangji` (conflicting dates). Each has a register row.
- Shared ids other chapters reuse: Central Asian places (suyab, talas, chach, samarkand, kucha) for 杜環; Indian places for 阿育王; `tang-taizong` for the Tang missions network.
- Chronology: 91 events sit in reckoned editorial windows. Disputes are recorded for the departure month and the death year (664 against 661).
- Follow-ups are in rfd/0002/XUANZANG_JOURNEY_FEASIBILITY.adoc. They are: PD identifications (Cunningham 1871, Watters 1904–05) for approximate_point; the journey record once PR #26 lands; and a cited source for the 葉護可汗 identification.
- Environment fact: Wikidata api.php, SPARQL and Wikipedia return 429 from cloud containers. Special:EntityData and Special:ItemByTitle work when spaced about 20s apart.

Related: [[chapter-selection]], [[tang-multi-story]].

Overlap with the 班超 chapter (branch claude/project-thread-dqyrr2), agreed 2026-10-21: it reuses khotan, kashgar, kucha, agni, baluka and yiwu, so both branches carry a file for each of these ids. Whichever PR lands second folds its names and cites into the existing file and deletes its own copy. The Han names are in historical/places/western-regions/ on that branch. han-changan and han-luoyang are separate Han-site records, distinct from changan and luoyang.

2026-10-21 late: Darwin pushed his own commits to PR #32: review fixes, and draft journeys in historical/journeys/xuanzang/ (three journeys; the compiler doesn't read them yet). The branch is now stacked on the full 圓仁 branch tip (495320d), which is rebased onto main; head 8124abe. Always fetch before pushing and never force over his commits. The scratchpad generator scripts are stale, so edit the record files directly and don't regenerate.

2026-10-22 03:50: PR #32 is ready for review. Darwin restacked it on #36's head a12af04, and the new head is 517d9c5. It is dirty against main because #49 landed: a12af04 ports #49 and conflicts in three e2e files, and main's versions should win. I told the 圓仁 thread and commented on the PR. Next step: once #36 is updated or merged, restack #32 onto it. Don't add a merge commit under Darwin's stack.
2026-10-22 04:00: #36 was rebased onto main 0bec0c3 at 1120778, and a12af04 was dropped. I restacked #32 onto it, and the new head is c04f0dc, ten own commits. The CF build and 828 tests pass.
2026-10-22 04:50: #32 was rebased onto #36 9207373, which sits on main 12d33b4; the head is 43b2972. The 班超 records landed first, so agni, baluka, kashgar, khotan, kucha and yiwu are folded into places/western-regions/ inside the places commit 0eafcb7. Through them the chapter now also reaches hou-hanshu. #39 (Aśoka) stacks on 7d281a0 (sources) and 0eafcb7 (places), so tell that thread whenever those commits change.
