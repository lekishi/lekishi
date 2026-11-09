---
name: chapter-projection-window-rules
description: Rules a draft chapter must meet for the atlas projection and card tests (window, coda captions, summary year); learned 2026-10-21 on PR #45
metadata:
  type: reference
  modified: 2026-10-21T16:09:19.622Z
---

Found while drafting Stephen II's chapter (PR #45, 2026-10-21). These show up in `pnpm test` and in preview builds:

- `src/lib/atlas/projection.ts`: every event outside the manifest's `window` must have a story caption starting with `Coda — `. Every event inside the window must not. A window value such as `754..755` counts as inside when it overlaps the window. There is no prelude label, so put the earlier events inside the window.
- `src/lib/atlas/chapters.test.ts`: the chapter `summary` must contain the window's start year.
- Since #44 (2026-10-21) plain `pnpm test` serves drafts too, and CI's e2e artifact is built with `LEKISHI_DRAFTS=1`. Tests that counted chapters were made draft-tolerant in #47 (search index) and #49 (e2e `servedChapters()` in `e2e/approvals.ts`). Never hardcode the chapter count in a test.
- Quickest full reproduction of the preview gate: `CF_PAGES=1 CF_PAGES_BRANCH=<branch> pnpm build` (about 5 minutes, exit 0 when clean). Hit on PR #31 too (Jehoiachin's release, 561, outside a 598–586 window).
- A preview-style build runs locally with `LEKISHI_DEV_PAGES=1` and the build scripts in order. `sync-globe-tiles` takes about 8 minutes.

**How to apply:** check a new chapter manifest against these rules before pushing. Related: [[shared-records-parallel-threads]].
