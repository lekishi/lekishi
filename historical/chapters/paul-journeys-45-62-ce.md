# Paul's journeys (c. 45–62 CE)

Draft chapter, candidate #26 of the "Events up to 100 CE" list in
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV).
It is the feasibility note and the scope record for the manifest
[`paul-journeys-45-62-ce.yaml`](paul-journeys-45-62-ce.yaml). Nothing here is
approved; the owner approves the manifest with `pnpm approvals`.

## What the chapter is

Paul's travels as the Acts of the Apostles tells them, from the sending of
Barnabas and Saul from Antioch to Paul's two years under guard in Rome. It is
the most journey-shaped chapter in this set: four journeys (three missions and
the voyage to Rome), each with its stops as child events, and stops dense
enough to test the map at sea and on land.

- 33 events (4 journeys and 29 stages), 33 places, 11 actors.
- Story: the first mission (Seleucia, Cyprus, Perga, Pisidian Antioch, Iconium,
  Lystra, Derbe), the council at Jerusalem, the second mission (Troas,
  Philippi, Thessalonica, Beroea, Athens, Corinth), the third (Ephesus, Troas,
  Miletus, Tyre, Caesarea), the arrest and custody, and the voyage by Sidon,
  Myra, Fair Havens, Malta, Syracuse, Rhegium and Puteoli to Rome.

## Sources and reuse

| Source | Edition read | Terms | Use |
|---|---|---|---|
| Acts of the Apostles | King James Version, Project Gutenberg eBook 10 (the shared `bible-kjv` source), read 2026-10-21 | Public domain; the UK letters patent cover printing, not quotation | Quoted, cited by chapter and verse |
| F. Prat, "St. Paul", *Catholic Encyclopedia* vol. 11 (1911) | New Advent transcription, read 2026-10-21 (new `catholic-encyclopedia` source) | Work public domain; New Advent claims copyright in its website, so the record quotes the work and notes the transcription | The chronology, quoted, as an interpretation attributed to Prat |
| Pleiades | Daily dump of 2026-10-21 (shared `pleiades` source) | CC BY 3.0 | Every coordinate except Rome's, as an interpretation attributed to Pleiades |

Every quotation was checked by script against the downloaded text on
2026-10-21, and every Acts quotation against the verse its locator names.

## Dates

Acts names no year. It gives seasons ("after the days of unleavened bread",
"the fast was now already past"), lengths of stay (a year and six months at
Corinth, two years at Ephesus, two years in custody, three months on Malta, two
years in Rome) and two Roman officials whose terms can be dated from other
sources (Gallio and Festus).

The chapter dates each event by the window that Prat's 1911 chronology gives
for its stage: first mission 45–49, council 49 or 50, second mission 50–53,
fourth visit to Jerusalem 53, third mission 53–57, arrest 57, Festus and the
departure for Rome 59, captivity at Rome 60–62. Each date claim is
`basis: interpretation` attributed to Prat, quoting his table. The custody and
the voyage, which fall between two of his dates, cite both.

This is a century-old reckoning. Prat puts Gallio "about 53". Modern
chronologies use the Delphi inscription that dates Gallio's proconsulship,
which generally moves the Corinth stay a year or two earlier. That modern
chronology is not cited here, because no source under the commercial-use rule
was read for it; see the gaps below.

## Places

Twenty-two places are minted here from the Pleiades dump, as
`approximate_point` interpretations attributed to Pleiades. Six of them are
shared records this thread owns (Antioch on the Orontes, Caesarea, Philippi,
Thessalonica, Rhegium and Puteoli). Ten are reused: Rome from the Stephen II
chapter, Tyre and Iconium from main's records with Acts folded in as a
supporting name, and seven copied byte for byte from the threads that own
them, Jerusalem and Sidon (Mesopotamia and the Levant), Athens, Corinth,
Ephesus and Miletus (Greece and Persia), and Syracuse (Hannibal). Their source
records come with them.

Malta keeps region precision: Acts names the island, not the bay of the wreck.
Fair Havens is the bay that keeps the name. Forum Appii and the Three Taverns
are road stations.

## Gaps and proposals for the owner

1. **A modern chronology.** Prat's 1911 dates are the only years in the
   chapter. A modern chronology (anchored on the Gallio inscription) should be
   added as an `alternative` date claim on each event, or as the main claim
   with Prat as the alternative. It needs a source whose terms allow
   commercial use, or a citation-only reference that someone has read.
2. **Journeys as their own kind.** Under draft PR #26 the four journeys would
   be journey records with ordered, dated stops, and the stages would be stops
   rather than child events. Here they are v0 events with `part_of`, which
   tests the hierarchy but not ordering: two stops on the same day cannot be
   ordered.
3. **Unlocated and passing stops.** Acts names about fifteen places in passing
   (Samothrace, Amphipolis, Apollonia, Assos, Mitylene, Chios, Samos, Cos,
   Rhodes, Patara, Ptolemais, Lasea, Phoenix, Cnidus, Salmone). They are left
   out to keep the chapter small, but they are exactly what a journey's stop
   list should hold.
4. **The "we" passages.** From Troas on, Acts sometimes narrates in the first
   person plural. The records keep the quotes as written; the contract has no
   way to mark a passage as a claimed eyewitness account.

## What it tests in the engine

- Four parent journeys with 29 child events through `part_of`.
- A long sea voyage with a shipwreck and a winter stop.
- Shared places reused across chapters (Rome, Jerusalem, Athens, Corinth,
  Syracuse, Sidon).
- Every date as an interpretation with a quoted chronology, and windows that
  overlap between stages.
