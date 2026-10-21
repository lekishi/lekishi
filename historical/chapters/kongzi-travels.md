# Confucius's travels among the states (draft)

The manifest is [`kongzi-travels.yaml`](kongzi-travels.yaml). The chapter is a **draft**: it has no
approval, production does not serve it, and development and pull-request previews show it under the
draft banner. It was written on 2026-10-21 as one of the ancient-China chapters Darwin asked for,
to put more data in front of the engine (candidate 14 of
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV)).

## Feasibility

**Verdict: feasible now, and the best stress test of conflicting chronology in the set.** The
孔子世家 tells the travels at length, but its years are known to be confused, and the table of the
twelve lords, the 衛 house and the 左傳 date the same visits differently. All are public domain,
and every quotation was checked against the transcription named in its source record. The
candidate list's "497–484 BCE" is one reading; the chapter's window opens at 498 BCE because the
table puts the departure there.

| Question | Finding |
| --- | --- |
| Primary texts | 史記 孔子世家, 衛康叔世家 and 十二諸侯年表; 左傳 定公 and 哀公; 論語 述而, 子罕, 先進, 衞靈公 and 微子. All read on Wikisource. |
| Dates | The table's years where it has them (departure 498, 衛 497, 陳 496, 宋 492, 衛 485, home 484 BCE); the 孔子世家's relative years ("the next year") elsewhere, anchored on 魯定公's death (495 BCE) and 季桓子's (492 BCE). |
| Places | 衛 (帝丘), 匡, 蒲 and 葉 are display anchors; 蔡 is a display anchor at Wikidata's 蔡國故城 (CC0), the old capital, which may not be the 蔡 he reached; 曲阜, 宋, 鄭 and 曹 come from the earlier chapters and 陳 from the six-states chapter. Three events have no place. |
| Rights | Every quoted source is public domain. |
| Disputes | Five, each on its event: the year of the departure (498 or 496 BCE), whether 宋 came before or after 陳, the year of the arrival in 陳, the last return to 衛 (from 楚 in 489 or from 陳 in 485 BCE, kept as two events), and the year of the dancing girls. |

## Inventory

20 steps: 19 events and 1 relationship, reaching 10 places, 23 actors and 5 sources, plus two
proposed journey records.

- Events: `kongzi-leaves-lu`, `kongzi-first-in-wey`, `kuang-detained`, `nanzi-audience`,
  `kongzi-at-cao`, `huan-tui-tree`, `zheng-east-gate`, `kongzi-arrives-chen`, `pu-covenant`,
  `lingong-asks-battle`, `kongzi-back-in-chen`, `kongzi-moves-to-cai`, `kongzi-at-ye`,
  `asking-the-ford`, `chen-cai-siege`, `chu-rescue`, `kongzi-returns-wey`, `kongzi-returns-wey-485`,
  `kongzi-returns-lu`.
- Relationship: `qi-lu-dancing-girls` (diplomacy).
- Journeys (proposed, not compiled): `kongzi-travels-shijia` and `kongzi-travels-table`, under
  `historical/journeys/kongzi/`.
- Places (new): `wey-diqiu`, `kuang`, `pu-wey`, `cai-shangcai`, `ye`; shared: `qufu`,
  `song-shangqiu`, `cao-taoqiu`, `xinzheng`, and `chen` from PR #38.
- Actors (new): `kongzi`, `zi-lu`, `yan-hui`, `zigong`, `ran-qiu`, `ji-huan-zi`, `ji-kang-zi`,
  `wey-ling-gong`, `nanzi`, `huan-tui`, `ye-gong`, `chu-zhao-wang`, `jieyu`, `kong-wenzi`,
  `cai-state`, `chen-state`; shared: `lu-state`, `wey-state`, `song-state`, `zheng-state`,
  `cao-state`, and `qi-state` and `chu-state` from PR #38.
- Sources: `shiji-chunqiu`, `zuozhuan`, `lunyu` (new), `dushi-fangyu-jiyao-zhou`, `wikidata`.

## What this chapter tests in the engine

- **Revisits.** Confucius is in 衛 four times and in 陳 twice. The journey goes back and forth over
  the same places, and the map must draw repeated legs without turning them into a tangle.
- **Two places at one point.** `kuang` and `pu-wey` share the 長垣 anchor.
- **Journeys that disagree on order.** The two journeys share events but list 宋 and 陳 in opposite
  order. Their windows overlap, so v0's order check passes both; the contrast must be visible on
  the card, not only in the data.
- **Places that may be wrong in a cited way.** `cai-shangcai` is a display anchor at Wikidata's 蔡, and the source
  itself says the 蔡 court had moved. The place card must show that note.

## Evidence states the contract lacks

These are proposals for Darwin, not implemented:

1. **Relative years.** "The next year", "after three years", "the year 定公 died" carry most of
   the dates here, each worked out by hand in the cite. This repeats the conquest chapter's
   `relative_to` proposal; here the anchors are deaths, which would make them events of their own.
2. **An event dated by two sources' orders, not years.** `huan-tui-tree`'s window is "before 陳 in
   one source, after it in another". A way to state an order claim per source would let the
   engine show the two sequences instead of a five-year window.

## Exclusions

Confucius's career in 魯 (夾谷, the three cities) before 498 BCE; his last years, the 春秋 and his
death in 479 BCE; the lute lesson, the falcon of the 肅慎 and other stories without a place or a
year; the 孔子家語, which is a later compilation.

## Before review

- Decide whether the 孔子世家 or the table should anchor each disputed year; the record follows
  the table where it has a year, except for 宋; the last return to 衛 is kept as two events, one per
  account, rather than one event anchored on either year.
- Re-check every locator against a critical edition, and the 左傳 哀公 transcription, which uses
  a different punctuation (．) from the other books.
