// Builds the Castle Craig estate from real-world map data: terrain and hills
// from elevation data; buildings, drives, woods, walls, hedges and the lake
// from OpenStreetMap. Textures and props are CC0 (see CREDITS.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from './layout.js';
import * as TX from './textures.js';
import { normalised, instanced, placed } from './assets.js';
import { ITEMS, NPCS, SHELTER, PADDOCK, KEEP_CLEAR, DINING } from './quests.js';

export const TEX_M = 3; // metres covered by one repeat of a wall texture

// ---------- geometry helpers ----------
export function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const [a, b] = dims[Math.floor(i / 4)];
    uv.setXY(i, (uv.getX(i) * a) / TEX_M, (uv.getY(i) * b) / TEX_M);
  }
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function cyl(rt, rb, h, x, y, z, seg = 24) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  const uv = g.attributes.uv;
  const circ = 2 * Math.PI * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / TEX_M, (uv.getY(i) * h) / TEX_M);
  g.translate(x, y, z);
  return g;
}

export function cone(r, h, x, y, z, seg = 24) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / TEX_M, (uv.getY(i) * h) / TEX_M);
  g.translate(x, y, z);
  return g;
}

export function merged(geos, mat, { cast = true, receive = true } = {}) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of list) {
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  }
  const m = new THREE.Mesh(mergeGeometries(list, false), mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export const pbrMat = (t, extra = {}) => new THREE.MeshStandardMaterial({
  map: t.diff, normalMap: t.nor, roughnessMap: t.arm, metalnessMap: t.arm, ...extra,
});

// Hipped roof over a rectangle (local x/z), ridge along the longer side.
function hipRoof(minX, maxX, minZ, maxZ, y, rise, over = 0.4) {
  minX -= over; maxX += over; minZ -= over; maxZ += over;
  const w = maxX - minX, d = maxZ - minZ, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const alongX = w >= d, half = Math.abs(w - d) / 2;
  const r0 = alongX ? [cx - half, y + rise, cz] : [cx, y + rise, cz - half];
  const r1 = alongX ? [cx + half, y + rise, cz] : [cx, y + rise, cz + half];
  const A = [minX, y, minZ], B = [maxX, y, minZ], C = [maxX, y, maxZ], D = [minX, y, maxZ];
  const tris = alongX
    ? [[A, r0, r1], [A, r1, B], [C, r1, r0], [C, r0, D], [D, r0, A], [B, r1, C]]
    : [[B, r0, A], [B, r1, r0], [D, r1, C], [D, r0, r1], [A, r0, D], [C, r1, B]];
  const pos = [], uv = [];
  for (const t of tris) for (const p of t) { pos.push(...p); uv.push(p[0] / 2.5, (p[2] + p[1]) / 2.5); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Smallest rectangle around a footprint: { angle, minX, maxX, minZ, maxZ } in its rotated frame.
function orientedBox(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const ang = Math.atan2(bz - az, bx - ax), c = Math.cos(-ang), s = Math.sin(-ang);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      const u = x * c - z * s, v = x * s + z * c;
      minX = Math.min(minX, u); maxX = Math.max(maxX, u); minZ = Math.min(minZ, v); maxZ = Math.max(maxZ, v);
    }
    const area = (maxX - minX) * (maxZ - minZ);
    if (!best || area < best.area) best = { angle: ang, minX, maxX, minZ, maxZ, area };
  }
  return best;
}
const polyArea = (p) => Math.abs(p.reduce((s, [x, z], i) => { const [x2, z2] = p[(i + 1) % p.length]; return s + x * z2 - x2 * z; }, 0)) / 2;

// Split a barrier line into pieces, leaving gaps where drives and tracks cross it.
function gappedSegments(line, gapAt = []) {
  const out = [];
  let run = null;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
      const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
      const gap = L.splatAt(mx, mz)[0] > 0.05 || gapAt.some(([gx, gz, r]) => Math.hypot(mx - gx, mz - gz) < r);
      if (gap) { if (run) { out.push(run); run = null; } continue; }
      if (!run) run = [p0];
      run.push(p1);
    }
  }
  if (run) out.push(run);
  return out;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const mat4 = (x, y, z, ry = 0, sc = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(sc, sc, sc));

// ---------- the world ----------
export function buildWorld(scene, { quality, assets }) {
  const R = L.rng(42);
  const time = { value: 0 };
  const T = assets.tex, M = L.geo.meta;
  const high = quality === 'high';
  const ground = (x, z) => L.groundHeight(x, z);

  const mats = {
    stone: pbrMat(T.stone),
    slate: pbrMat(T.slate, { color: '#7d8590' }),
    wood: pbrMat(T.wood),
    trim: new THREE.MeshStandardMaterial({ color: '#e9e3d6', roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: '#1c2a38', roughness: 0.05, metalness: 0.8 }),
    warmGlass: new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffb050', emissiveIntensity: 1.4, roughness: 0.3 }),
    door: new THREE.MeshStandardMaterial({ color: '#2f3b33', roughness: 0.6 }),
    hedge: new THREE.MeshStandardMaterial({ map: TX.leafTexture(), roughness: 1 }),
    soil: new THREE.MeshStandardMaterial({ map: T.mud.diff, normalMap: T.mud.nor, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
    fence: new THREE.MeshStandardMaterial({ color: '#7a6248', roughness: 0.9 }),
  };
  mats.hedge.map.repeat.set(1.5, 1.5);

  // ----- terrain: real heights, blended grass / gravel / mud / woodland floor -----
  const sp = M.splat;
  {
    const h = M.height, W = (h.nx - 1) * h.cell, D = (h.nz - 1) * h.cell;
    const g = new THREE.PlaneGeometry(W, D, h.nx - 1, h.nz - 1);
    g.rotateX(-Math.PI / 2);
    g.translate(h.minX + W / 2, 0, h.minZ + D / 2);
    const pos = g.attributes.position;
    const tint = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, L.geo.H[i]);
      const n = 0.5 + 0.5 * Math.sin(x * 0.05 + Math.sin(z * 0.031) * 2) * Math.cos(z * 0.043 - x * 0.012);
      const k = 0.82 + n * 0.25;
      tint.set([k * 0.66, k * 0.92, k * 0.5], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    g.computeVertexNormals();

    const rep = [W / 5, D / 5];
    for (const set of [T.grass, T.gravel, T.mud, T.forest]) for (const t of [set.diff, set.nor]) t.repeat.set(...rep);
    const splatTex = M.splatTexture;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.grass.diff, normalMap: T.grass.nor, roughness: 0.95, normalScale: new THREE.Vector2(0.8, 0.8) });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        tSplat: { value: splatTex }, splatRect: { value: new THREE.Vector4(sp.minX, sp.minZ, sp.w, sp.h) },
        tGravel: { value: T.gravel.diff }, tMud: { value: T.mud.diff }, tForest: { value: T.forest.diff },
        nGravel: { value: T.gravel.nor }, nMud: { value: T.mud.nor }, nForest: { value: T.forest.nor },
      });
      shader.vertexShader = 'uniform vec4 splatRect;\nvarying vec2 vSplatUv;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplatUv = (position.xz - splatRect.xy) / splatRect.zw;');
      shader.fragmentShader = `uniform sampler2D tSplat, tGravel, tMud, tForest, nGravel, nMud, nForest;
        varying vec2 vSplatUv;\n` + shader.fragmentShader
        .replace('#include <map_fragment>', `
          vec3 sm = texture2D(tSplat, vSplatUv).rgb;
          vec4 sw = vec4(1.0, sm.r, sm.b, sm.g * 0.85);
          sw.x = max(0.0, 1.0 - sw.y - sw.z - sw.w);
          sw /= max(dot(sw, vec4(1.0)), 1e-4);
          vec4 cG = mix(texture2D(map, vMapUv), texture2D(map, vMapUv * 0.27 + 0.13), 0.45);
          vec4 cP = texture2D(tGravel, vMapUv * 1.6);
          vec4 cM = texture2D(tMud, vMapUv);
          vec4 cF = texture2D(tForest, vMapUv);
          vec4 tex = cG * sw.x + cP * sw.y * vec4(1.3, 1.25, 1.2, 1.0) + cM * sw.z + cF * sw.w * vec4(1.15, 1.1, 1.15, 1.0);
          diffuseColor *= tex;`)
        .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, sw.x); // tint only the grass')
        .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
          vec3 mapN = (texture2D(normalMap, vNormalMapUv).xyz * sw.x + texture2D(nGravel, vNormalMapUv * 1.6).xyz * sw.y
            + texture2D(nMud, vNormalMapUv).xyz * sw.z + texture2D(nForest, vNormalMapUv).xyz * sw.w) * 2.0 - 1.0;`);
    };
    const terrain = new THREE.Mesh(g, mat);
    terrain.receiveShadow = true;
    scene.add(terrain);
  }

  // ----- the surrounding hills, from coarser elevation data -----
  {
    const f = M.far, h = M.height;
    const g = new THREE.PlaneGeometry(f.half * 2, f.half * 2, f.n - 1, f.n - 1);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const nearMaxX = h.minX + (h.nx - 1) * h.cell, nearMaxZ = h.minZ + (h.nz - 1) * h.cell;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let y = L.geo.far[i];
      if (x > h.minX + 45 && x < nearMaxX - 45 && z > h.minZ + 45 && z < nearMaxZ - 45) y -= 30; // tucked under the detailed terrain
      pos.setY(i, y);
      const n = 0.5 + 0.5 * Math.sin(x * 0.004 + Math.cos(z * 0.003) * 3);
      c.setRGB(0.36, 0.5, 0.26).lerp(new THREE.Color(0.46, 0.42, 0.3), L.smooth(60, 260, y) * 0.8).lerp(new THREE.Color(0.3, 0.42, 0.24), n * 0.35);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const farGrass = T.grass.diff.clone(); farGrass.repeat.set(400, 400); farGrass.needsUpdate = true;
    const far = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: farGrass, roughness: 1 }));
    far.receiveShadow = true;
    scene.add(far);
  }

  // ----- the lake -----
  const waterNormals = TX.waterNormals();
  waterNormals.repeat.set(8, 8);
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: '#29505a', roughness: 0.04, metalness: 0, normalMap: waterNormals,
    normalScale: new THREE.Vector2(0.3, 0.3), transparent: true, opacity: 0.9, envMapIntensity: 1.1,
  });
  for (const lk of M.lakes) {
    const shape = new THREE.Shape(lk.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 12, p.getZ(i) / 12);
    const water = new THREE.Mesh(g, waterMat);
    water.position.y = lk.level;
    water.receiveShadow = true;
    scene.add(water);
  }

  // ----- buildings from OpenStreetMap -----
  const diningId = DINING.id;
  {
    const walls = [], roofs = [], flat = [], windows = [], warm = [];
    for (const b of M.buildings) {
      if (b.house) continue;
      const pts = b.pts, area = polyArea(pts);
      const hgt = b.kind === 'greenhouse' ? 3 : area < 60 ? 3.6 : 6.4;
      const base = b.ground - 0.6, top = b.ground + hgt;
      const pos = [], uv = [];
      let run = 0;
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
        const len = Math.hypot(bx - ax, bz - az);
        const u0 = run / TEX_M, u1 = (run + len) / TEX_M, v0 = base / TEX_M, v1 = top / TEX_M;
        pos.push(ax, base, az, bx, base, bz, bx, top, bz, ax, base, az, bx, top, bz, ax, top, az);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
        run += len;
        // windows along longer walls, on each storey
        if (len > 4 && b.kind !== 'greenhouse') {
          const nx = -(bz - az) / len, nz = (bx - ax) / len; // outward for clockwise screen order; checked below
          const n = Math.floor((len - 1.5) / 3);
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n, wx = ax + (bx - ax) * t, wz = az + (bz - az) * t;
            for (const wy of hgt > 5 ? [1.6, 4.4] : [1.5]) {
              const ang = Math.atan2(-(bz - az), bx - ax);
              const target = b.id === diningId && wy < 3 ? warm : windows;
              for (const sgn of [1, -1]) {
                // place on whichever side is outside the footprint
                const px = wx + nx * 0.06 * sgn, pz = wz + nz * 0.06 * sgn;
                if (!L.pointInPoly(wx + nx * 0.5 * sgn, wz + nz * 0.5 * sgn, pts)) { target.push(box(1.0, 1.4, 0.1, px, b.ground + wy, pz, ang)); break; }
              }
            }
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      walls.push(g);
      const ob = orientedBox(pts);
      if (area / ob.area > 0.78 && b.kind !== 'greenhouse') {
        const r = hipRoof(ob.minX, ob.maxX, ob.minZ, ob.maxZ, top, Math.min(ob.maxX - ob.minX, ob.maxZ - ob.minZ) * 0.38);
        r.rotateY(-ob.angle);
        roofs.push(r);
      } else {
        const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
        const r = new THREE.ShapeGeometry(shape); r.rotateX(-Math.PI / 2); r.translate(0, top, 0);
        flat.push(r);
      }
    }
    const wallMesh = merged(walls, pbrMat(T.stone, { side: THREE.DoubleSide }));
    scene.add(wallMesh, merged(roofs, new THREE.MeshStandardMaterial({ map: T.slate.diff, normalMap: T.slate.nor, color: '#7d8590', side: THREE.DoubleSide })),
      merged(flat, new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.8, side: THREE.DoubleSide })), merged(windows, mats.glass));
    if (warm.length) scene.add(merged(warm, mats.warmGlass));
  }

  // ----- the main house: a Georgian mansion fitted to its real footprint -----
  buildMansion(scene, mats, assets);

  // ----- stone walls, hedges and fences -----
  {
    const stone = [], hedge = [], posts = [], rails = [];
    const garden = M.gardens.find((g) => polyArea(g) > 2000);
    for (const w of M.walls) {
      const tall = garden && L.pointInPoly(...L.centroid(garden), w.slice(0, -1));
      const h = tall ? 3.2 : 1.4, t = tall ? 0.5 : 0.45;
      // a gateway on the side nearest the clinic, plus gaps where drives cross
      const gates = [];
      if (tall) {
        let best = null;
        for (let i = 0; i < w.length - 1; i++) {
          const mx = (w[i][0] + w[i + 1][0]) / 2, mz = (w[i][1] + w[i + 1][1]) / 2;
          if (!best || mx < best[0]) best = [mx, mz, 2.2];
        }
        gates.push(best);
        M.gardenGate = best;
      }
      for (const run of gappedSegments(w, gates)) {
        for (let i = 0; i < run.length - 1; i++) {
          const [ax, az] = run[i], [bx, bz] = run[i + 1], len = Math.hypot(bx - ax, bz - az);
          if (len < 0.05) continue;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2, g0 = ground(mx, mz);
          stone.push(box(len + 0.05, h + 0.6, t, mx, g0 + h / 2 - 0.3, mz, -Math.atan2(bz - az, bx - ax)));
          L.addSeg([ax, az], [bx, bz], t / 2, h);
        }
      }
    }
    for (const line of M.hedges) {
      for (const run of gappedSegments(line)) for (let i = 0; i < run.length - 1; i++) {
        const [ax, az] = run[i], [bx, bz] = run[i + 1], len = Math.hypot(bx - ax, bz - az);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        hedge.push(box(len + 0.3, 1.9, 1.1, mx, ground(mx, mz) + 0.8, mz, -Math.atan2(bz - az, bx - ax)));
        L.addSeg([ax, az], [bx, bz], 0.55, 1.6);
      }
    }
    const fenceLine = (line, gates = []) => {
      for (const run of gappedSegments(line, gates)) {
        let acc = 0;
        for (let i = 0; i < run.length - 1; i++) {
          const [ax, az] = run[i], [bx, bz] = run[i + 1], len = Math.hypot(bx - ax, bz - az);
          const mx = (ax + bx) / 2, mz = (az + bz) / 2, g0 = ground(mx, mz), ang = -Math.atan2(bz - az, bx - ax);
          for (const y of [0.55, 1.0]) rails.push(box(len + 0.02, 0.09, 0.05, mx, g0 + y, mz, ang));
          acc += len;
          if (acc > 2.4 || i === 0) { acc = 0; posts.push(box(0.12, 1.25, 0.12, ax, ground(ax, az) + 0.5, az)); }
          L.addSeg([ax, az], [bx, bz], 0.08, 1.1);
        }
      }
    };
    for (const line of M.fences) fenceLine(line);
    // the alpaca paddock
    const P = PADDOCK;
    fenceLine([[P.minX, P.minZ], [P.maxX, P.minZ], [P.maxX, P.maxZ], [P.minX, P.maxZ], [P.minX, P.minZ]], [[...P.gate, 1.8]]);
    scene.add(merged(stone, mats.stone), merged(hedge, mats.hedge), merged(posts, mats.fence), merged(rails, mats.fence));
  }

  // ----- walled garden: raised beds and a glasshouse -----
  {
    const garden = M.gardens.find((g) => polyArea(g) > 2000);
    if (garden) {
      const [cx, cz] = L.centroid(garden);
      const wood = [], soil = [];
      const plantGeo = new THREE.IcosahedronGeometry(0.3, 1);
      const plantM = [];
      const col = new THREE.Color();
      for (let i = -2; i <= 2; i++) for (const dz of [-14, -6, 6, 14]) {
        const x = cx + i * 9, z = cz + dz;
        if (!L.pointInPoly(x - 4, z, garden) || !L.pointInPoly(x + 4, z, garden)) continue;
        const g0 = ground(x, z);
        wood.push(box(7, 0.45, 2, x, g0 + 0.2, z));
        soil.push(box(6.7, 0.06, 1.7, x, g0 + 0.44, z));
        L.addBox(x, z, 7, 2, 0.5);
        for (let k = 0; k < 6; k++) for (const r of [-0.45, 0.45]) {
          plantM.push(new THREE.Matrix4().compose(new THREE.Vector3(x - 2.9 + k * 1.16, g0 + 0.6, z + r), _q.setFromAxisAngle(UP, R() * 6), new THREE.Vector3(1, 0.7, 1).multiplyScalar(0.8 + R() * 0.5)));
        }
      }
      scene.add(merged(wood, mats.wood), merged(soil, mats.soil));
      const plants = new THREE.InstancedMesh(plantGeo, mats.leaf, plantM.length);
      plantM.forEach((m, i) => { plants.setMatrixAt(i, m); plants.setColorAt(i, col.setHSL(0.24 + R() * 0.1, 0.5, 0.32 + R() * 0.15)); });
      plants.castShadow = true;
      scene.add(plants);
    }
  }

  // ----- the smoking shelter -----
  {
    const S = SHELTER, g0 = ground(S.x, S.z);
    const grp = new THREE.Group();
    grp.position.set(S.x, g0, S.z);
    grp.rotation.y = S.ry;
    const frame = [], roof = [], bench = [], glass = [];
    for (const x of [-2.4, 2.4]) for (const z of [-1.3, 1.3]) frame.push(box(0.14, z < 0 ? 2.7 : 2.4, 0.14, x, (z < 0 ? 2.7 : 2.4) / 2, z));
    frame.push(box(4.95, 0.14, 0.16, 0, 2.66, -1.3), box(4.95, 0.14, 0.16, 0, 2.36, 1.3));
    const rf = box(5.4, 0.08, 3.2, 0, 2.55, 0); rf.rotateX(0); roof.push(rf);
    frame.push(box(4.8, 2.2, 0.06, 0, 1.25, -1.33)); // back panel
    for (const x of [-2.43, 2.43]) glass.push(box(0.04, 1.6, 2.4, x, 1.2, 0));
    bench.push(box(4.2, 0.07, 0.45, 0, 0.45, -0.95), box(4.2, 0.4, 0.06, 0, 0.75, -1.2));
    for (const x of [-1.8, 0, 1.8]) bench.push(box(0.08, 0.45, 0.4, x, 0.22, -0.95));
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 16), new THREE.MeshStandardMaterial({ color: '#2b3a2f', metalness: 0.6, roughness: 0.5 }));
    bin.position.set(2.0, 0.45, 0.6);
    const roofMesh = merged(roof, new THREE.MeshStandardMaterial({ color: '#4a5560', metalness: 0.4, roughness: 0.5 }));
    roofMesh.rotation.x = 0.1;
    grp.add(merged(frame, mats.wood), roofMesh, merged(bench, mats.wood), merged(glass, new THREE.MeshPhysicalMaterial({ color: '#cfe0e8', transparent: true, opacity: 0.35, roughness: 0.05 })), bin);
    // a little sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.35), new THREE.MeshStandardMaterial({ map: TX.signTexture('Smoking Shelter'), roughness: 0.6 }));
    sign.position.set(0, 2.95, 1.32);
    grp.add(sign);
    grp.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    scene.add(grp);
    // collide with the back panel and posts
    const toW = (x, z) => [S.x + x * Math.cos(S.ry) + z * Math.sin(S.ry), S.z - x * Math.sin(S.ry) + z * Math.cos(S.ry)];
    L.addSeg(toW(-2.45, -1.3), toW(2.45, -1.3), 0.12, 2.5);
    for (const x of [-2.4, 2.4]) L.addSeg(toW(x, -1.3), toW(x, 1.3), 0.08, 2.4);
  }

  // ----- trees: woods, scrub and parkland -----
  const keep = [...KEEP_CLEAR, ...Object.values(ITEMS).map((i) => [i.x, i.z, 5]), ...NPCS.map((n) => [n.x, n.z, 7])];
  const P = PADDOCK;
  const treeOk = (x, z, pad = 0) => {
    const s = L.splatAt(x, z);
    if (s[0] > 0.02 || s[2] > 0.05) return false; // drives, plots, lake shore
    if (x > P.minX - 3 && x < P.maxX + 3 && z > P.minZ - 3 && z < P.maxZ + 3) return false;
    if (keep.some(([kx, kz, r]) => Math.hypot(kx - x, kz - z) < r + pad)) return false;
    return true;
  };
  {
    const h = M.height, x0 = h.minX + 2, x1 = h.minX + (h.nx - 1) * h.cell - 2, z0 = h.minZ + 2, z1 = h.minZ + (h.nz - 1) * h.cell - 2;
    const singles = [[], []], clumps = [[], []], bushes = [];
    const spacing = high ? 6.5 : 9;
    for (let x = x0; x < x1; x += spacing) for (let z = z0; z < z1; z += spacing) {
      const jx = x + (R() - 0.5) * spacing * 0.9, jz = z + (R() - 0.5) * spacing * 0.9;
      const s = L.splatAt(jx, jz);
      const inside = jx > L.BOUNDS.minX && jx < L.BOUNDS.maxX && jz > L.BOUNDS.minZ && jz < L.BOUNDS.maxZ;
      if (s[1] > 0.6) { // woodland
        if (!treeOk(jx, jz)) continue;
        const deep = L.splatAt(jx + 9, jz)[1] > 0.9 && L.splatAt(jx - 9, jz)[1] > 0.9 && L.splatAt(jx, jz + 9)[1] > 0.9 && L.splatAt(jx, jz - 9)[1] > 0.9;
        const sc = 0.85 + R() * 0.5, ry = R() * 6.28, y = ground(jx, jz) - 0.15;
        if (deep && !inside && R() < 0.5) { if (R() < 0.6) clumps[R() < 0.5 ? 0 : 1].push(mat4(jx, y, jz, ry, sc)); continue; }
        singles[R() < 0.55 ? 0 : 1].push(mat4(jx, y, jz, ry, sc));
        if (inside) { L.addCircle(jx, jz, 0.45 * sc, 4); L.addFoliage(jx, jz, 2.3 * sc, 8 * sc); }
      } else if (s[1] > 0.25 && R() < 0.5) { // scrub and woodland edges
        if (!treeOk(jx, jz)) continue;
        bushes.push(mat4(jx, ground(jx, jz) - 0.1, jz, R() * 6.28, 0.35 + R() * 0.25));
      }
    }
    // parkland trees on the lawns and meadows around the house
    for (let i = 0; i < 260; i++) {
      const x = -260 + R() * 560, z = -300 + R() * 620;
      const s = L.splatAt(x, z);
      if (s[1] > 0.1 || !treeOk(x, z, 4) || Math.hypot(x, z) < 40) continue;
      const sc = 1.2 + R() * 0.7;
      singles[R() < 0.3 ? 0 : 1].push(mat4(x, ground(x, z) - 0.15, z, R() * 6.28, sc));
      L.addCircle(x, z, 0.5 * sc, 4);
      L.addFoliage(x, z, 2.3 * sc, 8 * sc);
    }
    const sA = normalised(assets.kk.treeA.scene, 8), sB = normalised(assets.kk.treeB.scene, 7.5);
    const cA = normalised(assets.kk.clumpA.scene, 15, 'xz'), cB = normalised(assets.kk.clumpB.scene, 15, 'xz');
    const bush = normalised(assets.kk.treeB.scene, 7.5);
    const g = new THREE.Group();
    instanced(g, sA, singles[0]); instanced(g, sB, singles[1]);
    instanced(g, cA, clumps[0]); instanced(g, cB, clumps[1]);
    instanced(g, bush, bushes);
    scene.add(g);
  }

  // ----- lake plants and rocks -----
  {
    const lilies = [normalised(assets.kk.lilyA.scene, 1.4, 'xz'), normalised(assets.kk.lilyB.scene, 1.4, 'xz')];
    const plants = [normalised(assets.kk.plantA.scene, 1.6), normalised(assets.kk.plantB.scene, 1.6)];
    const lilyM = [[], []], plantM = [[], []];
    for (const lk of M.lakes) {
      const xs = lk.pts.map((p) => p[0]), zs = lk.pts.map((p) => p[1]);
      for (let i = 0; i < 400; i++) {
        const x = Math.min(...xs) + R() * (Math.max(...xs) - Math.min(...xs)), z = Math.min(...zs) + R() * (Math.max(...zs) - Math.min(...zs));
        const inLake = L.pointInPoly(x, z, lk.pts), edge = L.polyEdgeDist(x, z, lk.pts);
        if (inLake && edge > 3 && lilyM[0].length + lilyM[1].length < 24) lilyM[i % 2].push(mat4(x, lk.level - 0.02, z, R() * 6.28, 0.6 + R() * 0.6));
        else if (edge < 1.8 && plantM[0].length + plantM[1].length < 50 && Math.hypot(x - ITEMS.drugs.x, z - ITEMS.drugs.z) > 2.5) {
          plantM[i % 2].push(mat4(x, Math.max(lk.level, ground(x, z)) - 0.1, z, R() * 6.28, 0.7 + R() * 0.6));
        }
      }
    }
    const g = new THREE.Group();
    lilies.forEach((m, i) => instanced(g, m, lilyM[i], { cast: false }));
    plants.forEach((m, i) => instanced(g, m, plantM[i]));
    scene.add(g);
  }

  // ----- benches, lamps, the north gate and kitchen props -----
  {
    const bench = normalised(assets.ph.bench.scene, 1.6, 'xz');
    const seat = (lx, lz, ry) => { const [x, z] = L.houseToWorld(lx, lz); scene.add(placed(bench, x, ground(x, z), z, ry - L.HOUSE.angle)); L.addCircle(x, z, 0.8); };
    seat(-8, 22, Math.PI); seat(8, 22, Math.PI); seat(-30, -16, 0);
    for (const lk of M.lakes) {
      const [cx] = L.centroid(lk.pts), zN = Math.min(...lk.pts.map((p) => p[1]));
      scene.add(placed(bench, cx - 5, ground(cx - 5, zN - 5), zN - 5, Math.PI)); L.addCircle(cx - 5, zN - 5, 0.8);
    }
    const lamp = normalised(assets.ph.lamp.scene, 3.9);
    for (const [lx, lz] of [[-14, -16], [14, -16], [-14, -32], [14, -32]]) {
      const [x, z] = L.houseToWorld(lx, lz);
      scene.add(placed(lamp, x, ground(x, z), z, -L.HOUSE.angle)); L.addCircle(x, z, 0.3, 4);
    }
    const gate = normalised(assets.ph.gate.scene, 3.2);
    const [gx, gz] = [199.7, -286.5];
    scene.add(placed(gate, gx, ground(gx, gz), gz, 0.9));
    const barrel = normalised(assets.kk.barrel.scene, 1.1), crate = normalised(assets.kk.crate.scene, 0.9);
    for (const [lx, lz, m] of [[20, 13.5, barrel], [21.4, 13.6, barrel], [16.5, 13.8, crate]]) {
      const [x, z] = L.houseToWorld(lx, lz);
      scene.add(placed(m, x, ground(x, z), z, R() * 6)); L.addCircle(x, z, 0.6);
    }
  }

  // ----- grass that follows the player (heights and mask read on the GPU) -----
  const grassCenter = { value: new THREE.Vector2() };
  {
    const blades = 5, verts = [], colors = [], normals = [];
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + R(), r = R() * 0.18;
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      const ry = R() * Math.PI, w = 0.045, h = 0.4 + R() * 0.3, lean = (R() - 0.5) * 0.25;
      const cx = Math.cos(ry) * w, cz = Math.sin(ry) * w;
      verts.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, ox + lean, h, oz + lean * 0.5);
      verts.push(ox + cx, 0, oz + cz, ox - cx, 0, oz - cz, ox + lean, h, oz + lean * 0.5);
      colors.push(0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 1, 1, 1, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 1, 1, 1);
      for (let k = 0; k < 6; k++) normals.push(0, 1, 0);
    }
    const count = high ? 60000 : 22000, size = high ? 110 : 80;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const offs = new Float32Array(count * 4), tints = new Float32Array(count * 3), col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      offs.set([(R() - 0.5) * size, (R() - 0.5) * size, 0.7 + R() * 0.7, R()], i * 4);
      col.setHSL(0.24 + R() * 0.06, 0.55, 0.2 + R() * 0.08);
      tints.set([col.r, col.g, col.b], i * 3);
    }
    g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 4));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
    g.instanceCount = count;
    const h = M.height;
    const heightTex = new THREE.DataTexture(L.geo.H, h.nx, h.nz, THREE.RedFormat, THREE.FloatType);
    heightTex.minFilter = heightTex.magFilter = THREE.NearestFilter; // float textures can't be filtered everywhere
    heightTex.generateMipmaps = false;
    heightTex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uTime: time, uCenter: grassCenter, uSize: { value: size },
        tHeight: { value: heightTex }, hRect: { value: new THREE.Vector4(h.minX, h.minZ, h.cell, 0) }, hSize: { value: new THREE.Vector2(h.nx, h.nz) },
        tSplat: { value: M.splatTexture }, splatRect: { value: new THREE.Vector4(sp.minX, sp.minZ, sp.w, sp.h) },
      });
      shader.vertexShader = `uniform float uTime, uSize; uniform vec2 uCenter, hSize; uniform vec4 hRect, splatRect;
        uniform sampler2D tHeight, tSplat; attribute vec4 aOffset; attribute vec3 aTint;
        float hAt(vec2 p) {
          vec2 f = (p - hRect.xy) / hRect.z; vec2 i = clamp(floor(f), vec2(0.0), hSize - 2.0); vec2 u = clamp(f - i, 0.0, 1.0);
          float a = texelFetch(tHeight, ivec2(i), 0).r, b = texelFetch(tHeight, ivec2(i) + ivec2(1, 0), 0).r;
          float c = texelFetch(tHeight, ivec2(i) + ivec2(0, 1), 0).r, d = texelFetch(tHeight, ivec2(i) + ivec2(1, 1), 0).r;
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }\n` + shader.vertexShader
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb *= aTint;')
        .replace('#include <begin_vertex>', `
          vec2 wp = aOffset.xy + uSize * floor((uCenter - aOffset.xy) / uSize + 0.5);
          vec3 sm = texture2D(tSplat, (wp - splatRect.xy) / splatRect.zw).rgb;
          float keep = (1.0 - smoothstep(0.02, 0.3, sm.r)) * (1.0 - smoothstep(0.02, 0.3, sm.b)) * step(aOffset.w, 1.0 - sm.g * 0.7);
          float edge = 1.0 - smoothstep(uSize * 0.35, uSize * 0.5, length(wp - uCenter));
          float s = aOffset.z * keep * edge;
          vec3 transformed = position * s;
          float sway = sin(uTime * 1.6 + wp.x * 0.3 + wp.y * 0.22) * 0.5 + sin(uTime * 2.7 + wp.x * 0.7 - wp.y * 0.4) * 0.25;
          float bend = position.y * position.y;
          transformed.x += sway * bend * 0.6 * s; transformed.z += sway * bend * 0.35 * s;
          transformed += vec3(wp.x, hAt(wp) - 0.03, wp.y);`);
    };
    const grass = new THREE.Mesh(g, mat);
    grass.frustumCulled = false;
    grass.receiveShadow = true;
    scene.add(grass);

    // wild flowers near the house
    const fGeo = new THREE.IcosahedronGeometry(0.05, 0);
    const flowers = new THREE.InstancedMesh(fGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), high ? 5000 : 2000);
    const palette = ['#e86a92', '#f2d14b', '#ffffff', '#b58be0', '#ff8a5c'];
    let f = 0;
    for (let d = 0; d < 120 && f < flowers.count; d++) {
      const cx = -200 + R() * 400, cz = -250 + R() * 500, hue = palette[Math.floor(R() * palette.length)];
      for (let i = 0; i < flowers.count / 100 && f < flowers.count; i++) {
        const x = cx + (R() - 0.5) * 14, z = cz + (R() - 0.5) * 14, s = L.splatAt(x, z);
        if (s[0] > 0.02 || s[2] > 0.05 || s[1] > 0.3) continue;
        _p.set(x, ground(x, z) + 0.22 + R() * 0.1, z);
        _s.setScalar(0.8 + R() * 0.6);
        flowers.setMatrixAt(f, _m.compose(_p, _q.identity(), _s));
        flowers.setColorAt(f, col.set(hue).offsetHSL(0, 0, (R() - 0.5) * 0.1));
        f++;
      }
    }
    flowers.count = f;
    scene.add(flowers);
  }

  function update(t, player) {
    time.value = t;
    grassCenter.value.set(player.x, player.z);
    waterNormals.offset.set(t * 0.012, t * 0.008);
  }

  return { update };
}

// ---------- the house ----------
// A three-storey centre block with lower wings, sash windows, hipped slate
// roofs, chimneys and a columned porch, fitted to the real footprint.
function buildMansion(scene, mats, assets) {
  const T = assets.tex;
  const grp = new THREE.Group();
  const base = L.geo.meta.buildings.find((b) => b.house).ground;
  grp.position.set(0, base, 0);
  grp.rotation.y = -L.HOUSE.angle;
  const stone = [], roofs = [], trim = [], glass = [], dark = [], chim = [];
  const blocks = [
    { x0: -11.8, x1: 11.6, z0: -2.3, z1: 12.4, h: 12.2, rows: [1.4, 5.2, 8.9] },        // centre
    { x0: -23.5, x1: -17.6, z0: -9.5, z1: 11.4, h: 7.6, rows: [1.4, 4.6] },             // west wing
    { x0: -17.6, x1: -11.8, z0: -6, z1: 11.4, h: 7.6, rows: [1.4, 4.6] },
    { x0: 11.6, x1: 17.4, z0: -6.2, z1: 11.2, h: 7.6, rows: [1.4, 4.6] },               // east wing
    { x0: 17.4, x1: 25.6, z0: -9.7, z1: 11.1, h: 7.6, rows: [1.4, 4.6] },
  ];
  for (const b of blocks) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    stone.push(box(w, b.h + 1, d, cx, b.h / 2 - 0.5, cz));
    trim.push(box(w + 0.3, 0.35, d + 0.3, cx, b.h - 0.1, cz)); // cornice
    trim.push(box(w + 0.15, 0.25, d + 0.15, cx, 0.9, cz)); // plinth band
    roofs.push(hipRoof(b.x0, b.x1, b.z0, b.z1, b.h, Math.min(w, d) * 0.32, 0.45));
    // sash windows on each face, skipping where wings meet
    const faces = [
      { len: w, fixed: b.z0, along: 'x', from: b.x0, out: -1 }, { len: w, fixed: b.z1, along: 'x', from: b.x0, out: 1 },
      { len: d, fixed: b.x0, along: 'z', from: b.z0, out: -1 }, { len: d, fixed: b.x1, along: 'z', from: b.z0, out: 1 },
    ];
    for (const f of faces) {
      const n = Math.floor(f.len / 2.7);
      for (let i = 0; i < n; i++) {
        const u = f.from + (i + 0.5) * (f.len / n);
        const px = f.along === 'x' ? u : f.fixed + f.out * 0.08, pz = f.along === 'x' ? f.fixed + f.out * 0.08 : u;
        const probe = f.along === 'x' ? [u, f.fixed + f.out * 0.6] : [f.fixed + f.out * 0.6, u];
        if (blocks.some((o) => o !== b && probe[0] > o.x0 && probe[0] < o.x1 && probe[1] > o.z0 && probe[1] < o.z1)) continue;
        if (b === blocks[0] && f.out === -1 && f.along === 'x' && Math.abs(u) < 3) continue; // the porch
        for (const [ri, y] of b.rows.entries()) {
          const wh = ri === b.rows.length - 1 && b.rows.length === 3 ? 1.6 : 2.2;
          const ry = f.along === 'x' ? 0 : Math.PI / 2;
          trim.push(box(1.35, wh + 0.3, 0.12, px, y + wh / 2, pz, ry));
          glass.push(box(1.05, wh, 0.2, px, y + wh / 2, pz, ry));
          trim.push(box(1.05, 0.06, 0.24, px, y + wh / 2, pz, ry)); // meeting rail
        }
      }
    }
  }
  // chimney stacks
  for (const [x, z] of [[-10.6, 2], [-10.6, 9], [10.4, 2], [10.4, 9], [-20.5, 0], [21.5, 0]]) {
    const bh = Math.abs(x) > 15 ? 7.6 : 12.2;
    chim.push(box(1.2, 3.4, 2.2, x, bh + 1.6, z));
    for (const dz of [-0.6, 0, 0.6]) dark.push(cyl(0.16, 0.16, 0.5, x, bh + 3.5, z + dz, 10));
  }
  // pedimented centre and columned porch on the entrance front (-z)
  {
    const shape = new THREE.Shape();
    shape.moveTo(-5.5, 0); shape.lineTo(5.5, 0); shape.lineTo(0, 2.3); shape.closePath();
    const ped = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
    ped.translate(0, 12.1, -2.6);
    stone.push(ped);
    for (const x of [-1.9, -0.65, 0.65, 1.9]) {
      trim.push(cyl(0.2, 0.23, 3.6, x, 1.8 + 0.35, -5.4, 16), box(0.55, 0.2, 0.55, x, 0.35, -5.4), box(0.6, 0.2, 0.6, x, 4.05, -5.4));
      L.addCircle(...L.houseToWorld(x, -5.4), 0.18, 4);
    }
    trim.push(box(4.8, 0.55, 3.6, 0, 4.4, -4.1)); // entablature and porch roof
    const pshape = new THREE.Shape();
    pshape.moveTo(-2.5, 0); pshape.lineTo(2.5, 0); pshape.lineTo(0, 1.0); pshape.closePath();
    const pp = new THREE.ExtrudeGeometry(pshape, { depth: 0.3, bevelEnabled: false });
    pp.translate(0, 4.65, -5.9);
    trim.push(pp);
    trim.push(box(5.4, 0.18, 4.2, 0, 0.09, -4.2), box(4.6, 0.18, 3.4, 0, 0.27, -4.0)); // steps
    dark.push(box(1.7, 3.0, 0.12, 0, 1.85, -2.36));
    const fan = new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20, 1, false, Math.PI / 2, Math.PI);
    fan.rotateX(Math.PI / 2); fan.translate(0, 3.35, -2.36);
    glass.push(fan);
  }
  // a canted bay window on the east wing's entrance side
  {
    const bx = 21.5, bz = -9.7;
    stone.push(box(4.2, 4.0, 1.6, bx, 1.5, bz - 0.8));
    for (const dx of [-1.3, 0, 1.3]) glass.push(box(1.0, 2.0, 0.2, bx + dx, 2.0, bz - 1.62));
    roofs.push(hipRoof(bx - 2.1, bx + 2.1, bz - 1.6, bz, 3.5, 0.6, 0.15));
  }
  const slate = new THREE.MeshStandardMaterial({ map: T.slate.diff, normalMap: T.slate.nor, color: '#6f7782', side: THREE.DoubleSide });
  grp.add(merged(stone, mats.stone), merged(roofs, slate), merged(trim, mats.trim), merged(glass, mats.glass),
    merged(dark, mats.door), merged(chim, mats.stone));
  scene.add(grp);
}

