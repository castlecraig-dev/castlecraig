#!/usr/bin/env python3
"""Build the game map of the Castle Craig estate from real-world open data.

Sources
  - Map features: OpenStreetMap (c) OpenStreetMap contributors, ODbL.
    https://www.openstreetmap.org/copyright
  - Elevation: Mapzen/AWS Terrain Tiles (terrarium encoding), which combine
    open datasets including SRTM and EU-DEM. https://registry.opendata.aws/terrain-tiles/

Writes to public/assets/map/:
  map.json    features in local metres (+x east, +z south, origin at the main house)
  height.bin  Float32 ground heights for the playable area (metres, relative to the house)
  far.bin     Float32 coarse heights for the surrounding hills
  splat.png   1 m/pixel ground mask: R road, G woodland floor, B mud/shore/building plots

Usage: python3 scripts/build-map.py   (needs Pillow; downloads ~2 MB)
"""
import io
import json
import math
import struct
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'map'
UA = 'castle-craig-quest map builder'
HOUSE_WAY = 399619658          # "Castle Craig Hospital" building
NEAR = (-420, 440, -450, 680)  # minX, maxX, minZ, maxZ in metres
NEAR_CELL = 3.0
FAR_HALF, FAR_CELL = 4000, 40.0


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


# ---------- projection ----------
def make_proj(lat0, lon0):
    p = math.radians(lat0)
    m_lat = 111132.954 - 559.822 * math.cos(2 * p) + 1.175 * math.cos(4 * p)
    m_lon = 111412.84 * math.cos(p) - 93.5 * math.cos(3 * p)
    to_xz = lambda lat, lon: ((lon - lon0) * m_lon, -(lat - lat0) * m_lat)
    to_ll = lambda x, z: (lat0 - z / m_lat, lon0 + x / m_lon)
    return to_xz, to_ll


# ---------- elevation tiles ----------
class Terrain:
    def __init__(self, zoom):
        self.zoom, self.tiles = zoom, {}

    def _px(self, lat, lon):
        n = 2 ** self.zoom
        x = (lon + 180) / 360 * n
        y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
        return x * 256, y * 256

    def _tile(self, tx, ty):
        key = (tx, ty)
        if key not in self.tiles:
            data = get(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{self.zoom}/{tx}/{ty}.png')
            self.tiles[key] = Image.open(io.BytesIO(data)).convert('RGB').load()
        return self.tiles[key]

    def _at(self, px, py):
        tx, ty = int(px // 256), int(py // 256)
        r, g, b = self._tile(tx, ty)[int(px) % 256, int(py) % 256]
        return r * 256 + g + b / 256 - 32768

    def height(self, lat, lon):
        px, py = self._px(lat, lon)
        px, py = px - 0.5, py - 0.5
        x0, y0 = math.floor(px), math.floor(py)
        fx, fy = px - x0, py - y0
        h00, h10 = self._at(x0, y0), self._at(x0 + 1, y0)
        h01, h11 = self._at(x0, y0 + 1), self._at(x0 + 1, y0 + 1)
        return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy


# ---------- geometry helpers ----------
def point_in_poly(x, z, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def seg_dist(px, pz, a, b):
    vx, vz = b[0] - a[0], b[1] - a[1]
    L = vx * vx + vz * vz
    t = 0 if L == 0 else max(0, min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / L))
    return math.hypot(px - a[0] - vx * t, pz - a[1] - vz * t)


def poly_edge_dist(x, z, poly):
    return min(seg_dist(x, z, poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))


def smoothstep(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def r1(v):
    return round(v, 1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # ----- OpenStreetMap -----
    print('downloading OpenStreetMap data…')
    osm = json.loads(get('https://api.openstreetmap.org/api/0.6/map.json?bbox=-3.3870,55.6780,-3.3630,55.6905'))
    els = osm['elements']
    nodes_ll = {e['id']: (e['lat'], e['lon']) for e in els if e['type'] == 'node'}
    ways = [e for e in els if e['type'] == 'way']
    house = next(w for w in ways if w['id'] == HOUSE_WAY)
    hl = [nodes_ll[n] for n in house['nodes'][:-1]]
    lat0 = sum(p[0] for p in hl) / len(hl)
    lon0 = sum(p[1] for p in hl) / len(hl)
    to_xz, to_ll = make_proj(lat0, lon0)

    def pts(w):
        return [to_xz(*nodes_ll[n]) for n in w['nodes'] if n in nodes_ll]

    feats = {k: [] for k in ['buildings', 'roads', 'woods', 'scrub', 'meadows', 'farmland', 'lakes', 'gardens', 'walls', 'hedges', 'fences']}
    ROAD_W = {'primary': 6.5, 'secondary': 6, 'unclassified': 4.5, 'residential': 4.5, 'service': 3.6, 'track': 3.0, 'path': 1.6, 'footway': 1.6, 'bridleway': 2}
    for w in ways:
        t = w.get('tags', {})
        p = pts(w)
        if len(p) < 2:
            continue
        closed = w['nodes'][0] == w['nodes'][-1]
        poly = [[r1(x), r1(z)] for x, z in (p[:-1] if closed else p)]
        if 'building' in t and closed:
            feats['buildings'].append({'id': w['id'], 'name': t.get('name') or t.get('addr:housename', ''), 'kind': t['building'],
                                       'house': w['id'] == HOUSE_WAY, 'pts': poly})
        elif t.get('highway') in ROAD_W:
            feats['roads'].append({'type': t['highway'], 'width': ROAD_W[t['highway']], 'name': t.get('name', t.get('ref', '')), 'pts': poly})
        elif closed and (t.get('natural') == 'wood' or t.get('landuse') == 'forest'):
            feats['woods'].append(poly)
        elif closed and t.get('natural') in ('scrub', 'heath'):
            feats['scrub'].append(poly)
        elif closed and t.get('landuse') in ('meadow', 'grass'):
            feats['meadows'].append(poly)
        elif closed and t.get('landuse') == 'farmland':
            feats['farmland'].append(poly)
        elif closed and t.get('natural') == 'water':
            feats['lakes'].append({'pts': poly})
        elif closed and t.get('leisure') == 'garden':
            feats['gardens'].append(poly)
        if t.get('barrier') == 'wall':
            feats['walls'].append(poly + ([poly[0]] if closed else []))
        elif t.get('barrier') == 'hedge':
            feats['hedges'].append(poly + ([poly[0]] if closed else []))
        elif t.get('barrier') == 'fence':
            feats['fences'].append(poly + ([poly[0]] if closed else []))

    # ----- elevation -----
    print('downloading elevation tiles…')
    near_t, far_t = Terrain(15), Terrain(12)
    h0 = near_t.height(lat0, lon0)
    x0, x1, z0, z1 = NEAR
    nx, nz = int((x1 - x0) / NEAR_CELL) + 1, int((z1 - z0) / NEAR_CELL) + 1
    H = [[near_t.height(*to_ll(x0 + i * NEAR_CELL, z0 + j * NEAR_CELL)) - h0 for i in range(nx)] for j in range(nz)]

    # light smoothing: the source data is coarser than our grid
    for _ in range(2):
        H = [[sum(H[min(nz - 1, max(0, j + dj))][min(nx - 1, max(0, i + di))] for di in (-1, 0, 1) for dj in (-1, 0, 1)) / 9
              for i in range(nx)] for j in range(nz)]

    def sample(x, z):
        fx, fz = (x - x0) / NEAR_CELL, (z - z0) / NEAR_CELL
        i, j = max(0, min(nx - 2, int(fx))), max(0, min(nz - 2, int(fz)))
        u, v = fx - i, fz - j
        return (H[j][i] * (1 - u) + H[j][i + 1] * u) * (1 - v) + (H[j + 1][i] * (1 - u) + H[j + 1][i + 1] * u) * v

    # level each building plot, then carve the lakes
    plots = []
    for b in feats['buildings']:
        poly = b['pts']
        b['ground'] = r1(sum(sample(x, z) for x, z in poly) / len(poly))
        plots.append((poly, b['ground']))
    for lk in feats['lakes']:
        lk['level'] = r1(min(sample(x, z) for x, z in lk['pts']) - 0.25)
    for j in range(nz):
        for i in range(nx):
            x, z = x0 + i * NEAR_CELL, z0 + j * NEAR_CELL
            for poly, g in plots:
                d = 0 if point_in_poly(x, z, poly) else poly_edge_dist(x, z, poly)
                if d < 6:
                    H[j][i] += (g - H[j][i]) * (1 - smoothstep(0, 6, d))
            for lk in feats['lakes']:
                poly = lk['pts']
                if point_in_poly(x, z, poly):
                    d = poly_edge_dist(x, z, poly)
                    H[j][i] = min(H[j][i], lk['level'] - 0.3 - 1.5 * smoothstep(0, 8, d))

    with open(OUT / 'height.bin', 'wb') as f:
        for row in H:
            f.write(struct.pack(f'<{nx}f', *row))

    fn = int(2 * FAR_HALF / FAR_CELL) + 1
    with open(OUT / 'far.bin', 'wb') as f:
        for j in range(fn):
            row = [far_t.height(*to_ll(-FAR_HALF + i * FAR_CELL, -FAR_HALF + j * FAR_CELL)) - h0 for i in range(fn)]
            f.write(struct.pack(f'<{fn}f', *row))

    # ----- splat mask, 1 m per pixel -----
    print('drawing ground mask…')
    W, Hh = int(x1 - x0), int(z1 - z0)
    P = lambda p: (p[0] - x0, p[1] - z0)
    road = Image.new('L', (W, Hh), 0); rd = ImageDraw.Draw(road)
    wood = Image.new('L', (W, Hh), 0); wd = ImageDraw.Draw(wood)
    mud = Image.new('L', (W, Hh), 0); md = ImageDraw.Draw(mud)
    for poly in feats['woods']:
        wd.polygon([P(p) for p in poly], fill=255)
    for poly in feats['scrub']:
        wd.polygon([P(p) for p in poly], fill=120)
    for r in feats['roads']:
        line = [P(p) for p in r['pts']]
        rd.line(line, fill=255, width=int(round(r['width'])), joint='curve')
        for p in line:
            rr = r['width'] / 2
            rd.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=255)
    for lk in feats['lakes']:
        poly = [P(p) for p in lk['pts']]
        md.polygon(poly, fill=255); md.line(poly + [poly[0]], fill=255, width=7)
    for b in feats['buildings']:
        md.polygon([P(p) for p in b['pts']], fill=255)
    road = road.filter(ImageFilter.GaussianBlur(0.8))
    wood = wood.filter(ImageFilter.GaussianBlur(3))
    mud = mud.filter(ImageFilter.GaussianBlur(1.5))
    Image.merge('RGB', (road, wood, mud)).save(OUT / 'splat.png', optimize=True)

    meta = {
        'source': 'OpenStreetMap contributors (ODbL); AWS Terrain Tiles',
        'origin': {'lat': lat0, 'lon': lon0, 'elevation': round(h0, 1)},
        'height': {'minX': x0, 'minZ': z0, 'cell': NEAR_CELL, 'nx': nx, 'nz': nz},
        'far': {'half': FAR_HALF, 'cell': FAR_CELL, 'n': fn},
        'splat': {'minX': x0, 'minZ': z0, 'w': W, 'h': Hh},
        **feats,
    }
    (OUT / 'map.json').write_text(json.dumps(meta, separators=(',', ':')))
    print('done:', {k: len(v) for k, v in feats.items()})


if __name__ == '__main__':
    main()
