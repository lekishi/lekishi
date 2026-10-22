# Draft chapter: the campaigns of Alexander, 335–323 BCE

> **Draft, not approved.** This chapter is the manifest
> [`alexander-campaigns-335-323.yaml`](alexander-campaigns-335-323.yaml) and the
> record files it reaches. It has no `approval` block, so production does not
> serve it; development and pull-request previews serve it under the draft
> banner. Only the owner approves it, with `pnpm approvals`.

The source pass, the findings shared with the Xerxes and Ten Thousand chapters,
and the proposals for the owner are in
[`rfd/0002/GREECE_PERSIA_FEASIBILITY.adoc`](../../rfd/0002/GREECE_PERSIA_FEASIBILITY.adoc).

## Coverage model

- **Window 335–323 BCE**: from the destruction of Thebes to Alexander's death
  at Babylon, as Arrian tells it in the _Anabasis of Alexander_.
- **Included**: one event for each major stage Arrian narrates, with the
  battles, sieges and foundings he describes: the Granicus, Asia Minor and
  Gordium, Issus, Tyre and Gaza, Egypt and Siwa, Gaugamela, the Persian
  capitals and Darius's death, Bactria and Sogdiana, India to the Hyphasis,
  the Gedrosian desert, and the last years at Susa, Opis, Ecbatana and Babylon.
- **Excluded**: the Thracian and Illyrian campaigns of 335 BCE, the Lycian and
  Pamphylian marches, the Aegean war at sea, the Mardians, Areians and
  Drangians, the conspiracies of Philotas and of the pages, most Indian sieges,
  Nearchus's voyage, and the Cossaeans.

## Inventory

Records the manifest reaches:

| Kind          | Records | Folder                                                                     |
| ------------- | ------- | -------------------------------------------------------------------------- |
| Events        | 36      | `historical/events/alexander/`                                             |
| Relationships | 5       | `historical/relationships/alexander/`                                      |
| Places        | 39      | `historical/places/greece-persia/` (32), `near-east/` (4), `egypt/` (2), `xuanzang/` (1) |
| Actors        | 11      | `historical/actors/greece-persia/`                                         |
| Sources       | 9       | `arrian-anabasis`, `herodotus`, `xenophon-anabasis`, `pleiades`, and five below |

Babylon, Pelusium and Gaza are byte-for-byte copies of records on the
Mesopotamia and Egypt branches, and they bring their sources `bible-kjv` and
`breasted-ancient-records` with them. Tyre and Susa are carried at the
Mesopotamia branch's paths and Memphis at the Egypt branch's. Whichever branch
merges second drops its copies. Sardis, Abydos, Elaius, Sestos and Thebes are
shared with the Xerxes chapter, and Tarsus, Issus, Thapsacus and Opis with the
Ten Thousand. Taxila is the 玄奘 chapter's record, which this chapter reaches as
it is; it brings `cien-zhuan`, `xiyu-ji` and `wikidata` with it.

## Evidence

- Arrian is read in Chinnock's translation (1884) on Project Gutenberg. Every
  quotation was checked against that text, not yet against a printed edition.
  The catalogue entry gives Chinnock's dates as 1842–1911; a second source
  should confirm the death date before the translation is called public domain
  worldwide.
- Arrian dates by Athenian archons, months and Olympiads. Six events he dates
  by archon and month (Tyre, Issus, Thapsacus, Gaugamela, Darius's death and
  the Hydaspes) are `attested`, as Qin's regnal years are, with Chinnock's finer
  conversion as a supporting interpretation. Every other year is the standard
  chronology as Chinnock states it in his headings and notes, cited as
  `conventional` with both Arrian's passage and Chinnock's statement; many
  stages are dated only to the window between two of his anchors.
- Chinnock dates Gaugamela to September 331 BCE in one note and the eclipse
  eleven days before it to 20 September in another, so the event keeps the year
  and records both.
- The Gordian knot is disputed, with Aristobulus's account as an alternative.
- Every located place carries Pleiades' representative point as an
  approximate point, pinned to the dump of 2026-10-21. The Sogdian rock,
  Thapsacus and Pura are unlocated. No route geometry is drawn: the campaign
  event carries the span and its stages point to it with `part_of`; the
  destruction of Thebes, before the crossing, does not.
- Alexander's marriage to Roxana uses the relationship type `other` for want
  of `marriage`.

## Review history

- 2026-10-21: drafted as candidate #17 of the chapter-selection pass, for
  testing data and engine work. Not reviewed by a specialist; not approved.
