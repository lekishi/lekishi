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
- the owner asked to review the corrected content before deciding, so the fixture
  is now rendered by the comparison review route `/compare/qin`, which states
  that it is unapproved preparation: see
  [`rfd/0003/COMPARISON_REVIEW_ROUTE.adoc`](../../../rfd/0003/COMPARISON_REVIEW_ROUTE.adoc);
- the boundary decision that kept it out of the artifact is recorded in
  [`rfd/0003/COMPARISON_FIXTURE_BOUNDARY.adoc`](../../../rfd/0003/COMPARISON_FIXTURE_BOUNDARY.adoc),
  whose artifact rule the review route supersedes.

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

The 226 BCE notice is the episode's documented aftermath and the last event of
Han's end. Including it keeps the window bounded to one thread (Han's end) and
gives the comparison harness five events, one dispute, one annexed-territory
case, and one event whose place the sources name but do not locate. It is the
narrowest scope that is still loadable as a map scenario; a future set can
narrow or extend it only through a new revision and set.

The fixture is **not** a campaign narrative: it records the dated acts the
sources state, asserts no causation, draws no route or territory, and places
every event at a label anchor or display placement only.

## Inventory

| Kind | Count | Notes |
| --- | --- | --- |
| Places | 4 | three with a `display_anchor` label position and one `unknown`; no asserted coordinate anywhere |
| Actors | 6 | 秦 and 韓 (states), 秦王政, 韓王安, 內史騰, 韓非 |
| Events | 5 | the submission/embassy, the death, the cession, the annexation, the revolt |
| Relationships | 4 | conflict, diplomacy (the submission request), changed boundaries (the cession), institutional change (the commandery) |
| Stories | 1 | the episode in presentation order |
| Sources | 4 | two primary works, one Qing historical geography for the place identifications, and Wikidata for the label-anchor coordinates |
| Records | 20 | one set publishes them; corrected and superseded records keep the revisions they replaced, unpublished |

The exact event inventory is pinned by
`src/lib/historical/contract/qin-chapter.test.ts`.

## Sources and rights

| Source | Kind | Cited locators | Rights |
| --- | --- | --- | --- |
| [`史記`](sources/shiji.json) | primary | 卷六 秦始皇本紀 (篇首, 十四年, 十六年, 十七年, 二十一年); 卷十五 六國年表 (秦始皇九年, 十四年, 十六年, 十七年); 卷四十五 韓世家 (韓哀侯二年, 韓桓惠王三十四年, 韓王安五年, 韓王安九年); 卷六十三 老子韓非列傳 | public domain; Wikisource transcription, unproofread; short quotations permitted |
| [`資治通鑑`](sources/zizhi-tongjian.json) | primary | 卷六 秦紀一 (莊襄王三年, 始皇帝十四年, 十六年, 十七年) | public domain; Wikisource transcription, unproofread, with later annotations; main text only |
| [`讀史方輿紀要`](sources/du-shi-fang-yu-jiyao.json) | reference | 卷四十七 河南二 開封府 (禹州, 禹州 陽翟城, 新鄭縣); 卷四十九 河南四 懷慶府 衛輝府 彰德府 (修武縣 南陽城); 卷五十一 河南六 南陽府; 卷五十三 陝西二 西安府 (涇陽縣 雲陽城) | public domain (1692); Wikisource transcription, unproofread; citation of its identifications, short quotations |
| [`Wikidata`](sources/wikidata.json) | dataset | Q1024662, Q10881340, Q1344848 (P625) | CC0 1.0; modern coordinate only, never a historical claim |

Every locator was re-checked against the named Wikisource transcription on
2026-09-25. All three transcriptions are unproofread, so every locator must be
re-checked against a critical edition before content freeze. The fixture cites
the 資治通鑑 main text only: its transcription carries later annotations and
text-critical notes (for example the correction of 勝 to 騰 in the 230 BCE
entry), and those are not used as evidence. The 讀史方輿紀要 transcription marks
each gazetteer entry's notes with an `{{annotate}}` template that renders inline;
the quoted fragments are the entry text as it renders, and one distance
expression it carries (卷五十三 涇陽縣 雲陽城) is damaged, so no distance is
quoted or used.

## Geometry: label anchors for what the sources identify, none for what they do not

The fixture shows an event only where a cited source supports a place, and every
position it shows is a **label anchor**: a map label position that asserts no
historical coordinate. Each anchor names the modern place it sits at, the dataset
its coordinate comes from, and the source that identifies the place the anchor
stands for, because a modern namesake is not evidence on its own.

- `新鄭` is anchored at the modern city of the same name (Wikidata Q1024662),
  which the cited historical geography also records as 新鄭 (卷四十七 開封府
  新鄭縣). The anchor is a map label position, not an identification of the
  capital's site or of the revolt's site.
- `雲陽`, the place the annals name for 韓非's death, is anchored at the modern
  `雲陽鎮` in `涇陽縣` (Wikidata Q10881340). The anchor rests on the cited
  historical geography's record of a `雲陽城` as a Qin county in the northwest of
  涇陽縣 (卷五十三 西安府 涇陽縣); it is area-level, asserts no site, and the
  transcription's distance expression is damaged, so no distance is used.
- `潁川郡`, the commandery the 230 BCE annexation created, is anchored at the
  modern `禹州市` (Wikidata Q1344848), the city that carries the name of the
  historical geography's `禹州`, whose `州治` `陽翟` it records as the Qin
  commandery's seat (卷四十七 開封府 禹州, 陽翟城). The anchor is a region-level
  label position: it asserts no site and no extent, and the entries cited here
  state neither seat nor extent.
- `南陽` carries **no position**. The entries name the land but state no extent or
  seat, and the cited historical geography records the name for two different
  regions — the `河內 南陽` (`南陽城` in the north of `修武縣`, 卷四十九 懷慶府
  修武縣) and the Qin `南陽郡` whose seat was `宛` (卷五十一 南陽府) — without
  identifying the land Han ceded in 231 BCE. The record chooses neither region,
  and the cession's summary states in the review surface that the cession has no
  position.
- The 233 BCE submission and embassy carries a display placement at `新鄭`, the
  Han capital the hereditary house records, because the entries name no place for
  either act. It asserts no site, and the Qin court the embassy reached is not
  named by any source in this set, so it is not anchored.
- No route, itinerary, area, or territory is published, and no event carries its
  own point geometry. The annexation is a campaign with **no** campaign site: the
  sources name only the commandery it created, and the anchor is the seat
  identification the historical geography records, not a site of the campaign.
- Every anchor's coordinate is the modern place's Wikidata value, and every
  anchor's identification is the historical geography's statement, recorded as
  that work's statement rather than as the primary entries'.

## Label positions (owner report, 2026-09-25)

The owner reported that locations were missing where the records name them: the
review route showed 雲陽, 南陽, and 潁川郡 as unlocated and the submission event
with no place at all. The preparing editor first added anchors at the modern
places that merely carry the names and withdrew them on review — a coordinate for
a modern namesake is not evidence that the ancient place was there. The positions
now published rest on the identifications the cited historical geography records:

| Revision | Record | What it adds |
| --- | --- | --- |
| `lks:rev:xinzheng-2` | `lks:place:xinzheng` | The anchor also cites the historical geography's record of 新鄭, so no anchor rests on the modern name alone. |
| `lks:rev:yunyang-2` | `lks:place:yunyang` | A label anchor at 雲陽鎮 resting on 雲陽城 as a Qin county in the northwest of 涇陽縣. |
| `lks:rev:yingchuan-2` | `lks:place:yingchuan` | A region-level label anchor at 禹州市 resting on 陽翟 as the Qin commandery's seat. |
| `lks:rev:nanyang-3` | `lks:place:nanyang` | Keeps `unknown` geometry and records the two regions the name covers, so the record says why it chooses neither. |
| `lks:rev:han-nanyang-cession-231-3` | `lks:event:han-nanyang-cession-231` | The summary and notes state in the review surface why the cession has no position. |
| `lks:rev:han-conquest-230-3` | `lks:event:han-conquest-230` | The summary and notes state that the entries name no campaign site and that the commandery's anchor is the seat the historical geography records. |
| `lks:rev:qin-conquest-han-story-3` | `lks:story:qin-conquest-han-233-226` | The coverage note names the label positions and why 南陽 has none. |

A second review round corrected three of those revisions as new revisions rather
than editing them:

| Revision | Record | What it corrects |
| --- | --- | --- |
| `lks:rev:nanyang-4` | `lks:place:nanyang` | The 南陽郡 quotation is from the 南陽府 entry, so the citation no longer names its 宛城 sub-entry. |
| `lks:rev:han-nanyang-cession-231-4` | `lks:event:han-nanyang-cession-231` | Only Qin's receipt of the land is dated to the ninth month; Han's presentation is dated to 231 BCE. |
| `lks:rev:han-conquest-230-4` | `lks:event:han-conquest-230` | The anchor sits at the modern city that carries the seat name the historical geography records, not at an established historical seat coordinate. |

They are additions in the same preparation set: no reviewed wording was approved
or rejected, no approval is recorded, and the superseded revisions stay in their
records. A source that identifies the ceded land would replace 南陽's `unknown`
geometry with a position; that is an owner/editorial sourcing decision.

## Time, uncertainty, and disputes

- Dates are published at the precision the sources give: the year for 233, 230,
  and 226 BCE and the ninth month for 231 BCE. **No day is published**, and no
  duration is invented: the year-only records are `occurrence_window`s, and the
  spans the fixture records are the two reigns, which the sources attest at both
  ends. The corrected revisions drop the two spans the review found unsupported (the
  conflict's 233–230 BCE `duration` and the officer's 231–230 BCE office
  `duration`), and the atlas must never present the year-only records as
  continuous activity.
- The regnal and absolute years are kept as the sources give them. The
  hereditary house dates the embassy and the attack to 王安五年; the six-states
  table records the embassy and the killing under 韓王安六年, aligned with
  秦始皇帝十四年 (233 BCE); the annals and the comprehensive mirror date the
  embassy to 始皇帝十四年 (233 BCE). The fixture records each expression and does
  not convert between them. `韓王安`'s reign span uses the six-states table's
  alignment (韓王安元年 = 238 BCE to 韓王安九年 = 230 BCE), with the other
  expressions recorded beside it.
- The hereditary house's transcription reads `潁州郡` where the annals and the
  comprehensive mirror read `潁川`/`潁川郡`. The record publishes `潁川郡` and
  keeps the variant in its claims and notes; a critical edition is what would
  settle the reading.
- 韓非's death is the fixture's one dispute. The annals and the comprehensive
  mirror date it to 始皇帝十四年 (233 BCE), and only the annals name 雲陽 as the
  place of the death; the hereditary house places the detention and killing
  under 王安五年; the six-states table records them under 韓王安六年; the
  biography gives no year. The accounts differ on who acted and how
  (the annals give 李斯's plan and a death at 雲陽, the hereditary house says Qin
  killed him, the biography adds 姚賈, the poison 李斯 sent, and the king's
  regret). All three are published as cited claims, the annals' account is the
  main one, and no day, manner, or cause is decided.
  - **Flagged, corrected, and now published for review.** The preparation
    snapshot's dispute summary said the three accounts agree on the year; the
    sources do not (see above), and the internal review flagged it. The corrected
    revision `lks:rev:hanfei-death-233-2` states each account's own dating and
    place and is what the set publishes and the review route renders; the
    superseded revision stays in the record as unpublished history.

## Corrections the internal review prepared, now published for review

The internal review of this milestone found the following source-fidelity and
wording issues in the fixture's first preparation. The preparing editor may not
approve content, so the corrections were first prepared as draft revisions; the
owner then asked to review the corrected content before deciding ("wire it up
first, and let me review again before approval"), and the fixture's single
preparation set now publishes the corrected revisions. Each corrected record
keeps the revision it replaced as unpublished history, and the ledger row still
records a `preparation snapshot` with no owner decision: the review route states
that the content is unapproved.

| Superseded revision | Published revision | What the correction changes |
| --- | --- | --- |
| `lks:rev:hanfei-death-233-1` | `lks:rev:hanfei-death-233-2` | The dispute summary no longer claims the accounts agree on the year and no longer equates the hereditary house's 王安五年 with the table's 韓王安六年; each account's own dating is stated, 雲陽 is attributed to the annals alone, and the six-states table is cited for the year. |
| `lks:rev:han-fei-1` | `lks:rev:han-fei-2` | The summary attributes the 233 BCE embassy dating to the annals and the comprehensive mirror and keeps the hereditary house's notice under 王安五年. |
| `lks:rev:han-submission-233-1` | `lks:rev:han-submission-233-2` | The notes state the six-states table's own alignment (秦始皇帝十四年 with 韓王安六年) instead of equating the hereditary house's 王安五年 with the table's sixth year. |
| `lks:rev:qin-han-conflict-1` | `lks:rev:qin-han-conflict-2` | The relationship no longer carries a continuous 233–230 BCE `duration`, and the 233 BCE dating is attributed to the annals and the six-states table rather than to the hereditary house, which gives 王安五年. |
| `lks:rev:han-conquest-230-1` | `lks:rev:han-conquest-230-2` | The mirror citation no longer attributes the officer's name to a text-critical corrected reading; the name stays with the annals. |
| `lks:rev:han-nanyang-cession-231-1` | `lks:rev:han-nanyang-cession-231-2` | The mirror's quoted fragments drop the transcription's editorial addition 秋. |
| `lks:rev:nanyang-1` | `lks:rev:nanyang-2` | The summary attributes the cession to the annals and the comprehensive mirror, not to the hereditary house; the quoted fragments drop 秋. |
| `lks:rev:han-nanyang-cession-1` | `lks:rev:han-nanyang-cession-2` | The mirror's quoted fragments drop 秋. |
| `lks:rev:nei-shi-teng-1` | `lks:rev:nei-shi-teng-2` | The name is cited to the annals alone, the mirror's corrected reading is stated in the notes rather than used as evidence, and the officer's office no longer carries a 231–230 BCE `duration` between two dated notices. |
| `lks:rev:qin-king-zheng-1` | `lks:rev:qin-king-zheng-2` | The mirror quotation is an unchanged fragment; the earlier text changed the source's comma to a full stop. |
| `lks:rev:han-king-an-1` | `lks:rev:han-king-an-2` | The role span is described as the six-states table's first numbered regnal year (元年, 238 BCE), not as an accession year, and the embassy year's regnal counts are recorded as differing expressions. |
| `lks:rev:qin-conquest-han-story-1` | `lks:rev:qin-conquest-han-story-2` | The coverage note names the annals' 230 BCE notice as a famine (民大饑), not a drought. |

`src/lib/historical/contract/qin-chapter.test.ts` pins each corrected revision's
id and reviewed sealed hash, the superseded revisions' unpublished status, the
absence of the flagged wording from the published content, and the absence of any
approval. The ledger row for `lks:set:qin-conquest-han-233-226-v1` records the
digest of the corrected preparation the review route renders.

## Exclusions

The story's coverage note states these, and the fixture's tests pin the window
and the event inventory:

- the other notices of the cited years: the 233 BCE Zhao campaign, the annals'
  230 BCE earthquake, 華陽太后, and famine notices, and the 226 BCE notice of
  昌平君 being moved to 郢;
- the 246 BCE 鄭國 canal, the 227–226 BCE Yan campaign and 荊軻's attempt,
  earlier Qin–Han wars, and every later Qin conquest;
- routes, campaign paths, territory, and asserted coordinates: the fixture
  publishes label anchors only.

## Review status

The single set, `lks:set:qin-conquest-han-233-226-v1`, publishes every record
and pins the four cited sources; the corrected records and the label-position
additions keep the revisions they replaced as unpublished history. It records the **preparing editor's
self-review** (`self_review`, reviewer = an author of the member revisions). This
is not owner review, not independent review, and not specialist review; no owner
decision exists, and the fixture must not be described as approved or published
for release.

The review route `/compare/qin` renders this set so the owner can inspect the
corrected content. It labels the content **Unapproved preparation**, shows the
fixture's 233–226 BCE window in BCE years, and shows 韓非's published dispute
with its conflicting accounts. The root page carries a **Comparison chapter**
card that links the route and repeats that label (`Unapproved preparation ·
self-review only`), states what the chapter is (a bounded second chapter prepared
as the second scenario for the shared comparison of map treatments, still to be
built), so the review surface is discoverable without reading as approved or
shipped; the card is subordinate to the reviewed Tang atlas call to action. The
fixture's status is "source-checked, corrected, published for review, awaiting
the owner's decision".

## What is deferred, and the remaining decisions

- **Owner review of the fixture's scope.** The owner may extend, narrow, or drop
  the episode; any change needs a new revision and a new set, and a new ledger
  row for that set.
- **The owner's decision on the corrected content.** The corrected revisions are
  published in the preparation set and rendered by the review route, and no
  approval is recorded. Approving them (or asking for changes) is the owner's
  decision; an approval would be a new ledger decision against the digest current
  then.
- **Optional specialist review.** Warring States chronology and the 韓非
  accounts are the areas a specialist would check; none has been performed.
- **The comparison harness.** The review route is its first piece: it loads this
  chapter through `src/lib/atlas/chapter-catalog.ts` with the window below and
  renders it with the atlas's BCE year labels. The measured treatment comparison
  and the shared baseline it needs are still to be built, and the review route is
  not a launch chapter.
- **A supported preparation-seal command.** `pnpm seal` deliberately refuses
  chapter directories, so this fixture was sealed with the contract's own
  canonical hashing during preparation. A documented way to seal a *new*
  preparation chapter, without weakening the immutability rule for approved
  content, is still open.
- **A source for the ceded land.** The Qing historical geography now pinned to
  the set records the name 南陽 for two different regions and identifies the Qin
  commandery's seat, so the commandery and the death place have anchors. It does
  not identify which land the 231 BCE cession was, so 南陽 keeps unknown geometry;
  a source that identifies the ceded land is what would place it. CHGIS and CBDB
  remain deferred (restrictive or non-commercial terms), and the identifications
  now used are a Qing compilation's, not a modern critical gazetteer's.
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
converted to the astronomical ordinals the atlas domain uses), and
`src/lib/atlas/comparison.ts` holds it together with the route's review wording;
the fixture's tests cross-check it against the published story window rather than
restating it. `pnpm build` runs the fixture's contract and catalog tests through
`scripts/check-chapter.mjs`. The review route ships the fixture on purpose, so
`scripts/check-static-build.mjs` requires `/compare/qin` to exist, to carry the
fixture and to state that it is unapproved preparation, and requires the
production atlas page not to render the fixture.

To review the fixture in a browser, open `/compare/qin` on the running dev server
or the static build: the route states the content's status, the event list and
the details panel show BCE years, and the disputed death event carries a
`disputed account` badge whose details show the published summary and the
conflicting accounts with their locators.

Do not run `pnpm seal` over this directory, and do not edit a published revision
or source: corrections require a new revision or source document and a new
publication set, which is the same rule the Tang chapter follows.

## Limitations that must be stated wherever this content appears

- It is a bounded curated selection, not a complete record of Qin's conquests or
  of Han's end, and not a claim that nothing else happened in these years.
- Its map positions are label anchors and display placements, not historical
  coordinates: each anchor rests on a cited identification and sits at the modern
  place that carries the name, and no site, extent, or seat is asserted for any
  place. 南陽 has no position at all, because the sources state no extent or seat
  and the name covers two regions.
- It is a preparation snapshot: not owner-approved, not release content, and not
  a second launch chapter. The corrected revisions are published for the owner's
  review, and the owner's decision on them is still open, so the wording must not
  be treated as final.
- The locators rest on unproofread transcriptions and must be re-checked against
  critical editions before content freeze; the identifications the anchors rest on
  are a 1692 compilation's, and a modern critical gazetteer would supersede them.
- The shared atlas opens at one home height for every chapter. The fixture's
  places are close together (雲陽 to 禹州 is about 450 km), so at that height
  their map labels overlap; the event list and the details surface carry the
  names and placements, and the camera can be zoomed. A chapter-relative home
  height would be a shared-surface change and is not part of this fixture.
