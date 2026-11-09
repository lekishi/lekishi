---
name: ashoka-chapter
description: Aśoka chapter (PR #39, merged 2026-10-22; still a draft, no approval): sources, ids and open gaps
metadata:
  type: project
---

Drafted 2026-10-21 on branch claude/project-thread-rgp6mf; PR #39 merged to main 2026-10-22 (after #57). Includes Darwin's review fixes and his atlas fix keeping chronological stepping inside the window. Manifest historical/chapters/ashoka-edicts-273-232.yaml ("Aśoka and his edicts, 273–232 BCE"; first drafted as 261–232 but renamed after the preview build failed), no approval; notes in rfd/0002/ASHOKA_EDICTS_FEASIBILITY.adoc.

- Sources: `asoka-inscriptions` (Smith's 1920 English, locator `inscription`) and `smith-asoka-1920` (chronology: consecration = regnal year 1 = 269 BCE, cited as interpretation). Both public domain via English Wikisource.
- Records live in */ashoka/: 33 places, 26 actors (incl. antiochus-ii, ptolemy-ii, antigonus-gonatas, magas-of-cyrene, alexander-of-rock-edict-xiii, cholas, pandyas), 36 events, 19 relationships. Reuses 玄奘's Indian places (pataliputra, bodh-gaya, taxila, …). The Greece/Persia thread agreed these Hellenistic kings are ours; it has alexander-the-great, darius-iii, persian-empire on PR #34.
- Gaps: Hultzsch CII I (1925) unread (archive.org unreachable); post-1920 inscriptions (Kandahar, Erragudi…) excluded; no second chronology; Mahāvihāra/Anurādhapura not yet places.

**Why:** later threads touching Mauryan India or Hellenistic kings should reuse these ids.
**How to apply:** check */ashoka/ before minting Mauryan or Hellenistic ids. See [[chapter-selection]], [[content-layout-world-first]].

Gotcha: the atlas projection (src/lib/atlas/projection.ts) rejects any story event wholly outside the manifest `window` unless its caption starts "Coda — ". `pnpm test` does not run it; only a preview build does (`CF_PAGES=1 CF_PAGES_BRANCH=<branch> pnpm build`), so run that before pushing a new chapter.
