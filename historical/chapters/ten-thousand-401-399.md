# Draft chapter: the march of the Ten Thousand, 401–399 BCE

> **Draft, not approved.** This chapter is the manifest
> [`ten-thousand-401-399.yaml`](ten-thousand-401-399.yaml) and the record files
> it reaches. It has no `approval` block, so production does not serve it;
> development and pull-request previews serve it under the draft banner. Only
> the owner approves it, with `pnpm approvals`.

The source pass, the findings shared with the Xerxes and Alexander chapters,
and the proposals for the owner are in
[`rfd/0002/GREECE_PERSIA_FEASIBILITY.adoc`](../../rfd/0002/GREECE_PERSIA_FEASIBILITY.adoc).

## Coverage model

- **Window 401–399 BCE**: from Cyrus's departure from Sardis to Thibron taking
  the army into his forces at Pergamus, as Xenophon tells it in the _Anabasis_.
- **Included**: each stage Xenophon describes with its halts, from Sardis by
  Ceramon-agora and Caystru-pedion to Tarsus and down the Euphrates; the
  reviews and the mutiny; Kunaxa; the seizure of the generals and the election
  of new ones; the retreat through the Carduchian country and Armenia; the sea
  at Theches; the coastal march and voyage; Byzantium; and the service with
  Seuthes.
- **Excluded**: Cyrus's earlier career and the war at Miletus, the speeches,
  Xenophon's later life, and the war Thibron fought.

## Inventory

Records the manifest reaches:

| Kind          | Records | Folder                                                                    |
| ------------- | ------- | ------------------------------------------------------------------------- |
| Events        | 30      | `historical/events/anabasis/`                                             |
| Relationships | 5       | `historical/relationships/anabasis/`                                      |
| Places        | 41      | `historical/places/greece-persia/`                                        |
| Actors        | 13      | `historical/actors/greece-persia/`                                        |
| Sources       | 4       | `xenophon-anabasis`, `grote-history-of-greece`, `herodotus`, `pleiades` |

Sardis and Kelainai are shared with the Xerxes chapter, and Tarsus, Issus,
Thapsacus and Opis with the Alexander chapter.

## Evidence

- Xenophon is read in Dakyns's translation (1890) on Project Gutenberg. Every
  quotation was checked against that text, not yet against a printed edition.
- Xenophon gives distances in stages and parasangs and halts in days, but no
  years. Every year is the standard chronology as George Grote states it,
  cited as `conventional` with both the Xenophon passage and Grote's statement.
  Most stages are dated
  only to the window between two of Grote's anchors (the start of the march in
  March or April 401 BCE, Kunaxa in September or October, the arrival at the
  sea, the junction with Thibron), so a stage reads as "somewhere in this
  span". The feasibility note proposes a date mode for this.
- Every located place carries Pleiades' representative point as an
  approximate point, pinned to the dump of 2026-10-21. Eight places are
  unlocated: Peltae, Ceramon-agora, Caystru-pedion, Thymbrium, Thapsacus,
  Corsote, Charmande and Kunaxa.
- No route geometry is drawn. The campaign event carries the span and every
  stage points to it with `part_of`; the stage events list their start,
  waypoint and end places in Xenophon's order, ready for the journey kind.
- Three records use `other` for want of a type: Kunaxa as a battlefield, the
  Cyreans as an army, and their service with Seuthes.

## Review history

- 2026-10-21: drafted as candidate #16 of the chapter-selection pass, for
  testing data and engine work. Not reviewed by a specialist; not approved.
- 2026-10-21: after an internal review, the stage from Ceramon-agora to
  Caystru-pedion (Xenophon I.2) was added to the Tyriaeum event, so
  Ceramon-agora is now in the chapter as its coverage says.
