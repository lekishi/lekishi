# Draft chapter: Xerxes' invasion of Hellas, 480–479 BCE

> **Draft, not approved.** This chapter is the manifest
> [`xerxes-invasion-480-479.yaml`](xerxes-invasion-480-479.yaml) and the record
> files it reaches. It has no `approval` block, so production does not serve it;
> development and pull-request previews serve it under the draft banner. Only
> the owner approves it, with `pnpm approvals`.

The source pass, the findings shared with the Ten Thousand and Alexander
chapters, and the proposals for the owner are in
[`rfd/0002/GREECE_PERSIA_FEASIBILITY.adoc`](../../rfd/0002/GREECE_PERSIA_FEASIBILITY.adoc).

## Coverage model

- **Window 483–479 BCE**: from the start of the Athos canal to the Athenians'
  return from Sestos, as Herodotus tells it in books VII–IX.
- **Preparations, 483–481 BCE**: the canal, the bridges over the Hellespont,
  the muster at Critalla, the heralds, and the Hellenic council. They are in
  the window because the card and the story start with them.
- **The invasion, 480–479 BCE**: each stage of the land army's march and the
  fleet's voyage, the battles of 480 and 479 BCE, Xerxes' return, Artabazos's
  sieges in Chalcidice, and the siege of Sestos.
- **Excluded**: Marathon and the earlier Persian expeditions, Gelon and the
  Sicilian embassies, the war at Himera, the catalogue of the army's nations,
  and everything after the autumn of 479 BCE.

## Inventory

Records the manifest reaches:

| Kind          | Records | Folder                                      |
| ------------- | ------- | ------------------------------------------- |
| Events        | 30      | `historical/events/xerxes/`                 |
| Relationships | 5       | `historical/relationships/xerxes/`          |
| Places        | 32      | `historical/places/greece-persia/`, and Delphi at `historical/places/hannibal/` |
| Actors        | 15      | `historical/actors/greece-persia/`          |
| Sources       | 5       | `herodotus`, `grote-history-of-greece`, `pleiades`, and `livy` and `wikidata` through Delphi |

The places and actors are written once for the atlas: Sardis, Kelainai,
Abydos, Elaius, Sestos and Thebes, the Persian Empire, Sparta and Thebes as
states are shared with the Ten Thousand or Alexander chapters. Delphi is the
Hannibal chapter's record, which this chapter reaches as it is.

## Evidence

- Herodotus is read in Macaulay's translation (1890) on Project Gutenberg.
  Every quotation was checked against that text, not yet against a printed
  edition. The Gutenberg text reads "five-and-thirty days" at VIII.115 where the
  Greek reads forty-five; the event's notes say so.
- Herodotus gives no years. Every year is the standard chronology as George
  Grote states it, cited as `conventional` with both the Herodotus passage and
  Grote's statement; the passage also stays as a supporting claim. The one
  exception is the start of the Athos works, about 483 BCE, which Grote does
  not date: it is an editorial count of Herodotus's "about three years" back
  from Grote's date for the march, and its claim says so.
- Every located place carries Pleiades' representative point as an
  approximate point, pinned to the dump of 2026-10-21. Critalla is unlocated.
  No route geometry is drawn: the campaign event carries the span, and twelve
  of its stages point to it with `part_of`; the battles and the preparations
  are separate events in the window.
- The attack on Delphi carries a conflicting claim from Grote. The canal's
  place record uses the type `other` for want of `canal`.

## Review history

- 2026-10-21: drafted as candidate #15 of the chapter-selection pass, for
  testing data and engine work. Not reviewed by a specialist; not approved.
- 2026-10-21: after an internal review, the Athos canal's start year was
  re-cited as an editorial reckoning rather than Herodotus's attestation, and
  the card's summary names the window's first year.
