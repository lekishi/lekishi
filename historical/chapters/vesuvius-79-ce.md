# Vesuvius (79 CE)

Draft chapter, candidate #30 of the "Events up to 100 CE" list in
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV).
It is the feasibility note and the scope record for the manifest
[`vesuvius-79-ce.yaml`](vesuvius-79-ce.yaml). Nothing here is approved; the
owner approves the manifest with `pnpm approvals`.

## What the chapter is

The eruption of Vesuvius as the younger Pliny described it to Tacitus, with the
aftermath from Cassius Dio. It is the smallest chapter in this set, a test of
how the atlas shows a few events over two days in one bay, with the
day-level dispute visible.

- 6 events, 5 places, 4 new actors (Titus is shared).
- Story: the cloud seen from Misenum, the elder Pliny's voyage to Stabiae and
  his death, the younger Pliny's flight, the burial of Herculaneum and
  Pompeii, and Titus's relief for Campania.

## Sources and reuse

| Source | Edition read | Terms | Use |
|---|---|---|---|
| Pliny the Younger, *Epistulae* 6.16 and 6.20 | The Latin Library transcription, read 2026-10-21 (new `pliny-letters` source) | Work public domain; the site states no terms and names no edition | Quoted in Latin, cited by book, letter and section |
| Cassius Dio, *Roman History* LXVI | Foster's translation (1905–1906), Project Gutenberg eBook 10890 (the shared `cassius-dio` source from the Egypt chapter) | Public domain | Quoted in English; Foster's year sidenotes as interpretations |
| Pleiades | Daily dump of 2026-10-21 (shared `pleiades` source) | CC BY 3.0 | Every coordinate, as an interpretation attributed to Pleiades |

Every quotation was checked by script against the downloaded text on
2026-10-21, and every Pliny quotation against the letter its locator names.
The `cassius-dio` record is copied byte for byte from the Egypt and the Nile
thread; its title names books LIV and LXIII, and the owning thread has been
asked to widen it to the whole work.

## Dates

Pliny gives the day: "Nonum Kal. Septembres hora fere septima", the ninth day
before the Kalends of September at about the seventh hour, which is 24 August
in the Julian calendar. He does not give the year. Dio gives no day, and
Foster's sidenote puts the chapters on the eruption under A.D. 79, so the year
is an interpretation attributed to Foster. The events of the next morning are
dated 25 August by counting in the letters.

The day is disputed. Foster translates Dio as saying the fire broke out "just
at the end of autumn", which conflicts with August; Cary's Loeb translation
(read on LacusCurtius) renders the same phrase "at the very end of the summer",
which does not. The eruption events carry Pliny's day as the main claim and
Dio, in Foster's words, as a `conflicting` claim, with a dispute summary that
says the conflict turns on the Greek.

## Places

All five places come from the Pleiades dump: Vesuvius (the summit), Misenum,
Stabiae, Pompeii and Herculaneum. Pliny never names Pompeii or Herculaneum;
their names here come from Dio. No plume, ash fall or damage area is drawn.

## Gaps and proposals for the owner

1. **An October date.** Modern arguments for an autumn eruption rest on finds
   at Pompeii, not on the texts. No source for them under the commercial-use
   rule was read, so they are not cited. A citation-only record of the
   excavation report would add them as an `alternative` claim.
2. **Translation as evidence.** The dispute partly depends on how a Greek
   phrase is translated. The contract has no way to say that two translations
   of one source disagree; the shared `cassius-dio` record names one
   translation. Either the Greek text or a second translation as its own
   source would make the disagreement data.
3. **Hours.** Pliny gives the seventh hour, the first hour, and the dark at
   dawn. The date contract stops at the day, so the hours stay in
   `as_written`.
4. **Areas.** An eruption is an area, not a point. The chapter uses the
   summit as context; an `approximate_area` or hazard footprint would need a
   source and a geometry kind that the v0 contract does not offer for events.

## What it tests in the engine

- Six events in two days at one bay, then one a year later.
- A day-level dispute with a `conflicting` claim from a second source.
- Two authors who are also actors (Pliny the Younger) or subjects (the elder
  Pliny) of their own account.
