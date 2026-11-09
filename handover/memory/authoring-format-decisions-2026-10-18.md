---
name: authoring-format-decisions-2026-10-18
description: Darwin's card-by-card decisions on RFD 2's authoring format, approvals, draft previews and chapter cards (2026-10-18 to 2026-10-21)
metadata:
  type: project
  modified: 2026-10-21T15:48:24.614Z
---

All are recorded in rfd/0002/AUTHORING_FORMAT.adoc and were implemented in PR #25 (branch claude/project-thread-anpeq8).

On 2026-10-18 the six proposals were decided as proposed:
- **Ids:** each id is its file name, with one folder per kind.
- **Records:** records are flat YAML with a cite on each field, and the compiler generates the claims.
- **Dates:** short strings, with BCE spelled out.
- **Manifests:** one YAML manifest per chapter, whose story is an explicit list of event ids.
- **Approval:** each manifest pins a digest approval. A CODEOWNERS rule requires Darwin's review, and `pnpm approvals` lists the chapters and diffs them against the last approval.
- **Compiled output:** never checked in. There is one `wikidata` source, and each citation is pinned to an item revision.

Later choices:
- **"Re-approve" (2026-10-18):** approvals are made fresh with the tool, never carried over.
- **"Previews show drafts" (2026-10-18):** the dev server and non-main Cloudflare previews serve draft and stale chapters under a Draft banner. Production never does.
- **"Drop it" (2026-10-20):** an approved chapter's card shows no approval line. A draft's card gets a Draft pill.
- **Digest v2 (2026-10-21):** Darwin re-approved both chapters under it.
- **`approve all` (2026-10-21):** Darwin found typing the id back too cumbersome. `pnpm approvals approve all` now walks the pending chapters with a [y/N] prompt and still requires a TTY.

- **Journeys as their own kind (2026-10-21):** Darwin chose a dedicated `journeys` record kind under contract v1 over stops on an event's `at` or a manifest list, as the better long-term model (branches, competing accounts, legs with their own interpretation). The 753 voyage is its first content. Spec + cited places merged in PR #26 (2026-10-21); contract v1 journeys/records/map change await Darwin's go on a card (thread "Next step after new globe").

- **A missing approval never fails a build (2026-10-21):** Darwin first OK'd CI-on-drafts, then said "don't want builds to fail because of lack of approvals". On PR #26: tests and the chapter gate serve drafts by default; production builds leave draft/stale chapters out (index too) with a warning; CI job `production` runs the production build + lists pending approvals. Card on stale behaviour (hide vs serve last approved vs keep failing) was open; hide was built as recommended. The auth thread (GitHub OAuth for drafts) relies on unapproved never being in the public bundle.
- **Fonts:** the subset Noto Serif JP/TC faces draw no simplified-only characters (遗, 扬, 张…). Write searchable record text (names, modern forms, notes, summaries) in traditional/Japanese forms or the static build fails. Darwin also converted new sources' text (2026-10-21, PR #26), so convert source text too.

- **Territories as control by place (2026-10-21):** Darwin chose held places (capitals, commanderies) per dated snapshot, no drawn borders; borders a later follow-up. Spec proposed in rfd/0002/TERRITORIES.adoc (PR #38). See [[qin-six-states-records]].

- **A `conventional` claim basis (2026-10-22):** Darwin chose it and accepted rfd/0002/CONVENTIONAL_DATES.adoc. Rule: attested if the source gives a calendar date that pins the year (archon plus month, regnal year); conventional if it gives a sequence and reference works agree; interpretation otherwise. Built in contract **v0** (Darwin: no v1 bumps before launch, see [[contract-v0-amend-in-place]]): `basis: conventional` + required `convention`, 2+ citations, time pointers only, never in a dispute; vectors in historical/v0/vectors/claims.json. Greek chapters re-cited (6 attested, 88 conventional). PR #56 merged 2026-10-22. Eponymous and Olympiad calendars still open.

Media and the rest of contract v1 are still only proposed; the territory record's shape awaits review. The Tang chapter will hold 鑒眞's 743–748 crossings as a second story (Darwin, 2026-10-21, thread "Grow Tang content").

**Why:** publication is owner-gated. I never write an approval or run `pnpm approvals approve` on real content.
**How to apply:** don't implement a proposal before Darwin answers its card, and give pros and cons with every card. See [[content-layout-world-first]].
