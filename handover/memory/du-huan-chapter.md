---
name: du-huan-chapter
description: State of the draft chapter du-huan-751-762 (杜環 and the 經行記, PR #37): sources, Darwin's 2026-10-22 decisions, cited identifications, shared-record copies
metadata:
  type: project
  modified: 2026-10-21T17:08:19.551Z
---

Draft chapter `du-huan-751-762` (杜環 and the 經行記), PR #37, merged to main 2026-10-22 as a draft (no approval block). After the merge, `tang-mission-750-754` and `qin-conquest-han-233-226` are STALE on main because of the one-source-per-work merge, and they await Darwin's re-approval.

- Records live under `historical/*/du-huan/`: 25 events, 11 relationships, 29 actors and 11 places. The feasibility note is `historical/chapters/du-huan-751-762.md`.
- Sources: `tongdian` (the only witness of 經行記), `ibn-al-athir-kamil` (Tornberg vol. 5, 1871; the Talas notice is printed p. 344 = PDF page 346 of IA bub_gb_8UGkDsf47jsC; OCR unusable, read page images) and `hirth-rockhill-chau-ju-kua` (1911, IA chaujukuahiswork00chauuoft; note 14 pp. 108–110 reads 亞俱羅=Kufa, 苫=Sham, 拂菻=Syria).
- Darwin decided on 2026-10-22: one source per work (the juan-scoped Tang sources were folded into `zizhi-tongjian`, `jiu-tangshu`, `xin-tangshu`, which made the Tang and Qin chapters STALE); add Ibn al-Athīr as a competing account; cite modern scholarship where open. Other chapters still have split sources (`zizhi-tongjian-qin-ji-2`, `shiji-six-states`, `dushi-fangyu-jiyao-six-states`, `shiji-han-frontiers`).
- Shared-record convention used with the other chapter threads: copy another thread's shared file byte for byte at the same path and never edit it. Identical adds merge cleanly whichever PR lands first. Two files with one name under one kind fail the build, so a copy must keep the owner's subfolder.
  - Copied: `places/ennin/{changan,tongguan}` from the 圓仁 thread, `places/tang/guangzhou` from PR #27, and `places/xuanzang/{chach,samarkand,suyab,talas}` from the 玄奘 thread.
- Site fonts draw no simplified-only characters (香积, 马, 关, 遗, 扬). Write CJK in traditional forms, including `modern` names.
- 亞俱羅 is an approximate point at Kufa and 苫國 one at region precision (Wikidata Q13415123), both `basis: interpretation` attributed to Hirth and Rockhill. 末祿=Merv and 拔汗那 stay uncited display anchors; 西海, 摩鄰, 白石嶺 and 相州 unknown. No open source identifies 西海, 摩鄰 or 末祿 (Chavannes 1903 p. 297, Hirth 1885, Bretschneider 1888 checked); 張一純's 經行記箋注 is in copyright.
- The site has no Arabic face: transliterate names, give Arabic passages in English. `places/hannibal/carthage.yaml` on main already triggers the build's "no face draws" warning.

- Cloudflare preview builds project drafts, and every step wholly outside the manifest `window` needs a caption starting "Coda — " (src/lib/atlas/projection.ts); there is no prelude label, so pre-window steps (744, 748) are badged coda too. Reproduce with `CF_PAGES=1 CF_PAGES_BRANCH=<branch> pnpm build`; plain `pnpm build` and tests miss it.

- Darwin reviewed and pushed fixes directly on 2026-10-21 (rebased onto main with #26, so no rebase is owed). Lessons for source reading: 又云 introduces a quotation, not a journey (摩鄰 is no stop); keep the order date (癸卯) and the act date (丙午) as two events; 一云/或曰 alternative accounts give no dating bound, so leave such events undated; "craftsmen were there" is contact, not transmission; check which 通典 entry actually quotes a fragment (拔汗那 sits under 疏勒).

Related: [[cloud-env-tooling]], [[authoring-format-decisions-2026-10-18]], [[chapter-selection]]
