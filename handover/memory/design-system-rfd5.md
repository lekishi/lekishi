---
name: design-system-rfd5
description: RFD 5 design system foundation merged to main via PR #21 on 2026-10-14 (tokens, $lib/ui, /dev/design, guard ratchet, docs/design-system.md)
metadata:
  type: project
  modified: 2026-10-14T02:34:00.000Z
---

RFD 5 (`rfd/0005/`) proposes hero-derived tokens (lacquer/ink/gold) in Tailwind v4 `@theme` with defaults cleared, evidence grammar as shared map+UI tokens, `$lib/ui` primitives, one layout frame for all scales, a scene safe area for the renderer, and a `/design` living reference.

Darwin's decisions, 2026-10-13: (1) hero palette + Cinzel/Noto Serif JP/Noto Sans JP: yes; (2) frame nav-left / selection-right / time-bottom / date-top, region mock's top story ribbon dropped: yes; (3) self-hosted subset fonts: yes; (4) `/design` built only in dev and Cloudflare PR previews (gated like `spikes/renderer/globe/preview-build.mjs`), never on production.

System sheet (review copy, v2 has decisions + 320 px frame): https://claude.ai/artifact/EHEH25jePp1RRBVXbWFwDd. PR: https://github.com/lekishi/lekishi/pull/21 (merged 2026-10-14 after three Amp oracle review rounds; findings table in the PR description). Concrete atlas mock (RFD 5 chrome over real globe captures, 12 states, 2026-10-13): https://claude.ai/artifact/9MYcMXmH66U7V4hBi7yoqb; it adds label declutter by priority (selected, then event count; unplaceable labels drop), not yet in the RFD. IA/navigation canvas (2026-10-13): https://claude.ai/artifact/LbB9H3dnzBLSVkeJhbQbZF proposes global search (/ key, cross-chapter, any script), a chapter switcher in the date bar, home with search + time ribbon, and chapter state in the URL query (?event=, ?place=, ?step=, ?from=&to=). Darwin decided 2026-10-13: `?event=` query (not per-event paths), and IA lives in RFD 5 (section + Navigation checklist, commits 70def50, 99ddd27). Tang story has 37 steps (24 events in 750–754).

**Why:** Track 1 adds ~12 new chrome surfaces; without a system each invents its own styling.
Darwin asked 2026-10-13 for the system itself in PR #21 (modelled on renga-dcim/renga's docs/design-system.md + design_system_live.ex). Built: tokens (`@theme static`), 13 `$lib/ui` primitives, `/dev/design` (Darwin 2026-10-13: all non-prod pages live under a gated `/dev` prefix; `scripts/dev-pages.mjs`, `__DEV_PAGES__`, `LEKISHI_DEV_PAGES=1`; `/dev` index lists them from `src/lib/dev/pages.ts`), `design-system.test.ts` legacy ratchet (13 files, 415 uses), `docs/design-system.md`. Production routes exclude `[dev=dev]` via `scripts/build-app.mjs` (route copy in `.svelte-kit-build/`). Deferred oracle nit: Badge, DateLine, Field hint and CitationLine hard-code `ink-faint`, which fails AA on glass; give them a glass context when compositions put them there. Still open: fonts self-hosting, frame on /design, migrating legacy screens, clearing Tailwind defaults.
**How to apply:** New UI uses `$lib/ui` and tokens only; lower LEGACY counts when touching legacy files. Chromium e2e can't launch in the cloud container (browser revision mismatch); Firefox projects run.
