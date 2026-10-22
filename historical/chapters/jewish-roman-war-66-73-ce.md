# The Jewish–Roman war (66–73 CE)

Draft chapter, candidate #28 of the "Events up to 100 CE" list in
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV).
It is the feasibility note and the scope record for the manifest
[`jewish-roman-war-66-73-ce.yaml`](jewish-roman-war-66-73-ce.yaml). Nothing here
is approved; the owner approves the manifest with `pnpm approvals`.

## What the chapter is

The first Jewish revolt against Rome as Josephus tells it in the *Jewish War*,
from the outbreak at Caesarea to the fall of Masada. Josephus is an unusual
witness: he commanded the rebels in Galilee, surrendered at Jotapata, watched
the siege of Jerusalem from Titus's camp, and wrote under Vespasian and Titus.
He is an actor in the chapter as well as its source, and the records say so.

- 16 events, 1 relationship, 11 places (8 new), 14 actors.
- Story: Caesarea, the Temple sacrifice, the garrison, Beth-horon, Ptolemais,
  Jotapata and Josephus's surrender, Taricheae, Gamala, Gischala, Vespasian
  proclaimed, the siege of Jerusalem, the Temple burned, the city taken,
  Herodium and Machaerus, and Masada.

## Sources and reuse

| Source | Edition read | Terms | Use |
|---|---|---|---|
| Josephus, *The Wars of the Jews* | Whiston's translation (1737) with his notes, Project Gutenberg eBook 2850, read 2026-10-21 (new `josephus-jewish-war` source) | Public domain | Quoted, cited by Whiston's book, chapter and section |
| *Catholic Encyclopedia* vol. 8 (1910): B. Meistermann, "Jerusalem (Before A.D. 71)"; K. Hoeber, "Flavius Josephus" | New Advent transcription, read 2026-10-21 (the `catholic-encyclopedia` source added with Paul's journeys) | Work public domain; the website is noted, not copied | Years, quoted, as the reference for conventional dates and as supporting interpretations |
| Pleiades | Daily dump of 2026-10-21 (shared `pleiades` source) | CC BY 3.0 | Every coordinate, as an interpretation attributed to Pleiades |

Every quotation was checked by script against the downloaded text on
2026-10-21, and every Josephus quotation against the section its locator
names. The locators use the book, chapter and section numbering of Whiston's
translation; modern editions also cite Niese's running paragraph numbers, and
the quotations need re-checking against the Greek before release.

## Dates

Josephus dates by Macedonian month and the regnal year of Nero, Agrippa or
Vespasian ("the eighth day of the month Dius, in the twelfth year of the reign
of Nero"); Whiston adds the Hebrew month in brackets. Each record keeps those
words in `as_written`. The years follow the three cases of
`rfd/0002/CONVENTIONAL_DATES.adoc`:

- *Attested* (4): the outbreak at Caesarea, Cestius's defeat, Jotapata and the
  taking of Jerusalem, where Josephus names the regnal year himself. The
  reference work's year (Meistermann, 1910, or Whiston's note, 1737) is a
  supporting interpretation.
- *Conventional* (10): events Josephus places by order alone, such as the
  garrison massacre, Gamala, the burning of the Temple and Vespasian's
  proclamation. Each cites the passage that places it and the reference work
  that states the year, on the standard chronology of Nero's and Vespasian's
  reigns.
- *Interpretation* (2): Masada, which Josephus gives no year and for which 73
  and 74 are both argued (Hoeber's 73 is used), and Herodium and Machaerus,
  which take the window between the fall of Jerusalem and Masada.

Meistermann also gives day-level Julian dates for the siege of Jerusalem (for
example "8 Elul (1 August)"). They are not used: his conversions disagree with
the usual equivalents, and the chapter keeps Josephus's months instead.

## Places

Eight places are minted from the Pleiades dump: Beth-horon (the upper village
standing for the pass), Jotapata, Taricheae (which the gazetteer equates with
Magdala), Gamala, Gischala, Herodium, Machaerus and Masada. Jerusalem and
Ptolemais (`akko`) are copied byte for byte from the Mesopotamia and Levant
thread, and Caesarea is this thread's shared record. No siege line, ramp or
territory is drawn.

## Gaps and proposals for the owner

1. **Masada, 73 or 74.** Josephus gives the day (15 Xanthicus) but not the
   year. The chapter uses Hoeber's 73. Many modern historians prefer 74 on the
   evidence of Flavius Silva's career, but no source under the commercial-use
   rule was read for it, so it is not an alternative claim yet. Adding one would
   make the event disputed.
2. **No Macedonian or Jewish calendar.** `calendar` has no `macedonian` or
   `hebrew` option, so a day such as "the tenth of Lous" can only be words. A
   calendar for Josephus's months, as `chinese_lunisolar` serves the Tang
   chapter, would let the compiler place the day.
3. **The author as actor.** Josephus is both the source and a participant. The
   contract cannot link an actor to a source, so the chapter says it in notes.
4. **Rival rebel parties.** The rebels are one `community` record so that the
   conflict with Rome can be drawn. Josephus distinguishes at least five
   parties that also fought one another; separate actor records and a
   `conflict` relationship among them would show the civil war.

## What it tests in the engine

- All three bases for a year in one chapter: regnal years attested by the
  source, years placed by sequence as conventional, and a disputed year as an
  interpretation.
- A narrow theatre (Galilee, Judaea and the Dead Sea) with fortresses close
  together.
- An author who appears as an actor in his own source.
