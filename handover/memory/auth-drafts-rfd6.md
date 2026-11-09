---
name: auth-drafts-rfd6
description: RFD 6 (PR #44, 2026-10-21) on GitHub sign-in so lekishi org members see drafts on production; constraints Darwin set and the open gate choice
metadata:
  type: project
  modified: 2026-10-21T16:08:43.335Z
---

Darwin asked on 2026-10-21 for sign-in so members of the `lekishi` GitHub org see draft/unapproved chapters on production (`lekishi.pages.dev`, no custom domain). Constraints Darwin stated:
- GitHub first; other auth / OIDC later (keep a provider interface).
- Pull-request previews keep showing every draft with no sign-in.
- "Don't want builds to fail because of lack of approvals": an unapproved or stale chapter is dropped from the public site with a warning, never a build failure (PR #26 implements the build side).

RFD 6 (`rfd/0006/`, PR #44): Darwin chose option A on 2026-10-21 (GitHub sign-in in the SvelteKit app, after renga-dcim/rfd). Defaults I took, not yet confirmed by Darwin: 12-hour sessions, OAuth App with read:org, 404 for a stale chapter's public URL.
Implemented on #44: adapter-cloudflare, with `wrangler.jsonc` setting pages_build_output_dir=build. `_routes.json` include is only /chapters/*, /auth/*, /drafts.json and /drafts/*, with exclude `<prerendered>`. The adapter's default excludes every static file and drops rules past 100. The chapter route uses +page.server.ts with prerender "auto". `virtual:lekishi-drafts` is SSR-only. check-static-build fails if any build/ file names an unapproved chapter.
#44's first five commits are #26's build-rule commits (drop, don't fail), carried there with that thread's agreement.
Merged 2026-10-21 19:43 UTC; production deployed it 2026-10-22 04:21 UTC (main's Cloudflare builds were stuck for ~8.5h). Owner action pending: create the OAuth App and set the Production secrets GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and SESSION_SECRET (docs/members-sign-in.md), then redeploy production, since Pages applies secrets only to new deployments. Done 2026-10-22: Darwin set the secrets, redeployed, and confirmed members see all 21 chapters; anonymous readers see 0 chapters, since every chapter was a draft or stale then. The home footer still says "A static site: reading needs no account".
Local end-to-end test: put SESSION_SECRET in .dev.vars, then `pnpm exec wrangler pages dev build`. Mint a cookie with createSession from src/lib/server/session.ts. Use http://localhost, not 127.0.0.1, so Chromium accepts the __Host- cookie.
Darwin pushed fixes to #44 himself (2026-10-21, 18:35–18:44 UTC): the shared overlay-definitions script and the per-chapter `_redirects` rules named a stale chapter in public files. Overlays now travel in chapter data (`chapter.overlays`, server-side projection), the legacy redirects are server loads, and _redirects has no per-chapter rules. Darwin also pushed d6d95b3 (19:25 UTC): adapter-cloudflare's platform proxy (workerd) outlived every `pnpm build`, scripts/build-app.mjs now kills its process group. Lesson: any browser module that keys data by chapter id leaks drafts.
Facts: the repo is private but preview URLs are public. renga-dcim/rfd SSRs every page; Lekishi only runs the worker for drafts and auth.

**Why:** any gate adds runtime code, secrets or an account, which AGENTS.md forbids without an owner decision.
**How to apply:** don't implement before Darwin picks the gate; never write approvals. Related: [[authoring-format-decisions-2026-10-18]].
