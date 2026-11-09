---
name: qin-han-steppe
description: State of the Qin–Han and steppe draft chapters (PR #42, stacked on six-states PR #38) and the ids they share with other threads
metadata:
  type: project
---

On 2026-10-21 the "Qin–Han and the steppe" thread opened draft PR #42 (branch claude/project-thread-dqyrr2). It is stacked on the six-states PR #38 (claude/project-thread-dli4e4) and retargets to main when #38 merges. It holds five draft manifests:
- han-xiongnu-wars-133-119
- zhang-qian-missions-140-115
- ban-chao-western-regions-73-102
- wa-nu-seal-57
- qin-shihuang-tours-220-210 (reuses #38's Qin records unedited)

The PR also has journey sketches in historical/journeys/ and feasibility notes rfd/0002/*_FEASIBILITY.adoc. Open gaps: the 漢書 卷19 table for 張騫's 大行 date, and a referenced source for the 1784 seal find (only Wikidata today).

Shared-id agreements with other open PRs:
- **玄奘 #32:** the ids khotan, kashgar, kucha, agni, baluka and yiwu.
- **圓仁 #36:** the id shikanoshima.
- **Rule for both:** each record has a copy in both PRs, with identical Wikidata pins. Whichever PR merges second folds its names and cites into the existing file and deletes its own copy. The compiler's duplicate-id check catches it on rebase.
- **Han cities:** the Han city sites are separate records, han-changan and han-luoyang. They are distinct from the Sui–Tang changan and luoyang.
- **From #38:** kuaiji-jun is the commandery. The mountain should be minted as kuaiji-shan.

Lessons from this work:
- Variant characters outside Big5 and JIS (e.g. 㢮 穼 乆 恱) in quotes risk the font-subset build check. Shorten the quote instead.
- Simplified forms also broke the build (coordinator, from PR #26).

**Why:** several region threads mint the same oases, cities and islands. Without these agreements, duplicates or broken merges follow.
**How to apply:** before minting a place in Central Asia, northern China or Kyūshū, grep every remote branch for the id and the modern name. See [[content-layout-world-first]] and [[cloud-env-tooling]].

- 2026-10-21: Darwin pushes review fixes straight onto PR #42's branch (e.g. 羌中, 李廣's battle dispute, the last tour's widened dates). Always `jj git fetch` before rebasing or pushing the stack, and adopt the remote head when its tree already matches.
- 2026-10-22 03:41 UTC: Darwin merged PR #42 into #38's branch (claude/project-thread-dli4e4), not main. The five Qin–Han chapters reach main when #38 merges. All five are still unapproved drafts.
