---
name: early-americas-chapter
description: Draft chapter early-americas-to-100 (PR #41, 2026-10-21) — date conversion conventions and the format gaps it found
metadata:
  type: project
  modified: 2026-10-21T15:56:46.241Z
---

On 2026-10-21 the "Ancient Americas chapter" thread wrote draft chapter `early-americas-to-100` (candidate #31 of [[chapter-selection]]). PR #41 merged on 2026-10-22; the chapter is on main as a draft with no approval. It holds 30 events, 25 places, 8 cultures and 25 sources, all under `americas/` subfolders. The feasibility note is rfd/0002/EARLY_AMERICAS_FEASIBILITY.adoc. The register section is "Archaeology and scholarship" in docs/SOURCE_REGISTER.adoc.

Conventions other ancient-chapter threads should reuse:
- N BP (before 1950) is written as N − 1949 BCE. The source's own wording stays in as_written, and the notes explain the conversion.
- Do NOT convert "N years ago" by counting from the publication year, because no source states that epoch. Darwin removed that rule on 2026-10-21. Find a cited calibrated or calendar date instead, for example the cal BP figure in the paper or a later dated source.
- Do not plot uncalibrated radiocarbon ages: the projection keeps the year and drops `calendar: unknown`, so the age shows up as a civil year. Use a calibrated date from a cited source.
- A modelled earliest-construction range (only a lower bound) is not a window. Use a stated construction date instead.
- Long Count dates are Julian years, with the Long Count in as_written. Do not claim a correlation constant explains a discrepancy unless a source says so.
- Archaeological cultures are actors with `types: [culture]`, and they join events as participant role `other` with a note.
- Site places use type `other` plus a note, because the vocabulary has no site or earthwork type.
- Copyrighted and NC-licensed journal articles are cite-only (all-rights-reserved, quotation_permitted unknown). Quotes come only from NPS pages and CC BY articles.

Gaps it raised for Darwin:
1. The notation cannot write approximate, century or open-bound dates, although v0 supports them.
2. There is no Long Count calendar or correlation field (proposed for contract v1).
3. Disputes carry their alternative date only as prose.
4. There is no archaeological site place type.

`pnpm brand:check` fails in cloud containers because Playwright's Chromium version mismatches the installed browser. It is unrelated to content.

**Why:** other threads writing chapters before 100 CE face the same conversions and gaps.
Darwin revised the chapter himself on 2026-10-21 (commits eb38c28, 512a27d, aed34c8 on the branch); read them before reusing these records. The atlas also refuses open-ended occurrences, and since RFD 6 chapter-card tests require the card summary to name the window's first year.

Decided 2026-10-22 (PR #52): the notation writes `~` (approximate endpoint), `730s`/`1st century BCE` (one decade/century), `after X`/`before X` (one-sided; atlas still refuses to publish them). No BP form. The Long Count is in contract **v0** (Darwin: no v1, amend v0 in place until launch): `calendar: mesoamerican_long_count` + `correlation: 584283` or `correlation: not stated` (→ null); the stelae use `not stated`.

**How to apply:** mark "about/ca." endpoints with `~` instead of noting them; don't publish after/before dates until the atlas draws open-ended occurrences.
