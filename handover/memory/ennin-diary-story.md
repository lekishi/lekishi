---
name: ennin-diary-story
description: 圓仁's diary (838–847) records for the Tang chapter, in PR #36: ids, owned places, what's open
metadata:
  type: project
  modified: 2026-10-21T15:43:01.710Z
---

On 2026-10-21, PR #36 (merged 2026-10-22) added world-first records for 圓仁's 入唐求法巡禮行記. It is a further story inside `tang-mission-750-754`; see [[tang-multi-story]]. No manifest was touched.

- **Source:** `nitto-guho-junrei-gyoki`, the Wikisource text of the 大日本佛教全書 edition. It is ⚠ conditional in the register. 小野勝年 and Reischauer are consulted only, never quoted.
- **Records:** all live under `historical/*/ennin/`.
  - 35 places; 13 of them are `unknown`.
  - 15 actors, 102 events (prefix `ennin-`, plus `huichang-*`) and 11 relationships.
  - 5 journeys in the PR #26 shape, under `historical/journeys/ennin/`.
- **Ownership:**
  - This work owns `changan`, `luoyang` and `taiyuan`, which the 玄奘 story shares.
  - The Tang missions work (#43, merged) owns the `mission-838-*` records and `fujiwara-no-tsunetsugu`, which the ennin events reference.
- **`shikanoshima` is shared:** on 2026-10-22 the 圓仁 copy was folded into main's `historical/places/wa/shikanoshima.yaml` (from #38). The diary's 志賀嶋 name form and its cite were added there. 漢 sites are separate records (`han-luoyang`, `han-changan`), not `luoyang`/`changan`.
- **Notation gap:** 閏 months can't be written, so 847 閏三月 is a window from the 3rd to the 4th month.
- **Window rule:** the CF preview build fails a draft chapter whose story has an event wholly outside the manifest `window` unless the step caption starts "Coda — " (src/lib/atlas/projection.ts). 838–847 is outside 750–754, so adding this story needs its own window (multi-story proposal). Reproduce with `CF_PAGES=1 CF_PAGES_BRANCH=<branch> pnpm build`.
- **Container issue:** `pnpm brand:check` fails in cloud containers because the Playwright headless shell is missing. This is an environment problem, not a code problem.

**Status 2026-10-23:** wired in as Tang's third story `ennin-diary-838-847` by PR #65 (merged), with its own 838..847 window.

**Why:** later threads that grow Tang or build the story switcher need these ids and dependencies.

**How to apply:** reuse these ids. Read rfd/0002/ENNIN_DIARY_FEASIBILITY.adoc for the open questions (split the story or not; adopt a gazetteer for the 13 unlocated places).
