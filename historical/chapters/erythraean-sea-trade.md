# The Erythraean Sea trade, Rome to India (41–77 CE)

Draft chapter, candidate #25 of the "Events up to 100 CE" list in
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV).
It is the feasibility note and the scope record for the manifest
[`erythraean-sea-trade.yaml`](erythraean-sea-trade.yaml). Nothing here is
approved; the owner approves the manifest with `pnpm approvals`.

## Verdict

Feasible, and the best arc test so far. The Periplus of the Erythraean Sea is a
Greek merchant's handbook to every port from the Red Sea to southern India:
who rules it, what it buys and sells, and when to sail. It links ports to each
other explicitly, so the chapter has fourteen trade arcs across nearly 70 degrees of
longitude, from Berenice to Muziris and from Taprobane to Rome. Pliny, writing
in the same decades, gives the route from Alexandria to Muziris in days.

- 23 events (the Periplus voyage and 11 ports, Pliny's route and 5 legs, the
  Hippalus crossing, the destruction of Eudaemon Arabia, the freedman's drift
  and the Taprobane embassy), 26 places, 15 actors, 14 relationships.
- A proposed v1 journey in
  [`historical/journeys/pliny-india-route.yaml`](../journeys/pliny-india-route.yaml),
  not compiled.

## Sources and reuse

| Source | Id | Edition read | Terms | Use |
|---|---|---|---|---|
| Periplus of the Erythraean Sea | `periplus-erythraean-sea` | Schoff's 1912 translation, Wikisource | Public domain; transcription CC BY-SA | Every port, ruler and arc; quoted in translation |
| Schoff's dating chapters | `schoff-periplus` | "Date and Authorship" and "Date … by Various Commentators", 1912 | Public domain | The 58–62 CE window and the other commentators' dates |
| Pliny, Natural History | `pliny-natural-history` | Bostock and Riley 1855, Perseus | Public domain; transcription CC BY-SA | VI.24 (the drift and the embassy) and VI.26 (the route) |
| Pleiades | `pleiades` | Dump of 2026-10-21 | CC BY 3.0 | Every coordinate, attributed to Pleiades |

Every quotation was checked by script against the downloaded texts. Eggermont
(1960) judged the Greek edition Schoff translated untrustworthy, so the records
quote the translation, not the Greek, and the locators should be re-checked
against Frisk (1927) or a later edition before release.

## Dates

The Periplus is undated. Schoff fixes the voyage it was written from between
the summers of 58 and 62 CE (60 CE the nearest single year), from Malichas of
the Nabataeans, Charibael and the state of Parthian and Kushan power. His list
of other commentators runs from 40–70 CE through Müller's 80–89 CE to
Reinaud's 246–247 CE; those are alternatives on the voyage event, and every
port shares Schoff's window because the text describes them in the present.

Pliny's route shares a window of 48–77 CE: his translators record Marcus's
argument that the 6 Mechir date fixes the passage to 48–51, and the Natural
History was dedicated in 77. The drift and the embassy are dated to Claudius's
reign, 41–54. The Hippalus crossing runs 41–58, from Vincent's reasoning (about
47) to Schoff's earliest date for the voyage.

## Places

Pleiades gives a point for every port drawn. Places the text names but no
gazetteer locates (Leuke Kome, Sabbatha, Moscha, Saua, Minnagara, Rhapta) are
left out rather than drawn. Where the text names only a country ("from
Egypt", "from Arabia"), the arc is drawn from Berenice or Muza and says so in
its notes.

## Shared ids

Three places use the ids other branches mint for the same place, so that the
duplicate fails the build and is merged rather than living as two records:
`bharukaccha` (Barygaza; the 玄奘 chapter), `ujjayini` (Ozene; the Ashoka
chapter) and `lanka` (Taprobane; the Ashoka chapter). `pliny-natural-history` is the
merged record the Nile thread wrote for both chapters, copied byte for byte.

`rome` is the record the Stephen II chapter minted on `main`; this chapter
folded into it its Pliny name, the Rome thread's (PR #30) Livy citation and the
Pleiades id, so PR #30 must fold into the same record when it merges.
`alexandria-egypt` (from the Greece thread, PR #34) is a byte-for-byte copy of
that thread's file, with the source it cites (`arrian-anabasis`), so the
branches merge cleanly.
`coptos` and `berenice` are minted here first.

## Evidence states the contract lacks

None new. The chapter needs "Egypt" as an arc end, which the records solve
with a stand-in port, and a journey without travellers (Pliny's route), which
is a finding for the journey proposal.
