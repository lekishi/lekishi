#!/usr/bin/env python3
"""Builds the atlas globe's tiles from open data, as the artifact ships them.

The renderer spike's builder (spikes/renderer/globe/build-tiles.py) made one
file per tile and per layer; this one paints the same heights and imagery and
packs them so a deploy stays far under the host's file limit:

  static/globe/tileset.json        levels, per-level availability, attribution
  static/globe/b/root.bin          the two level-0 tiles
  static/globe/b/{z}/{x}/{y}.bin   the children (level z+1) of tile z/x/y
  static/globe/ATTRIBUTION.txt     the elevation sources' required attribution

A bundle holds the four children of one tile because the globe refines a tile
into all four of its children at once and draws none of them until all four
have arrived (src/lib/atlas/renderer/globe/tiles.ts): one request per
refinement, and no tile fetched that would not have been fetched anyway.
Children outside the built coverage are left out; the globe subdivides their
parent's heights instead.

Each tile in a bundle is its 67x67 bordered heights (PNG, Terrarium-encoded,
R*256 + G + B/256 - 32768, row 0 north: the 65x65 grid plus a one-sample border
so normals are seamless across tile edges) and its 256x256 unlit imagery
(JPEG). The bundle layout is `src/lib/atlas/renderer/globe/bundle.ts`'s, which
documents it; `scripts/check-static-build.mjs` reads a bundle back to check it.

Coverage: the whole Earth to level 5 (about 5.6 degrees per tile), and levels
6 and 7 (about 0.6 km per imagery pixel) over the published chapters' extent,
107-140 E and 22-40 N with a margin, which covers 長安 to 平城京 and the Qin
chapter's 新鄭. A chapter beyond it needs its own rectangle here. Level 8
(about 0.3 km per pixel) covers the same extent, and levels 9 and 10 (down to
about 76 m per pixel) a box around each place the chapters draw, where a
reader zooms in; a new place needs its point in PLACES.

Sources (fetched once into .cache/globe/, none shipped):
  Terrarium elevation tiles, AWS Open Data "Terrain Tiles" (Mapzen and the
  sources in ATTRIBUTION below; attribution required): z4 globally, z7 and
  z9 over the chapters' extent, and z10 around each place. Bathymetry is kept for the sea's colour; the terrain
  surface is clamped to sea level.
  Natural Earth II (public domain), the level-2 tiles vendored in
  scripts/globe/natural-earth-ii/: the biome hue outside the land cover, blurred so its
  baked relief shading does not double the globe's own lighting.
  ESA WorldCover 2021 v200 (CC BY 4.0; attribution required), its 300 m
  overview over the 3-degree squares around the chapters and its 75 m overview
  around each place, read block by block from ESA's public bucket: the land's
  colour there, at every level.

Usage: python3 -I scripts/globe/build-tiles.py
Needs only numpy and Pillow; `scripts/sync-globe-tiles.mjs` runs it (with a
private virtual environment if the system Python lacks them) when the builder
or its inputs change.
"""
import io, json, math, multiprocessing, os, shutil, struct, time, urllib.error, urllib.request, zlib
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
CACHE = os.environ.get("LEKISHI_GLOBE_CACHE", os.path.join(REPO, ".cache", "globe"))
OUT = os.environ.get("LEKISHI_GLOBE_OUT", os.path.join(REPO, "static", "globe"))
NE2 = os.path.join(HERE, "natural-earth-ii")
TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
GRID = 65          # terrain samples per tile edge
IMG = 256          # imagery pixels per tile edge

def tile_range(z, rect):
    """The tiles of level z that a rectangle touches, as (x0, y0, x1, y1)."""
    s = 180.0 / (1 << z)
    return (int((rect[0] + 180) // s), int((rect[1] + 90) // s),
            int((rect[2] + 180 - 1e-9) // s), int((rect[3] + 90 - 1e-9) // s))

# The published chapters' extent (west, south, east, north) with a margin.
CHAPTERS = (107, 22, 140, 40)
# The points the chapters draw (lon, lat), rounded: a reader zooms in on these,
# so the finest levels are built around them and nowhere else. They are where
# detail is wanted, not historical claims; the records hold the positions.
# Places closer than a box apart share their boxes' tiles.
PLACES = {
    "xinzheng": (113.72, 34.40), "yingchuan": (113.47, 34.15), "yunyang": (108.81, 34.64),
    "hanyuan-hall": (108.96, 34.29), "yangzhou": (119.44, 32.39), "huangsipu": (120.62, 31.30),
    "ajinawa": (127.95, 26.48), "yaku": (130.53, 30.36), "tane": (130.98, 30.57),
    "akimeya": (130.23, 31.27), "ishigaki": (130.49, 31.24), "dazaifu": (130.52, 33.51),
    "murozaki": (135.94, 33.59), "naniwa": (135.50, 34.69), "heijo-palace": (135.80, 34.69),
    "todaiji": (135.84, 34.69), "toshodaiji": (135.78, 34.68),
}
# How far around each place (degrees) a fine level reaches: the finer the level,
# the closer the camera that asks for it, so the less ground it has to cover.
FINE_RADIUS = {9: 0.6, 10: 0.4}
def boxes(r): return [(lon - r, lat - r, lon + r, lat + r) for lon, lat in PLACES.values()]
def merged(rects):
    """Overlapping rectangles joined into their bounding boxes, so places close
    together share one elevation mosaic instead of fetching and holding it twice."""
    rects = list(rects)
    while True:
        for i in range(len(rects)):
            for j in range(i + 1, len(rects)):
                a, b = rects[i], rects[j]
                if a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]:
                    rects[i] = (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))
                    del rects[j]
                    break
            else:
                continue
            break
        else:
            return rects
def snapped(z, rect, margin):
    """A rectangle grown to the bounds of the level-z tiles it touches, plus a margin."""
    s = 180.0 / (1 << z)
    x0, y0, x1, y1 = tile_range(z, rect)
    return (-180 + x0 * s - margin, -90 + y0 * s - margin, -180 + (x1 + 1) * s + margin, -90 + (y1 + 1) * s + margin)
# Levels and the rectangles each is built over (None: the whole Earth).
LEVELS = {0: None, 1: None, 2: None, 3: None, 4: None, 5: None, 6: [CHAPTERS], 7: [CHAPTERS], 8: [CHAPTERS],
          **{z: boxes(r) for z, r in FINE_RADIUS.items()}}
FINE = 8  # the first level painted from the fine sources, with inland detail
# Elevation sources: the Terrarium zoom whose pixel matches the level's sample
# spacing, the rectangle (plus margin) it is fetched over, and the lowest level
# it serves. z9 and z10 serve the fine levels only, so every level below
# paints exactly as it did before they existed and still matches its
# neighbours. z9 covers level 8's extent and z10 every level-9 tile built (the
# coarser of the place levels reaches furthest), each with a margin for the
# imagery's one-pixel border.
SOURCES = [(4, None, 0), (7, (CHAPTERS[0] - 2, CHAPTERS[1] - 2, CHAPTERS[2] + 2, CHAPTERS[3] + 2), 0),
           (9, snapped(8, CHAPTERS, 0.05), FINE)] + \
    [(10, b, min(FINE_RADIUS)) for b in merged(snapped(9, b, 0.05) for b in boxes(FINE_RADIUS[9]))]

# The attribution the Terrain Tiles require, as listed by the Joerd attribution
# guide (github.com/tilezen/joerd/blob/master/docs/attribution.md, read
# 2026-10-12), plus Natural Earth's by convention.
ATTRIBUTION = """Globe elevation: Terrain Tiles on AWS Open Data (Mapzen and contributors).
* ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and
  funded under National Science Foundation awards 1043681, 1559691, and 1542736;
* Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;
* Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM)
  Österreich;
* Canada terrain data contains information licensed under the Open Government
  Licence – Canada;
* Europe terrain data produced using Copernicus data and information funded by the
  European Union - EU-DEM layers;
* Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration
* Mexico terrain data source: INEGI, Continental relief, 2016;
* New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New
  Zealand and the New Zealand Government (All rights reserved);
* Norway terrain data © Kartverket;
* United Kingdom terrain data © Environment Agency copyright and/or database right
  2015. All rights reserved;
* United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data
  courtesy of the U.S. Geological Survey.

Globe land cover: ESA WorldCover 2021 v200, © ESA WorldCover project 2021 /
Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover
consortium. Licensed under CC BY 4.0 (creativecommons.org/licenses/by/4.0/).
Modified: classes grouped and painted as colours, built-up land painted as
cropland, resampled to the globe's tiles.

Globe imagery: painted for Lekishi from that elevation, that land cover and
Natural Earth II (public domain).
"""
SHORT_ATTRIBUTION = "Elevation: Terrain Tiles on AWS Open Data (Mapzen and contributors). Land cover: ESA WorldCover 2021 (CC BY 4.0). Imagery painted from them and Natural Earth II."

def tile_bounds(z, x, y):
    s = 180.0 / (1 << z)
    return (-180 + x * s, -90 + y * s, -180 + (x + 1) * s, -90 + (y + 1) * s)

def ranges(z):
    if LEVELS[z] is None:
        return [(0, 0, (2 << z) - 1, (1 << z) - 1)]
    return sorted({tile_range(z, rect) for rect in LEVELS[z]})

def tiles_for(z):
    return sorted({(x, y) for x0, y0, x1, y1 in ranges(z) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)})

def availability():
    """Per level, the tile ranges built: one for a whole-Earth or chapter level,
    one per place box for a fine one (the client accepts any of them)."""
    return [[{"startX": x0, "startY": y0, "endX": x1, "endY": y1} for x0, y0, x1, y1 in ranges(z)]
            for z in sorted(LEVELS)]

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

def despiked(e, limit):
    """Replaces needles: a sample more than `limit` metres above the fourth
    highest of the 24 around it (or below the fourth lowest) takes their median.
    Terrarium carries such needles at some coasts and in the sea, alone or two
    or three abreast: 5,310 m beside sea-level samples in the z7 mosaic, 728 m
    at the shore of 秋妻屋浦 at z10. Drawn exaggerated, each is a dark wedge on
    the sea. The limit is one pixel's width (a 45-degree slope on every side
    at once), and never under 150 m, so real summits and cliffs stand."""
    r, h, w = 2, *e.shape
    p = np.pad(e, r, mode="edge")
    out = e.copy()
    count = 0
    for top in range(0, h, 256):  # in bands: the 24 neighbours of a whole mosaic do not fit in memory
        rows = min(256, h - top)
        around = np.stack([p[top + r + dy:top + r + dy + rows, r + dx:r + dx + w]
                           for dy in range(-r, r + 1) for dx in range(-r, r + 1) if dy or dx])
        # The fourth lowest and fourth highest of the 24, without a full sort.
        ranked = np.partition(around, (3, 20), axis=0)
        band = e[top:top + rows]
        needle = (band > ranked[20] + limit) | (band < ranked[3] - limit)
        if needle.any():
            out[top:top + rows][needle] = np.median(around[:, needle], axis=0)
        count += int(needle.sum())
    print(f"    {count} needles replaced", flush=True)
    return out

class Source:
    def __init__(self, z, rect, min_level):
        n = 1 << z
        if rect is None:
            tx0, tx1, ty0, ty1 = 0, n - 1, 0, n - 1
        else:
            fx0, fy1 = merc(rect[0], rect[1], z); fx1, fy0 = merc(rect[2], rect[3], z)
            tx0, tx1 = int(fx0 // 256), int(fx1 // 256)
            ty0, ty1 = int(fy0 // 256), int(fy1 // 256)
        jobs = [(z, x, y) for x in range(tx0, tx1 + 1) for y in range(ty0, ty1 + 1)]
        self.z, self.ox, self.oy, self.min_level = z, tx0 * 256, ty0 * 256, min_level
        self.e = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
        def place(job):  # fetched and decoded in threads: Pillow's decoder releases the GIL
            _, x, y = job
            a = np.asarray(Image.open(fetch(*job)).convert("RGB"), np.float32)
            self.e[(y - ty0) * 256:(y - ty0 + 1) * 256, (x - tx0) * 256:(x - tx0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        with ThreadPoolExecutor(8) as ex: list(ex.map(place, jobs))
        self.deg_per_px = 360.0 / (256 * n)
        if rect is not None:  # the whole-Earth z4 is too coarse for a needle to show
            # One pixel's width at the chapters' latitudes (about 30 degrees north).
            self.e = despiked(self.e, max(150.0, self.deg_per_px * 111320 * math.cos(math.radians(30))))
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
def elevation(lon, lat, deg_per_sample, level):
    """Bilinear elevation from the coarsest source fine enough for the spacing,
    falling back to coarser sources where a finer one does not cover the point.
    The sources of one zoom are one layer (z10 is fetched as a few boxes), and
    only the sources that serve the tile's level are used."""
    out = SRC[0].sample(lon, lat)
    for z in sorted({s.z for s in SRC[1:] if s.min_level <= level}):
        layer = [s for s in SRC[1:] if s.z == z and s.min_level <= level]
        for s in layer:
            m = s.covers(lon, lat)
            if m.any(): out = np.where(m, s.sample(lon, lat), out)
        if layer[0].deg_per_px <= deg_per_sample * 1.6:
            break
    return out

# ---- land cover: ESA WorldCover 2021 ----
# WorldCover is a 10 m land-cover map in plain latitude and longitude (the tiles'
# own grid), published as one cloud-optimised GeoTIFF per 3-degree square with
# overviews at 2 to 64 times its pixel (about 19 to 590 m). The builder reads
# only the overview blocks it needs, with HTTP range requests, and caches them
# (about 26 MB for the chapters); no GDAL needed.
# It is today's land cover: built-up land is painted as the cropland that
# surrounds it, since a modern city says nothing about the eighth century.
WORLDCOVER = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{name}_Map.tif"
COVER_EXTENT = (105, 21, 141, 42)   # the 3-degree squares around the chapters' extent
COVER_FADE = 1.0                    # degrees over which it gives way to Natural Earth at its edge
# Classes grouped by how they are painted: (WorldCover codes, colour).
COVER_GROUPS = [
    ((10,), "#4e7d37"),       # tree cover
    ((95,), "#3f7046"),       # mangroves
    ((20,), "#80994d"),       # shrubland
    ((30,), "#93b255"),       # grassland
    ((40, 50), "#adb35f"),    # cropland, and built-up land painted as cropland
    ((90,), "#6f9a68"),       # herbaceous wetland
    ((60, 100), "#bba982"),   # bare or sparse vegetation, moss and lichen
    ((70,), "#eef0f0"),       # snow and ice
    ((80,), "#4aa3b8"),       # permanent water
]
COVER_WATER = len(COVER_GROUPS) - 1
COVER_GREEN = [0, 1, 2, 3, 4, 5]    # the vegetated groups, which take the relief's forest and field shading

def cover_file(name):
    """The header of one WorldCover square and a reader for its overview blocks,
    or None where ESA publishes no square (open sea)."""
    d = os.path.join(CACHE, "worldcover", name); os.makedirs(d, exist_ok=True)
    url = WORLDCOVER.format(name=name)
    def get(a, n, path):
        if os.path.exists(path):
            with open(path, "rb") as f: return f.read()
        for attempt in range(4):
            try:
                data = urllib.request.urlopen(urllib.request.Request(url, headers={"Range": f"bytes={a}-{a + n - 1}"}), timeout=60).read()
                break
            except urllib.error.HTTPError as err:
                if err.code in (403, 404): return None
                if attempt == 3: raise
                time.sleep(2 ** attempt)
            except Exception:
                if attempt == 3: raise
                time.sleep(2 ** attempt)
        with open(path, "wb") as f: f.write(data)
        return data
    absent = os.path.join(d, "absent")
    if os.path.exists(absent): return None
    head = get(0, 1 << 17, os.path.join(d, "head"))
    if head is None:
        open(absent, "w").close(); return None
    # A classic little-endian TIFF: each image file directory is one overview,
    # 1024-pixel tiles of Deflate-compressed palette indices (the class codes).
    levels, off = [], struct.unpack_from("<I", head, 4)[0]
    while off:
        n = struct.unpack_from("<H", head, off)[0]; tags = {}
        for k in range(n):
            tag, typ, cnt = struct.unpack_from("<HHI", head, off + 2 + 12 * k)
            size = {3: 2, 4: 4}.get(typ, 1) * cnt; at = off + 2 + 12 * k + 8
            at = at if size <= 4 else struct.unpack_from("<I", head, at)[0]
            if typ in (3, 4): tags[tag] = struct.unpack_from("<" + ("H" if typ == 3 else "I") * cnt, head, at)
        assert tags[259] == (8,) and tags[322] == (1024,), f"{name}: unexpected TIFF layout"
        levels.append((tags[256][0], tags[324], tags[325]))
        off = struct.unpack_from("<I", head, off + 2 + 12 * n)[0]
    def block(size, bx, by):
        lvl = next(i for i, l in enumerate(levels) if l[0] == size)
        _, offs, counts = levels[lvl]; k = by * ((size + 1023) // 1024) + bx
        data = get(offs[k], counts[k], os.path.join(d, f"{size}-{k}.zz"))
        return np.frombuffer(zlib.decompress(data), np.uint8).reshape(1024, 1024)
    return block

class Cover:
    """WorldCover classes over a rectangle at one overview (`size` pixels per
    3-degree square), as one mosaic, row 0 north."""
    def __init__(self, size, rect, min_level):
        w, s, e, n = rect
        lon0, lat0 = int(w // 3) * 3, int(s // 3) * 3
        lon1, lat1 = int(math.ceil(e / 3)) * 3, int(math.ceil(n / 3)) * 3
        self.deg_per_px, self.min_level = 3.0 / size, min_level
        # Whole pixels around the rectangle, so a tile inside it reads no padding.
        px0, px1 = int((w - lon0) / self.deg_per_px), int(math.ceil((e - lon0) / self.deg_per_px))
        py0, py1 = int((lat1 - n) / self.deg_per_px), int(math.ceil((lat1 - s) / self.deg_per_px))
        self.west, self.north = lon0 + px0 * self.deg_per_px, lat1 - py0 * self.deg_per_px
        self.c = np.zeros((py1 - py0, px1 - px0), np.uint8)       # 0: no data
        jobs = []
        for sq_lat in range(lat0, lat1, 3):
            for sq_lon in range(lon0, lon1, 3):
                name = f"{'N' if sq_lat >= 0 else 'S'}{abs(sq_lat):02d}{'E' if sq_lon >= 0 else 'W'}{abs(sq_lon):03d}"
                gx, gy = (sq_lon - lon0) * size // 3, (lat1 - 3 - sq_lat) * size // 3   # the square's corner in the grid
                for by in range((size + 1023) // 1024):
                    for bx in range((size + 1023) // 1024):
                        x0, y0 = gx + bx * 1024, gy + by * 1024
                        if x0 + 1024 > px0 and x0 < px1 and y0 + 1024 > py0 and y0 < py1:
                            jobs.append((name, size, bx, by, x0, y0))
        readers = {}
        def place(job):
            name, size, bx, by, x0, y0 = job
            if name not in readers: readers[name] = cover_file(name)
            if readers[name] is None: return
            b = readers[name](size, bx, by)
            w_ = min(1024, size - bx * 1024); h_ = min(1024, size - by * 1024)
            b = b[:h_, :w_]
            ax0, ay0 = max(x0, px0), max(y0, py0); ax1, ay1 = min(x0 + w_, px1), min(y0 + h_, py1)
            if ax0 < ax1 and ay0 < ay1:
                self.c[ay0 - py0:ay1 - py0, ax0 - px0:ax1 - px0] = b[ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0]
        for name in sorted({j[0] for j in jobs}): readers[name] = cover_file(name)
        with ThreadPoolExecutor(8) as ex: list(ex.map(place, jobs))
        self.groups = None
        print(f"  land cover {3 / size * 111320:.0f} m: {len({j[0] for j in jobs})} squares, mosaic {self.c.shape[1]}x{self.c.shape[0]}", flush=True)

    def covers(self, w, s, e, n):
        h, wd = self.c.shape
        return w >= self.west and n <= self.north and e <= self.west + wd * self.deg_per_px and s >= self.north - h * self.deg_per_px

    def pyramid(self):
        """Group fractions at 2, 4, 8... times the pixel size, each the area mean
        of the one below, so a coarse tile shows the same mean colour as the
        finer tiles inside it and no level seams appear."""
        if self.groups is None:
            h, w = self.c.shape
            # One group at a time, so only one full-size mask exists at once.
            cur = [np.asarray(Image.fromarray(np.isin(self.c, codes).astype(np.uint8) * 255).resize((w // 2, h // 2), Image.BOX))
                   for codes, _ in COVER_GROUPS]
            levels = [None, cur]   # level 0 is the class mosaic itself
            while min(cur[0].shape) > 64:
                h, w = cur[0].shape
                cur = [np.asarray(Image.fromarray(g).resize((w // 2, h // 2), Image.BOX)) for g in cur]
                levels.append(cur)
            self.groups = levels
        return self.groups

    def mean_land(self, lon, lat):
        """The mean colour of the land classes over about 0.34 degrees (the scale
        of Natural Earth's blurred hue), bilinear, with how much of it is known
        land. Painting land cover relative to this mean keeps each region's
        Natural Earth colour on average, so the globe shows no rectangle where the
        land cover starts and coarse levels look as before."""
        if not hasattr(self, "_mean"):
            pyr = self.pyramid(); k = min(7, len(pyr) - 1)
            g = np.stack(pyr[k], -1).astype(np.float32) / 255.0
            land = np.delete(g, COVER_WATER, -1); rgb = np.delete(COVER_RGB, COVER_WATER, 0)
            amount = land.sum(-1)
            self._mean = ((land @ rgb) / np.maximum(amount, 1e-6)[..., None], amount, self.deg_per_px * self.c.shape[1] / g.shape[1])
        mean, amount, scale = self._mean
        h, w = amount.shape
        px = np.clip((lon - self.west) / scale - 0.5, 0, w - 1.001); py = np.clip((self.north - lat) / scale - 0.5, 0, h - 1.001)
        x0, y0 = px.astype(int), py.astype(int); fx, fy = px - x0, py - y0
        def bil(a):
            f = (lambda v: v[..., None]) if a.ndim == 3 else (lambda v: v)
            return (a[y0, x0] * f(1 - fx) + a[y0, x0 + 1] * f(fx)) * f(1 - fy) + (a[y0 + 1, x0] * f(1 - fx) + a[y0 + 1, x0 + 1] * f(fx)) * f(fy)
        return bil(mean), bil(amount)

    def fractions(self, w, s, e, n, size):
        """The area fraction of each group in every pixel of a size x size tile
        over (w, s, e, n); outside the mosaic and where there is no data the
        fractions are zero, so their sum is how much of the pixel is known."""
        k = 0
        if (e - w) / size >= self.deg_per_px * 2:
            k = min(int(math.log2((e - w) / size / self.deg_per_px)), len(self.pyramid()) - 1)
        if k == 0:
            src = self.c; scale = self.deg_per_px
        else:
            src = self.pyramid()[k]; h, wd = src[0].shape
            scale = self.deg_per_px * self.c.shape[1] / wd   # its pixels are the mosaic's, 2^k at a time
        fx0, fx1 = (w - self.west) / scale, (e - self.west) / scale
        fy0, fy1 = (self.north - n) / scale, (self.north - s) / scale
        ix0, iy0, ix1, iy1 = int(math.floor(fx0)), int(math.floor(fy0)), int(math.ceil(fx1)), int(math.ceil(fy1))
        H, W = (src.shape if k == 0 else src[0].shape)
        cx0, cy0, cx1, cy1 = max(ix0, 0), max(iy0, 0), min(ix1, W), min(iy1, H)
        out = np.zeros((size, size, len(COVER_GROUPS)), np.float32)
        if cx0 >= cx1 or cy0 >= cy1: return out
        box = (fx0 - ix0, fy0 - iy0, fx1 - ix0, fy1 - iy0)
        for g, (codes, _) in enumerate(COVER_GROUPS):
            win = np.zeros((iy1 - iy0, ix1 - ix0), np.float32)
            win[cy0 - iy0:cy1 - iy0, cx0 - ix0:cx1 - ix0] = np.isin(src[cy0:cy1, cx0:cx1], codes) if k == 0 else src[g][cy0:cy1, cx0:cx1] / 255.0
            out[..., g] = np.asarray(Image.fromarray(win, "F").resize((size, size), Image.BOX, box=box))
        return out

# Land cover (pixels per 3-degree square, rectangle, first level): about 300 m
# over the chapters' squares for every level, and about 75 m around the places
# for levels 9 and 10, the same boxes the z10 elevation is fetched for.
COVER_SOURCES = [(1125, COVER_EXTENT, 0)] + [(4500, b, min(FINE_RADIUS)) for b in merged(snapped(9, b, 0.05) for b in boxes(FINE_RADIUS[9]))]

COVERS = []
def land_cover(z, w, s, e, n, size):
    """Group fractions for one tile, from the finest cover that serves its level
    and holds the whole tile, else from the coarsest (which may hold part)."""
    step = (e - w) / size
    for c in sorted(COVERS, key=lambda c: c.deg_per_px):
        if c.min_level <= z and c.deg_per_px <= step * 1.6 and c.covers(w, s, e, n):
            return c.fractions(w, s, e, n, size)
    return max(COVERS, key=lambda c: c.deg_per_px).fractions(w, s, e, n, size)

# ---- heights: the tile grid plus a one-sample border ----
def heights_with_border(z, x, y):
    w, s, e, n = tile_bounds(z, x, y)
    step = (e - w) / (GRID - 1)
    lons = w + (np.arange(GRID + 2) - 1) * step
    lats = n - (np.arange(GRID + 2) - 1) * step      # row 0 = north
    LON, LAT = np.meshgrid(lons, lats)
    lat_c = np.clip(LAT, -90, 90)
    return LON, lat_c, np.maximum(elevation(LON, lat_c, step, z), 0.0)

def height_png(z, x, y):
    """Terrarium-encoded (R*256 + G + B/256 - 32768) PNG bytes, keeping the
    one-sample border the grid was sampled with, so a tile's edge normals see
    its neighbours."""
    h = heights_with_border(z, x, y)[2] + 32768
    rgb = np.stack([np.floor(h / 256), np.floor(h) % 256, np.floor((h % 1) * 256)], -1).astype(np.uint8)
    out = io.BytesIO()
    Image.fromarray(rgb).save(out, "PNG", optimize=True)
    return out.getvalue()

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
COVER_RGB = np.array([hexc(c) for _, c in COVER_GROUPS], np.float32)
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

def gaussian(a, sigma):
    """A separable Gaussian blur of a float array (Pillow's blurs take bytes only)."""
    r = max(1, int(math.ceil(3 * sigma)))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    for axis in (0, 1):
        p = np.pad(a, [(r, r) if i == axis else (0, 0) for i in (0, 1)], mode="edge")
        n = a.shape[axis]
        a = sum(k[i] * (p[i:i + n] if axis == 0 else p[:, i:i + n]) for i in range(2 * r + 1))
    return a

DETAIL_DEG = 0.015   # hills and valleys narrower than this (about 1.6 km) mark the ground
def inland_detail(land, z, w, n, step, LON, LAT, green, fade, invented):
    """The fine levels' inland ground. Its colour comes from Natural Earth's
    20 km pixels, so without this the land is smooth blobs however close the
    camera comes. Ground above its surroundings darkens towards forest and
    ground below them (valley floors) lightens towards fields, from the fine
    elevation; a mottle at two finer scales follows. Every term is zero on
    average over a few kilometres and fades in with the pixel size, as the
    coarser detail does, so level 8 keeps level 7's colours where a view shows
    both. The elevation is read over a margin wider than the blur, so a tile's
    edge agrees with its neighbour's."""
    blur = DETAIL_DEG / step
    m = int(math.ceil(3 * blur)) + 1
    lons = w + (np.arange(IMG + 2 * m) - m + 0.5) * step
    lats = n - (np.arange(IMG + 2 * m) - m + 0.5) * step
    LONm, LATm = np.meshgrid(lons, lats)
    Em = np.maximum(elevation(LONm, np.clip(LATm, -89.999, 89.999), step, z), 0)
    above = np.tanh((Em - gaussian(Em, blur)) / 40.0)[m:m + IMG, m:m + IMG]
    shade = above[..., None] * np.array([-0.30, -0.17, -0.30]) * fade(DETAIL_DEG)
    mottle = (noise(LON + 11.3, LAT - 4.1, 150.0) - 0.5) * 0.16 * fade(1 / 150.0) + \
        (noise(LON - 2.9, LAT + 8.6, 420.0) - 0.5) * 0.12 * fade(1 / 420.0)
    # The mottle is invented texture: it stands in for land cover only where
    # there is none (`invented` is 1 there and 0 where WorldCover paints).
    return land * (1 + (shade + mottle[..., None] * invented) * green)

SPECK_DEG = 0.0015  # low ground narrower than this (about 150 m) is not drawn as water
BEACH_DEG = 0.003   # how far (about 300 m) sand reaches inland from water
def low_ground(w, n, step, z):
    """Water and beach for the finest levels. The elevation steps in whole metres,
    and deltas and coastal plains lie a few metres above the sea, so thresholds on
    height alone paint them as blocks of sand with specks of water wherever a
    pixel is finer than the elevation's own step (蘇州 and 難波 at levels 9 and 10).
    Water is instead what most of a small neighbourhood is low enough to be, and
    sand needs water nearby. Coarser pixels than SPECK_DEG keep the plain height
    rule, so the levels below are painted exactly as before. The neighbourhood is
    read over a margin, so a tile's edge agrees with its neighbour's."""
    blur = BEACH_DEG / step
    m = int(math.ceil(3 * blur)) + 1
    lons = w + (np.arange(IMG + 2 * m) - m + 0.5) * step
    lats = n - (np.arange(IMG + 2 * m) - m + 0.5) * step
    LONm, LATm = np.meshgrid(lons, lats)
    Em = elevation(LONm, np.clip(LATm, -89.999, 89.999), step, z)
    water = gaussian((Em <= 0.5).astype(np.float32), SPECK_DEG / step) > 0.5
    near = gaussian(water.astype(np.float32), blur)
    inner = (slice(m, m + IMG), slice(m, m + IMG))
    beach = np.clip((near[inner] - 0.04) / 0.1, 0, 1) * (Em[inner] < 6)
    return water[inner], beach

def imagery_jpeg(z, x, y):
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
    E = elevation(LON, LAT, step, z)[1:-1, 1:-1]                 # coastline at full resolution
    COARSE = 0.011                                            # the z7 source where it exists, z4 elsewhere
    Ec = elevation(LON, LAT, COARSE, z)
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
    # Around the chapters, WorldCover paints the land: each pixel is the area mean
    # of its classes' colours, so every level shows the same colour for the same
    # ground. `real` is how much of a pixel it paints (none where it has no data,
    # fading out at its edge); the rest keeps Natural Earth's hue and the noise
    # that stands in for land cover where there is none.
    # Detail with a pixel-size fade: features of a given size fade to their mean
    # once a pixel is wider than half the feature.
    def fade(feature_deg): return float(np.clip((feature_deg / step - 2.0) / 2.0, 0, 1))
    # Faded in from level 5, as other detail is: the whole-Earth levels keep their
    # look, and the land cover's own edge never shows from afar.
    inside = w < COVER_EXTENT[2] and e > COVER_EXTENT[0] and s < COVER_EXTENT[3] and n > COVER_EXTENT[1]
    if inside and fade(0.066) > 0:
        cover = land_cover(z, w, s, e, n, IMG)
        known = cover.sum(-1)
        edge = np.minimum.reduce([LON - COVER_EXTENT[0], COVER_EXTENT[2] - LON, LAT - COVER_EXTENT[1], COVER_EXTENT[3] - LAT])
        real = (np.clip(known, 0, 1) * np.clip(edge / COVER_FADE, 0, 1) * fade(0.066))[..., None]
    else:  # nothing to paint: every term below reduces to the Natural Earth painting
        cover = np.zeros((IMG, IMG, len(COVER_GROUPS)), np.float32); known = cover.sum(-1)
        real = np.zeros((IMG, IMG, 1), np.float32)
    share = cover / np.maximum(known, 1e-6)[..., None]
    # The land classes' colour relative to their regional mean, applied to
    # Natural Earth's hue: forest darker and greener, fields lighter and
    # yellower than the region around them, the region itself unchanged.
    dry_share = np.delete(share, COVER_WATER, -1); amount = dry_share.sum(-1, keepdims=True)
    here = (dry_share @ np.delete(COVER_RGB, COVER_WATER, 0)) / np.maximum(amount, 1e-6)
    mean, mean_amount = COVERS[0].mean_land(LON, LAT)
    # Clipped so a lone field among forest does not glare.
    tinted = land * np.clip(here / np.maximum(mean, 1.0), 0.65, 1.3)
    real_land = real * (amount > 0.05) * (mean_amount[..., None] > 0.05)
    land = land * (1 - real_land) + np.clip(tinted, 0, 255) * real_land
    green = green * (1 - real) + share[..., COVER_GREEN].sum(-1, keepdims=True) * real
    wet = (share[..., COVER_WATER] > 0.5) & (real[..., 0] > 0.5)
    f_field, f_tone = fade(1 / 55.0), fade(1 / 40.0)
    fn = noise(LON + 3.1, LAT - 7.7, 55.0)
    field = np.clip((fn - 0.52) / 0.12, 0, 1)
    field = (0.18 + (field - 0.18) * f_field)[..., None] * green * (Ec[..., None] < 160) * (slope[..., None] < 0.12) * (1 - real)
    land = land * (1 - 0.5 * field) + hexc("#b7b65a") * 0.5 * field
    nz = (0.5 + (noise(LON, LAT, 40.0) - 0.5) * f_tone)[..., None]
    land = land * (1.12 - 0.3 * nz)
    if z >= FINE:
        land = inland_detail(land, z, w, n, step, LON, LAT, green, fade, 1 - real)
    rock = np.clip((slope[..., None] - 0.18) / 0.3, 0, 1) * 0.6
    land = land * (1 - rock) + hexc("#9b8a6c") * rock
    high = np.clip((Ec[..., None] - 900) / 1800, 0, 1) * 0.6
    land = land * (1 - high) + hexc("#a39377") * high
    if step <= SPECK_DEG:
        water, beach = low_ground(w, n, step, z)
        dry, sand = ~water, (beach * ~water)[..., None] * fade(0.004)
    else:
        dry, sand = E > 0.5, ((E > 0.5) & (E < 6))[..., None] * fade(0.004)
    land = land * (1 - sand) + hexc("#d8c48c") * sand
    depth = np.clip(-Ec, 0, None)[..., None]
    t = np.clip(depth / 1800.0, 0, 1) ** 0.55
    sea = hexc("#4aa3b8") * (1 - t) + hexc("#163f5c") * t
    ice = ((base.mean(-1) > 185) & (base.max(-1) - base.min(-1) < 45))[..., None]  # Natural Earth ice and snow
    dry = dry & ~wet   # rivers and lakes the elevation does not show
    col = np.where(dry[..., None], np.where(ice, base, land), np.where(ice, base, sea))
    out = io.BytesIO()
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(out, "JPEG", quality=86, optimize=True)
    return out.getvalue()

# ---- bundles ----
# Layout (little-endian), mirrored by src/lib/atlas/renderer/globe/bundle.ts:
#   "LKGB", u16 version (1), u16 tile count n,
#   n entries of 20 bytes: u8 z, 3 bytes zero, u32 x, u32 y, u32 height bytes,
#     u32 imagery bytes,
#   then each tile's height PNG followed by its imagery JPEG, in entry order.
MAGIC, VERSION = b"LKGB", 1

def bundle(tiles):
    head = MAGIC + struct.pack("<HH", VERSION, len(tiles))
    entries = b"".join(struct.pack("<B3xIIII", z, x, y, len(h), len(i)) for (z, x, y), (h, i) in tiles)
    return head + entries + b"".join(h + i for _, (h, i) in tiles)

def write(rel, data):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f: f.write(data)

def paint(job):
    return height_png(*job), imagery_jpeg(*job)

def main():
    t0 = time.time()
    print("globe tiles: fetching elevation sources", flush=True)
    for z, rect, min_level in SOURCES: SRC.append(Source(z, rect, min_level))
    for size, rect, min_level in COVER_SOURCES: COVERS.append(Cover(size, rect, min_level))
    for c in COVERS: c.pyramid()   # before forking, so the workers share it
    COVERS[0].mean_land(np.zeros(1), np.zeros(1))
    # Start from an empty output so a tile the coverage no longer includes
    # cannot linger in the artifact.
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    built = {}
    ne2()
    # Painting is numpy and Python in about equal parts, so threads would share
    # one interpreter lock: forked workers inherit the sources loaded above
    # (copy on write) and paint on every core.
    with multiprocessing.get_context("fork").Pool(os.cpu_count() or 2) as pool:
        for z in sorted(LEVELS):
            jobs = [(z, x, y) for x, y in tiles_for(z)]; t1 = time.time()
            out = pool.map(paint, jobs, chunksize=4)
            built.update(zip(jobs, out))
            print(f"  level {z}: {len(jobs)} tiles in {time.time() - t1:.0f}s", flush=True)
    # One bundle per tile that has built children, plus the roots'.
    groups = {}
    for (z, x, y), data in sorted(built.items()):
        key = "root" if z == 0 else (z - 1, x // 2, y // 2)
        groups.setdefault(key, []).append(((z, x, y), data))
    total = 0
    for key, tiles in groups.items():
        data = bundle(tiles); total += len(data)
        write("b/root.bin" if key == "root" else f"b/{key[0]}/{key[1]}/{key[2]}.bin", data)
    write("ATTRIBUTION.txt", ATTRIBUTION.encode("utf-8"))
    tileset = {"format": "lekishi-globe-bundles", "version": VERSION, "scheme": "tms", "projection": "EPSG:4326",
               "terrainGrid": GRID, "borderedGrid": GRID + 2, "imagerySize": IMG, "maxLevel": max(LEVELS),
               "available": availability(), "levelRects": {str(z): LEVELS[z] for z in LEVELS},
               "tiles": len(built), "bundles": len(groups), "bytes": total,
               "attribution": SHORT_ATTRIBUTION, "attributionFile": "ATTRIBUTION.txt"}
    with open(os.path.join(OUT, "tileset.json"), "w") as f: json.dump(tileset, f, indent=1)
    print(f"globe tiles: {len(built)} tiles in {len(groups)} bundles, {total / 1048576:.1f} MB, in {time.time() - t0:.0f}s", flush=True)

if __name__ == "__main__":
    main()
