#!/usr/bin/env python3
"""Precomputes the diorama symbols for the globe spikes from the region-scale
spike's rules, as geodetic positions every engine instances the same way.

Trees use the shared placement rule (elevation band, slope limit, noise
threshold, drop fraction) on the region spike's heightmap; houses use each
village's seed. Positions are lon/lat in degrees and ground height in true
metres; engines multiply heights by the scene's vertical exaggeration.
Usage: python3 -I spikes/renderer/globe/shared/make-diorama.py
"""
import json, math, os
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, "region")  # the region-scale scene the diorama was designed in
spec = json.load(open(os.path.join(R, "scene.json"))); HM = json.load(open(os.path.join(R, "height.json")))
a = np.asarray(Image.open(os.path.join(R, "height.png")).convert("RGB"), np.float64)
E = a[..., 0] * 256 + a[..., 1] - 1000
rows, cols = E.shape
U = HM["mpp"] * spec["unitsPerMeter"]; Wu, Hu = cols * U, rows * U
def h_at(c, r): return E[min(rows - 1, max(0, int(r))), min(cols - 1, max(0, int(c)))]
def h_lerp(x, z):
    c, r = (x + Wu / 2) / U, (z + Hu / 2) / U; c0, r0 = math.floor(c), math.floor(r); fc, fr = c - c0, r - r0
    return (h_at(c0, r0) * (1 - fc) + h_at(c0 + 1, r0) * fc) * (1 - fr) + (h_at(c0, r0 + 1) * (1 - fc) + h_at(c0 + 1, r0 + 1) * fc) * fr
def slope_at(c, r): return math.hypot(h_at(c + 1, r) - h_at(c - 1, r), h_at(c, r + 1) - h_at(c, r - 1)) / (2 * HM["mpp"])
def hash_(x, y): s = math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - math.floor(s)
def vn(x, y):
    x0, y0 = math.floor(x), math.floor(y); fx, fy = x - x0, y - y0; sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    return (hash_(x0, y0) * (1 - sx) + hash_(x0 + 1, y0) * sx) * (1 - sy) + (hash_(x0, y0 + 1) * (1 - sx) + hash_(x0 + 1, y0 + 1) * sx) * sy
def fbm(x, y): return vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.3 + vn(x * 4.3, y * 4.3) * 0.2
def to_lonlat(x, z):
    mx = HM["MX0"] + (x + Wu / 2) / Wu * (HM["MX1"] - HM["MX0"]); my = HM["MY0"] + (z + Hu / 2) / Hu * (HM["MY1"] - HM["MY0"])
    return mx * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * my))))
def to_xz(lon, lat):
    mx = (lon + 180) / 360; r = math.radians(lat); my = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2
    return (mx - HM["MX0"]) / (HM["MX1"] - HM["MX0"]) * Wu - Wu / 2, (my - HM["MY0"]) / (HM["MY1"] - HM["MY0"]) * Hu - Hu / 2
TR = spec["trees"]; trees = []
for r in range(2, rows - 2, TR["sampleEvery"]):
    for c in range(2, cols - 2, TR["sampleEvery"]):
        e = h_at(c, r)
        if e < TR["minElev"] or e > TR["maxElev"]: continue
        sl = slope_at(c, r)
        if sl > TR["maxSlope"]: continue
        if fbm(c * 0.03 + 5, r * 0.03 + 7) < TR["noiseThreshold"] or hash_(c, r) > TR["dropFraction"]: continue
        x = (c + hash_(r, c) * 1.6 - 0.8) * U - Wu / 2; z = (r + hash_(c * 3, r) * 1.6 - 0.8) * U - Hu / 2
        conifer = e > TR["coniferAbove"] or sl > TR["coniferSlope"]
        scale = (0.75 + hash_(x, z) * 0.5) if conifer else (0.7 + hash_(z, x) * 0.5)
        lon, lat = to_lonlat(x, z)
        trees.append([round(lon, 6), round(lat, 6), round(h_lerp(x, z), 1), 0 if conifer else 1, round(scale, 3), round(hash_(x * 2, z) * 6.28, 3)])
houses = []
for pl in spec["places"]:
    if not pl.get("village"): continue
    cx, cz = to_xz(pl["lon"], pl["lat"]); placed = k = 0
    while placed < pl["village"] and k < 200:
        k += 1; ang = hash_(pl["seed"] + k, 3) * 6.28; rr = 1.5 + hash_(k, pl["seed"]) * 7
        x, z = cx + math.cos(ang) * rr, cz + math.sin(ang) * rr * 0.8; e = h_lerp(x, z)
        if e < 4 or e > 90: continue
        lon, lat = to_lonlat(x, z)
        houses.append([round(lon, 6), round(lat, 6), round(e, 1), round(hash_(k, 9) * 6.28, 3), round(0.9 + hash_(5, k) * 0.3, 3), 1 if k % 3 == 0 else 0]); placed += 1
out = {"note": "Symbol sizes are the region spike's scene units times 100, in metres: symbolic, not to scale.",
       "unitMetres": 100, "trees": {"fields": ["lon", "lat", "groundM", "kind(0 conifer,1 broadleaf)", "scale", "rotRad"], "items": trees},
       "houses": {"fields": ["lon", "lat", "groundM", "rotRad", "scale", "roof(0 tile,1 thatch)"], "items": houses},
       "palette": spec["palette"]}
json.dump(out, open(os.path.join(HERE, "diorama.json"), "w"), separators=(",", ":"))
print(len(trees), "trees,", len(houses), "houses")
