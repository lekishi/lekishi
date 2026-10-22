# The 周 conquest of 商 at 牧野 (draft)

The manifest is [`zhou-conquest-muye.yaml`](zhou-conquest-muye.yaml). The chapter is a **draft**: it
has no approval, production does not serve it, and development and pull-request previews show it
under the draft banner. It was written on 2026-10-21 as one of the ancient-China chapters Darwin
asked for, to put more data in front of the engine (candidate 8 of
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV)).

## Feasibility

**Verdict: feasible now, and the best test yet of a disputed date.** The story is told at length
in 史記 周本紀 and 殷本紀 and in the 牧誓, all public domain, and every quotation was checked against
the transcription named in its source record. The places are a mix of excavated sites with
coordinates and identifications that rest on a Qing gazetteer.

| Question | Finding |
| --- | --- |
| Primary texts | 史記 卷三 殷本紀 and 卷四 周本紀; 尚書 牧誓, 召誥 and 洛誥; 古本竹書紀年 (王國維 1917). All read on Wikisource. |
| Contemporary evidence | The 利簋 bronze, cast days after the battle, names the 甲子 morning; the 何尊 names 成周. Neither inscription is cited yet. |
| Dates | The day 甲子 is attested; the year is not. The record keeps the 夏商周斷代工程's 1046 BCE (2022 report: 20 January 1046 BCE, cited through a China Daily report) as the anchor and the Bamboo Annals' count, which gives 1027 BCE, as an alternative. Every other event is offset from the battle by statements in the annals. |
| Places | 豐, 鎬 (宗周), 洛邑 (成周), the 魯 city at 曲阜 and the 宋 city at 商丘 have Wikidata coordinates (CC0). 孟津, 牧野 and 朝歌 are display anchors at the modern county that 讀史方輿紀要 identifies. |
| Rights | Every quoted source is public domain. The China Daily article is all rights reserved and is cited, not quoted. |
| Disputes | Three: the year of the battle; whether 紂 died in the 鹿臺 fire or was captured at 南單 (the Bamboo Annals); and whether 宋 was granted to 微子 by 武王 at the conquest or by 周公 after the rising. |

## Inventory

15 steps: 11 events and 4 relationships, reaching 8 places, 18 actors and 6 sources.

- Events: `mengjin-review`, `mengjin-crossing`, `muye-battle`, `di-xin-death`,
  `shang-altar-proclamation`, `wu-geng-enfeoffed`, `zhou-enfeoffments`, `luoyi-planned`,
  `sanjian-rebellion`, `weizi-song`, `chengzhou-founding`.
- Relationships: `zhou-shang-conquest` (conflict), `zhou-lu-enfeoffment` (institutional_change),
  `sanjian-against-zhou` (conflict), `song-successor-of-shang` (successor_of).
- Places: `feng`, `haojing`, `luoyi`, `qufu`, `song-shangqiu` (located); `mengjin`, `muye`,
  `chaoge` (display anchors).
- Actors: `zhou-wen-wang`, `zhou-wu-wang`, `zhou-gong-dan`, `shi-shangfu`, `zhou-cheng-wang`,
  `zhao-gong-shi`, `guan-shu`, `cai-shu`, `di-xin`, `wu-geng`, `weizi-qi`, `lu-state`, `song-state`,
  and, shared with the 殷 chapter, `zhou-state` and `shang-state`.
- Sources: `shiji-yin-zhou`, `shangshu`, `guben-zhushu-jinian`, `dushi-fangyu-jiyao-zhou`,
  `chinadaily-muye-2023`, `wikidata`.

## What this chapter tests in the engine

- **A disputed year with a main and an alternative claim.** The battle's window is the span
  between two named proposals, not an uncertainty around one. The date pane must show both and
  say which one is the editorial anchor.
- **Windows derived from other windows.** The 孟津 events and the post-conquest events are offsets
  from the battle, written out by hand. A later chronology that moved the battle would need every
  one of them edited; see the second proposal below.
- **A conflicting death.** `di-xin-death` keeps the fire and the capture as rival accounts of the
  same event.
- **A state that continues another.** `song-successor-of-shang` is the first `successor_of`
  between two states rather than two places.

## Evidence states the contract lacks

These are proposals for Darwin, not implemented:

1. **A date stated relative to another event.** "後二年" and "居二年" are claims about distance from
   the conquest, not about years. A `relative_to: { event, offset }` date would let the compiler
   derive the window and keep it in step when the anchor moves. Today the offset is applied by hand
   and the arithmetic is written in the cite's `says`.
2. **A window bounded by named rival proposals.** The 1046–1027 window is not "somewhere between";
   it is "one of these two, or neither". v0 has no way to say the interior is not supported. One
   option is a `mode: alternatives` date listing the candidate values, each with its own cite.

## Exclusions

The 利簋 and 何尊 inscriptions; the other proposed conquest years (from 1130 to 1018 BCE in the
literature), which fall outside the window and are named here so the window is not read as
the full range of opinion; 周公's campaign against 奄 and 薄姑; 武王's death and its year; the 殷
chapter before the conquest, which is `shang-yin-wu-ding`.

## Before review

- Cite the 利簋 inscription from a published reading and give `muye-battle` its 甲子 morning from
  the bronze, not only from the annals.
- Read the 2022 report itself instead of the article that reports it.
- Check the 孟津, 牧野 and 朝歌 identifications against a modern atlas such as 《中國歷史地圖集》.
