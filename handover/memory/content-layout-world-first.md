---
name: content-layout-world-first
description: Owner chose a world-first content layout (2026-10-14): records live once project-wide, chapters are manifests
metadata:
  type: project
  modified: 2026-10-14T05:23:10.010Z
---

On 2026-10-14 Darwin chose "world first" for historical content. Every record lives once in a project-wide tree, with ids unique across the project. A chapter is a manifest pointing at records, so one event can appear in several chapters' stories. This amends RFD 2's earlier "folder per chapter" decision (2026-10-10).

It is recorded in rfd/0002/AUTHORING_FORMAT.adoc (PR #22, merged 2026-10-14). Darwin's own revision narrowed the decision to just that. These parts of the record are still **proposals** awaiting the owner:
- the concrete directories and the filename-to-id rule
- the manifest fields
- digest approval
- the YAML record shape
- date notation
- journeys, territories and media
- compiled per-chapter bundles
- migration

The decision does not move historical/v0 and does not change the current publication gate.

**Why:** the goal is exploring an era across the globe, cross-chapter search, and one event belonging to several stories.

**How to apply:**
- Don't treat the proposals as decided. Ask Darwin before implementing them.
- The compiler is still to be built.
- A measured fact worth keeping: today's loader ships one JS chunk per content JSON file (103 of 121 client scripts on 2026-10-14). That is why per-chapter bundles are proposed, given Cloudflare's 20k-file limit.
- The discussion notes are at /mnt/project-files/notes/data-format/discussion.md.

Related: [[deep-links-query-params]]
