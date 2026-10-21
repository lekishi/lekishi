# Rome under the kings, as tradition tells it (753–509 BCE)

Draft chapter, candidate #10 of the "Events up to 100 CE" list in
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV).
It is the feasibility note and the scope record for the manifest
[`rome-kings-753-509-bce.yaml`](rome-kings-753-509-bce.yaml). Nothing here is
approved; the owner approves the manifest with `pnpm approvals`.

## What the chapter is

The Roman tradition of the seven kings, from the founding on the Palatine to
the election of the first consuls. It is **legend, written down about seven
centuries after the dates it gives**, and the chapter is built to test how the
atlas shows that: every event says who tells it, and every date is an ancient
reckoning rather than a measurement.

- 17 events, 10 relationships, 11 places, 16 actors.
- Story: the founding, the Sabine women and the union, Numa, the accession of
  each king, Alba Longa, Ostia, Tarquinius's move from Tarquinii, the census,
  Gabii, Lucretia, and the expulsion of the kings.

## Sources and reuse

| Source | Edition read | Terms | Use |
|---|---|---|---|
| Livy, *Ab urbe condita* I | The Latin Library transcription, read 2026-10-21 | Work public domain; the site states no terms and names no edition | Quoted in Latin, cited by book and chapter |
| Dionysius of Halicarnassus, *Roman Antiquities* I–V | Cary's Loeb translation (1937–1940), LacusCurtius | LacusCurtius marks the pages public domain (single-asterisk URLs), read 2026-10-21 | Quoted in English for the Olympiad dates |
| Censorinus, *De die natali* 21 | Hultsch's Teubner text (1867), LacusCurtius | Public domain, as above | The Varronian era (753 BCE) |
| Pleiades | Daily dump of 2026-10-21 (shared `pleiades` source) | CC BY 3.0 | Every coordinate except Rome's and Ostia's, as an interpretation attributed to Pleiades |

Every quotation was checked by script against the downloaded text on
2026-10-21; every Livy quotation also against the chapter its locator names.
Before release, re-check the locators against a critical edition (Ogilvie's
Oxford text for Livy) as the source register requires.

## Dates

Livy gives regnal lengths but no years. The chapter uses two ancient
reckonings and labels both:

- **Varro's era**, recorded by Censorinus (238 CE is the 991st year from the
  founding, counted from the Parilia), gives the conventional 753 BCE. It is
  the date the founding shows.
- **Dionysius** dates every accession by Olympiad year. An Olympic year runs
  from midsummer to midsummer, so each converts to two Julian years:
  Romulus 752/751, Numa 714/713, Tullus 671/670, Ancus 639/638, Tarquinius
  Priscus 615/614, Servius 577/576, Superbus 533/532, and the first consuls at
  the beginning of the 68th Olympiad, 508/507. The accession events use these.
- Events inside a reign (the Janus shrine, Alba Longa, Ostia, the census,
  Gabii) are dated to the whole reign as a window.
- Alternatives are kept as `alternative` claims: Dionysius 752/751, Fabius
  748/747, Cincius 729/728 and Timaeus 814/813 for the founding; Varro's 509
  for the first consuls; Romulus's first year for the seizure of the Sabine
  women.

`calendar: julian` is used for the converted values, with the Olympiad
expression in `as_written`. The contract has no Olympiad calendar; see the
gaps below.

## Places

Nine of the eleven places come from the Pleiades dump and are published as
`approximate_point` interpretations attributed to Pleiades. Rome is the shared
city record minted by the Stephen II chapter at Wikidata's coordinate, with
Livy's name form and its Pleiades id folded in; the Hannibal and Paul chapters
reuse it. Ostia is the Hannibal chapter's record, with Livy's founding under
Ancus folded in; its point is the excavated Roman town, which the summary says
is centuries later than the tradition's foundation. Alba Longa keeps region
precision because no excavated site has been identified as the city. No route, wall or territory is drawn.

## Gaps and proposals for the owner

1. **Tradition has no evidence state.** The contract knows `attested` and
   `interpretation`. Every claim here is attested in the sense that Livy says
   it, which reads the same as Caesar's eyewitness Gaul. Until the owner
   decides (a card in the project thread offers a per-claim `basis: tradition`
   in contract v1, an event flag, or no change), each record says "tradition,
   not record" in its text and the founding and the expulsion are marked
   disputed.
2. **No Olympiad or Varronian calendar.** `calendar` offers julian, gregorian,
   islamic, chinese_lunisolar, regnal and unknown. An `olympiad` calendar would
   let the record keep the source's own date and let the compiler do the
   conversion, as the Tang chapter keeps the lunisolar date.
3. **Reign windows are long.** Dating events to a whole reign gives windows of
   up to 44 years. That is honest, but it tests how the timeline shows a long
   occurrence window next to a two-year one.

## What it tests in the engine

- Legend clearly labelled, and how a card shows it.
- Competing chronologies as `alternative` claims on one date.
- Olympiad-year dates that span two Julian years.
- A succession chain of seven `successor_of` relationships, and a
  `relocated_to` between two places (the Albans moved to Rome).
- A cluster of points within 40 km of Rome.
