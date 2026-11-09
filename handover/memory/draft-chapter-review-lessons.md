---
name: draft-chapter-review-lessons
description: Corrections Darwin made reviewing the voyage draft chapters (PR #33, 2026-10-21) that apply to any new chapter's records
metadata:
  type: feedback
  modified: 2026-10-21T23:46:27.777Z
---

Darwin reviewed PR #33 by rebasing it onto main and pushing fixups (2026-10-21). The rules behind them:

- **No stand-in places.** If a source says "from Egypt" without a port, do not start the arc at Berenice and explain in notes; the atlas does not show notes, so the map asserts the port. Add a region place (`egypt`, `arabia`) at a label anchor and start the arc there.
- **Type only what the source says.** Obsidian that "reached" a site is not trade; type it `other` with a note. Keep `trade` only where the source says exchange.
- **No exact year for "around X".** "Around 3000 BP" written as one year plays back as a certain year. Give a window bounded by cited figures from neighbouring events, and say so in notes.
- **A licence with a possible non-commercial term is not usable until the owner decides.** Claim only the terms the conflicting licences share (attribution, no quotation), paraphrase instead of quoting, and keep the chapter from reaching any record that cites the source: take those relationships out of the manifest and place sites from another gazetteer.
- **Notes must state real coordinate origins.** Shared records copied from other threads keep their own sources (e.g. Wikidata points); register those sources too, and do not claim "every coordinate from Pleiades".
- **Cite the passage that supports the claim,** not a nearby one (a role cited to "nothing is known of the author").
- **Count arcs the map actually draws.** Relationships between actors with no anchor place draw no arc.

**Why:** each one made the card or the map assert more than the source does.
**How to apply:** check new records against this list before pushing. Related: [[voyage-chapters]], [[chapter-projection-window-rules]], [[chapter-review-feedback]].
