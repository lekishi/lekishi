# Renderer spike

The renderer spike behind RFD 3: the hero scene, from the whole Earth down to
the diorama at 秋妻屋浦. The owner chose the custom Three.js globe on
2026-10-12; it is what remains here. The record is
`rfd/0003/RENDERER_SPIKE.adoc`. Nothing here ships in the artifact.

- `globe/`: the custom globe, its tileset builder and its harness (see
  `globe/README.md`).
- `serve.mjs`: a plain static server for the repository root on port 4300.

The engines it was compared with were removed after the decision; their
records and evidence stay in `rfd/0003/`, and their code is in the history:

- the region-scale phase (the diorama alone on Three.js, Cesium and a
  Rust/wgpu probe) at commit `9337056`;
- the globe phase (Cesium, Three.js with 3d-tiles-renderer, and the custom
  globe's first prototype on one shared tileset) at commit `8b54ac8`.
