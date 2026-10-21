# 重耳's nineteen years in exile (draft)

The manifest is [`chonger-exile.yaml`](chonger-exile.yaml). The chapter is a **draft**: it has no
approval, production does not serve it, and development and pull-request previews show it under the
draft banner. It was written on 2026-10-21 as one of the ancient-China chapters Darwin asked for,
to put more data in front of the engine (candidate 12 of
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV)).

## Feasibility

**Verdict: feasible now, and the journey-shaped chapter this region was missing.** The 左傳 and the
晉 house of 史記 tell the exile stop by stop, both public domain, and the table of the twelve lords
gives the years. Every quotation was checked against the transcription named in its source record.
What is weak is the map: the texts name states, not cities, so every stop is placed at a capital by
an editorial reading, and five of the thirteen places have no position.

| Question | Finding |
| --- | --- |
| Primary texts | 左傳 僖公五年, 二十三年 and 二十四年; 史記 晉世家 and 十二諸侯年表; 古本竹書紀年 for the crossing at 河曲. All read on Wikisource. |
| Dates | Absolute years from the table: flight 655 BCE, departure from the 狄 644 BCE, 曹, 鄭, 楚 and 秦 all in 637 BCE, return 636 BCE. The stay in 齊 is the 晉 house's "five years" counted from 644 BCE. The 左傳 gives sexagenary days for the return; the records keep only the year. |
| Places | 蒲 (隰縣), 曹 (定陶) and 曲沃 are display anchors; 郢 (紀南城) and 雍 have Wikidata coordinates (CC0) as the dataset's identifications; 臨淄 and 新鄭 come from the six-states and Qin chapters. 狄, 楚丘, 五鹿, 河曲 and 郇 have no position; the historical geography names their districts. |
| Rights | Every quoted source is public domain. |
| Disputes | One that shapes the route: the 左傳 and the 晉 house put 衛 between the 狄 and 齊 in 644 BCE, the table puts it after 齊 in 637 BCE. Both are kept as separate events, `chonger-at-wey` and `chonger-at-wey-637`, and as separate journeys. |

## Inventory

19 steps: 16 events and 3 relationships, reaching 13 places, 29 actors and 5 sources, plus two
proposed journey records.

- Events: `chonger-flees-pu`, `chonger-among-di`, `chonger-leaves-di`, `chonger-at-wey`,
  `wulu-clod`, `chonger-in-qi`, `chonger-leaves-qi`, `chonger-at-wey-637`, `chonger-at-cao`,
  `chonger-at-song`, `chonger-at-zheng`, `chonger-at-chu`, `chonger-in-qin`, `chonger-crosses-he`,
  `xun-covenant`, `chonger-enthroned`.
- Relationships: `chonger-chu-promise` (diplomacy), `qin-backs-chonger` (alliance),
  `chonger-rules-jin` (rulership).
- Journeys (proposed, not compiled): `chonger-exile-zuozhuan` and `chonger-exile-table`, under
  `historical/journeys/jin/`, in the shape of draft PR #26. They are not in the manifest's `include`
  because the compiler does not read journeys yet.
- Places (new, under `places/chunqiu/`): `pu-jin`, `di`, `wey-chuqiu`, `wulu`, `cao-taoqiu`, `ying`,
  `yong`, `hequ`, `xun`, `quwo`; shared: `linzi` (six-states, PR #38), `xinzheng` (Qin),
  `song-shangqiu` (conquest chapter).
- Actors (new, under `actors/chunqiu/`): 重耳 and his companions, the lords who received him, and
  the states `cao-state` and `wey-state`; shared: `jin-state`, `zheng-state`, `song-state`,
  `qin-state`, and `qi-state` and `chu-state` from PR #38.
- Sources: `zuozhuan` (new), `shiji-chunqiu`, `guben-zhushu-jinian`, `dushi-fangyu-jiyao-zhou`,
  `wikidata`.

This chapter reuses ids from the six-states chapter, so the branch merges PR #38's branch. Merge
PR #38 first.

## What this chapter tests in the engine

- **Rival routes.** Two journeys share their first and last stops and part between 齊 and 衛. The
  map must draw both, and the fork, without merging them.
- **A whole year of stops.** Five stops share 637 BCE and v0 cannot order them; the journey's order
  check can catch nothing there.
- **Broken lines.** Half the stops are unlocated or display anchors, so under PR #26's rules most
  legs are not drawn. This is the worst case for a journey and should still read as a route on
  the list and the card.
- **Stays.** `chonger-among-di` and `chonger-in-qi` are durations of twelve and five years, the first
  `duration` events in the ancient chapters.

## Evidence states the contract lacks

These are proposals for Darwin, not implemented:

1. **A day in the sexagenary cycle.** The return is dated to days (二月甲午, 辛丑, 壬寅, 丙午, 丁未), which
   order the last stops exactly. v0's date notation has no lunisolar month and cyclical day. A
   `day: 丁未` with `month: 2` on a `chinese_lunisolar` year would keep them as written and let the
   engine order them without converting to Julian days.
2. **Rival accounts of one event.** `chonger-at-wey` and `chonger-at-wey-637` are one visit told
   twice. A `same_as` or `account_of` link between the two events would let the story show one stop
   with two dates instead of two stops.
3. **A stop placed at a state.** The texts say "he went to 楚", not to 郢. A stop whose evidence names
   only a polity could point at the state actor, and the map could place it at the polity's seat
   with a visible "seat, by inference" mark, instead of each event picking a capital editorially.

## Exclusions

The 驪姬 affair and the death of 申生; 夷吾's reign as 惠公; the 介子推 legend after the return; the
battle of 城濮 in 632 BCE, where 重耳 kept his promise to 楚; 令狐, 桑泉, 臼衰 and 廬柳, which are named but
not minted.

## Before review

- Check every capital placement against a modern atlas, and decide whether stops at states should
  wait for proposal 3.
- Re-check every 左傳 and 史記 locator against a critical edition.
