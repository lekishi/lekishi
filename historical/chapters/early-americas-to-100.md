# The early Americas, to 100 CE

> **Draft.** This chapter is the manifest
> [`early-americas-to-100.yaml`](early-americas-to-100.yaml) and the record files it
> reaches. It has no approval, so it is served only by the dev server and
> Cloudflare PR previews, under the Draft banner. It was written on 2026-10-21 as
> candidate #31 ("Early Mesoamerica and the Andes, to 100 CE") of
> [Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV),
> to give the data and the engine a large, varied set of early records to test
> with. The feasibility note is
> [`rfd/0002/EARLY_AMERICAS_FEASIBILITY.adoc`](../../rfd/0002/EARLY_AMERICAS_FEASIBILITY.adoc).

## Scope

Thirty events at twenty-five places in North, Central and South America, from the
White Sands footprints (about 23,000–21,000 years ago) to the Long Count stelae of
Chiapa de Corzo (36 BCE) and Tres Zapotes (32 BCE). Three spans begin before 100 CE
and run past it: the Nasca geoglyphs, the Hopewell earthworks and Teotihuacan.

The chapter has one story, in chronological order by the start of each event's
span. The order is not a claim that one event led to another. The only link
between events is a `proposed_influence` relationship from San Lorenzo to the
formal ceremonial complexes, which Inomata and colleagues (2021) propose. It is
marked `not_asserted`. The record exists, but it is not a story step: the
contract allows a relationship between events, and the atlas can so far draw
only relationships between actors and places.

The chapter's `window` runs from 21051 BCE to 100 CE, so the atlas opens on every
event before 100 CE. The atlas fails a draft whose story has an event wholly
outside the window unless that step's caption starts "Coda — ", and the earliest
sites are a prelude, not a coda. The densest stretch is 2700 BCE to 100 CE.

Not covered: La Venta, Izapa, Cuicuilco, Paracas, Moche, Tiwanaku, the wider
Archaic of South America, and every site after 100 CE.

## Records

All records live in the world-first tree under an `americas/` folder, which is
only for tidiness. Ids are global, and none of them existed before this chapter.

| Kind          | Count | Folder                                    |
| ------------- | ----: | ----------------------------------------- |
| Events        |    30 | `historical/events/americas/`             |
| Places        |    25 | `historical/places/americas/`             |
| Actors        |     8 | `historical/actors/americas/` (cultures)  |
| Relationships |     1 | `historical/relationships/americas/`      |
| Sources       |    25 | `historical/sources/` (plus `wikidata`)   |

The actors are archaeological cultures (`types: [culture]`): Olmec, Maya,
epi-Olmec, Poverty Point, Adena, Hopewell, Fort Ancient and Clovis. Each event
names a culture as a participant with role `other` and a note, because the
contract's participant roles describe people at an event, not the culture a
site is assigned to.

Every place is a Wikidata point (CC0) cited with the item's revision. Sites are
`approximate_point` with precision `site`. Four places that cover a large area
(White Sands, Jaltipan, the Nasca lines, and the Hopewell Ceremonial Earthworks,
which are a group of sites) are `display_anchor` points. The Xihuatoxtla shelter and Horr's Island have no
position: Wikidata has no coordinate for them, and the chapter does not invent
one. Places of type `other` say in a note that the place vocabulary has no type
for an archaeological site or an earthwork.

## How the dates are written

Each date's `as_written` keeps the source's own expression, and each record's
notes say how it was converted.

- **Years before present (BP)** count back from 1950. N BP is written as
  N − 1949 BCE (there is no year zero), and N BP below 1950 as 1950 − N CE.
- **"Years ago"** names no year to count from, and does not say whether the age
  is calibrated, so it is never converted on its own. A "years ago" figure is
  written as BP only where the source shows it is in calibrated years before
  present (Huaca Prieta); otherwise the date comes from a calendar or cal BP age
  the same or another cited source gives (Hopewell, Serpent Mound), and the
  rounded figure stays in a citation.
- **Calibrated BC dates** are written as the same BCE years.
- **Uncalibrated radiocarbon years** are not calendar years, and the atlas plots
  a date's year whatever its calendar, so none is used as a date. Paso de la
  Amada's 1400 BC (uncalibrated) is kept as a second citation beside the
  calibrated 1650 BCE that Blomster and Salazar Chávez (2020) give; the Fort
  Ancient charcoal dates for Serpent Mound appear only in its dispute.
- **Long Count dates** are written as Julian years with the Long Count in
  `as_written`, following the correlation the source uses.
- A span whose ends bound the event is `mode: window`; a span the event filled
  is `mode: duration`.

The notation cannot yet mark a date as approximate or give a century
precision, though contract v0 can store both. Every "about" date is therefore
written as an exact year or range, and the record's notes say it is
approximate. This is the first question for the owner in the feasibility note.

## Sources

Quotations come only from sources the commercial-use rule adopts: National Park
Service pages (public domain) and three CC BY articles (Dillehay 2015, Sugiyama
2021, Hansen 2022). Every other source is cited for what it states, with a
locator, and is not quoted. The register rows are under "Archaeology and
scholarship" in [`docs/SOURCE_REGISTER.adoc`](../../docs/SOURCE_REGISTER.adoc).

Nine events rest on the 2013 Poverty Point World Heritage nomination, mostly on
its comparative analysis of other early monumental sites (Watson Brake, Indian
Knoll, Horr's Island, Real Alto, Caral, San Lorenzo, Grave Creek, Nasca). It is a
good single source for dates and context, but it is a secondary summary; each of
those sites should get its own primary report before release.

Most journal sources were read as abstracts, through Europe PMC, OpenAlex,
Crossref or RePEc. Only the PLOS ONE articles, the Simposio papers, the Ohio
Archaeological Council papers, the nomination and the NPS pages were read in full.

## Disputes

Four records carry a dispute with a conflicting claim:

- **Poverty Point earthworks.** The nomination gives 3,700–3,100 BP; the National
  Park Service's Spanish page gives 1650–700 BCE.
- **The Cascajal block.** Its publishers date it by style to the early first
  millennium BCE; Ann Cyphers, as reported by Guerrero (2010, p. 1066), questions
  its context and so its authenticity.
- **Serpent Mound.** Herrmann and colleagues (2014) date its first construction to
  after about 321 BCE, 381–44 BCE at 95% probability (Adena); Fletcher and colleagues (1996) obtained charcoal
  dates of 920 ± 70 BP (Fort Ancient). Lepper (2020) argues the sediment dates
  are unreliable.
- **Tres Zapotes Stela C.** Guerrero reads its Long Count as 32 BCE; the INAH site
  museum guide gives 32 CE.

## For review

- **Serpent Mound's main claim is an editorial choice.** The draft makes the
  Adena date the main claim and the Fort Ancient date the conflicting one, which
  places the mound inside the chapter's era. Lepper (2020), the fuller of the two
  sources read, favors Fort Ancient. If the owner prefers that reading, the event
  falls after 100 CE and should leave the chapter, or stay with the dispute
  leading.
- **Poverty Point Mound A** is a part of the earthworks event (`part_of`), dated
  to a window inside it. Its "under three months" construction is stated in the
  summary and not in the date, because a date range is either the window the
  event fell in or the time it took, not both.
- **The Clovis event has no place.** It is a dated complex across North America,
  so it tests an event with no map position.
