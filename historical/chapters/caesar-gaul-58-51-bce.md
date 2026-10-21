# Caesar in Gaul (58–51 BCE)

Draft chapter, candidate #23 of the "Events up to 100 CE" list in
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV).
It is the feasibility note and the scope record for the manifest
[`caesar-gaul-58-51-bce.yaml`](caesar-gaul-58-51-bce.yaml). Nothing here is
approved; the owner approves the manifest with `pnpm approvals`.

## What the chapter is

The Gallic War as the Commentaries tell it: Caesar's own account of his eight
years as proconsul, one book a year, with an eighth book by his officer Hirtius.
It is the opposite case to the kings chapter. The source is contemporary and
written by the man in command, so the question is not whether the events
happened but whose numbers and motives the reader is given. Every event says
it is Caesar's report.

- 21 events, 6 relationships, 18 places, 16 actors.
- Story: the Helvetii at Genava, the Saône and Bibracte; Vesontio and
  Ariovistus; the Aisne, the Sambre and the Atuatuci; the Veneti; the Rhine
  bridge; two crossings to Britain and Cassivellaunus; Atuatuca; the second
  Rhine bridge; Cenabum, Vercingetorix, Avaricum, Gergovia and Alesia; and
  Uxellodunum.

## Sources and reuse

| Source | Edition read | Terms | Use |
|---|---|---|---|
| Caesar, *De bello Gallico* I–VIII | The Latin Library transcription, read 2026-10-21 | Work public domain; the site states no terms and names no edition | Quoted in Latin, cited by book and chapter |
| Pleiades | Daily dump of 2026-10-21 (shared `pleiades` source) | CC BY 3.0 | Every coordinate except Genava's, as an interpretation attributed to Pleiades |

Every quotation was checked by script against the downloaded text on
2026-10-21, and every locator against the chapter it names. Before release,
re-check the locators against a critical edition (Hering's Teubner or Du
Pontet's Oxford text). No translation is quoted; the summaries are ours.

## Dates

Caesar dates three books by the consuls: book I by Piso and Gabinius (58 BCE),
book IV by Pompey and Crassus (55), book V by Domitius and Claudius (54).
Hirtius says Caesar wrote one book for each year and that the year after book
VIII, the consulship of Paulus and Marcellus (50), had no great deeds in Gaul.
Together these date every book, so each event is a one-year window with its
consular or book year in `as_written`.

Only one event has a day: the Helvetii set the fifth day before the Kalends of
April for their gathering. That is a date in the pre-Julian Roman calendar,
which ran some weeks off the seasons in the 50s BCE, so the record keeps the
Latin and dates the event to the year.

## Places

Sixteen places come from the Pleiades dump as `approximate_point`
interpretations attributed to Pleiades. Genava is the shared record minted by
the Stephen II chapter at Wikidata's coordinate for Geneva, with Caesar's name
form and its Pleiades id folded in. Rivers and coasts (the Aisne, the
Sambre, the Rhine, the Saône, the Thames, the Morini's coast, the Veneti's
Armorica, Britain) keep region precision, and a battle on a river is shown at
the river's representative point, not at a battlefield.

- **Atuatuca** is drawn only as a `display_anchor` at Tongeren: Caesar calls
  it a fort in the middle of the Eburones' land, and the camp has not been
  found.
- **The Atuatuci's stronghold** has no point. Caesar describes its cliffs and
  its one approach but names no place, and the proposed sites are not cited.
- **Alesia, Gergovia and Bibracte** use Pleiades' site points (Alise-Sainte-
  Reine, the plateau of Gergovie, Mont Beuvray). The battle of Bibracte is
  shown at the oppidum only as the place Caesar was marching to.

No march route, front line or territory is drawn.

## Gaps and proposals for the owner

1. **No Roman republican calendar.** `calendar` has `julian` but no pre-Julian
   Roman calendar, so a day like "a. d. V Kal. Apr." can only be kept as words.
   A `roman_republican` calendar with consular years would keep it as data;
   the conversion to a Julian day before 45 BCE is itself uncertain, so it
   would be shown as a window.
2. **A commander's own report.** `basis: attested` covers both an eyewitness
   and a self-interested one. The text says "Caesar's own account" in each
   event; if the owner wants this as data, it is a per-claim note rather than
   a new evidence state, since the claims are attested.
3. **Battles on rivers.** Four battles sit on a river's representative point,
   which may be hundreds of kilometres from the field. A battlefield record
   with `display_anchor` would be more honest when a modern identification is
   cited; none is cited here.
4. **Journeys.** The marches (Genava to Bibracte, Vesontio to the Rhine, the
   two crossings to Britain) are journey-shaped. The owner decided on
   2026-10-21 that journeys are their own record kind
   ([the decision](../../rfd/0002/AUTHORING_FORMAT.adoc)), but the record's
   shape is still proposed and unbuilt. Once it is, they would be journeys
   with Caesar's stages as attested stops; until then this chapter does not
   add them.

## What it tests in the engine

- A dense run of 21 events across eight years, with three to six events in a
  single year (58 and 52 BCE).
- Places at several precisions side by side: sites, towns, rivers, regions, a
  display anchor and an unlocated stronghold.
- A theatre that spans Gaul, the Rhine and southern Britain.
- The same Roman state and commander in a chapter whose other actors are
  peoples (`community`) rather than states.
