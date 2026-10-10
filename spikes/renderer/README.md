# Renderer spike

The renderer spike behind RFD 3: the hero scene, from the whole Earth down to
the diorama at 秋妻屋浦, flown on three globes built from the same files. The
record is `rfd/0003/RENDERER_SPIKE.adoc`. Nothing here ships in the artifact.

- `globe/`: the globe phase and its follow-up (protocol in `globe/README.md`).
- `serve.mjs`: a plain static server for the repository root on port 4300.

The region-scale phase that came first (the diorama alone on Three.js,
Cesium and a Rust/wgpu probe) was removed once the globe phase superseded it.
Its record and evidence stay in `rfd/0003/`; its code is in the history at
commit `9337056`.
