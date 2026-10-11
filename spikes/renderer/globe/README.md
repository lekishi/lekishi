# Renderer spike, globe phase: one flight on three globes

The region-scale phase compared the diorama alone (its code is in the history
at commit `9337056`). The owner's
requirement is the globe: a reader explores an era across the whole Earth and
zooms freely from the globe to the diorama and back. This phase flies the same
path on three globes built from the same files, and measures them the same way.
The record is `rfd/0003/RENDERER_SPIKE.adoc`. Nothing here ships in the artifact.

| Spike | Directory | What it is |
| --- | --- | --- |
| Cesium | `cesium/` | CesiumJS with the shared quantized-mesh terrain (normals on) and the shared imagery |
| Three.js + 3d-tiles-renderer | `tilesjs/` | `TilesRenderer` with `QuantizedMeshPlugin` and an `XYZTilesOverlay` on the same files |
| Custom Three.js globe | `custom/` | A purpose-built quadtree globe reading the same heights and imagery |
| Custom globe follow-up | `followup/` | The custom globe as a module, with `GlobeControls`, picking, a draped polygon, an arc, tighter level of detail, and a real-device bench |

`custom/` is kept exactly as captured in the comparison; `followup/` is where
the custom globe continued.

## The shared tileset

`build-tiles.py` builds everything from open data into `tiles/` (generated,
ignored; about 200 MB):

- `tiles/terrain/` quantized-mesh 1.0, geographic TMS (EPSG:4326, two root
  tiles, y counts from the south), 65×65 grid per tile, with the
  `octvertexnormals` extension computed across tile borders so lighting has no
  seams. `layer.json` lists per-level availability.
- `tiles/height/{z}/{x}/{y}.png` the same 65×65 heights, Terrarium-encoded
  (`R*256 + G + B/256 - 32768`), row 0 north, for the custom globe.
- `tiles/imagery/{z}/{x}/{y}.jpg` 256×256 painted imagery on the same tiles
  (same z/x/y, TMS y), unlit: engines light it. Natural Earth II hue on the
  globe, the diorama palette by the peninsula.
- `tiles/tileset.json` the availability again, plus `imageryGroups`: imagery
  exists for levels 0–5 everywhere, 6–8 over the East China Sea, 9, 10 and 11
  over nested rectangles in southern Kyushu. Never request a tile outside
  them; a 404 counts as an error in the stats.

Heights are true metres with the sea clamped to 0. Every engine applies the
scene's vertical exaggeration (2.2) to terrain and symbols alike.

## The scene every spike draws

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

## The API every spike exposes

`window.spike` with:

- `ready`: resolves once the first globe view has rendered with its tiles;
- `fly(t)`: puts the camera at `cameraAt(scene.flight, t)` from `shared/flight.js`;
- `settled(ms)`: resolves `true` once no tile requests are pending and the
  frame has rendered, or `false` after `ms`;
- `setQuality('full' | 'phone')`: phone disables shadows and halves vegetation;
- `stats()`: `{ fps, frameMs, drawCalls, triangles, memoryMB, loadMs, bundleKB,
  tilesLoaded, traffic }`, where `traffic` is `tileTraffic()` from `shared/flight.js`.

## Running

    python3 -I spikes/renderer/globe/build-tiles.py          # once, a few minutes
    python3 -I spikes/renderer/globe/shared/make-diorama.py  # already committed output
    node spikes/renderer/serve.mjs                           # serves the repo on :4300
    open http://127.0.0.1:4300/spikes/renderer/globe/cesium/
    node spikes/renderer/globe/capture.mjs cesium            # → spikes/renderer/globe/out/cesium/

## The follow-up

`followup/` answers the four questions the globe phase left open for the
custom globe. It speaks the same `window.spike` API, so `capture.mjs followup`
captures it like the others, and adds:

- `pick(x, y)`, `screenOf(lon, lat, h)`, `arcScreen(i)` and `explore()` for
  scripted interaction; `followup/capture-interaction.mjs` drives real mouse
  input through them and writes `out/followup/interaction.mp4` and the pick
  stills;
- `?sse=N` to set the level-of-detail target (pixels of geometric error);
- `?bench=N` to play the flight in real time for N seconds and report frame
  times on the device in hand, with what could explain a long frame: the page
  hidden, a lost WebGL context, shaders compiled during the flight, the longest
  main-thread task, and where in the flight the worst frames fell.

On any device, from the PR's Cloudflare Pages preview: preview builds (never
`main`) run `preview-build.mjs` at the end of `pnpm build`, which generates the
heights and imagery with `build-tiles.py --custom` and copies the page in, so it
is served at

    https://<branch>.lekishi.pages.dev/spikes/renderer/globe/followup/
    https://<branch>.lekishi.pages.dev/spikes/renderer/globe/followup/?bench=24

`LEKISHI_SPIKE_PREVIEW=1 pnpm build` does the same locally.

Real devices on the same network, without the preview:

    HOST=0.0.0.0 node spikes/renderer/serve.mjs              # listens on the LAN
    open http://<this machine's address>:4300/spikes/renderer/globe/followup/?bench=24

The report box has a Copy button; paste it into the record.
