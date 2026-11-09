---
name: shared-record-owners
description: Which region thread mints which shared global record ids (places, actors, sources) for the pre-100 CE chapters, and the copy-byte-for-byte rule
metadata:
  type: project
  modified: 2026-10-21T16:30:00.000Z
---

Agreed between region threads on 2026-10-21. Ids are global, so one thread writes each file. A thread that needs a file before the minting PR merges copies it byte for byte from that thread's branch (git merges identical added files cleanly). Whichever PR merges second drops its copy and rebases, merging any extra names or cites into the surviving file.

- Rome and the Mediterranean (branch claude/project-thread-gn6b4c, folder */mediterranean/): `roman-republic`, `julius-caesar`, `vespasian`, `titus`, `damascus`, `caesarea-maritima`, `antioch-on-the-orontes`, `rhegium`, `puteoli`, `alba-longa`, `philippi`, `thessalonica`, and `tyre` (the Levant thread handed it over on 2026-10-21; Pleiades 678437).
- Hannibal (claude/project-thread-dkht9k, */hannibal/): `carthage`, `carthage-state`, `syracuse`, `capua`, `massalia`, `delphi`, `cannae`, the Alps, rivers, `hannibal`, the consuls of 218–216 BCE, `scipio-africanus`.
- Greece and Persia (claude/project-thread-dr9rbt): `athens`, `corinth`, `ephesus`, `miletus`, `alexandria`, sources `pleiades` (cite as "place N (reprLatLong), dump 2026-10-21") and `herodotus`.
- Mesopotamia and the Levant (claude/project-thread-nuwuyp, */near-east/): `jerusalem`, `tyre`, `sidon`, `ashkelon`, `lachish`, `babylon`, `susa`.
- Egypt and the Nile (claude/project-thread-7kmd5k, PR #29): `roman-empire` (from 27 BCE), `augustus`, `nero`, Kush ids; places `gaza`, `megiddo`, `kadesh`, `thebes`, `karnak`, `aleppo`, `orontes`, `hattusa`, `pi-ramesses`, `abydos-egypt`, `akhetaten`, `ugarit`, `qatna`, `simyra`, `joppa`, `red-sea`, `punt`, `deir-el-bahari`; actors `egypt-new-kingdom`, `hatti`, `kassite-babylonia`, `amurru-kingdom`, `mitanni`, `middle-assyrian-kingdom`, `alashiya`, `ramesses-ii`, `hattusili-iii`, `amenhotep-iii`, `akhenaten`, `hatshepsut`, `thutmose-iii`; sources `cassius-dio` and `pliny-natural-history` (both widened 2026-10-21 to the whole work so Rome and voyages carry identical files), `breasted-ancient-records`, `niebuhr-tell-el-amarna-period`, `maspero-history-of-egypt`, `sayce-hittites`, `garstang-land-of-hittites`. Egypt copied `samos`, `herodotus` (Greece), `byblos`, `sidon`, `jerusalem`, `nineveh`, `ashkelon`, `luckenbill-annals-sennacherib`, `bible-kjv` (Levant). Since #34 merged (2026-10-22), `tyre` is on main at places/near-east/tyre.yaml with Greece's content; Egypt dropped its places/mediterranean/ copy, and the Rome branch must do the same when it rebases.
- Shared sources are one record per work, not per chapter: `livy` is the Hannibal branch's file (Perseus transcription of the Teubner text, locator book.chapter.section; a quote across a section break cites a range like "1.48.7–8"). The Rome thread copied it byte for byte on 2026-10-21 and asked for its title and notes to be widened to the whole work, since book I (the kings) is cited too. Likewise `bible-kjv` (Levant branch, Gutenberg eBook 10, locators like "Acts 13:4") serves every Bible citation; the Rome thread cites Acts from it.

**Update 2026-10-21 22:40:** PR #45 (Stephen II) merged first with `rome`, `genava` and `massalia` under historical/places/stephen/ on main (Wikidata points). Those main files are now the shared records: other branches delete their copies and fold their names and cites in. Rome's merged text is the Hannibal branch's (PR #40) version; copy it byte for byte rather than re-merging.

**Update 2026-10-22:** Hannibal's PR #40 merged with its own `ostia` at historical/places/hannibal/ostia.yaml, so that file on main is now the shared Ostia. The Rome branch dropped its copy and folded Livy 1.33.9 (Ancus founds Ostia) into it as a supporting cite. Hannibal's #40 also changed main's `livy` licence note and `rome` summary, so check main's file before folding into either.

**Why:** two branches minting the same id fail the build on merge (duplicate file name under one kind).
**How to apply:** before minting an id, check this list and historical/; ask the owning thread rather than minting. See [[content-layout-world-first]].
