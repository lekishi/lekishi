---
name: voyage-chapters
description: The voyages region thread's three draft chapters (Hanno, Lapita, Periplus) in PR #33, the ids and sources it minted, and the open owner questions
metadata:
  type: project
  modified: 2026-10-21T16:40:00.000Z
---

The voyages thread opened draft PR #33 (branch claude/project-thread-0usrc4) on 2026-10-21. It contains three draft chapters: `hanno-voyage`, `lapita-expansion` and `erythraean-sea-trade`. Each has a feasibility note in historical/chapters/<id>.md. Three v1 journey sketches are in historical/journeys/ (not compiled).

Sources it minted: `pofatu`, `geonames`, `hanno-periplus`, `schoff-hanno`, `periplus-erythraean-sea`, `schoff-periplus` and the seven Lapita papers. Five of the Lapita papers are cite-only.

On the coordinator's instruction (2026-10-21), it took four places byte for byte from other PRs and dropped its own records:
- `rome`: after Darwin's rebase it is main's record from Stephen II (#45), with the Pliny name, Livy cite and Pleiades id folded in; PR #30 must fold into the same record
- `carthage` and `gades` (#40)
- `alexandria-egypt` (#34; this replaced its own `alexandria`)
- `pliny-natural-history` (the Nile thread's merged record, which covers the Nile, Hanno and Periplus locators)

It also copied the sources those records cite: `livy`, `polybius` and `arrian-anabasis`.

Folded into main's records on the 2026-10-22 rebase: `carthage-state` (Hannibal) and `bharukaccha` (玄奘; Barygaza name and Pleiades id added, 玄奘's label anchor kept).

Folded on the 2026-10-22 evening rebase (after #39 merged): `ujjayini` and `lanka` (Ashoka; Ozene, Taprobane, Palaesimundu names and Pleiades ids added, Ashoka's label anchors kept). No deliberate id collisions remain.

Open owner questions:
- Pofatu's licence conflicts. Darwin held the Pofatu-cited obsidian relationships back from the Lapita manifest and moved Teouma, Nukuleka and Mulifanua to GeoNames until the owner decides. The Zenodo release and the website say CC BY 4.0; the GitHub LICENSE file says CC BY-NC 4.0.
- Proposed evidence states, not yet built: a modelled radiocarbon date with its probability, a circa year, and a relative offset in days.

Wikidata returned 429 from this environment for the whole of 2026-10-21. GeoNames dumps (CC BY 4.0) worked as a fallback for modern coordinates.

Darwin rebased PR #33 onto main, fixed it after review and marked it ready for review on 2026-10-22.

**Why:** later threads would otherwise mint duplicates or reopen these questions.
**How to apply:** before minting ids for places in Egypt, Arabia, India or Oceania, check PR #33, and reuse what it mints. See [[chapter-selection]] and [[tang-multi-story]].

PR #33 merged on 2026-10-22 at 20:30 UTC, after seven rebases. All three chapters are drafts with no approval.
