# Renderer spike: the hero on three engines

Three implementations of the same scene, RFD 1's approved hero (the second
ship's landfall at 秋妻屋浦 on 753-12-20): one on CesiumJS, one on a custom
Three.js scene, and a Rust/wgpu probe compiled to wasm to size up a custom
engine. All three are measured the same way. The globe phase, which flies from the
whole Earth down to this scene on three globes, is in `globe/`. RFD 3 names this spike; the report that records
the result is `rfd/0003/RENDERER_SPIKE.adoc`. Nothing here ships in the
artifact.

## The scene both must draw

`shared/scene.json` is the contract. Both spikes read the same heightmap
(`shared/height.png`, 16-bit elevation encoded as R*256+G-1000, metres, with
`height.json` for the extent) and the same painted terrain texture
(`shared/terrain-color.jpg`, made by `shared/paint-texture.py`), and draw:

- the terrain mesh, vertically exaggerated by the factor in the spec, lit by
  one warm directional sun with shadows plus a hemisphere fill, with fog;
- water at sea level, translucent over the painted seabed;
- scattered symbolic forest: conifers and broadleaf trees placed by the same
  rule (elevation band, slope limit, noise threshold, drop fraction, seed);
- symbolic houses at the villages the spec lists, placed on land near each
  point with the spec's seed;
- two schematic 遣唐使船 (hull, deck, cabin, two masts, sails, flag) at the
  positions and headings given, and a dashed route for the second ship;
- labels in the chapter's script, with romanized small caps, at the places;
- the same camera: target, offset, and field of view from the spec.

## The API both must expose

`window.spike` with:

- `ready`: a Promise resolved after the first full render;
- `orbit(t)`: camera around the target by `t * 360` degrees at constant tilt;
- `playhead(t)`: move ship 2 along the route from its start to the landfall;
- `setQuality('full' | 'phone')`: phone disables shadows and halves vegetation;
- `stats()`: `{ fps, frameMs, drawCalls, triangles, memoryMB, loadMs, bundleKB }`.

The harness (`capture.mjs`) drives these to take the same screenshots, record
the same videos, and collect the same numbers for each spike.

## Running

    node spikes/renderer/serve.mjs            # serves the repo root on :4300
    open http://127.0.0.1:4300/spikes/renderer/three/
    open http://127.0.0.1:4300/spikes/renderer/cesium/
    open http://127.0.0.1:4300/spikes/renderer/wgpu/      # after spikes/renderer/wgpu/build.sh

    node spikes/renderer/capture.mjs three    # screenshots, videos, stats → spikes/renderer/out/three/
    node spikes/renderer/capture.mjs cesium
    node spikes/renderer/capture.mjs wgpu

The harness needs an `ffmpeg` with libx264 on PATH (or `FFMPEG=/path/to/ffmpeg`)
to assemble the captured frames into MP4. Videos are built frame by frame
(set the API, wait two animation frames, screenshot) because real-time screen
recording loses the motion on a software GPU; on this container that takes
several seconds a frame. The Rust probe needs the `wasm32-unknown-unknown`
target and `wasm-bindgen-cli` 0.2.100 (`build.sh` lists both); its build output
(`target/`, `pkg/`) is generated and ignored.

The container that produced the report renders through a software GPU, so its
frame times are relative. Run the pages on real devices and read the
overlay in the top-left corner for the numbers that matter.
