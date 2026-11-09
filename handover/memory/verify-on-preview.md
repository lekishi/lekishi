---
name: verify-on-preview
description: Darwin expects visual changes checked on the deployed Cloudflare preview, not only a local build
metadata:
  type: feedback
  modified: 2026-10-14T17:23:26.630Z
---

On 2026-10-14 Darwin asked "Did you check the preview yourself?" after I reported the finer globe tiles from a local build only.

**Why:** Darwin tests on real devices against the PR preview (https://claude-project-thread-anpeq8.lekishi.pages.dev for PR 23's branch; other branches get their own branch preview URL from the Cloudflare bot comment). A local check doesn't prove what Darwin sees.

**How to apply:** once the Cloudflare Pages deploy for the pushed commit succeeds, drive the preview with Playwright (it is reachable from the cloud container), e.g. watch `/globe/b/...` requests and take screenshots at phone size. Then say plainly which checks ran on the preview and which ran locally. See [[cloud-env-tooling]].
