---
name: darwin-pushes-to-thread-branches
description: Darwin pushes his own fix commits straight onto Claude thread branches (seen on PR #30, 2026-10-21); fetch before every push and never force over them
metadata:
  type: feedback
  modified: 2026-10-21T23:27:49.130Z
---

On 2026-10-21 at 23:11 UTC Darwin pushed four commits directly onto claude/project-thread-gn6b4c (PR #30, Rome chapters) without a message in the thread. The commits switched multi-year spans from `mode: window` to `mode: duration`, moved an alternative date claim under `date.cite`, added anchor-day cites, and updated the chapter notes.

At 23:57 the same day he rewrote the whole branch: every commit was re-authored as him, with the same file content, so the old commit ids disappeared. After a fetch, if jj abandons your commits and the working copy jumps to an old parent, run `jj new <branch>@origin`. Don't restore the old commits.

**Why:** a rebase plus `jj git push` from a stale local head would move the bookmark sideways and silently drop his commits.

**How to apply:**
- Before any push to a thread branch, run `jj git fetch --branch <branch>` and compare the remote head with your local parent.
- If the remote has commits you don't, build on top of them with `jj new <branch>@origin`, or rebase your own commits onto them. Never overwrite them.
- Treat his changes as authoring guidance for later chapters. A span the source gives as lasting the whole time is a `duration`, not a `window`. Alternative claims about a date go under `date.cite`, not the record's top-level `cite`.

**No merge commits (Darwin, 2026-10-22):** "stop merging and messing up the commits". To bring main or a parent PR into a thread branch, rebase it as a straight line (for example `jj duplicate` or `jj rebase` of the non-merge commits), and fold each conflict fix into the commit that introduced the file. Never create a merge commit.

See [[shared-record-owners]].
