# Lekishi handover to Amp (2026-11-09)

Darwin moved Lekishi from his Claude project ("Lekishi", 33 threads from
2026-10-12 to 2026-11-04) to Amp, where the **lekishi MVP** space takes the
project over. This folder holds everything that lived outside this repository:
the project memory, the shared notes, the brand kit and the published mocks.
Everything else (code, RFDs, records, CI) was already in the repository.

Read this file first, then `memory/MEMORY.md`, which indexes the rest of the
memory. Treat dates and states as true on the day they were written, and check
them against `main` and GitHub before acting.

## What Lekishi is, in one paragraph

An interactive historical atlas: a static SvelteKit site on Cloudflare Pages
(<https://lekishi.pages.dev>) rendering a custom Three.js globe, with chapters
authored as YAML records under `historical/` (world-first layout, RFD 2) and
compiled to contract v0 at build time. A chapter reaches production only with
Darwin's digest approval in its manifest. A small Pages worker serves sign-in
and drafts to members of the `lekishi` GitHub org (RFD 6). Start with
`AGENTS.md`, `README.md` and `rfd/README.adoc`.

## Where things stand

- `main` is at c7318b4 (#67, 2026-10-23). Nothing has merged since.
- 39 chapters are served (drafts included), from Sargon to Stephen II. 88
  places and 41 actors are already shared by id across chapters.
- **Open PR:** draft [#68](https://github.com/lekishi/lekishi/pull/68),
  `docs(rfd): the information architecture reset at 39 chapters`, branch
  `claude/project-thread-s2n64u`, CI green. It adds `rfd/0005/IA_RESET.adoc`.
  This is the next piece of product work.
- All other Claude PRs (#18 to #67) are merged.

## Darwin's direction right now (most important)

After the 2026-10-23 UI/UX audit Darwin said the atlas has no exploration, the
IA is "straight up bad", nothing feels like Civilization, and "boring is not
what I'm trying to achieve" (`memory/ux-direction-2026-10-23.md`). The IA reset
answers that: a world page at a moment in time, chapters on their own page as
vertical timelines by culture, a place across chapters, guided chapter tours,
and the Civ-register scene (terrain zoom, units on journeys, settlements,
figures) as requirements, not polish (`memory/ia-reset-2026-11-04.md`).

**Three questions are still unanswered on #68:**

1. Does the world page replace home outright, or does home keep a short list
   beside it?
2. Is the Civ scene work scheduled with the IA pages or after them?
3. Are the ten culture columns the right grouping? (The mock's columns are
   hand-assigned; a `region` field on the manifest is proposed.)

## Other decisions waiting on Darwin

- **Stale approvals.** #65 and #66 changed records that approved chapters
  reach, so Tang (`tang-mission-750-754`), both Qin chapters, `chonger-exile`
  and `kongzi-travels` are stale and left out of production until Darwin runs
  `pnpm approvals`. Agents never write approvals (AGENTS.md).
- **Members sign-in (RFD 6).** Memory says Darwin set the Production secrets
  and confirmed it on 2026-10-22, but the 2026-11-02 weekly status still listed
  the OAuth App and secrets as pending. Verify on production. Four defaults
  were never confirmed: 404 for a stale chapter's public URL, previews open,
  12-hour sessions, OAuth App (read:org) rather than a GitHub App.
- **Authoring format:** the journey record's shape, media, and per-claim
  credit still need Darwin's agreement.
- **CHGIS:** whether to ask for written permission; the last open Track 0 item
  in RFD 4.
- **Voyage chapters:** the Pofatu licence conflict and the proposed evidence
  states (`memory/voyage-chapters.md`).
- **Egypt:** BCE windows are editorial placeholders until a cited chronology
  is chosen (`memory/egypt-nile-chapters.md`).
- **Tang:** the missions network (#43 records) is not wired in as a story yet.

## Working rules Darwin set (keep these)

- Use jj over git; commit in small logical chunks; Conventional Commits.
- Always rebase branches onto `main` (or their base PR); never merge `main` or
  another PR into a branch. Fetch first and keep Darwin's own commits; he
  pushes fixes straight onto agent branches
  (`memory/darwin-pushes-to-thread-branches.md`).
- Commits are authored as `Darwin <5746693+darwin67@users.noreply.github.com>`
  (`memory/commit-identity.md`).
- Open PRs as drafts; record design decisions as RFDs.
- No contract v1 until launch: amend v0 in place
  (`memory/contract-v0-amend-in-place.md`).
- Never raise test timeouts to get green; fix the slowness
  (`memory/no-timeout-bumps.md`).
- One source record per work (e.g. 資治通鑑), not per chapter or juan.
- Non-production pages live under `/dev`; deep links use query params on the
  chapter URL (`?event=`, `?place=`, `?step=`, `?story=`, `?from=`/`?to=`).
- Verify visual changes on the Cloudflare preview, not only locally
  (`memory/verify-on-preview.md`); Pages builds one at a time and can lag hours
  (`memory/cloudflare-pages-queue.md`).
- Content evidence rules from Darwin's reviews:
  `memory/content-evidence-rules.md`, `memory/chapter-review-feedback.md`,
  `memory/draft-chapter-review-lessons.md`, `memory/tradition-basis.md`.

## What is in this folder

| Path | What it is |
| --- | --- |
| `memory/` | The Claude project's whole memory, 42 files, copied verbatim. `MEMORY.md` is the index; `[[name]]` links point to `memory/name.md`. Notes that say "v1" are superseded by `contract-v0-amend-in-place.md`. |
| `notes/roadmap-session-digest.md` | Digest of the founding roadmap session (2026-10-12). |
| `notes/data-format-discussion.md` | The RFD 2 data-format discussion (world-first layout). |
| `brand/lekishi-brand-kit.zip` | The full brand kit (Meridian dial mark, wordmarks, lockups, app icons, social card) in SVG and PNG. The shipped subset is already in the repository via PR #24. |
| `artifacts/ia-reset-mock/` | The IA reset mock (2026-11-04), four tabs built from real records. Open `index.html`. Published at <https://claude.ai/artifact/L8j7dDL6A6Pakc6uRemJfE>. |
| `artifacts/ui-ux-audit/` | The UI/UX audit at 39 chapters (2026-10-23) with its screenshots. <https://claude.ai/artifact/W6pm9RST4rodcNu7VjXN8a> |
| `artifacts/close-up-audit/` | The close-up (diorama) audit page, 2026-10-14. Its 110 media files (about 40 MB of video) were not copied; they remain at <https://claude.ai/artifact/Bnwm7YdFUziwyvmzJvJW97>. |
| `artifacts/ia-navigation-design/` | Source boards of the 2026-10-13 IA and navigation design (site map, URL contract, four ways in, home, search, switcher, arrival, phone). Embedded screenshots were blob references and did not copy. <https://claude.ai/artifact/LbB9H3dnzBLSVkeJhbQbZF> |
| `artifacts/atlas-mock/` | The 2026-10-13 atlas mock. <https://claude.ai/artifact/9MYcMXmH66U7V4hBi7yoqb> |
| `artifacts/system-sheet/` | The 2026-10-13 design system sheet (RFD 5). <https://claude.ai/artifact/EHEH25jePp1RRBVXbWFwDd> |
| `artifacts/mark-studies/` | Logo mark studies, 2026-10-14. <https://claude.ai/artifact/Ps24CWpX4vZPnTSuSrisEy> |

Not copied, by choice:

- "Choosing Lekishi's next chapters" (2026-10-21) is a claude.ai Doc:
  <https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV>. Every chapter it
  proposed has since been built; `memory/chapter-selection.md` summarises it.
- `patches/conventional/` in the shared folder: superseded, since #56 merged
  the conventional date basis into v0.
- Screenshots in the shared folder (`atlas/`, `design-system/`,
  `dev-wikidata/`): point-in-time captures of screens that have since changed.

## Things that stay in Claude

- The routine **"Weekly Lekishi status"** (Mondays 16:45 UTC) still runs in
  Claude. Darwin decides whether to stop it and set up an equivalent in Amp.
- Thread conversations themselves. Their outcomes are in the memory notes and
  in the merged PRs' descriptions.

## Environment notes for agents

- `.amp/services.yaml` already declares the dev server and the built artifact;
  use `amp orb services ensure`.
- Before a first `pnpm build`, `pnpm sync:globe` and `pnpm sync:fonts` take
  about 10 minutes.
- Known e2e flakes and their fixes: `memory/e2e-known-failures.md`.
- Wikidata API rate limits and workarounds: `memory/cloud-env-tooling.md`.
