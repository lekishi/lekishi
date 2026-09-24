# Tang chapter fixture: the 750–754 embassy of Fujiwara no Kiyokawa

This directory holds the first reviewed chapter content for the public PoC: the
Tang mission selected at Gate 1, in the versioned `lekishi-historical-contract/v0`
format. It is content, not contract; the schemas and semantics live in
`historical/v0` and `src/lib/historical/contract`.

## Coverage model

Selected by the owner on 2026-09-24 from
[`rfd/0002/TANG_MISSION_FEASIBILITY.adoc`](../../../rfd/0002/TANG_MISSION_FEASIBILITY.adoc)
(Candidate B) and recorded in
[`rfd/0004/GATE1_DECISION.adoc`](../../../rfd/0004/GATE1_DECISION.adoc):

- **Primary mission window 750–754**: appointment, dispatch, the Tang New Year
  audience, the return voyage, the return reports, the rewards, and the 754
  ordinations.
- **Included coda nodes outside the window at 758, 759, 763, and 779**, each
  separately sourced and labelled as a coda node, not as a mission effect.
- **The outbound voyage of 752 is excluded**: it is undocumented in the sources
  checked, so the chapter has no content, no route, and no map geometry for it.

## Inventory

| Kind | Count | Notes |
| --- | --- | --- |
| Places | 15 | `難波`, `大宰府`, `平城宮`, `揚州`, `蘇州黃泗浦`, `阿兒奈波島`, `多禰島`, `益救島`, `秋妻屋浦`, `石籬浦`, `紀伊國牟漏埼`, `驩州`, `蓬萊宮含元殿`, `東大寺`, `唐招提寺` |
| Actors | 12 | The mission principals, 鑒眞 and 法進, the Tang general 呉懷實, the sovereign 孝謙天皇, and the two state actors 日本國 and 唐 |
| Events | 29 | 24 inside 750–754 and 5 coda events across the four coda years (779 has two) |
| Relationships | 9 | diplomacy, travel, two contacts, transmission, two institutional changes, and two 779 commemorations |
| Stories | 1 | The mission in presentation order, with the coda steps labelled |
| Sources | 9 | Four primary works, four reference or scholarly works, and Wikidata |

## Evidence and uncertainty

- Every published place, actor, event, and relationship carries a cited claim,
  and every claim names a source and a locator (volume and entry, article, or
  dataset row). Quotes are used only from the public-domain primary texts.
- **No coordinates are asserted from the sources.** Modern identifications of
  `阿兒奈波島` (Okinawa Island), `多禰島` (the Tanegashima–Yakushima area),
  `益救島` (Yakushima), and `秋妻屋浦` (坊津) are recorded as
  `cited_interpretation` claims naming the reference work or article that
  proposes them; `石籬浦`, `紀伊國牟漏埼`, and `驩州` carry `unknown` geometry
  with an explanation because no identification is sourced here. The other
  places carry `display_anchor` geometry only, which is explicitly not an
  asserted historical coordinate.
- **Two place identifications are published as proposals.** `紀伊國牟漏埼` is
  placed at the modern town of 太地 (`approximate_point`, locality precision)
  because the cited prefectural record reports that 紀州藩's 紀伊続風土記
  identified 牟漏崎 with 太地の燈明崎; `石籬浦` is placed at the former town of
  頴娃 (locality precision) because the cited prefectural record names 石垣 in
  present-day 南九州市穎娃町 as the drift place. Both are labelled as modern
  identifications (比定), not source statements, and neither asserts a landing
  site. `驩州` keeps `unknown` geometry: the primary sources give its seat
  county but no source in this set identifies the site, so no coordinate is
  manufactured.
- **Court acts are anchored, not placed.** The entries that record the court's
  appointment of the embassy, the 節刀 grant, the audiences and reports, the
  rewards, and the 758 and 779 court acts name no place (the 節刀 entry names
  `内裏`). Each of those ten events points at `平城宮` — the court's seat, whose
  record carries the chronicle's own naming of the palace and the inner precinct
  — as a `display_anchor`, with a `cited_interpretation` claim attributed to the
  editorial preparation. The atlas therefore shows them, labelled "display
  anchor only", and asserts no coordinate for any of them.
- `多禰島` is published only as the second ship's intended destination: the
  biography names it as the course the second ship set out on and then records
  the arrival at `益救島`, so the separation event carries it as a qualified
  contextual place and no landing there is asserted.
- Textual variants are kept rather than normalized away: `益救島`/`益久嶋`,
  `胡麿`/`古麻呂`, and the day expressions the sources use for 古麻呂's return
  and report. Where the source gives only a sexagenary day, or where the chapter
  does not establish that two notices describe one occasion, it publishes month
  precision and keeps the source's own expression. 鑒眞's age at death is
  published as an explicit dispute, because the two sources give different
  figures.
- The 754 ordinations rest on the biography alone; the chronicle's later notice
  of 聖武皇帝 receiving the precepts is recorded as a supporting claim without
  resolving who the biography's `天皇` is. The biography's hagiographic material
  is excluded.
- The two 753 island arrivals (`益救島` in the biography, `益久嶋` in the
  chronicle) are two records with their own citations: the cited passages do not
  state that they describe the same ship, and the chapter does not decide that.

## Review status

Two publication sets are in the tree. `lks:set:tang-mission-750-754-v1`
publishes the first prepared revision of every record; the corrections the first
review cycle produced are appended as new revisions of the affected records and
published by `lks:set:tang-mission-750-754-v2`. The earlier revisions and their
pins stay in the tree, so `Publication.history` shows the content that was
published first and the correction beside it.

Both sets record the **preparing editor's self-review**
(`self_review`, reviewer = an author of the member revisions). This is not owner
review, not independent review, and not specialist review. The owner's editorial
approval under RFD 2 — and therefore RFD 4's AC2 — is **still pending**, and the
specialist reviews the feasibility report identified (maritime history for the
return-voyage landfalls, Buddhist studies for the ordination and lineage claims,
Tang court history for the audience, and a philologist for the editions) have
not been performed.

A third set, `lks:set:tang-mission-750-754-court-anchors`, publishes the court
placements and the two place identifications the owner accepted on 2026-09-24 (see
[`rfd/0002/PUBLICATION_APPROVAL.adoc`](../../../rfd/0002/PUBLICATION_APPROVAL.adoc)).
Its ledger row records an `owner decided` decision — the owner decided that this
content may be published — while the set itself keeps the preparing editor's
`self_review`; it is not the owner's editorial approval under RFD 2.

Neither set is an official publication. In the contract's vocabulary
"published" means *named by a publication set* — the atomic unit the atlas
reads — not *approved for release*. The owner's decisions are recorded in
[`rfd/0002/PUBLICATION_APPROVAL.adoc`](../../../rfd/0002/PUBLICATION_APPROVAL.adoc):
a set may exist only when that ledger names it. The two preparation sets are
recorded there as **preparation snapshots** created under the owner's
instruction, and the placement set as an **owner decided** publication. The
first `owner approved` row will be the owner's editorial approval of this
chapter.

## What is deferred, and why

- **Purchases, library-only scholarship, and specialist outreach**: deferred at
  Gate 1; no account, purchase, or contact was made.
- **CHGIS and CBDB**: deferred (restrictive or non-commercial terms); no Chinese
  gazetteer or biographical data is used, which is why `驩州` and the Chinese
  places carry no asserted coordinates.
- **Images and media**: none are included. The public-domain 東征伝絵巻 scroll
  and the 鑒眞 statue photograph remain candidates, but every media file needs
  per-file clearance and a "later illustrated copy, not evidence" label first.
- **Deferred actors**: 思託, 榮叡, 普照, 川部酒麻呂, 王維, 藤原仲麻呂, 良弁,
  and 安宿王 appear in the feasibility report's candidate list but are not
  published here; each would need its own sourced role statement and date range,
  and 王維's poem was not verified in the Wave 1A pass.
- **The 752 outbound voyage**: no content at all, by the coverage model.

## Load and validate

The chapter is loaded through the content boundary in
`src/lib/historical/chapter.ts` and validated with the contract's own
`Publication.checkAll`:

```bash
pnpm test        # includes src/lib/historical/contract/tang-chapter.test.ts
```

Do not run `pnpm seal` over this directory. That command is deliberately limited
to the synthetic worked examples. Correcting chapter content requires a new
revision or source document and a new publication set, preserving the hashes and
review metadata that approved the existing publication. An in-place edit to an
approved revision or source must fail validation rather than being resealed; the
correction set above is the worked example of that path.

## Limitations that must be stated wherever this content appears

- Locators were re-checked against the named digital transcriptions on
  2026-09-24. Those transcriptions are unproofread and use `■` for damaged
  characters, so every locator must be re-checked against a critical edition
  before content freeze.
- The chapter is a bounded curated selection, not a complete record of the
  mission, and not a claim that nothing else happened in these years.
