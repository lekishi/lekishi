# The fall of Western 周 and the move to 洛邑 (draft)

The manifest is [`zhou-move-east.yaml`](zhou-move-east.yaml). The chapter is a **draft**: it has no
approval, production does not serve it, and development and pull-request previews show it under
the draft banner. It was written on 2026-10-21 as one of the ancient-China chapters Darwin asked
for, to put more data in front of the engine (candidate 9 of
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV)).

## Feasibility

**Verdict: feasible now, and the first ancient chapter whose years come from the sources.** The
table of the twelve lords counts years without a break from the 共和 regency, 841 BCE, so 幽王's
death falls in 771 BCE and 平王's move in 770 BCE without a modern chronology. Two independent
accounts, the Han annals and the Bamboo Annals, disagree on order and place, which is what the
chapter is for. Every quotation was checked against the transcription named in its source record.

| Question | Finding |
| --- | --- |
| Primary texts | 史記 周本紀, 秦本紀, 十二諸侯年表, 晉世家 and 鄭世家; 古本竹書紀年 (王國維 1917). All read on Wikisource. |
| Contemporary evidence | Bronze inscriptions of the late Western 周 and the 清華簡 繫年, which also tells the two-kings story. Not read; the 繫年 is a modern edition under copyright and would be cited, not quoted. |
| Dates | Absolute, from the table's count. Two windows: the change of heir (779 BCE in the annals, 774 BCE in the Bamboo Annals) and 平王's enthronement (after 幽王's death, or before it). 晉文侯's years are aligned to the table through the 晉 house. |
| Places | 驪山 has a Wikidata coordinate (CC0); 岐山 is a display anchor at the modern county; 鎬 and 雒邑 come from the conquest chapter. 申, 戲 and 攜 have no position. |
| Rights | Every quoted source is public domain. |
| Disputes | Three: the year of the new heir; where 幽王 died (under 驪山, or at 戲); and whether 平王 was made king before or after his father's death. |

## Inventory

14 steps: 10 events and 4 relationships, reaching 7 places, 18 actors and 5 sources.

- Events: `sanchuan-earthquake`, `baosi-made-queen`, `beacon-fires`, `pingwang-flees-shen`,
  `youwang-killed`, `pingwang-enthroned`, `xie-wang-enthroned`, `qin-made-lord`,
  `pingwang-moves-east`, `xie-wang-killed`.
- Relationships: `quanrong-against-zhou` (conflict), `zhou-qin-enfeoffment` (institutional_change),
  `zhou-capital-moves-east` (relocated_to), `jin-against-xie-wang` (conflict).
- Places: `mount-li` (located), `mount-qi` (display anchor), `haojing`, `luoyi` (shared with the
  conquest chapter); `shen`, `xi`, `xie` (unknown).
- Actors: `zhou-you-wang`, `bao-si`, `bo-fu`, `zhou-ping-wang`, `shen-hou`, `quanrong`,
  `zeng-state`, `guo-gong-han`, `xie-wang`, `jin-wen-hou`, `jin-state`, `qin-xiang-gong`,
  `zheng-huan-gong`, `zheng-state`, `bo-yang-fu`; shared: `zhou-state`, `lu-state`, and `qin-state`
  from the approved Qin chapter, referenced and not edited.
- Sources: `shiji-yin-zhou`, `shiji-chunqiu` (new), `guben-zhushu-jinian`, `dushi-fangyu-jiyao-zhou`,
  `wikidata`.

`shiji-chunqiu` is a new source record for the 春秋-era chapters of 史記, separate from `shiji`, so
that the Qin approval is not reopened. `jin-state` and `zheng-state` are minted here for the 重耳
and Confucius chapters to reuse.

## What this chapter tests in the engine

- **Rival kings.** 平王 and 攜王 reign at the same time for eleven years; the story has two
  enthronements and no single ruler.
- **An event whose date depends on which account you follow.** `pingwang-enthroned` is either
  before or after `youwang-killed`; playback order and the date pane must not imply one.
- **Alternative places for one death.** `youwang-killed` has 驪山 as its site and 戲 as an
  alternative place with no coordinate.
- **A state reused across eras.** `qin-state` appears in 771 BCE and in 230 BCE; its approved
  summary describes only the later chapter.

## Evidence states the contract lacks

These are proposals for Darwin, not implemented:

1. **Unknown point, known region.** The geography puts 戲 on a river east of 臨潼, so it is not
   "anywhere". v0 refuses `unknown` with any precision but `unspecified`, so the record cannot say
   "within this region". Proposed: allow `unknown` to carry a `within:` reference to a located
   place, which the map could draw as a soft area.
2. **Before or after another event.** The Bamboo Annals' 先是 ("before this") is an ordering claim,
   not a date. A `before:` or `after:` reference to another event would let the engine order
   `pingwang-enthroned` against `youwang-killed` under each account.
3. **A year read through another state's reign.** 晉文侯's years are aligned to the table only
   through the 晉 house; the arithmetic is written by hand in each cite. This is the same proposal
   as the conquest chapter's relative date.

## Exclusions

The 宣王 reign and the 千畝 battle before it; the 鄭 move east and 鄭's conquest of 虢 and 鄶; the 清華簡
繫年 and other excavated texts; 秦文公's campaigns after 760 BCE; the earlier 周 chapters, which are
`shang-yin-wu-ding` and `zhou-conquest-muye`.

## Before review

- Read the 繫年's account of 攜王 and cite it, because it is the only other source for the two
  kings.
- Check that the table's year count matches a critical edition; the transcription's 公元前 column
  is an editor's addition.
- Re-check every 史記 locator against a critical edition.
