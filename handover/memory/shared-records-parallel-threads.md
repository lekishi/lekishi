---
name: shared-records-parallel-threads
description: How parallel chapter threads share place/actor ids (rome, genava, massalia…) without duplicate records; observed 2026-10-21
metadata:
  type: project
  modified: 2026-10-21T15:42:18.908Z
---

On 2026-10-21 about 20 threads authored chapters in parallel, each on its own branch. Record ids are file names and must be unique per kind ([[content-layout-world-first]]), and two files with the same name anywhere under one kind folder fail the build.

Convention used by the Stephen II thread (branch claude/project-thread-2qnkn8):
- Before minting a place or actor, list the files other open branches add (`git diff --name-only --diff-filter=A origin/main...<branch> -- historical`) and reuse an existing id for the same thing, even if that branch is unmerged (e.g. `rome` and `genava` from the Rome/Gaul branch gn6b4c, `massalia` from the Hannibal branch dkht9k).
- Whoever merges second deletes its own copy on rebase and merges its name forms and cites into the surviving record.
- Thread-to-thread messages are capped at 60 an hour project-wide, so the coordination may have to go in the PR body instead.

**Update 2026-10-21 22:36:** PR #45 (Stephen II) merged first. So `rome`, `genava` and `massalia` now live on main under `historical/places/stephen/`. The Rome/Gaul branch (gn6b4c) and the Hannibal branch (dkht9k) must delete their copies on rebase and merge their name forms and cites into those records.

**Why:** duplicate ids break the build; the same place under two ids defeats cross-chapter search.
**How to apply:** check other branches before naming shared places, and expect a rebase merge of shared records.

Incident 2026-10-22: #27 (places/tang/zhenzhou = 振州, Hainan) and #36 (places/ennin/zhenzhou = 鎮州, Hebei) both merged with the id `zhenzhou` and broke main; fixed by renaming the Tang one to `zhenzhou-hainan` (PR #54). Same romanization ≠ same place: before minting an id, grep `historical/places/**/<id>.yaml` on main and on open PR branches, and add a disambiguating suffix for homophones (州 names especially).
