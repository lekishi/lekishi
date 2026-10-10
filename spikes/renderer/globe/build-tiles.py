#!/usr/bin/env python3
"""Builds the shared globe tileset that every globe spike reads.

One elevation sampler feeds three outputs on the same geographic tiling
(EPSG:4326, TMS, two root tiles), so the engines are compared on identical data:

  tiles/terrain/{z}/{x}/{y}.terrain   quantized-mesh 1.0, simplified, with oct-encoded normals
                                      (Cesium and 3d-tiles-renderer)
  tiles/height/{z}/{x}/{y}.png        65x65 Terrarium-encoded heights (custom globe)
  tiles/imagery/{z}/{x}/{y}.jpg       256x256 painted imagery, unlit (all three)
  tiles/terrain/layer.json            terrain descriptor with per-level availability
  tiles/tileset.json                  the same availability for the imagery and the custom globe

Sources (all fetched once into .cache/, none shipped):
  Terrarium elevation tiles, AWS Open Data "Terrain Tiles" (Mapzen/Linux
  Foundation; attribution required): z4 globally, finer zooms over nested
  rectangles around the 753 voyage. Bathymetry is kept for sea colour; the
  terrain surface is clamped to sea level.
  Natural Earth II (public domain), as bundled with CesiumJS: the biome hue at
  every zoom, blurred so its baked relief shading does not double the engines'
  own lighting.

Coverage is nested so the tileset stays small: the whole Earth to level 5, the
East China Sea to level 8, southern Kyushu to level 10, and the Satsuma
peninsula to level 11 (about 150 m per terrain sample, the source resolution).

Usage: python3 -I spikes/renderer/globe/build-tiles.py [--only terrain|height|imagery] [--custom]

--custom writes only what the custom globe reads (heights, imagery and
tileset.json) and needs only numpy and Pillow: the meshing libraries are not
imported. Cloudflare preview builds use it (see preview-build.mjs); the heights
and imagery are the same files the full build writes.
"""
import io, json, math, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageFilter
from struct import pack

CUSTOM_ONLY = "--custom" in sys.argv
if not CUSTOM_ONLY:
    from pydelatin import Delatin
    from quantized_mesh_encoder import encode
    from quantized_mesh_encoder.extensions import ExtensionBase, ExtensionId, EXTENSION_HEADER, oct_encode
    from quantized_mesh_encoder.ecef import to_ecef
else:
    ExtensionBase = object   # the quantized-mesh extension class below is defined but never used

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
# Overridable so a build can be checked against another without touching tiles/.
CACHE = os.environ.get("LEKISHI_TILES_CACHE", os.path.join(HERE, ".cache"))
OUT = os.environ.get("LEKISHI_TILES_OUT", os.path.join(HERE, "tiles"))
NE2 = os.path.join(REPO, "node_modules/cesium/Build/Cesium/Assets/Textures/NaturalEarthII")
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
GRID = 65          # terrain samples per tile edge (Cesium's heightmap convention)
IMG = 256          # imagery pixels per tile edge

# Levels and the rectangle (west, south, east, north) each is built over.
LEVELS = {0: None, 1: None, 2: None, 3: None, 4: None, 5: None,
          6: (110, 20, 140, 45), 7: (110, 20, 140, 45), 8: (110, 20, 140, 45),
          9: (125, 26, 135, 35), 10: (128.5, 29.5, 132.5, 33.5),
          11: (129.5, 30.6, 131.2, 31.9)}
# Elevation source per zoom: the Terrarium zoom whose pixel matches the level's
# sample spacing, with the rectangle (plus margin) it is fetched over.
SOURCES = [(4, None), (7, (108, 18, 142, 47)), (8, (124, 25, 136, 36)),
           (9, (128, 29, 133, 34)), (11, (129.3, 30.4, 131.4, 32.1))]

def tile_bounds(z, x, y):
    s = 180.0 / (1 << z)
    return (-180 + x * s, -90 + y * s, -180 + (x + 1) * s, -90 + (y + 1) * s)

def tiles_for(z):
    nx, ny = 2 << z, 1 << z
    rect = LEVELS[z]
    if rect is None:
        return [(x, y) for x in range(nx) for y in range(ny)]
    s = 180.0 / (1 << z)
    x0, x1 = int((rect[0] + 180) // s), int((rect[2] + 180 - 1e-9) // s)
    y0, y1 = int((rect[1] + 90) // s), int((rect[3] + 90 - 1e-9) // s)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]

def availability():
    out = []
    for z in sorted(LEVELS):
        t = tiles_for(z)
        xs, ys = [a for a, _ in t], [b for _, b in t]
        out.append([{"startX": min(xs), "startY": min(ys), "endX": max(xs), "endY": max(ys)}])
    return out

# ---- elevation sources: Terrarium mosaics in Web Mercator pixel space ----
def merc(lon, lat, z):
    n = 256 * (1 << z)
    lat = np.clip(lat, -85.05112878, 85.05112878)
    r = np.radians(lat)
    return (lon + 180) / 360 * n, (1 - np.log(np.tan(r) + 1 / np.cos(r)) / math.pi) / 2 * n

def fetch(z, x, y):
    p = os.path.join(CACHE, "terrarium", str(z), str(x), f"{y}.png")
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(TERRARIUM.format(z=z, x=x, y=y), timeout=60).read()
                break
            except Exception:
                if attempt == 3: raise
                time.sleep(2 ** attempt)
        with open(p, "wb") as f: f.write(data)
    return p

class Source:
    def __init__(self, z, rect):
        n = 1 << z
        if rect is None:
            tx0, tx1, ty0, ty1 = 0, n - 1, 0, n - 1
        else:
            fx0, fy1 = merc(rect[0], rect[1], z); fx1, fy0 = merc(rect[2], rect[3], z)
            tx0, tx1 = int(fx0 // 256), int(fx1 // 256)
            ty0, ty1 = int(fy0 // 256), int(fy1 // 256)
        jobs = [(z, x, y) for x in range(tx0, tx1 + 1) for y in range(ty0, ty1 + 1)]
        with ThreadPoolExecutor(8) as ex: paths = list(ex.map(lambda j: fetch(*j), jobs))
        self.z, self.ox, self.oy = z, tx0 * 256, ty0 * 256
        self.e = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
        for (_, x, y), p in zip(jobs, paths):
            a = np.asarray(Image.open(p).convert("RGB"), np.float32)
            self.e[(y - ty0) * 256:(y - ty0 + 1) * 256, (x - tx0) * 256:(x - tx0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        self.deg_per_px = 360.0 / (256 * n)
        print(f"  source z{z}: {len(jobs)} tiles, mosaic {self.e.shape[1]}x{self.e.shape[0]}", flush=True)

    def covers(self, lon, lat):
        px, py = merc(lon, lat, self.z); px -= self.ox; py -= self.oy
        h, w = self.e.shape
        return (px >= 0.5) & (py >= 0.5) & (px <= w - 1.5) & (py <= h - 1.5)

    def sample(self, lon, lat):
        px, py = merc(lon, lat, self.z); px = px - self.ox - 0.5; py = py - self.oy - 0.5
        h, w = self.e.shape
        px = np.clip(px, 0, w - 1.001); py = np.clip(py, 0, h - 1.001)
        x0, y0 = np.floor(px).astype(int), np.floor(py).astype(int); fx, fy = px - x0, py - y0
        e = self.e
        return (e[y0, x0] * (1 - fx) + e[y0, x0 + 1] * fx) * (1 - fy) + (e[y0 + 1, x0] * (1 - fx) + e[y0 + 1, x0 + 1] * fx) * fy

SRC = []
def elevation(lon, lat, deg_per_sample):
    """Bilinear elevation from the coarsest source fine enough for the spacing,
    falling back to coarser sources where a finer one does not cover the point."""
    out = SRC[0].sample(lon, lat)
    for s in SRC[1:]:
        if s.deg_per_px > deg_per_sample * 1.6:
            m = s.covers(lon, lat)
            if m.any(): out = np.where(m, s.sample(lon, lat), out)
            continue
        m = s.covers(lon, lat)
        if m.any(): out = np.where(m, s.sample(lon, lat), out)
        break
    return out

# ---- terrain: quantized mesh with seamless normals ----
class Normals(ExtensionBase):
    """Oct-encoded normals computed on a grid one sample wider than the tile,
    so neighbouring tiles agree at their shared edge and lighting has no seams."""
    def __init__(self, normals): self.id = ExtensionId.VERTEX_NORMALS; self.normals = normals
    def encode(self):
        enc = oct_encode_snorm(self.normals).tobytes("C")
        return pack(EXTENSION_HEADER["extensionId"], self.id.value) + pack(EXTENSION_HEADER["extensionLength"], len(enc)) + enc

def oct_encode_snorm(v):
    """Oct-encodes unit normals to two bytes the way Cesium decodes them
    (AttributeCompression.octEncode: round((x * 0.5 + 0.5) * 255)). The
    encoder library floors * 256, which wraps a component of exactly +1 to 0
    and flips normals along the 0, 90 and 180 degree meridians."""
    l1 = np.abs(v).sum(1, keepdims=True)
    r = v[:, :2] / l1
    neg = v[:, 2] < 0
    sx, sy = np.where(r[:, 0] >= 0, 1.0, -1.0), np.where(r[:, 1] >= 0, 1.0, -1.0)
    x = np.where(neg, (1 - np.abs(r[:, 1])) * sx, r[:, 0]); y = np.where(neg, (1 - np.abs(r[:, 0])) * sy, r[:, 1])
    return np.round((np.clip(np.stack([x, y], 1), -1, 1) * 0.5 + 0.5) * 255).astype(np.uint8)

TRI = None
def grid_indices():
    global TRI
    if TRI is None:
        idx = []
        for r in range(GRID - 1):
            for c in range(GRID - 1):
                a = r * GRID + c; b = a + GRID
                idx += [a, a + 1, b, a + 1, b + 1, b]
        TRI = np.array(idx, np.uint32)
    return TRI

def heights_with_border(z, x, y):
    w, s, e, n = tile_bounds(z, x, y)
    step = (e - w) / (GRID - 1)
    lons = w + (np.arange(GRID + 2) - 1) * step
    lats = n - (np.arange(GRID + 2) - 1) * step      # row 0 = north
    LON, LAT = np.meshgrid(lons, lats)
    lat_c = np.clip(LAT, -90, 90)
    return LON, lat_c, np.maximum(elevation(LON, lat_c, step), 0.0)

def build_terrain(z, x, y):
    LON, LAT, H = heights_with_border(z, x, y)
    P = to_ecef(np.stack([LON.ravel(), LAT.ravel(), H.ravel()], 1).astype(np.float64)).reshape(GRID + 2, GRID + 2, 3)
    dx = P[1:-1, 2:] - P[1:-1, :-2]; dy = P[2:, 1:-1] - P[:-2, 1:-1]
    nrm = np.cross(dy, dx).reshape(-1, 3)
    up = to_ecef(np.stack([LON[1:-1, 1:-1].ravel(), LAT[1:-1, 1:-1].ravel(), np.zeros(GRID * GRID)], 1))
    up /= np.linalg.norm(up, axis=1, keepdims=True)
    l = np.linalg.norm(nrm, axis=1, keepdims=True); bad = (l[:, 0] < 1e-9)
    nrm = np.where(bad[:, None], up, nrm / np.maximum(l, 1e-12))
    nrm = np.where((np.sum(nrm * up, 1) < 0)[:, None], -nrm, nrm)
    # Sea is flat: a sea vertex beside a slope would otherwise carry the slope's
    # normal, and long simplified sea triangles smear it into dark streaks.
    nrm = np.where((H[1:-1, 1:-1].ravel() <= 0.5)[:, None], up, nrm)
    # Simplify the grid into a triangulated mesh within an error bound that
    # halves per level, as terrain services do (a tenth of Cesium's own
    # per-level geometric error); flat sea collapses to two triangles. The
    # custom globe keeps the full grid in the PNG below, by design.
    inner = H[1:-1, 1:-1]
    lon_i, lat_i = LON[1:-1, 1:-1], LAT[1:-1, 1:-1]
    # The simplifier sees heights plus the Earth's curvature below the tile's
    # tangent plane, so it also keeps the vertices a flat triangle would need
    # to stay within the error of the curved surface (otherwise flat sea tiles
    # collapse to chords that cut kilometres into the globe at coarse levels).
    P0 = to_ecef(np.stack([lon_i.ravel(), lat_i.ravel(), np.zeros(GRID * GRID)], 1)).reshape(GRID, GRID, 3)
    pc = P0[GRID // 2, GRID // 2]; nc = pc / np.linalg.norm(pc)
    dome = np.einsum("ijk,k->ij", P0 - pc, nc)
    tin = Delatin((inner + dome).astype(np.float64), max_error=max(0.5, 0.1 * 77067.0 / (1 << z)))
    # pydelatin's y counts rows from the bottom; the grid's row 0 is north.
    vc, vr = tin.vertices[:, 0].astype(int), (GRID - 1 - tin.vertices[:, 1]).astype(int)
    pos = np.stack([lon_i[vr, vc], lat_i[vr, vc], inner[vr, vc]], 1).astype(np.float64)
    nrm_v = nrm.reshape(GRID, GRID, 3)[vr, vc]
    buf = io.BytesIO()
    tri = tin.triangles.astype(np.int64)
    # Counter-clockwise in (east, north), as quantized-mesh expects (front faces).
    a, b, c = pos[tri[:, 0], :2], pos[tri[:, 1], :2], pos[tri[:, 2], :2]
    cw = ((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])) < 0
    tri[cw] = tri[cw][:, [0, 2, 1]]
    encode(buf, pos, tri.astype(np.uint32).ravel(), bounds=tile_bounds(z, x, y), sphere_method="naive", extensions=(Normals(nrm_v.astype(np.float64)),))
    p = os.path.join(OUT, "terrain", str(z), str(x), f"{y}.terrain")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f: f.write(buf.getvalue())
    write_height(z, x, y, H)
    return len(buf.getvalue())

def build_height(z, x, y):
    write_height(z, x, y, heights_with_border(z, x, y)[2])

def write_height(z, x, y, H):
    # The same heights for the custom globe, Terrarium-encoded (R*256 + G + B/256 - 32768).
    h = H[1:-1, 1:-1] + 32768
    rgb = np.stack([np.floor(h / 256), np.floor(h) % 256, np.floor((h % 1) * 256)], -1).astype(np.uint8)
    p = os.path.join(OUT, "height", str(z), str(x), f"{y}.png")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    Image.fromarray(rgb).save(p, optimize=True)

# ---- imagery: painted, unlit, seamless ----
NE2_IMG = None
def ne2():
    """Natural Earth II level 2 as an equirectangular hue map (2048x1024),
    blurred so its baked relief shading reads as colour only."""
    global NE2_IMG
    if NE2_IMG is None:
        im = Image.new("RGB", (2048, 1024))
        for x in range(8):
            for y in range(4):
                im.paste(Image.open(os.path.join(NE2, "2", str(x), f"{y}.jpg")).convert("RGB"), (x * 256, (3 - y) * 256))
        # The land hue is a mask-normalised blur of Natural Earth's land pixels,
        # extended outward from the nearest land, because land in our elevation
        # is often sea at Natural Earth's 20 km pixels (narrow peninsulas,
        # islands). A plain blur would tint coasts with the sea's blue.
        a = np.asarray(im, np.float32)
        land = ~((a[..., 2] > a[..., 0] + 12) & (a[..., 2] >= a[..., 1])) | (a.mean(-1) > 200)  # ice counts as land
        def blur(arr, r): return np.asarray(Image.fromarray(arr).filter(ImageFilter.GaussianBlur(r)), np.float32)
        def fill(r):
            w = blur((land * 255).astype(np.uint8), r) / 255.0
            c = np.stack([blur((a[..., i] * land).astype(np.uint8), r) for i in range(3)], -1)
            return c / np.maximum(w, 1e-4)[..., None], w
        near, wn = fill(2.2); far, wf = fill(12)
        hue = np.where((wn > 0.15)[..., None], near, np.where((wf > 0.02)[..., None], far, hexc("#6f9a4a")))
        NE2_IMG = np.clip(hue, 0, 255)
    return NE2_IMG

def ne2_at(lon, lat):
    a = ne2(); h, w = a.shape[:2]
    px = np.clip((lon + 180) / 360 * w - 0.5, 0, w - 1.001); py = np.clip((90 - lat) / 180 * h - 0.5, 0, h - 1.001)
    x0, y0 = px.astype(int), py.astype(int); fx, fy = (px - x0)[..., None], (py - y0)[..., None]
    return (a[y0, x0] * (1 - fx) + a[y0, x0 + 1] * fx) * (1 - fy) + (a[y0 + 1, x0] * (1 - fx) + a[y0 + 1, x0 + 1] * fx) * fy

def hexc(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
def hash2(x, y):
    s = np.sin(x * 127.1 + y * 311.7) * 43758.5453
    return s - np.floor(s)
def vnoise(x, y):
    x0, y0 = np.floor(x), np.floor(y); fx, fy = x - x0, y - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    return (hash2(x0, y0) * (1 - sx) + hash2(x0 + 1, y0) * sx) * (1 - sy) + (hash2(x0, y0 + 1) * (1 - sx) + hash2(x0 + 1, y0 + 1) * sx) * sy
def noise(lon, lat, scale):
    """Value noise keyed on absolute lon/lat, so every tile and zoom agrees."""
    return vnoise(lon * scale, lat * scale) * 0.6 + vnoise(lon * scale * 2.3 + 17, lat * scale * 2.3 + 5) * 0.4

def build_imagery(z, x, y):
    """Paints one tile so that every point gets the same colour at every level:
    the same rules apply worldwide (no per-level or per-region switches), sea
    depth and slope come from one fixed source, and detail finer than a pixel
    fades to its average instead of aliasing. Level seams would otherwise show
    wherever two imagery levels meet on screen."""
    w, s, e, n = tile_bounds(z, x, y)
    step = (e - w) / IMG
    lons = w + (np.arange(IMG + 2) - 0.5) * step
    lats = n - (np.arange(IMG + 2) - 0.5) * step
    LON, LAT = np.meshgrid(lons, lats); LAT = np.clip(LAT, -89.999, 89.999)
    E = elevation(LON, LAT, step)[1:-1, 1:-1]                 # coastline at full resolution
    COARSE = 0.011                                            # the z7 source where it exists, z4 elsewhere
    Ec = elevation(LON, LAT, COARSE)
    gy, gx = np.gradient(Ec, step * 111320.0)
    gx = gx / np.maximum(np.cos(np.radians(LAT)), 0.05)
    slope = np.hypot(gx, gy)[1:-1, 1:-1]
    Ec = Ec[1:-1, 1:-1]; LON = LON[1:-1, 1:-1]; LAT = LAT[1:-1, 1:-1]
    base = ne2_at(LON, LAT)
    # Vegetated land (Natural Earth's greens) takes the diorama's grass; arid and
    # icy land keeps its own hue. The same rule everywhere, at every level.
    green = np.clip((base[..., 1] - np.maximum(base[..., 0], base[..., 2]) + 6) / 30.0, 0, 1)[..., None]
    lum = base.mean(-1, keepdims=True)
    styl = np.clip((base - lum) * 1.25 + lum * 1.04, 0, 255)
    land = styl * (1 - 0.8 * green) + hexc("#7faf49") * 0.8 * green
    # Detail with a pixel-size fade: features of a given size fade to their mean
    # once a pixel is wider than half the feature.
    def fade(feature_deg): return float(np.clip((feature_deg / step - 2.0) / 2.0, 0, 1))
    f_field, f_tone = fade(1 / 55.0), fade(1 / 40.0)
    fn = noise(LON + 3.1, LAT - 7.7, 55.0)
    field = np.clip((fn - 0.52) / 0.12, 0, 1)
    field = (0.18 + (field - 0.18) * f_field)[..., None] * green * (Ec[..., None] < 160) * (slope[..., None] < 0.12)
    land = land * (1 - 0.5 * field) + hexc("#b7b65a") * 0.5 * field
    nz = (0.5 + (noise(LON, LAT, 40.0) - 0.5) * f_tone)[..., None]
    land = land * (1.12 - 0.3 * nz)
    rock = np.clip((slope[..., None] - 0.18) / 0.3, 0, 1) * 0.6
    land = land * (1 - rock) + hexc("#9b8a6c") * rock
    high = np.clip((Ec[..., None] - 900) / 1800, 0, 1) * 0.6
    land = land * (1 - high) + hexc("#a39377") * high
    sand = ((E > 0.5) & (E < 6))[..., None] * fade(0.004)
    land = land * (1 - sand) + hexc("#d8c48c") * sand
    depth = np.clip(-Ec, 0, None)[..., None]
    t = np.clip(depth / 1800.0, 0, 1) ** 0.55
    sea = hexc("#4aa3b8") * (1 - t) + hexc("#163f5c") * t
    ice = ((base.mean(-1) > 185) & (base.max(-1) - base.min(-1) < 45))[..., None]  # Natural Earth ice and snow
    col = np.where((E > 0.5)[..., None], np.where(ice, base, land), np.where(ice, base, sea))
    p = os.path.join(OUT, "imagery", str(z), str(x), f"{y}.jpg")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(p, quality=86, optimize=True)

def main():
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    t0 = time.time()
    print("fetching elevation sources", flush=True)
    for z, rect in SOURCES: SRC.append(Source(z, rect))
    os.makedirs(OUT, exist_ok=True)
    avail = availability()
    for z in sorted(LEVELS):
        jobs = tiles_for(z); t1 = time.time()
        if only in (None, "terrain", "height"):
            with ThreadPoolExecutor(4) as ex: list(ex.map(lambda j: (build_height if CUSTOM_ONLY else build_terrain)(z, *j), jobs))
        if only in (None, "imagery"):
            with ThreadPoolExecutor(4) as ex: list(ex.map(lambda j: build_imagery(z, *j), jobs))
        print(f"  level {z}: {len(jobs)} tiles in {time.time() - t1:.0f}s", flush=True)
    layer = {"tilejson": "2.1.0", "name": "lekishi-spike", "version": "1.0.0", "format": "quantized-mesh-1.0",
             "scheme": "tms", "projection": "EPSG:4326", "bounds": [-180, -90, 180, 90], "minzoom": 0, "maxzoom": max(LEVELS),
             "tiles": ["{z}/{x}/{y}.terrain?v={version}"], "extensions": ["octvertexnormals"], "available": avail,
             "attribution": "Elevation: Terrain Tiles on AWS Open Data (Mapzen and contributors). Imagery painted from it and Natural Earth II."}
    if not CUSTOM_ONLY:
        with open(os.path.join(OUT, "terrain", "layer.json"), "w") as f: json.dump(layer, f)
    tileset = {"scheme": "tms", "projection": "EPSG:4326", "terrainGrid": GRID, "imagerySize": IMG, "maxLevel": max(LEVELS),
               "available": avail, "levelRects": {str(z): LEVELS[z] for z in LEVELS},
               "imageryGroups": [{"minLevel": 0, "maxLevel": 5, "rect": None}, {"minLevel": 6, "maxLevel": 8, "rect": LEVELS[6]},
                                 {"minLevel": 9, "maxLevel": 9, "rect": LEVELS[9]}, {"minLevel": 10, "maxLevel": 10, "rect": LEVELS[10]},
                                 {"minLevel": 11, "maxLevel": 11, "rect": LEVELS[11]}],
               "attribution": layer["attribution"]}
    with open(os.path.join(OUT, "tileset.json"), "w") as f: json.dump(tileset, f, indent=1)
    print(f"done in {time.time() - t0:.0f}s", flush=True)

if __name__ == "__main__":
    main()
