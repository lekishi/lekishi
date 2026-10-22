# 殷 under 武丁 and 婦好 (draft)

The manifest is [`shang-yin-wu-ding.yaml`](shang-yin-wu-ding.yaml). The chapter is a **draft**: it
has no approval, production does not serve it, and development and pull-request previews show it
under the draft banner. It was written on 2026-10-21 as one of the ancient-China chapters Darwin
asked for, to put more data in front of the engine (candidate 7 of
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV)).

## Feasibility

**Verdict: feasible as a text chapter now, weak as an archaeology chapter until two sources are
read.** The transmitted texts are public domain and quotable, and every quotation in the records
was checked against the transcription named in its source record. What the candidate list promised,
"excavated sites, and dates known only to a reign", is half delivered: the dates are, but 婦好 is
known only from excavation and oracle bones, and neither has been read.

| Question | Finding |
| --- | --- |
| Primary texts | 史記 殷本紀 (Han, about 1,000 years after the events), 古本竹書紀年 (王國維's 1917 reconstruction, public domain), 尚書 無逸, 周易 既濟. All read on Wikisource. |
| Contemporary evidence | Oracle-bone inscriptions and the 殷墟 excavations. Not read. 《甲骨文合集》 (1978–1983) and the excavation report 《殷墟婦好墓》 (1980) are copyrighted compilations: catalogue numbers and readings may be cited as interpretation, the inscriptions themselves quoted as public-domain text once a reading has been checked in a library. |
| Dates | No source gives an absolute year before 841 BCE. Every event carries a window from the 夏商周斷代工程 chronology (盤庚's move about 1300 BCE, the fall of 商 in 1046 BCE), cited through a page that reports it, because the 2000 table itself was not read. |
| Places | 殷墟 and 婦好's tomb have Wikidata coordinates (CC0). 亳, 奄, 傅險 and 鬼方 have none and are recorded as unknown. |
| Rights | Every quoted source is public domain. The two modern pages that report the chronology are all rights reserved and are cited, not quoted. |
| Disputes | Two real ones, both between the Han annals and the Bamboo Annals: where 盤庚 moved, and whether 武乙 moved at all. |

## Inventory

12 steps: 9 events and 3 relationships, reaching 6 places, 10 actors and 7 sources.

- Events: `pangeng-moves-to-yin`, `wuding-silent-years`, `fu-yue-found`, `pheasant-omen`,
  `gaozong-guifang-war`, `fu-hao-burial`, `wuyi-moves-north`, `jili-visits-shang`,
  `wending-kills-jili`.
- Relationships: `yin-capital-relocation` (relocated_to), `zhou-shang-court-visit` (diplomacy),
  `shang-zhou-killing-of-jili` (conflict).
- Places: `yinxu`, `fu-hao-tomb` (located); `shang-bo`, `shang-yan`, `fuxian`, `guifang` (unknown).
- Actors: `shang-state`, `pan-geng`, `wu-ding`, `fu-yue`, `zu-ji`, `fu-hao`, `wu-yi`, `wen-ding`,
  and, shared with the 周 chapters, `zhou-state` and `zhou-ji-li`.
- Sources: `shiji-yin-zhou`, `guben-zhushu-jinian`, `shangshu`, `zhouyi`, `dushi-fangyu-jiyao-zhou`,
  `ourchinastory-xszc-chronology`, `wikidata`.

New sources are separate records rather than additions to `shiji` and `dushi-fangyu-jiyao`, because
editing those would reopen the approved Qin chapter.

## What this chapter tests in the engine

- **Many events with one identical window.** Seven events share 1300–1046 BCE. The contract
  rightly refuses to order them; the story list and playback must show them as unordered, not
  stacked at a midpoint.
- **Events with no place.** Four events carry no place at all, because the texts give none.
- **A chapter whose only coordinates are two points 300 m apart.** The camera's home view and the
  bounding box degenerate.
- **A destination that may be an origin.** `pangeng-moves-to-yin` keeps 奄 as start, 殷 as end and
  亳 as a conflicting "other".

## Evidence states the contract lacks

These are proposals for Darwin, not implemented:

1. **"About" a year.** The table says 盤庚 moved *about* 1300 BCE. v0's `era_year` already has
   `endpoint_certainty: approximate`, but the record notation cannot write it, so the record holds a
   one-year window and says so in prose. Proposed spelling: `c. 1300 BCE`, compiling to
   `endpoint_certainty: approximate` on both ends.
2. **A date that is only a reign.** "In 武丁's reign" is not the same claim as "somewhere in
   1300–1046 BCE"; the reign is a range whose own ends are disputed. A `reign:` reference (an actor
   role with a date) would let a later chronology move every event of the reign at once.

## Exclusions

The oracle-bone record of 武丁's wars and 婦好's campaigns; the modern excavations of 殷墟 (from 1928)
and of her tomb (1976); the 洹北 商城 that some scholars take for 盤庚's first 殷; the 商 kings
before 盤庚 and after 文丁; the 周 conquest itself, which is its own chapter (`zhou-conquest-muye`).

## Before review

- Read 《殷墟婦好墓》 for the tomb's date and contents, and give `fu-hao-burial` its own window.
- Read the 2000 年表 or the 2022 report directly instead of the page that reports it.
- Re-check every 史記 locator against a critical edition (the Wikisource text is unproofread).
