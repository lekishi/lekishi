---
name: egypt-nile-chapters
description: State of the five Egypt and Nile draft chapters (PR #29), their source limits, and the Shaw chronology they use (2026-10-22)
metadata:
  type: project
---

On 2026-10-21 the Egypt and the Nile thread drafted five chapters, PR #29 (merged 2026-10-22): punt-expedition, megiddo-campaign-1457bce, amarna-letters, kadesh-and-the-treaty, rome-kush-25bce-65. None is approved; approval is Darwin's. Notes: rfd/0002/EGYPT_NILE_FEASIBILITY.adoc.

- Chronology (Darwin chose on 2026-10-22: cite one modern chronology): the four Bronze Age chapters follow Shaw, Oxford History of Ancient Egypt (2000), source `shaw-oxford-history-ancient-egypt`, cite-only. Reigns: Hatshepsut 1473–1458, Thutmose III 1479–1425, Amenhotep III 1390–1352, Akhenaten 1352–1336, Seti I 1294–1279, Ramesses II 1279–1213 BCE. Year n of a king acceding in A falls in A−n+1..A−n. Figures read from pharaoh.se's reign tables, not the book; check them against the printed table before approval. The contract has no Egyptian civil calendar; `egyptian_civil` was proposed, not decided.
- The `conventional` date basis (in contract v0 since #56, 2026-10-22) does not cover the Bronze Age windows: reference chronologies disagree there, so they stay `interpretation` once a chronology is cited. It would apply to the Neronian windows in rome-kush (Nero's reign, Seneca's death); Dio's consular dates there are attested and would take the proposed `eponymous` calendar.
- Garstang, The Land of the Hittites (1910) is PD in the US but protected in life+70 countries until 2027-01-01 (he died 1956): recorded with quotation_permitted false, cited only. Re-review after that date.
- Access limits seen in the cloud container: archive.org is blocked by the network policy; Wikimedia (Commons, Wikisource, Wikidata API) returned 429 for most of the day, so Breasted's ARE vols II–III could not be downloaded. Project Gutenberg works: Maspero (17323–17325), Niebuhr (26145), Sayce (40243), Garstang (68806).
- Pleiades cite format used: at "place N (reprLatLong, version V), dump 2026-10-21", basis interpretation, attributed_to Pleiades. A display_anchor must have precision unspecified.
- Source records cap `edition` at 300 characters.

**Why:** a later thread approving or extending these chapters needs to know the dates are placeholders and Garstang can't be quoted yet.
**How to apply:** date any new New Kingdom record on Shaw's reigns with the same cited reckoning; check [[shared-record-owners]] before minting ids.
