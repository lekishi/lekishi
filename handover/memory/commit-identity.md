---
name: commit-identity
description: Jujutsu author identity to use for Lekishi commits (Darwin's GitHub noreply address)
metadata:
  type: project
  modified: 2026-10-12T19:19:28.231Z
---

Commits on Lekishi branches are authored as `Darwin <5746693+darwin67@users.noreply.github.com>` (the identity on main's history), set with `jj config set --repo user.name/user.email`; Claude goes in the Co-Authored-By trailer. Darwin's own local commits (e.g. on PR #18, 2026-10-12) use `Darwin Wu <hey@dwu.sh>`; main's squash merges show the noreply form. Cloud containers default to `Claude <noreply@anthropic.com>`, so set it before committing.

**Why:** AGENTS.md says to verify Jujutsu's author identity and use the user's established one, never an invented one.
**How to apply:** In a fresh container, run the two `jj config set --repo` commands before the first commit; if commits already exist, `jj metaedit --update-author -r 'main@origin..@'`.
