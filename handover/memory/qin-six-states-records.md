---
name: qin-six-states-records
description: Ids and conventions of the Qin six-states (230–221 BCE) draft chapter and its shared records, and its territory snapshots (PR #59)
metadata:
  type: project
  modified: 2026-10-21T15:50:56.236Z
---

Draft chapter `qin-unification-230-221` (thread "Qin's conquest of the six states", branch claude/project-thread-dli4e4, 2026-10-21). Records live under historical/{places,actors,events,relationships}/qin/.

- **Separate source records keep approved chapters fresh:** `shiji-six-states`, `zizhi-tongjian-qin-ji-2` and `dushi-fangyu-jiyao-six-states` are second records for works whose original source records belong to the approved Han chapter. Editing `shiji`/`zizhi-tongjian`/`dushi-fangyu-jiyao` to add juan would make that chapter stale.
- **Shared ids other threads should reuse:** places xianyang, handan, ji-yan (薊), daliang, linzi, chen (陳/郢陳), liaodong, dai, shanggu, taiyuan-jun, kuaiji-jun (the commandery; the mountain should be `kuaiji-shan`); actors zhao-state, wei-state, chu-state, yan-state, qi-state, dai-state, wang-jian, wang-ben, li-xin, meng-tian, meng-wu, li-si, wang-wan.
- **Id collision lesson:** the Ennin thread minted `taiyuan` (Tang prefecture), so Qin commanderies take a `-jun` suffix.
- **Contract gotchas:** a record's top-level `cite` may have only one main claim (later ones need `role: supporting`); any `conflicting` claim needs a `dispute` block and vice versa; `types: [other]` needs `notes`.
- **Darwin's review fixes (2026-10-21, rebased #38 onto main 4a7d53a, tip 3e5b455):** attribute an act only to who the *cited* source names (安陵's lord refuses in 資治通鑑, not 唐雎); a year must rest on sources that give one (the 王翦 biography supports 項燕's death but dates nothing); an actor named only in prose must be `include`d in the manifest or it is unreachable; notes must not contradict a dispute block.
- **Merged:** PR #38 merged to main 2026-10-22 (rebased onto #49, carrying #42's squash). #35 (ancient China) was rebased on it. #35 mints `wey-state` for 衛, separate from `wei-state` (魏).
- **Territory:** Darwin chose control by place, no borders (2026-10-21; borders are a follow-up) and accepted the shape 2026-10-22. Built in contract v0 (kind `territory`, codes `territory_*`, 15 vectors) in PR #59 (merged 2026-10-22), with atlas tinting (`--color-control-1..8`), place `shouchun` (壽春), and 15 snapshots in historical/territories/qin/: qin-held-230/228/226/225/224/222/221, zhao-held-229, dai-held-228, yan-held-229, yan-held-226, wei-held-229, chu-held-229, chu-held-224 (disputed), qi-held-229.
- **Snapshot window convention:** a snapshot runs from the change its sources date to the year before the next dated change; in a transfer year the gaining controller holds the place (otherwise `territory_overlap_without_dispute` fires). Left out: 南陽 (identity), 上谷 (a camp is not a holding), 壽春 in Qin's snapshots.

**Why:** about ten threads add records in parallel, and ids are global.
**How to apply:** check these ids before minting a Warring States place or actor. See [[content-layout-world-first]] and [[authoring-format-decisions-2026-10-18]].
