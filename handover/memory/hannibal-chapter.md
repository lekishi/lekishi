---
name: hannibal-chapter
description: Draft Hannibal 218–216 BCE chapter (PR #40): shared ids, Roman-date convention, Pleiades/Perseus citation formats, engine findings
metadata:
  type: project
  modified: 2026-10-22T23:40:16.566Z
---

Draft chapter `hannibal-italy-218-216` was authored 2026-10-21 in thread "Hannibal's march into Italy" (PR #40, merged 2026-10-22). It has no approval; only Darwin writes approvals. Hannibal journey records are not written yet: the journey shape in #26 is still a proposal, and the YAML waits in the feasibility note.

- Records live under historical/*/hannibal/. `rome` and `massalia` live on main at historical/places/stephen/ (from #45). Hannibal's names and its Pleiades points were folded into those records as `role: supporting` claims, and the Wikidata points were kept. `roman-republic` (actors/mediterranean/) is a byte copy of the Rome chapter's (#30). `livy.yaml` is shared with #30, and its title covers the whole work. `syracuse`, `delphi` and `carthage` are minted here for reuse.
- Since #44, vitest serves drafts. A draft's card summary must name its window's first year (chapters.test.ts). The search-index test fix is in #47.
- **Roman dates:** use `calendar: regnal` with the consuls or the season in `as_written`, at year precision. Roman-calendar days are never converted, because v0 has no Roman calendar.
- **Citation formats:**
  - Perseus TEI transcriptions (CC BY-SA over PD editions) use locators of the form book.chapter.section.
  - Pleiades is cited as "place N (title), reprLatLong, dump 2026-10-21", together with Wikidata "QID (P625), revision N".
- **Contract rules learned:**
  - A record-level `cite` may hold only one main claim.
  - A `dispute` needs an alternative or conflicting claim.
  - A display_anchor must have precision unspecified.
  - `envoy` is not a participant role.
  - A story event wholly outside the manifest `window` needs a caption starting "Coda — ". Only the draft-serving build catches this: `CF_PAGES=1 CF_PAGES_BRANCH=<branch> pnpm build`.
- The engine findings and the proposed journey YAMLs are in rfd/0002/HANNIBAL_FEASIBILITY.adoc.

- Darwin's review edits, 2026-10-21, pushed straight onto the branch:
  - A place's first name form is its label in every chapter, so the classical form leads (Massilia before Maxilia). Shared records stay chapter-neutral, with no chapter-specific summary.
  - Livy and Gellius state no licence in their Perseus TEI headers, so the canonical-latinLit default applies. Livy and Polybius are not independent sources.
  - Updating PR branches: Darwin wants rebases onto main, never merge commits (2026-10-22), keeping any commits Darwin pushed.
- Arabic script is drawn by Noto Naskh Arabic (PR #51, merged 2026-10-22). Modern names reach the place card's toggle since PR #62 (merged 2026-10-22): `Place.modern` is a list of {form, lang}, and NameForm takes a list. The records' `note` on each modern name is not shown yet. The font subsetter must keep the joining features isol, init, medi, fina, rlig and curs.

**Why:** about 10 parallel chapter threads share records; later threads must reuse these ids and conventions.
**How to apply:** reuse the ids before minting new ones, and follow the date and citation formats above. See [[tang-multi-story]] and [[chapter-selection]].
