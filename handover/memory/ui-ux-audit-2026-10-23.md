---
name: ui-ux-audit-2026-10-23
description: UI/UX audit of the atlas at 39 chapters (2026-10-23): verdict, bugs found, recommendations, and the open questions Darwin was asked
metadata:
  type: project
  modified: 2026-10-23T07:29:54.963Z
---

Audit artifact (private to Darwin): https://claude.ai/artifact/W6pm9RST4rodcNu7VjXN8a. Walked locally on `main` at 27f5ac3 (Darwin: "don't walk the deployed site yet since it's not fully deployed with the approvals; just run the app locally"). Playwright with `/opt/pw-browsers/chromium` + swiftshader does take globe screenshots locally (contradicts the older note in [[cloud-env-tooling]]); `vite dev` needs `pnpm sync:globe` and `sync:fonts` first (about 10 min).

**Verdict:** the chapter is the only unit of navigation (home catalogue, switcher dialog, search grouped by chapter, chapter globe shows only its own places); the region-scale map is a low-res wash with no painted relief, sea/river labels or declutter (RFD 4 Track 1 exit still open); play is a 4 years/s time-lapse that opens no card and moves no camera; qualification text (legend essay, placement notes, captions on the water, About's sha256 digest) outweighs the history.

**Bugs found (unfixed as of 2026-10-23):** `boundingBoxCenter` in `src/lib/atlas/projection.ts` averages raw longitudes, so antimeridian chapters (Lapita) open over Africa; TimeRibbon illegible with 39 chapters and the 21051 BCE Americas window; home ChapterGlobe centred on the mean home view (Persian Gulf), labels overprint; every `?step=` link recentres a 5-year window and the ArrivalPlate says "window widened" even inside the chapter window; `medallion()` in `card.ts` gives Latin names one initial (Vesuvius pennants "C C P"); place card's modern-name disclosure reads "Modern name" like a missing value; search ranks by chapter group before match quality ("Rome" → Monte Albán first); no label declutter; `YEARS_PER_SECOND = 4` regardless of window; "schematic, follows the dated stops" drawn as a label on the globe.

**Recommendations given (not decided):** fixes above; legend folded + a key, attribution out of the scene; story mode (guided tour: card, camera, date, hold) vs time mode (scrubber, speed scaled to window); home as the world (globe + era strip + search, list grouped by time/region); painted relief + base labels + declutter; qualify quietly (one badge, notes behind disclosure); chapters that know each other (dimmed neighbour marks, "near this", shared place/person ids across chapters).

**Open questions put to Darwin (unanswered when written):** reading unit (chapter / world-at-a-time / thread / place); is play a story or a clock; does the 2026-10-10 hero still set the bar; how loud should qualification be; reader vs scholar first; shared records across chapters; what five minutes on the site should look like.

**How to apply:** before building UI changes, check the thread "Multi-chapter UI/UX audit" for Darwin's answers; don't re-audit. Related: [[design-system-rfd5]], [[verify-on-preview]], [[chapter-selection]].
