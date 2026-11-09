---
name: rome-conventional-recite
description: Planned re-citation of the five Rome chapters (PR #30) under the conventional basis from PR #34, once contract v1 builds it
metadata:
  type: project
  modified: 2026-10-22T07:39:29.035Z
---

On 2026-10-22, Darwin asked whether the `conventional` basis (rfd/0002/CONVENTIONAL_DATES.adoc, PR #34, merged; the basis is proposed but not yet built) helps the Rome chapters. Claude answered yes and proposed doing it in a follow-up PR after #30 merges, once v1 has `conventional` plus the `eponymous` and `olympiad` calendars. Darwin hasn't confirmed it yet.

Planned moves:
- **Jewish war:** 7 events dated by a regnal year (Nero or Vespasian) move to `attested`. 7 events tied to them by sequence move to `conventional`, with Meistermann, Whiston or Hoeber as the reference source. Masada and Herodium/Machaerus stay `interpretation`.
- **Gaul:**
  - 16 "year of book N" events become `conventional`. Each needs a reference chronology added as its second source.
  - 5 consul-year events stay `attested` and get the `eponymous` calendar.
- **Kings:**
  - 6 Olympiad accessions get the `olympiad` calendar.
  - 7 "in the reign of X" windows and Lucretia go DOWN to `interpretation`. They default to attested today, which overstates them.
  - The founding, the Sabine women and the expulsion keep their disputes.
- **Vesuvius:** the burial (79) and Titus's relief (80) become `conventional`. The 4 day-level records are disputed, so they're ineligible.
- **Paul:** no change, because Prat's chronology is disputed.

The basis doesn't settle the kings tradition question, which is about whether those events happened, not how their dates convert.

Update 2026-10-22: `conventional` is built in draft PR #56 (from the Greece thread, stacked on #53), but without the `olympiad` or `eponymous` calendars. The re-cite can stack on #56. The calendar changes for the Gaul consul-year events and the kings' Olympiad accessions wait on those calendars. Darwin said to do it in #30 itself ("just update it", 2026-10-22). DONE: #30 is rebased in a line onto #56 (b440751) and re-cited: Jewish war has 4 attested and 10 conventional; Gaul has 16 conventional with the new `holmes-caesars-conquest-of-gaul` source; the kings have 8 windows moved to interpretation; Vesuvius has 2 conventional. Corrected from the first estimate of 7 attested and 7 conventional, because only 4 Josephus quotes name a regnal year.

2026-10-22 evening: Darwin put `conventional` into contract v0 in place, with no version bump while the project isn't live. #56 now sits directly on main (head 2ac7d27). #30 is rebased onto it (head 1ac23a7) with no conflicts, and all five Rome chapters compile as lekishi-historical-contract/v0.

Later on 2026-10-22, #56 merged. #30 is rebased onto main (head 85d7838). The two catholic-encyclopedia source records are merged into one: main's record from #31 now also names New Advent and the Prat, Meistermann and Hoeber entries.

See [[shared-record-owners]].

2026-10-22 22:10: #30 rebased onto main after #29 (Egypt). Head d4f8879 adds the tradition basis (see [[tradition-basis]]).

2026-10-22 22:58: #30 merged into main (squash 6711d63). The five Rome chapters are drafts on main and have no approvals.
