"""Paint the shared terrain colour texture from the heightmap: elevation tint, slope, noise.
Both spikes map this one image onto the terrain so colour is not a variable between them."""
import json, math, numpy as np
from PIL import Image
H16 = np.asarray(Image.open("height.png").convert("RGB"), dtype=np.float64)
E = H16[:, :, 0] * 256 + H16[:, :, 1] - 1000
meta = json.load(open("height.json")); mpp = meta["mpp"]
def box(a, r):
    k = 2*r+1; p = np.pad(a, r, mode="edge"); c = np.cumsum(p, axis=0); c = np.concatenate([np.zeros((1, c.shape[1])), c]); a = (c[k:]-c[:-k])/k
    c = np.cumsum(a, axis=1); c = np.concatenate([np.zeros((c.shape[0], 1)), c], axis=1); return (c[:, k:]-c[:, :-k])/k
rng = np.random.default_rng(7)
n = box(rng.random(E.shape), 3)*0.5 + box(rng.random(E.shape), 9)*0.5; n = (n-n.mean())/(n.std()+1e-9)
n2 = box(rng.random(E.shape), 14); n2 = (n2-n2.mean())/(n2.std()+1e-9)
gy, gx = np.gradient(E, mpp); slope = np.hypot(gx, gy)
def hexc(h): return np.array([int(h[i:i+2], 16) for i in (1, 3, 5)], dtype=np.float64)
col = np.zeros(E.shape+(3,))
deep = (E <= 1)
# Terrarium has no bathymetry here (sea is clamped to 0), so shade the sea by distance
# from the coast instead: shallow near land, the deep colour offshore.
near = box(box((E > 1).astype(np.float64), 31).T, 31).T
t = np.clip(1 - near*5, 0, 1)[..., None]
col[deep] = (hexc("#3f93ad")[None, :]*(1-t) + hexc("#1d5674")[None, :]*t)[deep]
sand = (E > 1) & (E < 7); col[sand] = hexc("#d8c48c")
land = E >= 7
field = (n2 > 0.56) & (E < 160) & (slope < 0.12)
base = np.where(field[..., None], hexc("#b7b65a")[None, None, :], hexc("#7faf49")[None, None, :])
base = base*(1-0.6*np.clip(n, 0, 1)[..., None]) + hexc("#5c8a39")[None, None, :]*(0.6*np.clip(n, 0, 1)[..., None])
hi = np.clip((E-220)/300, 0, 1)[..., None]; base = base*(1-hi) + hexc("#8d7d4e")[None, None, :]*hi
hi2 = np.clip((E-520)/300, 0, 1)[..., None]; base = base*(1-hi2) + hexc("#857568")[None, None, :]*hi2
sl = np.clip((slope-0.22)/0.25, 0, 1)[..., None]; base = base*(1-sl) + hexc("#8f8373")[None, None, :]*sl
col[land] = base[land]
im = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").resize((E.shape[1]*2, E.shape[0]*2), Image.BICUBIC)
im.save("terrain-color.jpg", quality=90, optimize=True); print("terrain-color.jpg", im.size)
