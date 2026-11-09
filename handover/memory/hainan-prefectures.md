---
name: hainan-prefectures
description: How the Tang Hainan prefectures 振州, 萬安州, 崖州 were placed (PR #66, 2026-10-23) and what source/approval side effects that had
metadata:
  type: project
  modified: 2026-10-23T07:16:36.403Z
---

PR #66 (merged 2026-10-23) places the three prefectures of 鑒眞's 748–749 Hainan stay as region-level `approximate_point`, `basis: interpretation`, attributed to 顧祖禹 讀史方輿紀要 卷一百五 瓊州府, point = Wikidata coordinate of the modern namesake:
- `zhenzhou-hainan` (seat 寧遠; Song renamed 振州 → 崖州) → 崖州區 Q16259700.
- `wananzhou` → 陵水 Q944615, because the seat moved to 陵水 開元九年 (721) and back to 萬安 貞元初 (785). Not 萬寧.
- `yazhou` (Tang seat 舍城, merged into 瓊山) → 瓊山區 Q1022262. The gazetteer's 舍城 distance (府東北二百六十里) doesn't fit and isn't used.

Side effects:
- `dushi-fangyu-jiyao` was widened to one source for the whole work. Through shared places like 新鄭, that makes Qin ×2, chonger-exile and kongzi-travels approvals stale, along with Tang.
- `-six-states` and `-zhou` copies are still separate; folding them in is open work.
- Rebased onto main after #65 (2026-10-23). #65 had already fixed the source-boundary test (one story's view) and check:worker (Tang first in OVERLAY_MARKERS), so this PR's own versions of those fixes were dropped.

Test timeouts: after #65, a cold record-tree read costs ~3 s per vitest worker (1.4 s YAML parse, ~1.5 s schema checks), so first tests that load a chapter can pass 5 s on runners (qin-chapter timed out on #66 once). Fixed by PR #67 (merged 2026-10-23): a vitest globalSetup reads the tree once (tree.ts `readEntries`) and `provide`s it, and each worker's setupFile `seedReadCache`s it. Qin's first test goes from 2.8 s to 0.2 s.

Sources ruled out: CHGIS (not adopted, RFD 2) and Takakusu's BEFEO translation (Persée captcha, NC terms). 新唐書 卷四十三上 地理志 confirms the seats but wasn't cited, to avoid making Du Huan stale.

Related: [[tang-multi-story]], [[content-evidence-rules]].
