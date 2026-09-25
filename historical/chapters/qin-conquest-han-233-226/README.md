# Qin comparison fixture: the end of the state of Han, 233–226 BCE

This directory holds the bounded Qin comparison fixture authorized on
2026-09-25: the smallest source-checked, contract-valid Qin-conquest episode
needed for the shared treatment comparison. It is **comparison-only**:

- it is not a launch chapter and is not rendered by the production atlas;
- its publication set is recorded in
  [`rfd/0002/PUBLICATION_APPROVAL.adoc`](../../../rfd/0002/PUBLICATION_APPROVAL.adoc)
  as a `preparation snapshot` with the preparing editor's self-review — the owner
  instructed the fixture, no release decision has been taken, and RFD 4's AC2
  does not apply to it;
- the boundary that makes it loadable without shipping it in the release
  artifact is recorded in
  [`rfd/0003/COMPARISON_FIXTURE_BOUNDARY.adoc`](../../../rfd/0003/COMPARISON_FIXTURE_BOUNDARY.adoc).

## Scope, and why this scope

The accepted RFD records bound Qin only loosely: RFD 1 lists "Qin's conquests of
the rival Warring States: campaigns, battles, chronology, and political change"
and asks for "a bounded episode from Qin's conquest" whose specific episode "remains
to be selected and source-checked"; RFD 4 makes Qin a bounded comparison fixture
rather than a launch chapter. No RFD names an episode, so this fixture takes the
narrowest source-supported default that still yields a usable comparison:

**Episode window 233–226 BCE** — the end of the state of Han under Qin:

1. **233 BCE** — the Han king's submission (land and royal seal offered, vassal
   status requested) and 韓非's embassy to Qin;
2. **233 BCE** — 韓非's detention and death at 雲陽, published as an explicit
   dispute;
3. **231 BCE** — the cession of 南陽, which Qin receives in the ninth month;
4. **230 BCE** — 內史騰 takes Han, captures 韓王安, and the annexed land becomes
   the 潁川 commandery;
5. **226 BCE** — 新鄭, the former capital, revolts.

The 226 BCE notice is the episode's documented aftermath and the **only event
this fixture places** (the death names 雲陽 and the cession names 南陽, but no
source in this set identifies either, so both stay unlocated). Excluding the
revolt would leave the fixture with no sourced map point at all, because the
annexation's own entries name only the commandery the annexation created.
Including it as the last event keeps the window bounded to one thread (Han's end)
and gives the comparison harness one placed event, four list-only events, one
dispute, and one unlocated-territory case. It is the narrowest scope that is
still loadable as a map scenario; a future set can narrow or extend it only
through a new revision and set.

The fixture is **not** a campaign narrative: it records the dated acts the
sources state, asserts no causation, draws no route or territory, and places
nothing beyond one label anchor.

## Inventory

| Kind | Count | Notes |
| --- | --- | --- |
| Places | 4 | `新鄭` (label anchor only), `雲陽`, `南陽`, `潁川郡` (all three `unknown` geometry) |
| Actors | 6 | 秦 and 韓 (states), 秦王政, 韓王安, 內史騰, 韓非 |
| Events | 5 | the submission/embassy, the death, the cession, the annexation, the revolt |
| Relationships | 4 | conflict, diplomacy (the submission request), changed boundaries (the cession), institutional change (the commandery) |
| Stories | 1 | the episode in presentation order |
| Sources | 3 | two primary works and Wikidata for the one anchor coordinate |
| Records | 20 | one sealed revision each, published by one set |

The exact event inventory is pinned by
`src/lib/historical/contract/qin-chapter.test.ts`.

## Sources and rights

| Source | Kind | Cited locators | Rights |
| --- | --- | --- | --- |
| [`史記`](sources/shiji.json) | primary | 卷六 秦始皇本紀 (篇首, 十四年, 十六年, 十七年, 二十一年); 卷十五 六國年表 (秦始皇九年, 十四年, 十六年, 十七年); 卷四十五 韓世家 (韓哀侯二年, 韓桓惠王三十四年, 韓王安五年, 韓王安九年); 卷六十三 老子韓非列傳 | public domain; Wikisource transcription, unproofread; short quotations permitted |
| [`資治通鑑`](sources/zizhi-tongjian.json) | primary | 卷六 秦紀一 (莊襄王三年, 始皇帝十四年, 十六年, 十七年) | public domain; Wikisource transcription, unproofread, with later annotations; main text only |
| [`Wikidata`](sources/wikidata.json) | dataset | Q1024662 (P625) | CC0 1.0; modern coordinate only, never a historical claim |

Every locator was re-checked against the named Wikisource transcription on
2026-09-25. Both transcriptions are unproofread, so every locator must be
re-checked against a critical edition before content freeze. The fixture cites
the 資治通鑑 main text only: its transcription carries later annotations and
text-critical notes (for example the correction of 勝 to 騰 in the 230 BCE
entry), and those are not used as evidence.

## Geometry: one label anchor, everything else unlocated

- `新鄭` carries the fixture's only placement: a `display_anchor` at the modern
  city of the same name (Wikidata Q1024662), labelled as a label anchor that
  asserts no historical coordinate. The anchor is a map label position, not an
  identification of the capital's site or of the revolt's site.
- `雲陽`, `南陽`, and `潁川郡` carry `unknown` geometry with an explanation: the
  cited entries name them but state no site, extent, or seat. In particular the
  fixture does **not** place the Han-era 南陽 at the modern city of the same
  name — the sources do not identify the two — and it does not place 雲陽 at the
  modern town of the same name.
- No route, itinerary, area, or territory is published, and no event carries its
  own point geometry. The annexation is a campaign with **no** campaign site:
  the sources name only the commandery it created.
- The one placed event is the 226 BCE revolt; the other four are list-only and
  the atlas must state why for each.

## Time, uncertainty, and disputes

- Dates are published at the precision the sources give: the year for 233, 230,
  and 226 BCE and the ninth month for 231 BCE. **No day is published**, and no
  duration is invented; the year-only events are `occurrence_window`s, so the
  atlas must never present them as continuous activity.
- The regnal and absolute years are kept as the sources give them. The
  hereditary house dates the embassy to 王安五年, while the six-states table
  aligns 秦始皇十四年 (233 BCE) with 王安六年; the fixture records both
  expressions and does not convert between them. `韓王安`'s reign span uses the
  six-states table's alignment (韓王安元年 = 238 BCE to 韓王安九年 = 230 BCE),
  with the other expressions recorded beside it.
- The hereditary house's transcription reads `潁州郡` where the annals and the
  comprehensive mirror read `潁川`/`潁川郡`. The record publishes `潁川郡` and
  keeps the variant in its claims and notes; a critical edition is what would
  settle the reading.
- 韓非's death is the fixture's one dispute. The annals and the comprehensive
  mirror date it to 始皇帝十四年 (233 BCE); the hereditary house records the
  detention and killing under 王安五年, which the six-states table aligns with
  王安六年; the biography gives no year. The accounts differ on who acted and how
  (the annals give 李斯's plan and a death at 雲陽, the hereditary house says Qin
  killed him, the biography adds 姚賈, the poison 李斯 sent, and the king's
  regret). All three are published as cited claims, the annals' account is the
  main one, and no day, manner, or cause is decided.
  - **Flagged and drafted.** The published snapshot's dispute summary says the
    three accounts agree on the year; the sources do not (see above), and the
    review flagged it. The draft revision
    `lks:rev:hanfei-death-233-2` states each account's dating and is listed under
    <<Prepared corrections awaiting a publication decision>>.

## Prepared corrections awaiting a publication decision

The internal review of this milestone found the following source-fidelity and
wording issues in the **published snapshot**. The publication gate does not let
the preparing editor supersede a prepared set, so each correction is prepared as
an unpublished draft revision that no set names: the atlas, the ledger digest,
and the projection still read the snapshot the owner has seen. Publishing a
corrected preparation set is the owner's decision.

| Published revision | Draft correction | What the draft changes |
| --- | --- | --- |
| `lks:rev:hanfei-death-233-1` | `lks:rev:hanfei-death-233-2` | The dispute summary no longer claims the accounts agree on the year; each account's dating (233 BCE, 王安五年/王安六年, none) is stated, and the six-states table is cited for the year. |
| `lks:rev:qin-han-conflict-1` | `lks:rev:qin-han-conflict-2` | The relationship no longer carries a continuous 233–230 BCE `duration`; the three separately dated acts stay in the cited summary. |
| `lks:rev:han-conquest-230-1` | `lks:rev:han-conquest-230-2` | The mirror citation no longer attributes the officer's name to a text-critical corrected reading; the name stays with the annals. |
| `lks:rev:han-nanyang-cession-231-1` | `lks:rev:han-nanyang-cession-231-2` | The mirror's quoted fragments drop the transcription's editorial addition 秋. |
| `lks:rev:nanyang-1` | `lks:rev:nanyang-2` | The summary attributes the cession to the annals and the comprehensive mirror, not to the hereditary house; the quoted fragments drop 秋. |
| `lks:rev:han-nanyang-cession-1` | `lks:rev:han-nanyang-cession-2` | The mirror's quoted fragments drop 秋. |
| `lks:rev:nei-shi-teng-1` | `lks:rev:nei-shi-teng-2` | The name is cited to the annals alone, and the mirror's corrected reading is stated in the notes rather than used as evidence. |
| `lks:rev:qin-king-zheng-1` | `lks:rev:qin-king-zheng-2` | The mirror quotation is an unchanged fragment; the earlier text changed the source's comma to a full stop. |
| `lks:rev:han-king-an-1` | `lks:rev:han-king-an-2` | The role span is described as the six-states table's first numbered regnal year (元年, 238 BCE), not as an accession year. |
| `lks:rev:qin-conquest-han-story-1` | `lks:rev:qin-conquest-han-story-2` | The coverage note names the annals' 230 BCE notice as a famine (民大饑), not a drought. |

`src/lib/historical/contract/qin-chapter.test.ts` pins each draft, its sealed
hash, its unpublished status, and the published snapshot's flagged wording, so
neither the drafts nor the boundary can drift silently. The ledger row for
`lks:set:qin-conquest-han-233-226-v1` still records the published digest.

## Exclusions

The story's coverage note states these, and the fixture's tests pin the window
and the event inventory:

- the other notices of the cited years: the 233 BCE Zhao campaign, the annals'
  230 BCE earthquake, 華陽太后, and famine notices, and the 226 BCE notice of
  昌平君 being moved to 郢;
- the 246 BCE 鄭國 canal, the 227–226 BCE Yan campaign and 荊軻's attempt,
  earlier Qin–Han wars, and every later Qin conquest;
- routes, campaign paths, territory, and asserted coordinates beyond the one
  label anchor.

## Review status

The single set, `lks:set:qin-conquest-han-233-226-v1`, publishes every record
with exactly one revision each and pins the three cited sources. It records the
**preparing editor's self-review** (`self_review`, reviewer = an author of the
member revisions). This is not owner review, not independent review, and not
specialist review; no owner release decision exists, and the fixture must not be
described as approved or published for release.

The published snapshot is what the ledger row records. Ten correction drafts
prepared after the internal review are **unpublished**: they are listed above,
pinned by the fixture's tests, and await the owner's decision to publish a
corrected preparation set. Until then, the flagged published wording stays as
the ledger records it, and the fixture's status is "source-checked, corrections
drafted, awaiting a publication decision".

## What is deferred, and the remaining decisions

- **Owner review of the fixture's scope.** The owner may extend, narrow, or drop
  the episode; any change needs a new revision and a new set, and a new ledger
  row for that set.
- **The prepared corrections.** Ten draft revisions are prepared and unpublished
  (listed above). Publishing a corrected preparation set needs the owner's
  decision; the preparing editor may not supersede the prepared set.
- **Optional specialist review.** Warring States chronology and the 韓非
  accounts are the areas a specialist would check; none has been performed.
- **The comparison harness.** It does not exist yet. When it is built it must
  load this chapter through `src/lib/atlas/chapter-catalog.ts` with the window
  below, and it must add BCE year formatting before rendering: the atlas's
  current display labels print the astronomical year number, which is correct
  for the Tang chapter's CE dates but wrong for a BCE chapter.
- **A supported preparation-seal command.** `pnpm seal` deliberately refuses
  chapter directories, so this fixture was sealed with the contract's own
  canonical hashing during preparation. A documented way to seal a *new*
  preparation chapter, without weakening the immutability rule for approved
  content, is still open.
- **Gazetteer sources.** CHGIS and CBDB remain deferred (restrictive or
  non-commercial terms); a source that identifies the Qin 雲陽, the Han-era
  南陽, or the 潁川 commandery's seat is what would place them.
- **No media.** No image or media asset is included.

## Load and validate

```bash
pnpm test        # includes src/lib/historical/contract/qin-chapter.test.ts
```

The Node-side loader is `src/lib/historical/chapter.ts`; the fixture validates
with the contract's own `Publication.checkAll` and the publication approval
gate. The browser-safe path is `src/lib/atlas/chapter-catalog.ts`:

```ts
const chapter = await loadChapterContent("qin-conquest-han-233-226", {
  defaultWindow: { start: -232, end: -225 }, // 233–226 BCE, astronomical ordinals
})
```

The window is the fixture's coverage model (the years the story window names,
converted to the astronomical ordinals the atlas domain uses). `pnpm build`
runs the fixture's contract and catalog tests through
`scripts/check-chapter.mjs`, and `scripts/check-static-build.mjs` fails if the
fixture's ids reach the release artifact: the comparison harness shipping is a
deliberate later change.

Do not run `pnpm seal` over this directory, and do not edit a published revision
or source: corrections require a new revision or source document and a new
publication set, which is the same rule the Tang chapter follows.

## Limitations that must be stated wherever this content appears

- It is a bounded curated selection, not a complete record of Qin's conquests or
  of Han's end, and not a claim that nothing else happened in these years.
- It is a preparation snapshot: not owner-approved, not release content, and not
  a second launch chapter. Ten correction drafts await the owner's publication
  decision, so the published wording must not be treated as final.
- The locators rest on unproofread transcriptions and must be re-checked against
  critical editions before content freeze.
