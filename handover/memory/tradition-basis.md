---
name: tradition-basis
description: Darwin chose a per-claim `basis: tradition` for legend (2026-10-22); built in contract v0 in PR #30 with atlas badge and dotted place names
metadata:
  type: project
  modified: 2026-10-22T22:03:57.268Z
---

On 2026-10-22 Darwin picked option A on the Rome thread's card: a per-claim `basis: tradition` for what a source passes on as the received story of a time it did not witness (founding legends, kings known only from much later writers, birth legends). It went into contract v0 in place, like `conventional` ([[contract-v0-amend-in-place]]).

Built in PR #30 (Rome and the Mediterranean), merged 2026-10-22 (squash 6711d63), as six commits on top of the chapters:
- RFD record `rfd/0002/TRADITION_BASIS.adoc`.
- Contract: the basis needs no attribution, may take any role (so traditions can be the sides of a dispute), and is not itself a dispute. New code `conventional_in_tradition`: a conventional date may not share a pointer with a tradition (Varro's 753 BCE is a reckoning of a legend, not a standard conversion). There are 4 new vectors, so the pinned total is 220.
- Compiler: `basis: tradition` passes through unchanged.
- Atlas: `HistoricalEvent.tradition` is true when ANY main claim is a tradition. The display has a `tradition` badge (quotation glyph, dotted border) in event rows and search, a card section ("Told as tradition: …"), a dotted underline on the map name of a place with a tradition event, and a legend entry. The marker keeps the place's own evidence form.
- Kings chapter: all event, relationship and legendary-person name claims are tradition, so 17 of 17 events show as tradition. Reign windows stay interpretation. Places and the Sabines and Albans as peoples stay attested.

**Why:** a reader couldn't tell Livy's legend from Caesar's eyewitness account, since both were `attested`.
**How to apply:** other threads with legend (Sargon's birth, the Trojan War) can re-cite with it now that #30 is merged. Never put `conventional` on a pointer that a tradition asserts.
