---
name: e2e-known-failures
description: Known e2e failures on main (Oct 2026): the 秋妻屋浦 diorama test is flaky on desktop-chromium, and chapter-count tests break when a draft chapter is added, and the camera-follow test fails on main since 41d4b07
metadata:
  type: project
  modified: 2026-10-22T03:22:17.519Z
---

Seen while driving PR #27 on 2026-10-21/22:

- **`atlas.spec.ts` "fetches the 秋妻屋浦 diorama…" (desktop-chromium) is flaky.** It timed out in `settledCenter`/`toPass` on main (CI run 270) and on #27, then passed when the job was rerun once. Rerun it before treating it as this PR's failure.
- **Hard-coded chapter counts break when a draft chapter lands.** CI serves drafts, so adding a draft manifest (e.g. #45 Stephen II) broke "presents both chapters…", "switches chapters…" and the not-found test, which expected exactly 2. PR #49 counts the served chapters instead (`servedChapters()` in `e2e/approvals.ts`). A branch cut before #49 merges can cherry-pick it.
- **`atlas.spec.ts:701` "stops camera following on manual input without pausing playback" (desktop-chromium) fails on main at 41d4b07 (2026-10-22, run 39735159535) and on PR #33.** It times out clicking `#atlas-play-toggle` on the Tang chapter, or reads `aria-pressed` as "". No fix existed as of 07:35 UTC.

- **`atlas.spec.ts` "stops camera following on manual input…" (desktop-chromium) runs near the 120 s default**: 1.1–1.9 min on main, and it failed on slow runners (main at 80790c7 and 41d4b07). PR #55 gives it `test.setTimeout(240_000)`. Desktop-chromium suite time swings from 7 to 13 min between runners.

**How to apply:** when a PR's e2e goes red, first compare it with main's latest CI run and with these. Port the existing fix and comment once, per the PR rules.

Related: [[cloudflare-pages-queue]], [[verify-on-preview]]

- **`placeMark()` in e2e/workspace.ts picks a marker child by position** (`> span:nth-child(3)` since PR #59 added the controller disc before the pulse). Adding or reordering a marker span in `renderer/globe/view.ts` breaks every `markPoint` test on all browsers; update the index with it.
- **"presents both chapters…" can log `Cannot read properties of undefined (reading 'isReady')`** locally under swiftshader (not from src); it passed on rerun.
- **Build job "Check the production worker with a stale chapter" red on main since #64 (27f5ac3, 2026-10-23).** `scripts/check-worker.mjs` stales the first approved chapter, and once every chapter was approved that was alexander-campaigns, which has no OVERLAY_MARKERS entry. Fix on PR #65 (4286ef3 + 7461c9c) walks OVERLAY_MARKERS in order, Tang first, with marker `lks:journey:jianzhen-to-nara-753`. Never stale qin-conquest-han alone: qin-unification names it, so the static build invariant fails. Cherry-pick both until #65 merges.
