# Renderer spike: the custom globe

The owner's requirement is the globe: a reader explores an era across the
whole Earth and zooms freely from the globe to the diorama and back. The
spike compared three globes on the same files, and the owner chose the custom
Three.js globe on 2026-10-12. `followup/` is that globe: a quadtree of tiles
loaded in workers, `GlobeControls` from 3d-tiles-renderer for the camera,
picking, a draped polygon, a relationship arc, and a real-device bench. The
record is `rfd/0003/RENDERER_SPIKE.adoc`. Nothing here ships in the artifact.

The other globes (Cesium, Three.js with 3d-tiles-renderer) and the custom
globe's first prototype are in the history at commit `8b54ac8`; their evidence
stays in `rfd/0003/spike/`.

## The tileset

`build-tiles.py` builds the tiles from open data into `tiles/` (generated,
ignored; about 80 MB) with only numpy and Pillow:

- `tiles/heightb/{z}/{x}/{y}.png` 67×67 heights, Terrarium-encoded
  (`R*256 + G + B/256 - 32768`), row 0 north, geographic TMS (EPSG:4326, two
  root tiles, y counts from the south): each tile's 65×65 grid plus a
  one-sample border, so normals are seamless across tile edges.
- `tiles/imagery/{z}/{x}/{y}.jpg` 256×256 painted imagery on the same tiles,
  unlit: the globe lights it. Natural Earth II hue on the globe, the diorama
  palette by the peninsula.
- `tiles/tileset.json` per-level availability, plus `imageryGroups`: imagery
  exists for levels 0–5 everywhere, 6–8 over the East China Sea, 9, 10 and 11
  over nested rectangles in southern Kyushu. Never request a tile outside
  them; a 404 counts as an error in the stats.

Heights are true metres with the sea clamped to 0. The globe applies the
scene's vertical exaggeration (2.2) to terrain and symbols alike.

## The scene

`shared/scene.json` and `shared/diorama.json`:

- the globe with terrain and imagery, a dark space background, an atmosphere
  rim, the sun fixed in Earth-fixed space (`shared/flight.js` `sunDirection`);
- the voyage route as a dashed line across the sea, readable from the globe to
  the diorama;
- labels in the chapter's script with romanized small caps, each shown only
  between its `minRangeM` and `maxRangeM` of camera range;
- below `diorama.showBelowRangeM`, the diorama from the region-scale phase:
  4,162 trees (conifer cone or broadleaf ball on a trunk), 25 houses, and the
  two ships, at the positions in `diorama.json` and `scene.json`, sizes in the
  region spike's units times 100 metres (symbolic, not to scale).

## The spike API

`window.spike` with:

- `ready`: resolves once the first globe view has rendered with its tiles;
- `fly(t)`: puts the camera at `cameraAt(scene.flight, t)` from `shared/flight.js`;
- `settled(ms)`: resolves `true` once no tile requests are pending and the
  frame has rendered, or `false` after `ms`;
- `setQuality('full' | 'phone')`: phone disables shadows and halves vegetation;
- `stats()`: `{ fps, frameMs, drawCalls, triangles, memoryMB, loadMs, bundleKB,
  tilesLoaded, traffic, ... }`;
- `pick(x, y)`, `screenOf(lon, lat, h)`, `arcScreen(i)` and `explore()` for
  scripted interaction.

## Running

    python3 -I spikes/renderer/globe/build-tiles.py          # once, a few minutes
    python3 -I spikes/renderer/globe/shared/make-diorama.py  # already committed output
    node spikes/renderer/serve.mjs                           # serves the repo on :4300
    open http://127.0.0.1:4300/spikes/renderer/globe/followup/
    node spikes/renderer/globe/capture.mjs                   # stills, flight video, stats → out/followup/
    node spikes/renderer/globe/followup/capture-interaction.mjs   # real mouse input → out/followup/interaction.mp4

Query parameters:

- `?sse=N` to set the level-of-detail target (pixels of geometric error);
- `?bench=N` to play the flight in real time for N seconds and report frame
  times on the device in hand, with what could explain a long frame: the page
  hidden, a lost WebGL context, shaders compiled during the flight, the longest
  main-thread task, and where in the flight the worst frames fell;
- `?quality=phone` to start in the lighter tier (half the trees, no shadows),
  for example `?bench=24&quality=phone` to bench a phone in both tiers.

On any device, from the PR's Cloudflare Pages preview: preview builds (never
`main`) run `preview-build.mjs` at the end of `pnpm build`, which generates the
heights and imagery with `build-tiles.py` and copies the page in, so it
is served at

    https://<branch>.lekishi.pages.dev/spikes/renderer/globe/followup/
    https://<branch>.lekishi.pages.dev/spikes/renderer/globe/followup/?bench=24

`LEKISHI_SPIKE_PREVIEW=1 pnpm build` does the same locally.

Real devices on the same network, without the preview:

    HOST=0.0.0.0 node spikes/renderer/serve.mjs              # listens on the LAN
    open http://<this machine's address>:4300/spikes/renderer/globe/followup/?bench=24

The report box has a Copy button; paste it into the record.
