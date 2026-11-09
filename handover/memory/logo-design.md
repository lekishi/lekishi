---
name: logo-design
description: Lekishi logo decided 2026-10-14 — Meridian dial, Window cut, caps + 歴史 wordmark; merged in PR #24; studies artifact; how to regenerate
metadata:
  type: project
  modified: 2026-10-14T07:35:44.553Z
---

Darwin's decisions, 2026-10-14: the mark is the **Meridian dial** (over an L monogram, a route crossing, a 歴 seal), in its **Window cut** (over the full dial and the bezel), and the wordmark is **LEKISHI caps + hairline + 歴史** (over caps alone and a lowercase with a gold dot). Caps alone is kept for the header below 640 px. Studies artifact: https://claude.ai/artifact/Ps24CWpX4vZPnTSuSrisEy (round 2 is current).

PR #24 (merged 2026-10-14, with two follow-up fixes by Darwin) implements it: `src/lib/ui/brand.ts` (geometry: 23.4° tilt, playhead at -66.6° on the axis, separate 32/16 px cuts; outlined Cinzel 600 caps and Noto Serif CJK JP SemiBold 歴史), `Logo` in `$lib/ui` (`wordmark="bilingual" | "caps"`), `pnpm brand` (maintenance test writes the SVGs from the tokens; `scripts/rasterize-brand.mjs` renders the ICO and the touch icon in Chromium; set LEKISHI_CHROMIUM=/opt/pw-browsers/chromium in the cloud container), and `brand.test.ts` pins the shipped files. It replaced Phoenix's orange bird. RFD 5 has a "Mark and wordmark" section and the owner decisions.

Brand kit for use elsewhere (delivered 2026-10-17): /mnt/project-files/brand/lekishi-brand-kit.zip and its unzipped folder. It holds SVG and PNG in on-dark, on-light (dark gold #9a7425, kit-only), mono-black and mono-white colourways, plus app icons, the favicon, the social card and a README. The generator scripts lived only in a session scratchpad: rebuild them from brand.ts's markMarkup/WORDMARK exports.

**Why:** a new Claude touching the logo needs the decisions and how the files are generated.
**How to apply:** change the logo only in brand.ts, then run `pnpm brand`. jj in the cloud: download the release binary from github.com/jj-vcs/jj releases, because the Nix shell can't fetch. The Python outlining tools lived in a session scratchpad, not the repo. See [[design-system-rfd5]].
