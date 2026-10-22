# Hannibal's march into Italy, 218–216 BCE

A **draft** chapter, authored on 2026-10-21 to give the atlas a large second
Mediterranean chapter to test data and engine against. It has no approval: the
dev server and pull-request previews show it under the Draft banner, production
does not. The manifest is [`hannibal-italy-218-216.yaml`](hannibal-italy-218-216.yaml);
the records are under `historical/*/hannibal/`, with the shared `rome` and
`massalia` under `historical/places/stephen/` and `roman-republic` under
`historical/actors/mediterranean/`.

## Scope

The march from New Carthage to the Po, the battles of 218–216 BCE, the Roman
responses at home, and the allies each side won and lost, opened by the 219 BCE
siege of Saguntum. Codas: the Philip V treaty (215 BCE) and Hannibal's
inscription at the Lacinian temple (205 BCE), which is where Polybius' troop
figures come from. Excluded: everything after 216 BCE in Italy and Iberia, the
island theatres, and Livy's prodigy lists.

## Sources and conventions

- Polybius book 3 (with 7.9 and 10.3) is the main source; Livy 21–23 doubles it
  and adds what it lacks. Where they differ the event is disputed and keeps
  both, with the record publishing Polybius unless only Livy tells it.
- Every quotation is the Perseus transcription of a public-domain Teubner or
  Loeb edition, checked by script against the text at its locator. Locators are
  book.chapter.section.
- Dates are Roman consular years at year precision, `calendar: regnal`, with the
  consuls or the source's seasonal phrase in `as_written`. Days in the Roman
  calendar are kept as written and not converted.
- Towns are placed at Pleiades identifications with the Wikidata coordinate;
  rivers, mountains and regions carry label anchors; six places have no
  coordinate. No route is drawn.

Findings for the engine, and proposed journey records, are in
[`rfd/0002/HANNIBAL_FEASIBILITY.adoc`](../../rfd/0002/HANNIBAL_FEASIBILITY.adoc).
