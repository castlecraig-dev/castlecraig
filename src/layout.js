// Shared layout of the estate: positions, ground height and collision.
// Units are metres. +x is east, +z is south.

export const BOUNDS = { minX: -90, maxX: 90, minZ: -70, maxZ: 80 };
export const WATER_Y = -0.4;
export const FLAT_Y = 0.2;

export const CASTLE = { x: 0, z: -24, w: 26, d: 16 };
export const GARDEN = { x: -50, z: -26, w: 30, d: 26 };
export const POND = { x: 50, z: -28, rx: 16, rz: 11 };
export const DINING_HALL = { x: 70, z: -4, w: 14, d: 9 };
export const RIVER_HALF = 4.5;
export const riverZ = (x) => 38 + 4 * Math.sin(x / 18) + 1.5 * Math.sin(x / 7 + 1);
export const BRIDGE = { x: 0, z: riverZ(0), halfW: 2.2, halfL: 8, deckY: 0.55 };

export const PATH_HALF = 1.8;
export const PATHS = [
  [[0, -14], [0, 58]],     // castle door, south over the bridge into the woods
  [[0, 58], [-38, 64]],    // woods, west branch
  [[0, 58], [34, 56]],     // woods, east branch
  [[-82, 10], [82, 10]],   // the main drive
  [[-50, -12], [-50, 10]], // to the walled garden
  [[40, -15], [40, 10]],   // to the pond
  [[70, 0.5], [70, 10]],   // to the dining hall
  [[13, -20], [22, -20]],  // kitchen door
  [[22, -20], [22, 10]],
];

// Raised vegetable beds in the walled garden (x/z centre, width, depth)
export const BEDS = [];
for (const dx of [-8, 8]) for (const dz of [-7, -1.5, 4]) {
  BEDS.push({ x: GARDEN.x + dx, z: GARDEN.z + dz, w: 8, d: 2 });
}

// ---------- helpers ----------
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function rectDist(x, z, r) {
  const dx = Math.max(Math.abs(x - r.x) - r.w / 2, 0);
  const dz = Math.max(Math.abs(z - r.z) - r.d / 2, 0);
  return Math.hypot(dx, dz);
}

function segDist(px, pz, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = clamp(((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
}

export function pathDist(x, z) {
  let d = Infinity;
  for (const [a, b] of PATHS) d = Math.min(d, segDist(x, z, a, b));
  return d;
}

export const pondDist = (x, z) => Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
export const riverDist = (x, z) => Math.abs(z - riverZ(x));

export function onBridge(x, z) {
  return Math.abs(x - BRIDGE.x) < BRIDGE.halfW && Math.abs(z - BRIDGE.z) < BRIDGE.halfL;
}

// Natural ground height before buildings and the bridge.
export function groundHeight(x, z) {
  let h = 1.25
    + 0.9 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05)
    + 0.5 * Math.sin(x * 0.11 + z * 0.07)
    + 0.25 * Math.sin(x * 0.23 - z * 0.19);

  // Level the ground around buildings and paths
  let f = 1;
  f = Math.min(f, smooth(2, 10, rectDist(x, z, CASTLE)));
  f = Math.min(f, smooth(1, 6, rectDist(x, z, GARDEN)));
  f = Math.min(f, smooth(1, 6, rectDist(x, z, DINING_HALL)));
  f = Math.min(f, smooth(PATH_HALF, PATH_HALF + 5, pathDist(x, z)));
  h = FLAT_Y + (h - FLAT_Y) * f;

  // Rolling Border hills beyond the grounds
  const ex = Math.max(0, Math.abs(x) - 86);
  const ez = Math.max(0, z < 0 ? -z - 66 : z - 76);
  const e = Math.hypot(ex, ez);
  h += e * e * 0.03 + e * 0.3 * (1 + 0.6 * Math.sin(x * 0.06 + z * 0.045));

  // Carve the river and the pond
  h = lerp(h, -1.8, 1 - smooth(RIVER_HALF - 1.5, RIVER_HALF + 2.5, riverDist(x, z)));
  h = lerp(h, -1.8, 1 - smooth(0.75, 1.15, pondDist(x, z)));
  return h;
}

// Height a character stands at.
export function standHeight(x, z) {
  const g = groundHeight(x, z);
  return onBridge(x, z) ? Math.max(g, BRIDGE.deckY) : g;
}

export const isWater = (x, z) => !onBridge(x, z) && groundHeight(x, z) < WATER_Y + 0.12;

// ---------- collision ----------
export const colliders = { boxes: [], circles: [] };
// h is the obstacle's height, used to stop the camera passing through buildings.
export const addBox = (x, z, w, d, h = 1) => colliders.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
export const addCircle = (x, z, r, h = 1) => colliders.circles.push({ x, z, r, h });

// True if the point (x, y, z) is inside something solid and tall enough.
export function solidAt(x, y, z) {
  if (y < groundHeight(x, z) + 0.3) return true;
  for (const b of colliders.boxes) if (y < FLAT_Y + b.h && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  for (const c of colliders.circles) if (y < FLAT_Y + c.h && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
  return false;
}

export function blocked(x, z, r = 0.4) {
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return true;
  if (isWater(x, z)) return true;
  for (const b of colliders.boxes) {
    if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
  }
  for (const c of colliders.circles) {
    const dx = x - c.x, dz = z - c.z, rr = r + c.r;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
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
