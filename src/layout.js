// Layout of the Castle Craig estate, built from real-world map data
// (OpenStreetMap and open elevation data; see scripts/build-map.py).
// Units are metres. +x is east, +z is south, and the origin is the main house.

export const BOUNDS = { minX: -300, maxX: 330, minZ: -330, maxZ: 560 }; // where the player can walk

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- the main house's own frame ----------
// The real house is turned about 8 degrees from north. In house coordinates its
// front (entrance) faces -z, onto the forecourt between the two wings.
export const HOUSE = { angle: -0.138352 };
const HC = Math.cos(HOUSE.angle), HS = Math.sin(HOUSE.angle);
export const houseToWorld = (lx, lz) => [lx * HC - lz * HS, lx * HS + lz * HC];
export const worldToHouse = (x, z) => [x * HC + z * HS, -x * HS + z * HC];
export const FRONT_DOOR = { local: [0, -2.3] };
[FRONT_DOOR.x, FRONT_DOOR.z] = houseToWorld(0, -2.3);

// ---------- geometry helpers ----------
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function segDist(px, pz, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1], L = vx * vx + vz * vz;
  const t = L === 0 ? 0 : clamp(((px - a[0]) * vx + (pz - a[1]) * vz) / L, 0, 1);
  return Math.hypot(px - a[0] - vx * t, pz - a[1] - vz * t);
}
export function polyEdgeDist(x, z, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, z, poly[i], poly[(i + 1) % poly.length]));
  return d;
}
export const centroid = (poly) => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

// ---------- map data ----------
export const geo = { meta: null, H: null, far: null, splat: null };

export function initGeo({ meta, H, far, splat }) {
  Object.assign(geo, { meta, H, far, splat });
  for (const b of meta.buildings) addPoly(b.pts, b.house ? 16 : 7, b.ground);
  for (const lk of meta.lakes) addItem({ type: 'water', pts: lk.pts }, bboxOf(lk.pts));
}

function bilinear(arr, nx, nz, fx, fz) {
  const i = clamp(Math.floor(fx), 0, nx - 2), j = clamp(Math.floor(fz), 0, nz - 2);
  const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
  const a = arr[j * nx + i], b = arr[j * nx + i + 1], c = arr[(j + 1) * nx + i], d = arr[(j + 1) * nx + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// Real ground height (metres relative to the house), from the elevation data.
export function groundHeight(x, z) {
  const h = geo.meta.height;
  const fx = (x - h.minX) / h.cell, fz = (z - h.minZ) / h.cell;
  if (fx >= 0 && fz >= 0 && fx <= h.nx - 1 && fz <= h.nz - 1) return bilinear(geo.H, h.nx, h.nz, fx, fz);
  const f = geo.meta.far;
  return bilinear(geo.far, f.n, f.n, (x + f.half) / f.cell, (z + f.half) / f.cell);
}

// Ground mask at a point: [road, wood, mud], each 0..1, at 1 m resolution.
// Mud also covers the lake and building plots.
const _s = [0, 0, 0];
export function splatAt(x, z) {
  const s = geo.meta.splat, i = Math.floor(x - s.minX), j = Math.floor(z - s.minZ);
  if (i < 0 || j < 0 || i >= s.w || j >= s.h) { _s[0] = 0; _s[1] = 0.6; _s[2] = 0; return _s; }
  const k = (j * s.w + i) * 4, d = geo.splat;
  _s[0] = d[k] / 255; _s[1] = d[k + 1] / 255; _s[2] = d[k + 2] / 255;
  return _s;
}
export const onRoad = (x, z) => splatAt(x, z)[0] > 0.4;

// ---------- collision (spatial hash) ----------
const CELL = 16;
const grid = new Map();
const key = (i, j) => i * 100003 + j;
function bboxOf(pts, pad = 0) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}
function addItem(item, bb) {
  const pad = 1.2; // covers the player's radius
  for (let i = Math.floor((bb.minX - pad) / CELL); i <= Math.floor((bb.maxX + pad) / CELL); i++) {
    for (let j = Math.floor((bb.minZ - pad) / CELL); j <= Math.floor((bb.maxZ + pad) / CELL); j++) {
      const k = key(i, j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(item);
    }
  }
}
const cellItems = (x, z) => grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];

// h is how tall an obstacle is above the ground, used to keep the camera out of it.
export const addPoly = (pts, h = 3, base = null) => addItem({ type: 'poly', pts, h, base }, bboxOf(pts));
export const addSeg = (a, b, half, h = 1) => addItem({ type: 'seg', a, b, half, h }, bboxOf([a, b], half));
export const addCircle = (x, z, r, h = 1) => addItem({ type: 'circle', x, z, r, h }, { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
// Tree canopies: don't block walking, but keep the camera out of them.
export const addFoliage = (x, z, r, top) => addItem({ type: 'foliage', x, z, r, h: top, low: 2.2 }, { minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
export function addBox(x, z, w, d, h = 1, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c]);
  addPoly(pts, h);
}

function hits(item, x, z, r) {
  switch (item.type) {
    case 'foliage': return false;
    case 'poly': return pointInPoly(x, z, item.pts) || polyEdgeDist(x, z, item.pts) < r;
    case 'water': return pointInPoly(x, z, item.pts);
    case 'seg': return segDist(x, z, item.a, item.b) < r + item.half;
    default: return (x - item.x) ** 2 + (z - item.z) ** 2 < (r + item.r) ** 2;
  }
}

export const isWater = (x, z) => cellItems(x, z).some((it) => it.type === 'water' && pointInPoly(x, z, it.pts));

export function blocked(x, z, r = 0.4) {
  if (view.inside) return blockedInside(x, z, r);
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return true;
  for (const it of cellItems(x, z)) if (hits(it, x, z, r)) return true;
  return false;
}

// True if the point (x, y, z) is inside something solid (for the camera).
export function solidAt(x, y, z) {
  if (view.inside) return solidInside(x, y, z);
  const g = groundHeight(x, z);
  if (y < g + 0.3) return true;
  for (const it of cellItems(x, z)) {
    if (it.type === 'water' || y > g + it.h) continue;
    if (it.type === 'foliage') { if (y > g + it.low && (x - it.x) ** 2 + (z - it.z) ** 2 < it.r * it.r) return true; continue; }
    if (it.type === 'poly' ? pointInPoly(x, z, it.pts) : hits(it, x, z, 0)) return true;
  }
  return false;
}

// Line of sight at eye height: blocked by buildings and high walls.
export function losBlocked(x0, z0, x1, z1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.7);
  for (let i = 1; i < steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps, z = z0 + ((z1 - z0) * i) / steps;
    for (const it of cellItems(x, z)) {
      if (it.h < 1.7) continue;
      if (it.type === 'poly' ? pointInPoly(x, z, it.pts) : it.type === 'seg' && segDist(x, z, it.a, it.b) < it.half) return true;
    }
  }
  return false;
}

// ---------- the castle interior ----------
// The interior is built well away from the grounds so the two never overlap.
// It is laid out to fit the real house: the Front Hall sits behind the front door in the
// centre block, the stair hall behind it on the garden front, and the Quiet Room in the
// east wing. (Interior local +z points out of the front door; x is mirrored from the house frame.)
// Walking through the castle's front door moves the player there.
export const INTERIOR = { x: 6000, z: 6000 };
export const view = { inside: false };

// Walkable floor areas in interior-local metres. ceil is the ceiling height.
export const ROOMS = {
  hall: { minX: -7, maxX: 7, minZ: -5, maxZ: 5, ceil: 5.6 },
  quiet: { minX: -20, maxX: -7.4, minZ: -5, maxZ: 4, ceil: 4.2 },
  stairs: { minX: -7, maxX: -2, minZ: -9.6, maxZ: -5.4, ceil: 6 },
  // west wing (x is mirrored, so it's +x here): the Drawing Room, with the Common Room behind it
  drawing: { minX: 7.4, maxX: 21, minZ: -2, maxZ: 5, ceil: 4.6 },
  common: { minX: 7.4, maxX: 21, minZ: -9.6, maxZ: -2.4, ceil: 4.0 },
  // behind the hall, beside the stairs
  therapy: { minX: -1.6, maxX: 7, minZ: -9.6, maxZ: -5.4, ceil: 4.0 },
  // upstairs (a separate area reached from the top of the stairs)
  corridor: { minX: -8, maxX: 8, minZ: -42, maxZ: -39, ceil: 3.0 },
  bedroomA: { minX: -8, maxX: -0.2, minZ: -48, maxZ: -42.4, ceil: 3.0 },
  bedroomB: { minX: 0.2, maxX: 8, minZ: -48, maxZ: -42.4, ceil: 3.0 },
};
export const DOORWAYS = {
  quiet: { minX: -7.6, maxX: -6.8, minZ: 1.4, maxZ: 3.6, ceil: 2.8 },
  stairs: { minX: -6.2, maxX: -3.6, minZ: -5.6, maxZ: -4.8, ceil: 3.2 },
  front: { minX: -1.1, maxX: 1.1, minZ: 4.9, maxZ: 5.9, ceil: 3 }, // leads back outside
  drawing: { minX: 6.8, maxX: 7.6, minZ: -1.1, maxZ: 1.1, ceil: 2.8 },
  common: { minX: 13, maxX: 15, minZ: -2.6, maxZ: -1.8, ceil: 2.6 },
  therapy: { minX: 3.6, maxX: 5.2, minZ: -5.6, maxZ: -4.8, ceil: 2.6 },
  bedroomA: { minX: -4.6, maxX: -3.4, minZ: -42.6, maxZ: -41.8, ceil: 2.4 },
  bedroomB: { minX: 3.4, maxX: 4.6, minZ: -42.6, maxZ: -41.8, ceil: 2.4 },
  upstairs: { minX: -8.6, maxX: -7.8, minZ: -41.6, maxZ: -39.4, ceil: 2.4 }, // back down the stairs
};
export const UPSTAIRS_Z = -30; // anything north of this (more negative) is the first floor
const WALKABLE = [...Object.values(ROOMS), ...Object.values(DOORWAYS)];
const CAMERA_SPACE = [...Object.values(ROOMS), DOORWAYS.quiet, DOORWAYS.stairs, DOORWAYS.drawing, DOORWAYS.common, DOORWAYS.therapy, DOORWAYS.bedroomA, DOORWAYS.bedroomB]; // not the outside door gaps
export const STAIRS = { minX: -6.8, maxX: -5.25, bottomZ: -5.8, topZ: -8.9, rise: 2.6 };

export const inColliders = { boxes: [], circles: [] };
export const addInBox = (x, z, w, d) => inColliders.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
export const addInCircle = (x, z, r) => inColliders.circles.push({ x, z, r });

// Floor height inside, in interior-local coordinates (0 except on the stairs).
export function interiorFloor(lx, lz) {
  if (lx > STAIRS.minX && lx < STAIRS.maxX && lz < STAIRS.bottomZ) {
    return Math.min(STAIRS.rise, ((STAIRS.bottomZ - lz) / (STAIRS.bottomZ - STAIRS.topZ)) * STAIRS.rise);
  }
  return 0;
}
const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

function blockedInside(x, z, r) {
  const lx = x - INTERIOR.x, lz = z - INTERIOR.z;
  for (const [cx, cz] of [[lx - r, lz - r], [lx + r, lz - r], [lx - r, lz + r], [lx + r, lz + r]]) {
    if (!WALKABLE.some((w) => inRect(w, cx, cz))) return true;
  }
  for (const b of inColliders.boxes) if (lx + r > b.minX && lx - r < b.maxX && lz + r > b.minZ && lz - r < b.maxZ) return true;
  for (const c of inColliders.circles) if ((lx - c.x) ** 2 + (lz - c.z) ** 2 < (r + c.r) ** 2) return true;
  return false;
}

function solidInside(x, y, z) {
  const lx = x - INTERIOR.x, lz = z - INTERIOR.z;
  const floor = interiorFloor(lx, lz);
  if (y < floor + 0.2) return true;
  return !CAMERA_SPACE.some((w) => inRect(w, lx, lz) && y < w.ceil - 0.25);
}

// Height a character stands at.
export function standHeight(x, z) {
  if (view.inside) return interiorFloor(x - INTERIOR.x, z - INTERIOR.z);
  return groundHeight(x, z);
}

// Small seeded random so the estate is the same on every visit.
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
