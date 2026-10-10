import json, math, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

GEO = "geo"  # fetched open data, see README
OUT = "."

def merc_y(lat):  # lat deg -> mercator unit [0,1] from top
    r = math.radians(lat); return (1 - math.log(math.tan(r) + 1/math.cos(r)) / math.pi) / 2
def merc_x(lon): return (lon + 180) / 360

def load_tiles(z, xs, ys, d):
    rows = []
    for y in ys:
        row = []
        for x in xs:
            im = np.asarray(Image.open(f"{GEO}/{d}/{x}_{y}.png").convert("RGB"), dtype=np.float64)
            row.append(im[:, :, 0] * 256 + im[:, :, 1] + im[:, :, 2] / 256 - 32768)
        rows.append(np.concatenate(row, axis=1))
    return np.concatenate(rows, axis=0)

def box_blur(a, r):
    if r <= 0: return a
    k = 2 * r + 1
    p = np.pad(a, r, mode="edge")
    c = np.cumsum(p, axis=0); c = np.concatenate([np.zeros((1, c.shape[1])), c])
    a = (c[k:] - c[:-k]) / k
    c = np.cumsum(a, axis=1); c = np.concatenate([np.zeros((c.shape[0], 1)), c], axis=1)
    return (c[:, k:] - c[:, :-k]) / k
def blur(a, r): return box_blur(box_blur(box_blur(a, r), r), r)

def hex2rgb(h): return np.array([int(h[i:i+2], 16) for i in (1, 3, 5)], dtype=np.float64)
def ramp(v, stops):  # v array, stops [(value, hex)]
    vals = np.array([s[0] for s in stops]); cols = np.stack([hex2rgb(s[1]) for s in stops])
    out = np.zeros(v.shape + (3,))
    for c in range(3): out[..., c] = np.interp(v, vals, cols[:, c])
    return out

LAND = [(0, "#8db75c"), (120, "#9fbd5b"), (350, "#b3b75e"), (700, "#b9a35c"), (1200, "#a98a56"),
        (1900, "#95735a"), (2800, "#8c7b70"), (3600, "#b9b1a6"), (4800, "#efede6")]
OCEAN_DEEP = hex2rgb("#17455f"); OCEAN_MID = hex2rgb("#245f7c"); OCEAN_SHELF = hex2rgb("#3d8aa6"); OCEAN_SHALLOW = hex2rgb("#73b9c7")

def hillshade(E, mpp, exag=2.6, az=315, alt=42):
    Es = blur(E, 1)
    gy, gx = np.gradient(Es * exag, mpp)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    azr, altr = math.radians(az), math.radians(alt)
    sh = np.sin(altr) * np.cos(slope) + np.cos(altr) * np.sin(slope) * np.cos(azr - aspect)
    return np.clip(sh, 0, 1)

def noise(shape, seed=3):
    rng = np.random.default_rng(seed)
    n = blur(rng.random(shape), 4) * 0.35 + blur(rng.random(shape), 10) * 0.35 + blur(rng.random(shape), 22) * 0.3
    n = (n - n.mean()) / (n.std() + 1e-9)
    return n

def project_rings(geojson, proj, W, H, bbox_filter=None):
    """Yield (ring_pts, is_hole) for every ring of every polygon."""
    for f in geojson["features"]:
        g = f["geometry"]; polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for i, ring in enumerate(poly):
                lons = [p[0] for p in ring]; lats = [p[1] for p in ring]
                if bbox_filter and (max(lons) < bbox_filter[0] or min(lons) > bbox_filter[2] or max(lats) < bbox_filter[1] or min(lats) > bbox_filter[3]):
                    continue
                pts = [proj(p[0], p[1]) for p in ring]
                yield pts, i > 0

def paint(E, land_mask, mpp, rivers=None, lakes=None, coast_rings=None, scale_small=False):
    H, W = E.shape
    sh = hillshade(E, mpp)
    n = noise(E.shape)
    land_col = ramp(np.clip(E, 0, 5000) + n * 40, LAND)
    light = 0.62 + 0.55 * sh + n * 0.025
    land_col = land_col * light[..., None]
    # painterly: slight posterize of lighting
    D = np.clip(-E, 0, 6000)
    t = np.clip(D / 2500, 0, 1) ** 0.6
    ocean = OCEAN_SHELF[None, None, :] * (1 - t)[..., None] + OCEAN_DEEP[None, None, :] * t[..., None]
    shelf = np.clip(1 - D / 180, 0, 1) ** 1.5
    if scale_small: shelf = np.where(D < 1.5, 0.0, shelf); t = np.where(D < 1.5, 0.55, t); ocean = OCEAN_SHELF[None, None, :] * (1 - t)[..., None] + OCEAN_DEEP[None, None, :] * t[..., None]
    ocean = ocean * (1 - shelf[..., None] * 0.6) + OCEAN_SHALLOW[None, None, :] * (shelf[..., None] * 0.6)
    # coastal halo from the land mask
    halo = blur(land_mask.astype(np.float64), 4 if scale_small else 9)
    halo = np.clip(halo * 1.6, 0, 1) * (1 - land_mask)
    ocean = ocean * (1 - halo[..., None] * 0.45) + hex2rgb("#9fd2d8")[None, None, :] * (halo[..., None] * 0.45)
    ocean = ocean * (1 + n[..., None] * 0.03)
    m = land_mask[..., None]
    img = land_col * m + ocean * (1 - m)
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(im, "RGBA")
    if lakes:
        for pts, hole in lakes:
            if len(pts) > 2: draw.polygon(pts, fill=(93, 160, 182, 255) if not hole else None)
    if rivers:
        for pts, w in rivers:
            if len(pts) > 1: draw.line(pts, fill=(78, 150, 176, 220), width=w, joint="curve")
    def segments(pts):
        W2 = im.size[0] / 2; cur = [pts[0]]
        for p in pts[1:] + [pts[0]]:
            if abs(p[0] - cur[-1][0]) > W2: 
                if len(cur) > 1: yield cur
                cur = [p]
            else: cur.append(p)
        if len(cur) > 1: yield cur
    if coast_rings:
        for pts, hole in coast_rings:
            for seg in segments(pts):
                draw.line(seg, fill=(214, 236, 236, 110), width=5 if not scale_small else 3)
        for pts, hole in coast_rings:
            for seg in segments(pts):
                draw.line(seg, fill=(44, 58, 48, 150), width=2 if not scale_small else 1)
    return im

# ---------- Region: z6 tiles x52-57 y24-27 ----------
Z = 6; XS = range(52, 58); YS = range(24, 28)
E = load_tiles(Z, XS, YS, "tiles6")
n = 2 ** Z
mos_x0, mos_y0 = 52 / n, 24 / n  # mercator unit origin of mosaic
px = n * 256  # pixels per mercator unit
# crop bbox
LON0, LON1, LAT0, LAT1 = 117.0, 143.0, 23.5, 38.2
cx0 = int((merc_x(LON0) - mos_x0) * px); cx1 = int((merc_x(LON1) - mos_x0) * px)
cy0 = int((merc_y(LAT1) - mos_y0) * px); cy1 = int((merc_y(LAT0) - mos_y0) * px)
E = E[cy0:cy1, cx0:cx1]
H, W = E.shape
print("region crop", W, H)
# exact bbox in mercator units for the page
MX0 = mos_x0 + cx0 / px; MX1 = mos_x0 + cx1 / px; MY0 = mos_y0 + cy0 / px; MY1 = mos_y0 + cy1 / px
def proj_region(lon, lat):
    return ((merc_x(lon) - MX0) / (MX1 - MX0) * W, (merc_y(lat) - MY0) / (MY1 - MY0) * H)

land = json.load(open(f"{GEO}/land-50m.geojson"))
bbox = (LON0 - 2, LAT0 - 2, LON1 + 2, LAT1 + 2)
rings = list(project_rings(land, proj_region, W, H, bbox))
mask_im = Image.new("L", (W, H), 0); md = ImageDraw.Draw(mask_im)
for pts, hole in rings:
    if len(pts) > 2: md.polygon(pts, fill=0 if hole else 255)
land_mask = np.asarray(mask_im, dtype=np.float64) / 255

rivers_gj = json.load(open(f"{GEO}/rivers.geojson")); rivers = []
for f in rivers_gj["features"]:
    sr = f["properties"].get("scalerank", 9)
    if sr is None or sr > 7: continue
    g = f["geometry"]; lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
    for line in lines:
        lons = [p[0] for p in line]; lats = [p[1] for p in line]
        if max(lons) < LON0 or min(lons) > LON1 or max(lats) < LAT0 or min(lats) > LAT1: continue
        rivers.append(([proj_region(p[0], p[1]) for p in line], 3 if sr <= 3 else 2))
lakes_gj = json.load(open(f"{GEO}/lakes.geojson"))
lakes = [r for r in project_rings(lakes_gj, proj_region, W, H, bbox)]

mpp = 40075016.686 * math.cos(math.radians(31)) / (n * 256)
im = paint(E, land_mask, mpp, rivers, lakes, rings)
im.save(f"{OUT}/region.jpg", quality=86, optimize=True)
json.dump({"W": W, "H": H, "MX0": MX0, "MX1": MX1, "MY0": MY0, "MY1": MY1, "lon": [LON0, LON1], "lat": [LAT0, LAT1]}, open(f"{OUT}/region.json", "w"))
print("region.jpg", os.path.getsize(f"{OUT}/region.jpg"))

# ---------- Globe: z3 8x8 -> equirect 2048x1024 ----------
E3 = load_tiles(3, range(8), range(8), "tiles3")  # 2048x2048 mercator, lat +-85.05
GW, GH = 2048, 1024
lats = 90 - (np.arange(GH) + 0.5) / GH * 180
my = np.array([merc_y(max(min(l, 85.0), -85.0)) for l in lats]) * 2048
my = np.clip(my, 0, 2047)
Eq = E3[my.astype(int), :]
# polar fill: above 85 use edge rows (Antarctica/Arctic ice)
land110 = json.load(open(f"{GEO}/land-110m.geojson"))
def proj_eq(lon, lat): return ((lon + 180) / 360 * GW, (90 - lat) / 180 * GH)
rings110 = list(project_rings(land110, proj_eq, GW, GH))
mask_im = Image.new("L", (GW, GH), 0); md = ImageDraw.Draw(mask_im)
for pts, hole in rings110:
    if len(pts) > 2: md.polygon(pts, fill=0 if hole else 255)
gmask = np.asarray(mask_im, dtype=np.float64) / 255
# Antarctica below -85 is land in the mask; elevation rows are clamped. Fine for a globe mock.
mpp3 = 40075016.686 / GW
gim = paint(Eq, gmask, mpp3, None, None, rings110, scale_small=True)
gim.save(f"{OUT}/globe.jpg", quality=84, optimize=True)
print("globe.jpg", os.path.getsize(f"{OUT}/globe.jpg"))
