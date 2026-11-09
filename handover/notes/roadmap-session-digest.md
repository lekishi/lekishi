# Digest: Claude Code Remote session session_0184q2Vpm5iKSftnAWfwy2P6

Title: "Lekishi: Project status and roadmap". Repo: lekishi/lekishi. Span: 2026-10-10 03:19 UTC to 2026-10-12 05:06 UTC.
Source: every page of `list_events`, kinds user/assistant/result, read from the newest page back to the first (91 pages, none skipped). The transcript includes three context compactions (at 10-10 06:50, 10-10 19:05 and 10-11 04:01). Their summaries were read and cross-checked against the raw events. Image content and most tool output were not reproduced; the assistant's prose and the key tool calls (commits, PRs, artifacts, triggers) were.

Working setup noted in the session: jj was not available, so it used git with the repo-local identity `Darwin <5746693+darwin67@users.noreply.github.com>`. The Nix shell could not fetch, so it ran Node 22 and pnpm. The session worked in its own container at /home/user/lekishi (session cwd id a094ae20-...).

---

## 1. Every message from the human user (Darwin), in order

Not listed: automated stop-hook feedback ("There are uncommitted changes / untracked files ... commit and push"), subagent hand-backs, GitHub and trigger notifications, compaction summaries, and the artifact "page contract" text the harness injected.

| # | Time (UTC) | Message (verbatim) |
|---|---|---|
| 1 | 2026-10-10 03:19:31 (iOS) | "Inspect the current project status and help map out a better roadmap to make this project a reality. I'm not very happy about what's accomplished so far, both in terms of data quality and also visualization" |
| 2 | 10-10 03:20:01 | "Also run the app and check the visuals" |
| 3 | 10-10 03:43:07 | "Instead of adding a new RFD, redo the existing ones" |
| 4 | 10-10 03:52:46 | "Close PR 14, and let's start doing UI mocks. The current UI can act as a baseline but we can also reevaluate the tech being used. I was initially thinking of visualization that look a little more like the game civilization" |
| 5 | 10-10 03:57:02 | (image attachment: Civilization VII screenshots, 2048x1024) |
| 6 | 10-10 03:58:35 | "Research civilization 7 to see what it looks like" |
| 7 | 10-10 04:10:08 | "Looks quite different?" |
| 8 | 10-10 04:27:39 | "Yup this is what I'm looking for" |
| 9 | 10-10 04:29:25 | "For phones, maybe we can dilute it down to 2D or something? Kinda like how Nintendo did it for one of their devices" |
| 10 | 10-10 04:29:44 | "Or even pixelated with pixel.js or something" |
| 11 | 10-10 04:45:48 | "When I say using pixel.js, I meant more like 2D map like early Pokémon games so it's easier to render on smaller screens, and controls are more constrained as well. Tablet and above should allow 3D and pixel versions that can be switched by demand" |
| 12 | 10-10 05:00:17 | (with screenshot) "The idea and direction is right but nav and controls need more refinement. Too much wasted space" |
| 13 | 10-10 05:03:40 | (with screenshot) "Well this is now a waste of space on larger screens. Utilize it better" |
| 14 | 10-10 05:08:58 | "Looks good. And PoC will be after RFD updates?" |
| 15 | 10-10 05:09:28 | "Mark it ready for review" |
| 16 | 10-10 05:56:55 | "What about 1, 2?" |
| 17 | 10-10 05:59:43 | "Let's address one by one. For format, if I want external contributor in the future like scholars or experts, how would that look?" |
| 18 | 10-10 06:05:06 | "We're talking about potentially non technical folks, so is this a flow to standardize on? Git based is fine for now, and the underlying system will most likely continue to be so, but thinking of how it'll work as project grows" |
| 19 | 10-10 06:06:31 | "Yes, record that in RFD 2 and move on to 2" |
| 20 | 10-10 06:10:33 | "Commercial means for profit activities or company? If it's a non profit, does it count?" |
| 21 | 10-10 06:12:30 | "Broader term? What kind?" |
| 22 | 10-10 06:20:44 | "What other datasets are out there that's available?" |
| 23 | 10-10 06:27:09 | "Let's choose default to ones allowing commercial use for now" |
| 24 | 10-10 06:30:30 | "Let's include all valuable and useful data sources with their licenses with maybe groups of tables and such, and have a check or not to allow use in the docs" |
| 25 | 10-10 06:30:47 | "Have the RFDs linked to that doc" |
| 26 | 10-10 06:30:57 | "Make it an adoc as well" |
| 27 | 10-10 06:36:15 | "No I mean under ./docs" |
| 28 | 10-10 06:43:04 | "No preference yet and I'd like to see the result of both spikes. Make sure to compile a report with proof of work, screenshots, demo videos and such. Also make sure to include pros/cons, strengths/weaknesses and future extensibility. I'm also open to building a custom engine for this project, potentially in rust and load as wasm depending on the results" |
| 29 | 10-10 10:55:37 | "Did you watch the videos yourself?" (followed by a local command that switched the model to claude-opus-5-5) |
| 30 | 10-10 11:38:03 | "Higher the better?" |
| 31 | 10-10 12:55:38 | "This is not apple to apple comparison if globe is abandoned, and I don't want to abandon it. That's the whole experience I want to deliver so user can explore an era across the globe, zoom in and out whenever they want" |
| 32 | 10-10 13:10:55 | "Start the globe phase. Can try both maintained 3js pkg or we can build a custom one as well that fits our needs" |
| 33 | 10-10 18:21:49 | "Let's do the follow up for custom to see if it can get to what we need it to?" |
| 34 | 10-10 18:22:22 | "You can also clean up the initial eval since it's no longer needes" |
| 35 | 10-10 22:52:00 | "How do I test the new globe? Using the cloudflare preview deploy" |
| 35a | 10-10 ~22:53 | AskUserQuestion answer: **"Build tiles in preview (Recommended)"** |
| 36 | 10-10 23:49:14 | iPad bench, round 1: "device: … iPad; CPU OS 26_6_2 … CriOS/155 … viewport: 820×1042 @2x · sse 4.5 · frames: 1335 in 24 s (55.6 fps mean) · frame time p50 17.0 ms · p95 30.0 ms · max 99 ms · frames over 33 ms: 2.7% · tiles: 995 heights, 995 imagery" |
| 37 | 10-10 23:55:20 | iPhone bench, round 1: "iPhone OS 26_7_1 … viewport: 402×684 @3x · sse 4.5 · 1424 in 24 s (59.3 fps mean) · p50 17.0 · p95 21.0 · max 74 ms · over 33 ms: 0.8% · tiles: 603 heights, 603 imagery" |
| 38 | 10-10 23:59:27 | "The number of files are concerning, how can we reduce it? Would it reduce if we get rid of the previous PoC?" (he then **denied** the AskUserQuestion that offered options, at 00:03) |
| 39 | 10-11 00:03:59 | "What are the remaining gaps for custom globe implementation?" |
| 40 | 10-11 00:06:24 | "Let's close all engine gaps then do another hardware evaluation? I'd like us to be in a place to make a call on one and remove the other spikes entirely without follow ups so we can just focus on building out the project going forward" |
| 41 | 10-11 00:14:03 | "How do you optimize these kind of apps?" (sent mid-turn. The compaction summary says it was answered, but no standalone answer text appears in the transcript. The session kept working on optimizations.) |
| 42 | 10-11 03:24:37 | iPad round 2: "viewport: 1180×682 @2x · sse 4.5 · 1434 in 24 s (59.8 fps) · p50 17.0 · p95 17.0 · max 72 ms · over 33 ms 0.1% · tiles: 521 (385 distinct) · tile memory peak 160 of 128 MB" |
| 43 | 10-11 03:27:52 | iPhone round 2: "402×684 @3x · 1385 in 24 s (57.7 fps) · p50 17.0 · p95 17.0 · max 808 ms · 0.1% · 498 (386 distinct) · peak 162 of 128 MB" |
| 44 | 10-11 03:59:39 | iPhone re-run after the fix: "1437 in 24 s (59.9 fps) · p50 17.0 · p95 17.0 · max 24 ms · 0.0% · 490 (378 distinct) · peak 155 of 128 MB" |
| 45 | 10-11 04:01:16 | iPad re-run: "1180×682 @2x · 1432 in 24 s (59.7 fps) · p50/p95 17.0/17.0 · max 43 ms · 0.3% · 530 (390 distinct) · peak 162 of 128 MB" |
| 46 | 10-11 16:52:38 | Desktop Firefox: "Linux Firefox/154 · 1916×891 @1x · 1427 in 24 s (59.5 fps) · p50 17.0 · p95 18.0 · max 90 ms · 0.7% · 538 (479 distinct) · peak 258 of 256 MB" |
| 47 | 10-11 16:53:20 | "another one on chrome" with Chrome/154 · 1916×883 @1x · 1059 in 24 s (44.1 fps) · p50 16.7 · p95 17.3 · **max 6340 ms** · 0.1% · 549 (490 distinct) · peak 258 of 256 MB |
| 48 | 10-11 16:56:22 | "firefox on laptop screen size:" 2129×1094 @1.2x · 3830 in 24 s (159.6 fps) · p50 6.0 · p95 7.0 · max 197 ms · 0.1% · 618 (542) · peak 256/256. "chrome on laptop screen size:" 2129×1062 @1.2x · 3955 in 24 s (164.8 fps) · p50 6.1 · p95 6.3 · max 13 ms · 0.0% · 677 (562) · peak 256/256 |
| 49 | 10-11 22:59:56 | "chrome 1:" 2129×1137 @1.2x · 164.5 fps · p50 6.1 · p95 6.5 · max 13 · 0.0% · 730 (590) · worst 13 ms at 48%/71%/48% · page hidden no · context lost no · shaders during flight 0 · longest main-thread task 76 ms. "chrome 2:" 1916×908 @1x · 59.9 fps · p50 16.7 · p95 16.9 · max 23 · 0.0% · 550 (490) · worst 23 ms at 49% · hidden no · lost no · shaders 0 · longest task 68 ms |
| 50 | 10-11 23:11:07 | Mid-range phone, full quality: "Linux; Android 10; K … Chrome/154 Mobile · 411×782 @2.625x · 1236 in 24 s (51.5 fps) · p50 16.9 · p95 34.9 · max 70 ms · over 33 ms 9.5% · 500 (384 distinct) · peak 150/128 · worst 70 ms at 74%, 68 at 73%, 57 at 90% · shaders 0 · longest main-thread task 299 ms (1 over 100 ms)" |
| 51 | 10-12 01:29:16 | Same phone, `quality phone`: "(drawn at 2x) · 1414 in 24 s (58.9 fps) · p50 16.8 · p95 18.7 · max 80 ms · 0.7% · 508 (392 distinct) · peak 154/128 · worst 80 ms at 1%, 69 at 63%, 51 at 20% · longest task none over 50 ms during the flight; 87 ms ending as it began" |
| 52 | 10-12 01:46:22 | **"Yup let's go the custom route and clean up other spikes. But let's keep the investigation docs"** |
| 52a | 10-12 01:47:37 | AskUserQuestion answer: **"Keep all media (Recommended)"**, so the docs keep every engine's images and videos and only spike code is removed |
| 53 | 10-12 05:05:32 | "PR merged." |

---

## 2. Chronological narrative

### A. Assessment and roadmap (10-10 03:19 to 03:50)
- The session built and ran the site and captured both chapters at desktop and phone widths. It read all the RFDs and wrote a status assessment.
- **Diagnosis:**
  - 6,228 lines of governance prose and 311 tests protect 34 events and 19 places.
  - No place has an asserted historical coordinate. There are no routes, territories or images.
  - Dots sit at modern city centres, and ten Tang events stack on one point.
  - The time controls are two number inputs and a bare slider.
- **Root causes:**
  - "Rigour became refusal": RFD 2 was read as "draw nothing you cannot prove".
  - The data is thinner than its own free sources. Example: 黃泗浦 is anchored at central Suzhou, while Wikidata has the Huangsipu site item Q133305745 about 60 km away.
  - The content format suits a newsroom: about 100 lines of JSON per place, with sets, ledger and digest.
- **First roadmap:** a "show, then qualify" principle and three tracks.
  - Track 0 (one week): hero mock, close PR #14, compact authoring, gazetteer rights.
  - Track 1 (4–6 weeks): basemap, labels, journeys, arcs, territory, timeline, and a MapLibre spike.
  - Track 2 (continuous): anchors from Wikidata/Pleiades, the 753 voyage, images, Tang at 200+ events, Qin campaign.
- Written as RFD 5 on branch `docs/rfd-0005-roadmap-reset`. **Draft PR #15** opened (subscribed, check-in trigger `trig_01BaKyqKQ8SrnZ2mUnpZQZkH`).
- At the user's request ("redo the existing ones"), RFD 5 was folded into RFDs 1–4 and `rfd/0005` was deleted. The dated sub-records were kept.
  - RFD 1: hero bar and show-then-qualify.
  - RFD 2: cited coordinates, drawn routes, one editor.
  - RFD 3: lines, areas, basemap, renderer spike; the Phoenix baseline dropped.
  - RFD 4: release charter with three tracks and six release criteria (RC1–RC6) replacing AC1–AC8.
  - Tests: 501 passed, 1 skipped.

### B. UI mocks in the Civilization register (10-10 03:52 to 05:09)
- **PR #14 closed** by decision (03:53).
- Mock artifact **https://claude.ai/artifact/9iGo5aGtJUiHd1CLmHLuLZ** ("lekishi-hero.html"), published in versions 1 to 7. Contents:
  - v1: region hero (painted relief, schematic voyage, arcs), globe screen, local 平城京 grid. Included a Civ VII research write-up ("readable realism").
  - v2: after "Looks quite different?", a **3D Three.js diorama** of the 秋妻屋浦 landfall with Civ VII-style chrome. The user approved it: "Yup this is what I'm looking for".
  - v3/v4: a quarter-resolution pixel toggle.
  - v5: a PixiJS **handheld tile-map tier** (Pokémon-style; d-pad, A/B).
  - v6: compact phone nav and controls (Select/Start pills, map fills the viewport).
  - v7: on tablet and desktop, tile mode fills the stage (journal | map | card).
- **Decisions recorded in the RFDs** (pushed to PR #15):
  - The diorama is the approved Tang hero (assets in `rfd/0001/hero/`).
  - Phones get the handheld 2D tile tier. Tablet and up get 3D with the pixel look switchable.
  - RFD 3 dropped MapLibre: the spike would compare stylized Cesium against a custom Three.js scene.
- The user asked to mark PR #15 ready for review (05:09). **PR #15 merged** by the owner at about 05:52 as "docs(rfd): revise RFDs 1–4 around the content and visualization reset (#15)", commit 408d5e1.

### C. Track 0 decisions: authoring format, contributors, source rights (10-10 05:56 to 06:40)
- **Authoring format and contribution flow:**
  - Proposed one compact YAML per chapter compiled to the v0 contract. After the user's questions, it became **a folder per chapter with one small YAML file per record**.
  - Standardized: the content model (stable ids, cited claims, attested vs interpretation, disputes as sibling claims, `contributed_by`/`reviewed_by`), the approval contract, and three roles (contributor, specialist reviewer, editor).
  - A **4-stage contribution surface** for non-technical scholars:
    1. Editor transcribes their material.
    2. A GitHub issue form.
    3. A Git-backed editing site. This needs an auth proxy, which is an owner decision.
    4. A database application only when needed.
  - The user approved this. Recorded in RFD 2 on branch `docs/rfd2-track0-decisions`, **draft PR #16** (trigger `trig_01MKz4KDuSTWMPc5krCsQc7o`).
- **Gazetteer rights:**
  - The session first claimed CHGIS was CC BY-NC and that "broader terms" had been granted. It **corrected itself**: CHGIS terms are "free for academic research, no commercial use, resale, or redistribution". CBDB is CC BY-NC-SA, with stricter terms from 2026-08-20.
  - It explained that "NonCommercial" is about the activity, not the entity.
  - It surveyed the alternatives: Wikidata, Pleiades, WHG, 日本歴史地名大系 data, NIHU 歴史地名データ, Getty TGN, CCTS, OpenHistoricalMap, historical-basemaps, Seshat, texts, museums.
- **Rule chosen by the user:** a source is adopted by default only if its terms allow commercial use with attribution.
  - Allowed: Wikidata, Pleiades, Getty TGN, OHM, ColBase, the Met/Smithsonian/Cleveland/Getty CC0, public-domain base geography, OFL fonts.
  - Not allowed: CHGIS, TGAZ, CCTS, CBDB, Seshat, ctext as data, CBETA/SAT as data, Rumsey.
  - Many rows are "unread"; the Japanese gazetteers are first to read.
- **Source register:** first written at `rfd/0002/SOURCE_REGISTER.adoc`, then moved at the user's request to **`docs/SOURCE_REGISTER.adoc`** with a `docs/README.adoc` index. It has eight grouped tables and a status column (allowed / conditional / unread / not allowed), and is linked from RFDs 1–4.
- The owner marked PR #16 ready. **PR #16 merged** about 06:40: "docs(rfd): record the Track 0 decisions and add the source register (#16)", commit 3841687.

### D. Renderer spike, region-scale phase (10-10 06:43 to 12:32)
- Branch **`spike/renderer-hero`**, **draft PR #17** opened 07:18 and subscribed. Shared scene contract in `spikes/renderer/shared/`, plus `serve.mjs` and the Playwright `capture.mjs` harness.
- Three implementations of the hero: Three.js r170 (own code), CesiumJS 1.145 (built by a delegated subagent), and a **Rust/wgpu 24 to wasm probe** (322 lines of Rust).
- Record **`rfd/0003/RENDERER_SPIKE.adoc`** with media under `rfd/0003/spike/`. HTML report artifact **https://claude.ai/artifact/JrBmZxfiiuH7kN9VbADFDY** ("Lekishi Renderer Spike"), versions 1 to 16 over the session.
- First proposal: Three.js, retire Cesium, keep Rust/wgpu as a future native option.
- **"Did you watch the videos yourself?"** The session admitted it had not. Five of six videos were broken: the real-time recorder caught only a few frames on the software GPU. It rebuilt the harness to capture frame by frame and fixed Cesium's playhead route. Frame rates are now reported as ranges, with a "Better" direction column ("Higher the better?": yes, for fps). It withdrew its claim that Cesium and Three.js tie.
- User: the globe must not be abandoned. The session **withdrew the region-scale proposal**, recorded the globe requirement in RFD 3, and defined a fair globe-to-local comparison. Rust/wgpu dropped out of that round.

### E. Globe phase (10-10 13:10 to 16:31)
- **One shared tileset** from `spikes/renderer/globe/build-tiles.py`:
  - Built from Terrarium elevation (AWS) and the Natural Earth II hue, as a geographic TMS.
  - Global coverage to L5, then nested to L11 over Satsuma (about 150 m).
  - Quantized-mesh terrain for Cesium and tilesjs, and 65×65 PNG height grids for the custom globe.
- Three globes: **Cesium** (subagent), **Three.js + 3d-tiles-renderer 0.5.3** (subagent), and a **custom Three.js quadtree globe** (373 lines).
- The agents found six defects in the tile builder, all fixed: mirrored pydelatin rows, clockwise winding, flat chords, octahedral-normal wrap, imagery seams and blue tint, and sea normals.
- Results (software GPU):

  | | Cesium | tilesjs | custom |
  |---|---|---|---|
  | Engine JS | 5.9 MB | 2.0 MB | 1.3 MB |
  | Load | 7.9 s | 5.2 s | 2.7 s |
  | Tiles | 872 | 1,185 | 2,012 |
  | Workarounds | private API for shadows | four adaptations | none |

- **Proposal:** the custom globe, borrowing GlobeControls from 3d-tiles-renderer, after a one-week follow-up spike. Two commits labelled "work in progress" were snapshots of the tilesjs page.

### F. Custom globe follow-up (10-10 18:21 to 21:23)
- Region-scale spike code removed ("clean up the initial eval"; it remains in history at `9337056`).
- New `spikes/renderer/globe/followup/` (globe.js, overlay.js, main.js, index.html, followup.json):
  - GlobeControls (drag, zoom to cursor, tilt) and picking with info cards.
  - A draped schematic polygon (薩摩国) and an arc (遣唐使, 平城京 to 揚州), both labelled as test shapes.
  - Real per-tile height bounds. The default detail target is 4.5 px; over the flight it fetched 424+424 tiles against Cesium's 440+432.
  - A `?bench=N` real-device mode.
- `serve.mjs` gained `HOST=0.0.0.0`. Evidence went to `rfd/0003/spike/globe/followup/`.
- Gaps recorded: no sky at low tilt, drags on labels, untested touch, twice the draw calls, outline thickening.

### G. Cloudflare preview testing and first hardware round (10-10 22:52 to 23:57)
- The user chose "Build tiles in preview". Implementation:
  - `build-tiles.py --custom` (heights and imagery only; numpy and Pillow).
  - New `spikes/renderer/globe/preview-build.mjs`, run from the `pnpm build` script, active only for preview builds via `CF_PAGES_BRANCH`.
  - Vendor files copied to `/spikes/vendor/`, with a placeholder page if tile generation fails.
  - The preview is about 13,700 files, under the 20k limit. Production `main` is unchanged.
- Preview URLs:
  - **https://spike-renderer-hero.lekishi.pages.dev/spikes/renderer/globe/followup/**
  - Bench: **`?bench=24`**
- Round 1 results: iPad passed the tablet thresholds (p95 30 ms, max 99). The iPhone was smoother (p95 21, max 74). The session noted the iPhone is high-end, so the mid-range phone was still missing.
- The owner marked PR #17 ready for review (about 23:57).
- **File-count concern:** the session offered three cuts:
  - drop the region-scale PoC media (93 to 69 files);
  - also drop Cesium and tilesjs (about 50 files);
  - pack the preview tiles (13,700 files to a few hundred).
  
  The user denied the question, so nothing was decided then.

### H. Remaining gaps, then all engine gaps closed (10-11 00:03 to 02:42)
- Gap list given in four groups:
  1. Engine fixes.
  2. Not yet measured: desktop, mid-range phone, gestures, Firefox/Safari, cold load, context loss.
  3. Integration into the atlas: SvelteKit/Vite bundling, the `entry.ts`/`AtlasRenderer` boundary, workspace-owned time, no module-scope browser access, idempotent disposal, re-doing the Firefox/Linux trackpad-pinch 5x amplification on GlobeControls, test coverage equal to `cesium-renderer.test.ts`, per-chapter tile pipeline within Cloudflare limits, real contract data, labels/CJK, keyboard.
  4. Owner decisions: the renderer, needing a new dated record superseding RFD 3's Cesium choice; tile hosting and file-count strategy.
- **Closed (commits eca82a7 through 461690f):**
  - Bordered heights (`heightb/`, 67×67) for seamless normals.
  - Tile-loading web workers (`tile-worker.js`) with cancellation.
  - LRU memory budget of 256 MB on desktop and 128 MB on touch (soft; evicts tiles stale for over 1.5 s).
  - Detail in CSS pixels, relaxed under a new haze. The iPad-shaped run went from 995 to 458 tiles.
  - Sky dome and FogExp2 haze.
  - Screen-space outlines; labels hit-tested from the canvas.
  - Instanced houses and merged ships: 61 draw calls against Cesium's 59.
  - Block-bounded raycasts, 7–30x faster.
  - Outward skirts (fixed a crack). WebGL context loss verified as recovering.
  - Distinct-tile counting.
- Custom globe vs Cesium: 396+396 tiles with none re-fetched (Cesium 440+432); 2.5 MB vs 4.4 MB transferred; 2.2 s vs 7.9 s load; 1.6 MB vs 5.9 MB engine JS.
- New record section "Custom globe engine gaps closed (2026-10-11)". Evidence in `rfd/0003/spike/globe/engine/`.

### I. Second hardware round (10-11 03:24 to 10-12 01:30)
- **iPad:** p95 dropped from 30 to 17 ms.
- **iPhone:** an 808 ms stall, traced to about 11 shader programs compiled mid-flight.
  - Fixed with a **shader warm-up** before the flight (`compileAsync`, rendering the shadowed transition, and pivot-mesh and tile-material probes). Commit cb5314f.
  - iPhone re-run: max 24 ms, 0.0% over 33 ms. iPad re-run: max 43 ms.
- **Desktop:**
  - Three runs fit the limits. Chrome on the 60 Hz screen had one unexplained 6,340 ms frame.
  - The session added bench diagnostics: page hidden, context lost, shaders during the flight, longest main-thread task, and where the worst frames fell.
  - Chrome re-runs were clean (max 23 ms and 13 ms). The first run stays recorded as unexplained and not recurring.
- **Mid-range Android:**
  - Full quality: p95 34.9 ms, 9.5% of frames over 33 ms. The 299 ms main-thread task came from the warm-up, before the flight.
  - The bench was fixed to keep every frame except the first; earlier rows dropped five frames, and the record says so.
  - Added `?quality=phone`.
  - Phone tier: p95 18.7 ms, 0.7% over 33 ms. So shadows and trees caused the slowdown, not tile streaming. This phone class needs the lighter tier.
- The session said the evidence was complete and nothing contradicted the custom-globe proposal.
- Housekeeping: another Claude session in the project had subscribed to PR #17's events, so this session re-subscribed at 01:30.

### J. Decision and cleanup (10-12 01:46 to 02:47)
- **Owner decision:** the custom route; clean up the other spikes; keep the investigation docs. He chose "Keep all media".
- Commits:
  - 5dde591: removed `globe/cesium/`, `globe/tilesjs/` and `globe/custom/`.
  - 9361e9b: `build-tiles.py` builds only the custom tiles. The output was byte-identical: 6,444 height tiles, 6,444 imagery tiles and `tileset.json`.
  - fd3b4a7: READMEs.
  - bcc9f0e: "docs(rfd): record the owner's choice of the custom globe". Adds a "Decision (2026-10-12)" section in RENDERER_SPIKE.adoc and the IMPLEMENTATION tick plus the next item.
- `shared/region/` was removed by mistake and then restored, since `make-diorama.py` needs it. Removed code lives in history at `8b54ac8`.
- PR #17 went from 103 to 96 files. Retitled **"feat(spike): renderer spike, decided on the custom globe"**. Artifact v16 published. All CI green on bcc9f0e.

### K. Close (10-12 05:05)
- The user said "PR merged". **PR #17 merged** as d1227be "feat(spike): renderer spike, decided on the custom globe (#17)".
- The session unsubscribed from PR #17 and deleted the last trigger, `trig_013mRa9HdwiKXLXoPHCvwEhX`.

### PRs
| PR | Title / purpose | Branch | Final state |
|---|---|---|---|
| #14 | Earlier treatment-comparison PR (Gate 2 evidence) | n/a | **Closed** by decision 10-10 03:53 (not merged) |
| #15 | RFD revision / roadmap reset ("docs(rfd): revise RFDs 1–4 around the content and visualization reset") | `docs/rfd-0005-roadmap-reset` | **Merged** about 10-10 05:52 (408d5e1) |
| #16 | "docs(rfd): record the Track 0 decisions and add the source register" | `docs/rfd2-track0-decisions` | **Merged** about 10-10 06:40 (3841687) |
| #17 | "feat(spike): renderer spike, decided on the custom globe" | `spike/renderer-hero` | **Merged** 10-12 before 05:05 (d1227be) |

### Artifacts
- https://claude.ai/artifact/9iGo5aGtJUiHd1CLmHLuLZ: UI mocks (Civ-style region, globe, diorama, handheld tier, 平城京), last version 7.
- https://claude.ai/artifact/JrBmZxfiiuH7kN9VbADFDY: renderer spike report, last version 16.

### Triggers and subscriptions
The session armed and cancelled many `send_later` safety-net check-ins, for PR #15 (trig_01BaKy…, trig_01JUuu…), PR #16 (trig_01MKz4…) and PR #17 (trig_0169D4…, trig_01D112…, trig_01DNRR…, trig_01N7pR…, trig_01LHzi…, trig_01Ub89…, trig_01Eyrk…, trig_017vii…, trig_01F1rq…, trig_01GsGP…, trig_01MH6M…, trig_0115DW…, trig_01CZx8…, trig_012Lss…, trig_01MYTF…, trig_01Ancv…, trig_01XMEu…, trig_013mRa…). The last one was deleted at 05:06 on 10-12. **No triggers or PR subscriptions remain active.**

---

## 3. Open items, follow-ups, deferred decisions and risks

**What the session last named as next** (10-12 05:06):
- Put the custom globe behind the `AtlasRenderer` boundary in place of the Cesium renderer. This means bundling through SvelteKit, its tiles, controls and picking, compiling shaders before the first flight, and a quality tier chosen up front or from measured frame times (the mid-range phone needs the lighter tier).
- This goes on a new branch from the latest `main`, "whenever you want to start it". **The user never answered.**

**Known gaps and consequences stated in the session:**
- The live atlas still renders with **Cesium**, and **AGENTS.md's Cesium guidance** still describes it. Both are to change when the custom globe is integrated. AGENTS.md rules that will need revisiting include "cesium-renderer.ts is the only module that imports Cesium", the Cesium runtime sync and static-build check, and the Firefox pinch amplification test.
- RFD 3's static architecture decision names Cesium. The session said switching needs a new dated decision record that supersedes it. The decision is recorded in `RENDERER_SPIKE.adoc` "Decision (2026-10-12)". Whether a separate superseding architecture record or a STATIC_ARCHITECTURE update is needed was not done explicitly.
- Falling back to Cesium would now mean restoring the quantized-mesh writer from history (commit `8b54ac8`).
- The integration work list (section H above): no module-scope browser access, idempotent disposal, re-doing the Firefox/Linux pinch amplification on GlobeControls with its tests, coverage equal to `cesium-renderer.test.ts`, the workspace owning time, mounting only via `entry.ts`.
- **Tiles in the shipped site:** a per-chapter terrain and basemap pipeline, packed within Cloudflare's 20,000-file and 25 MiB-per-file limits, with attribution visible. **Where tiles are hosted for the public release is undecided (owner).** Preview-tile packing (13,700 files to a few hundred) was offered but never done.
- Real data must replace the spike's schematic polygon and arc (`followup.json`). The diorama's trees and houses are precomputed for one region only. Also needed: label collision with CJK fonts, keyboard controls with focus, and picking that scales.
- Still untested: touch-gesture frame rates, desktop Safari, cold load on mobile networks. The single Chrome 6.3 s stall remains unexplained (it did not recur).
- The mid-range phone needs the phone tier; automatic quality selection from measured frame times was suggested.
- The early "How do you optimize these kind of apps?" question has no clearly delivered standalone answer in the transcript.

**Owner-gated or deferred decisions:**
- CHGIS: whether ever to ask for written permission (the session offered to draft the email). CCTS likewise. CBDB, Seshat and Rumsey deferred.
- Stage 3 of the contribution surface (Git-backed editor) needs an auth proxy, which is an owner decision under the no-provider rule.
- Publication remains owner-gated per AGENTS.md. Per-chapter approval for released content is still open (RFD 2 checklist).
- External deployment and paid providers need owner authorization (tile hosting).

**Roadmap as last recorded** (RFD 4 charter; RFD 1/2/3 checklists on `main`):
- **Track 0:** hero approved; PR #14 closed; authoring format decided; source rule and register done; renderer spike run; renderer decided 2026-10-12.
- **Track 1** ("The map worth looking at"; exit: the served Tang chapter beside its hero, owner-judged):
  - Integrate the custom globe; diorama renderer support; terrain and basemap pipelines; symbol library.
  - Labels with CJK; handheld PixiJS tier; pixel look; timeline strip.
  - Journey lines animated by the playhead; arcs; control-snapshot polygons; chrome diet; 平城京 local hero.
- **Track 2** ("The data worth exploring"; exit: the 753 voyage followable end to end with sources, Tang at 200+ events, Qin with control snapshots):
  - Read the unread register rows; build the record-file compiler with CI checks.
  - Replace city-centre anchors with cited coordinates (黃泗浦, 含元殿, 平城宮, 大宰府, …).
  - Publish the 753 voyage and the 754 overland leg as schematic links; first media set.
  - Tang: missions 630–894, 鑒眞 743–748, 圓仁 838–847. Qin: Han snapshots 233/230 BCE.
  - Migrate chapters and retire the digest ledger.
- **Release criteria:**
  - RC1: hero on desktop and a physical iPad.
  - RC2: journey followable, citations within two clicks.
  - RC3: traceability.
  - RC4: 3 s on a mid-range phone, 60 fps on desktop and iPad; accessibility.
  - RC5: rights.
  - RC6: as in RFD 4.

**Observation from the current local checkout** (not from the transcript): on `main` at d1227be, `rfd/0004/IMPLEMENTATION.adoc` Track 0 still shows three items unticked even though they were decided in this session:
- "Authoring format and per-chapter approval designed" (PR #16).
- "CHGIS and CBDB rights decided" (CHGIS not adopted, CBDB deferred; PR #16).
- "Renderer decided by the owner on that evidence" (custom globe, PR #17).

`rfd/0003/IMPLEMENTATION.adoc` does tick the decision. The RFD 4 checklist looks stale.

---

## 4. Final state at the end of the session

- 10-12 01:56: the session reported the custom globe as the chosen renderer, with the other spikes removed. The docs and all media are kept. PR #17 is down to 96 files and retitled. `pnpm verify` passes. A local preview build serves the custom globe cleanly. Not changed yet: the live atlas (still Cesium) and the AGENTS.md Cesium guidance.
- 01:59: the preview for bcc9f0e serves the real custom globe; `tileset.json` and sample L11 tiles return 200. Bench link unchanged.
- 02:28 and 02:47: all checks green on bcc9f0e (verify, e2e, Validate title, Cloudflare Pages), mergeable, no review threads. A check-in was re-armed for 06:48.
- 05:05: the user said "PR merged." 05:06 session reply: "With PR #17 merged, the custom globe decision, the spike record and all the evidence are now on `main`. I've unsubscribed from the PR's GitHub activity and cancelled the 06:48 UTC check-in. The next step in `rfd/0003/IMPLEMENTATION.adoc` is putting the custom globe behind the `AtlasRenderer` boundary in place of the Cesium renderer … That work would go on a new branch from the latest `main`, whenever you want to start it."
- 05:06:12, last message: "GitHub has now sent the merge event for PR #17 too, so it's closed. I had already unsubscribed and cancelled the check-in, so there's nothing left to do on it."
- End state: `main` at d1227be. No open PRs from this session. No active triggers or subscriptions. No pending user question. The globe integration is proposed but not started.
