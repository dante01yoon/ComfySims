import json, sys, numpy as np
from PIL import Image
layout = json.load(open(sys.argv[1]))['layout']
W, H, FAR, EYE = 2048, 1024, 800.0, 160.0
eye = np.array([-450.0, EYE, -180.0])
x0, x1, z0, z1, top = -700, -200, -500, 0, 270
lon = (np.arange(W) + 0.5) / W * 2 * np.pi - np.pi
lat = np.pi / 2 - (np.arange(H) + 0.5) / H * np.pi
LON, LAT = np.meshgrid(lon, lat)
d = np.stack([np.cos(LAT) * np.sin(LON), np.sin(LAT), np.cos(LAT) * np.cos(LON)], -1)
best = np.full((H, W), np.inf)
def planes(axis, value, inside):
    t = (value - eye[axis]) / np.where(d[..., axis] == 0, 1e-9, d[..., axis])
    p = eye + d * t[..., None]
    ok = (t > 0) & inside(p)
    return np.where(ok, t, np.inf)
openings = [  # (axis fixed, value, along-axis, lo, hi, sill, top)
    (2, -500, 0, -500, -300, 90, 220),   # north window
    (0, -700, 2, -350, -150, 90, 220),   # west window
    (0, -200, 2, -200, -110, 0, 210),    # door to office
    (2, 0, 0, -280, -190, 0, 210),       # door to hall
]
def wall(axis, value):
    along = 2 if axis == 0 else 0
    def inside(p):
        hole = np.zeros(p.shape[:2], bool)
        for a, v, al, lo, hi, s, tp in openings:
            if a == axis and v == value:
                hole |= (p[..., al] > lo) & (p[..., al] < hi) & (p[..., 1] > s) & (p[..., 1] < tp)
        return ~hole
    return planes(axis, value, inside)
for axis, value in [(0, x0), (0, x1), (2, z0), (2, z1)]:
    best = np.minimum(best, wall(axis, value))
best = np.minimum(best, planes(1, 0, lambda p: np.ones(p.shape[:2], bool)))
best = np.minimum(best, planes(1, top, lambda p: np.ones(p.shape[:2], bool)))
assets = {a['id']: a['dimensions'] for a in layout['assets']}
for item in layout['items']:
    p = item['position']
    if not (x0 < p['x'] < x1 and z0 < p['z'] < z1): continue
    dim = assets[item['assetId']]
    yaw = np.radians(item.get('rotationY', 0))
    c, s = np.cos(-yaw), np.sin(-yaw)
    o = eye - np.array([p['x'], 0, p['z']])
    ol = np.array([c * o[0] + s * o[2], o[1], -s * o[0] + c * o[2]])
    dl = np.stack([c * d[..., 0] + s * d[..., 2], d[..., 1], -s * d[..., 0] + c * d[..., 2]], -1)
    lo = np.array([-dim['width'] / 2, 0, -dim['depth'] / 2]); hi = np.array([dim['width'] / 2, dim['height'], dim['depth'] / 2])
    inv = 1 / np.where(dl == 0, 1e-9, dl)
    ta, tb = (lo - ol) * inv, (hi - ol) * inv
    tn, tf = np.minimum(ta, tb).max(-1), np.maximum(ta, tb).min(-1)
    best = np.minimum(best, np.where((tf >= tn) & (tf > 0), np.maximum(tn, 0), np.inf))
    print('box', item['id'], dim)
v = np.clip(1 - (best - 40) / 560, 0, 1)
Image.fromarray((v * 255).astype(np.uint8)).convert('RGB').save(sys.argv[2])
