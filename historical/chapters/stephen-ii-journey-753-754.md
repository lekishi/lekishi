# Draft chapter: Stephen II's journey to the Franks, 753–754

> **Draft, not approved.** This chapter is the manifest
> [`stephen-ii-journey-753-754.yaml`](stephen-ii-journey-753-754.yaml) and the
> record files it reaches. It has no `approval` block, so production does not
> serve it; development and pull-request previews serve it under the draft
> banner. Only the owner approves it, with `pnpm approvals`.

The source pass, the disputes, and how the stops fit the proposed journey kind
are in
[`rfd/0002/STEPHEN_II_JOURNEY_FEASIBILITY.adoc`](../../rfd/0002/STEPHEN_II_JOURNEY_FEASIBILITY.adoc).

## Coverage model

- **Primary window 753–754**: from Stephen II leaving Rome on 14 October 753,
  by Aistulf's court at Pavia and the Great St Bernard, to the meeting with
  Pepin at Ponthion on 6 January 754, the winter at Saint-Denis, the anointing,
  and the assemblies at Berny and Quierzy.
- **Prelude, 752–753**: Aistulf's broken peace, the embassies, the litany, the
  letters and envoys that led to the journey, all in or from Rome. The atlas
  has no prelude label, only a coda one, so the manifest's window is
  `752..754` to keep these events in the primary window.
- **Return, 754 or 755**: the first Italian campaign with the pope in the
  king's train, the peace of Pavia, and the return to Rome. The annals give
  755 and the papal life's order gives 754, so these events carry the window
  `754..755`.
- **Coda, 756–757**, labelled in the captions: the siege of Rome, the second
  campaign, the handing over of the exarchate, Aistulf's death, Desiderius's
  accession, and Stephen's burial on 26 April 757.
- **Excluded**: the annals' other notices of these years (the Saxon campaign of
  753, Grifo's death, Boniface's martyrdom, the organ of 757), the earlier
  papal appeals to Charles Martel, and everything after April 757.

## Inventory

| Kind | Records | Folder |
| --- | --- | --- |
| Events | 56 | `historical/events/stephen/` |
| Relationships | 8 | `historical/relationships/stephen/` |
| Places | 22 | `historical/places/stephen/` |
| Actors | 23 | `historical/actors/stephen/` |
| Sources | 5 new, plus `wikidata` | `historical/sources/` |
| Journeys | 6 | `historical/journeys/stephen/` |

The places, actors, and sources are written once for the whole atlas, so a
later chapter on Rome, the Lombards, or the Carolingians reuses them by id.

## Evidence

- Every date and place cites the work, not the transcription it was read in.
  The life of Stephen II was read in a reading copy without paragraph numbers,
  the annals and the letter on Latin Wikisource, the continuations of Fredegar
  on the Latin Library. None has been checked against a critical edition yet.
- Every place carries an asserted point (`approximate_point`) at the
  coordinate Wikidata records for the modern place identified with it, pinned
  to the item revision read on 2026-10-21. The identification is editorial and
  each place says so; two valleys are at region precision.
- No route geometry is asserted. Six journey records in
  `historical/journeys/stephen/` order the stops; every leg is schematic, and
  only the envoys' leg to Marseille states its mode (by sea).
- Three questions are kept open rather than chosen: the meeting place
  (Ponthion or Quierzy), who sent Carloman, and the year of the first campaign.

## Review history

- 2026-10-21: drafted from the first ranked candidate of the chapter-selection
  pass, at the owner's request for more chapters and events to test with. Not
  reviewed by a specialist; not approved.
