# Hanno's voyage beyond the Pillars (about 570–470 BCE)

Draft chapter, candidate #18 of the "Events up to 100 CE" list in
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV).
It is the feasibility note and the scope record for the manifest
[`hanno-voyage.yaml`](hanno-voyage.yaml). Nothing here is approved; the owner
approves the manifest with `pnpm approvals`.

## Verdict

Feasible, and the hardest test of places so far. The Periplus of Hanno is a
short Greek account of a Carthaginian voyage down the Atlantic coast of Africa,
in eighteen sections, counting days' sailing between stages and giving no
year. Of the fifteen places the chapter records, five carry a gazetteer
coordinate and ten do not; every one of them has been identified differently by different
scholars. The chapter is worth having for exactly that: an engine that draws
this chapter honestly can draw any disputed geography.

- 19 events (the voyage, 17 stages, and Pliny's skins in the temple), 15
  places, 4 actors, 2 relationships. The relationships join actors
  (Hanno with the Lixitae and with the Gorillai), and no actor has an
  anchor place, so the map draws no arc for them; they show on the cards.
- A journey record in
  [`historical/journeys/hanno-voyage.yaml`](../journeys/hanno-voyage.yaml).
  The chapter does not include it yet; the tests compile it and check it
  against the contract.

## Sources and reuse

| Source | Id | Edition read | Terms | Use |
|---|---|---|---|---|
| Periplus of Hanno | `hanno-periplus` | Schoff's 1913 Greek text and translation, Wikisource | Public domain; transcription CC BY-SA | Every stage; quoted in Greek |
| Schoff's commentary | `schoff-hanno` | "The Geography of the Voyage" and "Carthaginian Chronology", 1913 | Public domain | Identifications and the 470 BCE date, as interpretation |
| Pliny, Natural History | `pliny-natural-history` | Bostock and Riley 1855, Perseus | Public domain; transcription CC BY-SA | II.67, V.1, VI.36, and the translators' notes as 1855 scholarship |
| Pleiades | `pleiades` | Dump of 2026-10-21 | CC BY 3.0 | Every identification, and the coordinates of the places minted here |
| Wikidata | `wikidata` | Pinned revisions, 2026-10-21 | CC0 | The coordinate of the shared `carthage` |
| Livy; Polybius | `livy`, `polybius` | Teubner editions, Perseus | Public domain; transcription CC BY-SA | Reached through the shared `carthage`, not cited by this chapter's own records |

Every quotation was checked by script against the downloaded texts on
2026-10-21. The Greek is Schoff's text as Wikisource transcribes it, accents
included (it prints Ώς where an editor would print Ὡς); re-check against
Müller's Geographi Graeci Minores before release.

## Dates

The account has no date. Pliny places it "in the most flourishing times of the
Punic state". Schoff puts the voyage about 470 BCE; Pliny's translators record
Falconer, Bougainville and Gail at about 570 BCE, and others from the age of
Hesiod to Agathocles. Every stage shares one window, `570 BCE..470 BCE`, with the
outlying readings as alternatives on the umbrella event. The skins Pliny saw
reported in the temple of Juno run to the fall of Carthage in 146 BCE.

## Places

Drawn only where a gazetteer gives a point: Carthage, the Pillars,
Soloeis (Cape Spartel), Cerne (Mogador) and the Chariot of the Gods (Mount
Cameroon), the last three at region precision. Every other place is `unknown`,
with a main "unlocated" claim, the commentators' identifications as
alternatives and a dispute, which is what the contract requires of a place
with competing identifications and no point.

## Disputes kept

- The date (above), and the voyage's extent: Pliny II.67 says Hanno sailed
  from Gades to the end of Arabia, which the account does not support.
- Cerne: two days' sail in the Greek, twelve in Schoff's translation (§8).
- The skins: three women flayed in the account, two skins in the temple in
  Pliny.

## Evidence states the contract lacks

Proposed to the owner, not built:

1. **Relative time.** The stages are ordered by days' sailing ("two days",
   "twelve days", "a day's run") with no anchor. The contract can only give
   every stage the voyage's window, so the timeline cannot separate them. A
   relative offset from a sibling event, in days, would let the engine order
   stages inside one undated window.

## Shared ids

`carthage` and `gades` are the Hannibal chapter's records (PR #40), with the
sources they cite (`livy`, `polybius`). The Carthaginian state is the Hannibal
chapter's `carthage-state` too, with the account's opening line folded in as a
supporting cite on its Greek name. No record of this chapter reaches `gades` (Pliny's Gades is named in
his text, not placed), so it is carried only to keep the copy whole; the Hanno and Pliny name forms live in the events that cite them.
`pliny-natural-history` is the merged record the Nile thread wrote for both
chapters, copied byte for byte. `pleiades` is
byte-identical across branches.
