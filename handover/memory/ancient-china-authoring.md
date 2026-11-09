---
name: ancient-china-authoring
description: How the ancient-China draft chapters (PR #35) were authored: shared ids, per-chapter sources, traditional forms, merge of #38, proposed evidence states
metadata:
  type: project
  modified: 2026-10-21T16:09:56.072Z
---

Thread "Ancient China" (branch claude/project-thread-97dc38, draft PR #35, started 2026-10-21) authors candidates 7, 8, 9, 12, 14: shang-yin-wu-ding, zhou-conquest-muye, zhou-move-east, chonger-exile, and Confucius's travels.

- **Separate source records** (shiji-yin-zhou, shiji-chunqiu, dushi-fangyu-jiyao-zhou, zuozhuan, guben-zhushu-jinian, shangshu, zhouyi) instead of editing `shiji` / `dushi-fangyu-jiyao`, because editing those would stale the approved Qin chapter's digest.
- **Shared ids minted here:** zhou-state, shang-state, lu-state, song-state, jin-state, zheng-state, wey-state (衛; `wei-state` is 魏 in PR #38), cao-state; places luoyi, haojing, song-shangqiu, qufu, and 春秋 places under places/chunqiu/. Reuse them.
- **#38 merged 2026-10-22**; PR #35 was rebased onto main and merged 2026-10-22. The five ancient-China chapters are on main as drafts awaiting approval.
- Since #44, unit tests serve drafts: each chapter summary must contain its window's start year label (src/lib/atlas/chapters.test.ts). Draft chapters also fail the Cloudflare preview build if a non-"Coda — " step falls outside the window; check with `CF_PAGES=1 CF_PAGES_BRANCH=<branch> pnpm build`.
- **Traditional forms only** in record text: the fonts (Noto Serif JP/TC) lack many simplified glyphs and the build fails (`pnpm sync:fonts` prints "no face draws: …"). Quotes from simplified Wikisource transcriptions are given in traditional forms and the source notes say so.
- Wikisource 讀史方輿紀要 卷四十一/四十八 transcriptions are simplified; 史記 年表's 公元前 column is the transcription's addition.
- Wikimedia/Wikidata APIs rate-limit hard (429); fetch EntityData slowly in the background.
- Proposed evidence states (in each chapter's .md, awaiting Darwin): `c. YEAR` approximate, `reign:` reference, relative dates (`relative_to`), alternatives-only windows, unknown-within-region, before/after ordering, sexagenary day dates, rival-account links between events, stops placed at a state.

**Why:** ~18 threads touch shared records; these conventions avoid duplicate ids, stale approvals and font build failures.
**How to apply:** check historical/ on main and open PR branches before minting; never edit approved records. See [[chapter-selection]], [[authoring-format-decisions-2026-10-18]].
