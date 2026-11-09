---
name: record-tree-test-speed
description: Why the chapter/approval unit tests were slow (buildTree re-parsing all YAML) and the cache fix merged in PR #57 (2026-10-22)
metadata:
  type: project
  modified: 2026-10-22T07:57:35.321Z
---

Profiled 2026-10-22 on main (~1,970 record files, 2.6 MB): `buildTree` costs ~1.8 s, of which YAML parsing is 1.2 s and schema checks 0.7 s. `compileAll` is ~0.35 s, `compileChapter` ~25 ms, `Publication.checkAll` over all chapters ~1.4 s. Tests built the real tree (with one file edited) once or twice per case, so cases hit 3.5–6.5 s and broke Cloudflare's `check-chapter` against Vitest's 5 s default.

Darwin rejected just raising `testTimeout` without understanding the cause ("just raise timeout without understanding why?"). The 60 s timeout commit 7cb08d4 on PR #31 should not be needed after #57.

Fix merged in PR #57 (2026-10-22): `buildTree` caches each file's parsed, schema-checked result by kind + text, deep-frozen. Second build 1.7 s → 18 ms; full unit suite 58 s → 28 s; no timeout change. Remaining cost is each test file's first cold build (~1.7 s locally), which still grows linearly with records.

**Why:** Darwin wants root causes fixed, not thresholds bumped.
**How to apply:** when a test gets slow, profile first; raise a timeout only for a cost shown to be irreducible, and say so. If cold builds approach 5 s again, look at YAML parse speed or sharing one tree across test files.

Related: [[e2e-known-failures]]
