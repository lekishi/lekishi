# Natural Earth II, level 2

The 32 level-2 tiles (256 × 256 JPEG, geographic TMS, row 0 at the south) of
the Natural Earth II raster that CesiumJS 1.145.0 bundled under
`Build/Cesium/Assets/Textures/NaturalEarthII/2/`, copied byte for byte. Their
source is `NE2_HR_LC_SR_W_DR` (recoloured), Natural Earth, public domain.

They are a build input only: `scripts/globe/build-tiles.py` (and the renderer
spike's builder) blur them into the biome hue that the painted globe imagery
starts from. Nothing here is served. They were vendored when the custom globe
replaced Cesium, so the tile build no longer depends on the Cesium package.
