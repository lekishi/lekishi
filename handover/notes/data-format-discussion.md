# Data format for chapters, events and related records

Discussion opener, 2026-10-14. Checked against `main` at dd572bd. Nothing here is decided until Darwin says so; the default output once it converges is a dated decision record in RFD 2 as a draft PR.

## Where things stand

### What the repo stores today

- **Contract v0** (`historical/v0/`, rationale in `rfd/0002/CONTRACTS.adoc`): JSON Schemas, 187 test vectors, five record kinds (place, actor, event, relationship, story) plus source documents and publication sets.
- **Two chapters** in `historical/chapters/<id>/{records,sources,publication-sets}/`: Tang has 29 events, 15 places, 12 actors, 9 relationships and 1 story; Qin has 5, 4, 6, 4 and 1.
- **Every record is a full v0 document**: a revisions array with author, change explanation and `revision_hash`, then the content, then claims that point into the content by JSON pointer (`"asserts": "/time"`), then a publication block naming a set. The 86 records come to 12,658 lines of JSON, about 147 lines per record. `event-akimeya-landfall-753.json` says one fact ("the second ship lands at 秋妻屋浦 on 753-12-20, per the 東征伝") in 103 lines.
- **Sources are per chapter**: both chapters carry their own `wikidata.json`.

### What the atlas derives at build time

`src/lib/atlas/chapter-catalog.ts` bundles the JSON with `import.meta.glob`, and `projection.ts` turns it into the domain types in `domain.ts` (`Chapter`, `HistoricalEvent`, `Place`, `StoryStep`, and so on).

Several chapter-level facts have no home in the data, so they are computed or hard-coded:

- **Chapter title**: the first clause of the story record's summary (`projection.ts:215`).
- **Event title**: the story step's caption. Events themselves have no title field.
- **Default window**: hard-coded in TypeScript (`chapter-registry.ts`, `TANG_COVERAGE` and `QIN_COVERAGE`).
- **Home view**: the centre of the places' bounding box.
- **The served list**: also in TypeScript.

### Already decided (RFD 2, 2026-10-10)

The owner approved "a folder per chapter with one small file per record (`events/akimeya-landfall-753.yaml`, about ten lines)", compiled to the v0 contract at build time, with these parts of the plan:

- Git history replaces revision envelopes.
- One owner approval per chapter replaces the publication-set ledger.
- Claims stay cited, and attested stays distinct from interpretation.
- Disputes are sibling claims, and `contributed_by`/`reviewed_by` sit on each claim.

The compiler and the migration are the open items in `rfd/0002/IMPLEMENTATION.adoc`. **What the decision left open is the concrete shape of those files**, and that is what this thread is for.

### What RFDs 1 and 5 now ask of the data that v0 cannot say

| Need (source) | v0 today |
|---|---|
| Journeys as dashed lines through dated stops (RFD 1) | No journey shape. The pieces exist: `part_of`, place roles `start`/`waypoint`/`end`, and the geometry interpretation `schematic_link`. Nothing yet ties them into a line. |
| Dated political-control polygons (RFD 1, territory layer) | No kind. A place can carry a polygon, but a place has no dated validity per geometry. |
| Images on cards and chapter heroes (RFD 1, RFD 2 "media is content") | Only `source.kind: media`. Nothing says which record an image depicts, or that a later depiction is not evidence. |
| Relationship arcs styled by type (RFD 5 legend) | Covered by `relationship_types` (transmission, diplomacy, conflict, trade, institutional_change, and others). |
| Deep links `?event=akimeya-landfall-753` (RFD 5) | Works today by stripping `lks:event:` from the record id. |
| Search across chapters, grouped by chapter (RFD 5) | Works per chapter. A place shared by two chapters would be two records. |

## Design questions, each with a recommendation

### 1. Shared entities: chapter-local or a shared catalog? *(needs Darwin's call)*

長安, 唐, the 史記 and Wikidata will recur across chapters. Today each chapter would re-declare them.

**Recommendation: a shared catalog for places, actors and sources, and chapter folders for events, relationships, the story, and the new kinds.**

```
historical/
  v0/                         contract: schemas, vectors (unchanged)
  catalog/
    places/yangzhou.yaml      lks:place:yangzhou
    actors/tang-dynasty.yaml
    sources/toseiden.yaml
  chapters/tang-mission-750-754/
    chapter.yaml              manifest (question 2)
    events/akimeya-landfall-753.yaml
    relationships/kiyokawa-jianzhen-contact.yaml
```

The cost is that editing a shared place touches every chapter that cites it. The approval check below handles that: a chapter's approval covers everything it reaches, so the edit shows up as "needs re-approval" on each affected chapter instead of slipping through.

### 1b. Layout: world first, chapters as views *(added 2026-10-14, supersedes 1 if chosen)*

Darwin asked whether to redo the layout for a better long-term result. Recommendation: go one step further than question 1 and put **every** record kind in the shared tree, with chapters reduced to manifests.

```
historical/
  contract/v0/                schemas and vectors (moved from historical/v0)
  events/                     every event once; subfolders allowed, ignored by ids
    tang-embassy/akimeya-landfall-753.yaml
  places/  actors/  relationships/  sources/
  territories/  media/        with contract v1 (question 5)
  chapters/
    tang-mission-750-754.yaml manifest (question 2), points at records
```

Why: RFD 3 records the owner's aim of exploring an era across the globe. That view shows events from several chapters at once, and one event can belong to two stories (鑒眞's voyage is part of the Tang embassy and of any Buddhism-transmission chapter). Cross-chapter search (RFD 5) and the single time ribbon get the same benefit.

Costs: an edit to a shared event re-opens approval for every chapter that reaches it (the closure digest makes this automatic), and top-level folders grow (subfolders absorb it). The migration effort matches the one already planned. This amends RFD 2's approved "folder per chapter", so it needs a dated superseding note.

### 2. A chapter manifest *(needs Darwin's call)*

**Recommendation: one `chapter.yaml` per chapter that owns everything the projection currently infers or hard-codes.** The story record and `chapter-registry.ts`'s coverage constants go away, and the served list is derived from which chapters carry an approval.

```yaml
title: The Tang embassy of 750–754
summary: The 750–754 embassy of 藤原朝臣清河, from appointment through the return voyage and the 754 ordinations.
window: 750..754          # opens here
span: 750..779            # the story, including the coda nodes
coverage: …               # today's coverage_note
home: { center: [125.0, 31.5], scale: region }   # optional, else the bounding box
hero: media/hero-landfall.yaml                  # once media exists (question 5)
story:
  - appointment-750                              # caption defaults to the event's title
  - japan-tang-embassy: The diplomatic mission from Japan to Tang
  - akimeya-landfall-753
approval:
  digest: sha256:…        # of the compiled chapter and everything it references
  by: Darwin
  on: 2026-10-20
```

The approval pins a **content digest, not a commit**. A commit cannot name itself, and squash merges rewrite hashes. The build recomputes the digest, and a mismatch means the chapter is not served until re-approved. This is the "no change to an approved chapter reaching the build without a new approval" check RFD 2 lists.

### 3. The record file itself

**Recommendation: YAML (as approved), file name = id, flat fields, and citations attached to the field they support.** The compiler generates claim ids and JSON pointers. Authors never write `"asserts": "/places/0"`.

Event (the 103-line record above):

```yaml
# chapters/tang-mission-750-754/events/akimeya-landfall-753.yaml
title: The landfall at 秋妻屋浦
summary: The second ship lands at 薩摩國阿多郡秋妻屋浦 at noon on 天寶十二載十二月廿日.
types: [journey]
part_of: return-voyage-753
date:
  value: 753-12-20
  calendar: chinese_lunisolar
  as_written: 廿日乙酉午時
  cite: { source: toseiden, at: 廿日乙酉午時，第二舟著薩摩國阿多郡秋妻屋浦 }
places:
  - place: akimeya
    role: site
    cite: { source: toseiden, at: 廿日乙酉午時，第二舟著薩摩國阿多郡秋妻屋浦 }
notes: The landing place is attested; its modern identification is a cited interpretation on the place.
```

Place:

```yaml
# catalog/places/yangzhou.yaml
name: { form: 揚州, lang: lzh, script: Hani, roman: Yangzhou, scheme: pinyin }
types: [settlement]
at:
  point: [119.4363, 32.3912]
  basis: display_anchor          # or approximate_point / site …, the v0 vocabulary
  precision: unspecified
  cite: { source: wikidata, at: Q57906 (P625) }
modern: [{ form: 揚州市, lang: zh-Hans }]
```

Conventions:

- **Defaults.** `basis` defaults to `attested`, and an interpretation says `basis: interpretation` and cites the scholarship.
- **Locator kind.** A source declares its locator kind once (`entry`, `page`, `juan`), so a citation only gives `at:`.
- **Disputes** are `alternatives:` beside the main value, each with its own `cite`. The main account stays an editorial choice.
- **Credit.** `contributed_by` and `reviewed_by` default at the file level and can be overridden per field. They are new; v0 has no `contributed_by` today.
- **Event titles move onto the event.** A story caption becomes an optional override.
- **Editor support.** A JSON Schema for the YAML files gives editors completion and inline errors, and is the first CI check.

### 4. Date notation *(needs Darwin's call)*

**Recommendation: a small EDTF-like subset, with BCE spelled out.**

- `753-12-20`, `753-12` and `753` set day, month and year precision.
- `750..754` is a range.
- `mode: window` or `mode: duration` covers the cases where a range is not an instant.
- `233 BCE`, `233-10 BCE` and `233 BCE..226 BCE` cover dates before the common era.

Spelling BCE out avoids astronomical years (EDTF's `-0232` means 233 BCE), which is exactly the off-by-one the contract's `era` field exists to prevent. The compiler emits the v0 `interval`/`precision`/`mode` objects unchanged, so the 187 time vectors keep holding.

### 5. Journeys, territories and media

- **Journeys: derive, don't duplicate.** A journey event's line is drawn through the dated places of the events that are `part_of` it. The Tang return voyage already has that shape, so no new data is needed. A route reconstructed in scholarship is an explicit `route:` with its own GeoJSON file and citation, which the compiler emits as `reconstructed_route`.
- **Territories: a new kind** (`territories/tang-754.yaml`: whose control, the date of the snapshot, a GeoJSON file, basis and citation). Snapshots are never interpolated, per RFD 1.
- **Media: a new kind** (`media/…yaml`: file, licence via its source, `depicts:` record ids, and a depiction label such as "later depiction, not evidence").

Territory and media are new rules, so per AGENTS.md they mean **contract v1** with new vectors, not an edit to v0. *Needs Darwin's call:* specify them now in the same record, or (my recommendation) specify them now and implement them with the first chapter that draws a territory or shows an image, so v1 lands with real content to test against.

### 6. What happens to the v0 machinery

- **The compiler** turns each chapter folder into v0 documents with a single synthetic revision and computed hashes, so `Publication.checkAll`, the 187 vectors and `projection.ts` keep running unchanged during the migration.
- **The publication-set ledger** and `publication-approval.test.ts` retire once the per-chapter digest is enforced, as RFD 2 already says. The two existing sets stay in the tree as history.
- **Migration** is mechanical, JSON to YAML by a script, followed by a review diff of the compiled output against today's files. Ideally the diff is identical apart from revision metadata.

## Defaults picked without asking

- **Where it is written down:** a dated sub-record `rfd/0002/AUTHORING_FORMAT.adoc`, linked from RFD 2's existing decision, rather than a new RFD, since RFD 2 owns the data contracts.
- **Format:** plain YAML rather than Markdown with front matter. Revisit if card narratives grow past a paragraph.
- **Ids:** the namespace prefix is implied by the folder (`events/x.yaml` is `lks:event:x`), and ids are unique across all chapters, because RFD 5's search and deep links span chapters.

## Deployed file count (Cloudflare's 20,000-file limit)

Checked 2026-10-14 with a client build of `main`. Today's loader (`chapter-catalog.ts`, lazy `import.meta.glob`) emits **one JS chunk per content JSON file**: 103 of the 121 client scripts are records, sources and sets. Content is therefore linear in record count. At RFD 4's target of 200+ events per chapter, 20 chapters would mean roughly 6,000 or more files from content alone, on top of the globe's tile bundles (944 files for the whole artifact today, nearly all tiles).

The record files themselves never ship. What decides the count is what the compiler emits. **Recommendation: the compiler writes one compiled document per chapter, and the loader imports that**, so content costs one file per chapter however many records it has. That applies whatever the answers to the questions above, and could land with the compiler.
