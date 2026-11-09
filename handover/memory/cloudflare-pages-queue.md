---
name: cloudflare-pages-queue
description: Cloudflare Pages builds lekishi one at a time; on busy days previews and production lag hours, and the GitHub check shows in_progress while queued
metadata:
  type: project
---

Observed 2026-10-21: Cloudflare Pages runs one lekishi build at a time, in push order, with production (main) waiting behind queued previews. With many threads pushing, the queue ran about 3 hours behind (commits pushed at 17:07 UTC finished building at 20:04). The "Cloudflare Pages" GitHub check reads `in_progress` from the moment a build is queued, so a long `in_progress` is not by itself a hung build. A build takes about 40–70 s locally.

**Why:** I mistook the queue for a hang on PR #44 ([[auth-drafts-rfd6]]) until I compared check runs across branches.
**How to apply:** before debugging a "stuck" preview, list the Cloudflare check on other branches' heads (public API: /repos/lekishi/lekishi/commits/<sha>/check-runs). To deploy main sooner, the owner can cancel stale preview builds in the Pages dashboard. Related: [[verify-on-preview]].
