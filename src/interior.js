// The inside of the castle: the Front Hall, the Quiet Room (the old billiard
// room) and the staircase. Modelled on reference photos of the real rooms,
// using CC0 Poly Haven furniture and textures (see CREDITS.md).
import * as THREE from 'three';
import * as L from './layout.js';
import * as TX from './textures.js';
import { box, cyl, merged, pbrMat, TEX_M } from './world.js';
import { normalised } from './assets.js';

const { ROOMS } = L;
const WALL = 0.2; // wall thickness

// A straight wall with openings (doors and windows). axis 'x' runs along x at z = at.
// openings: [{ from, to, bottom, top }] in metres along the wall.
function wall(geos, axis, at, a, b, h, openings = [], { y0 = 0, t = WALL } = {}) {
  const piece = (u0, u1, ya, yb) => {
    if (u1 - u0 < 0.001 || yb - ya < 0.001) return;
    const mid = (u0 + u1) / 2, ym = (ya + yb) / 2;
    geos.push(axis === 'x' ? box(u1 - u0, yb - ya, t, mid, ym, at) : box(t, yb - ya, u1 - u0, at, ym, mid));
  };
  let cur = a;
  for (const o of [...openings].sort((p, q) => p.from - q.from)) {
    piece(cur, o.from, y0, h);
    piece(o.from, o.to, y0, Math.max(y0, o.bottom || 0));
    piece(o.from, o.to, Math.max(y0, o.top), h);
    cur = o.to;
  }
  piece(cur, b, y0, h);
}

// Four walls around a room rect, just outside it. open: { n, s, e, w } opening lists.
function roomWalls(geos, r, h, open = {}, opts = {}) {
  const t = opts.t ?? WALL, inset = opts.inset ?? 0; // inset > 0 places a lining inside the room
  const off = inset ? -inset - t / 2 : t / 2;
  wall(geos, 'x', r.minZ - off, r.minX - (inset ? 0 : t), r.maxX + (inset ? 0 : t), h, open.n, opts);
  wall(geos, 'x', r.maxZ + off, r.minX - (inset ? 0 : t), r.maxX + (inset ? 0 : t), h, open.s, opts);
  wall(geos, 'z', r.minX - off, r.minZ, r.maxZ, h, open.w, opts);
  wall(geos, 'z', r.maxX + off, r.minZ, r.maxZ, h, open.e, opts);
}

function floor(r, mat, y = 0) {
  const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
  const m = new THREE.Mesh(box(w, 0.05, d, (r.minX + r.maxX) / 2, y - 0.025, (r.minZ + r.maxZ) / 2), mat);
  m.receiveShadow = true;
  return m;
}

// Groin vault over one bay: the higher of two crossing barrel vaults.
function groinVault(cx, cz, bw, bd, spring, rise) {
  const g = new THREE.PlaneGeometry(bw, bd, 28, 28);
  g.rotateX(Math.PI / 2); // faces down
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getZ(i);
    const hA = rise * Math.sqrt(Math.max(0, 1 - (2 * v / bd) ** 2));
    const hB = rise * Math.sqrt(Math.max(0, 1 - (2 * u / bw) ** 2));
    p.setXYZ(i, u + cx, spring + Math.max(hA, hB), v + cz);
    uv.setXY(i, (uv.getX(i) * bw) / TEX_M, (uv.getY(i) * bd) / TEX_M);
  }
  g.computeVertexNormals();
  return g;
}

function tinted(root, color, extra = {}) {
  const o = root.clone(true);
  o.traverse((c) => {
    if (!c.isMesh) return;
    c.material = c.material.clone();
    c.material.color.set(color);
    Object.assign(c.material, extra);
  });
  return o;
}

function put(group, model, x, y, z, ry = 0, s = 1) {
  const o = model.clone(true);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.scale.setScalar(s);
  o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  group.add(o);
  return o;
}

const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z); // turn a model's front (+z) towards a point

export function buildInterior(scene, { assets }) {
  const T = assets.tex, P = assets.ph;
  const group = new THREE.Group();
  group.position.set(L.INTERIOR.x, 0, L.INTERIOR.z);
  group.visible = false;
  scene.add(group);
  const lights = [];
  const fires = [];

  const rep = (t, n) => { for (const k of ['diff', 'nor', 'arm']) { t[k] = t[k].clone(); t[k].repeat.set(n, n); t[k].needsUpdate = true; } return t; };
  const mats = {
    plaster: pbrMat(T.plaster, { color: '#f2e8cf' }),
    vault: pbrMat(T.plaster, { color: '#f6edd6', side: THREE.DoubleSide }),
    darkFloor: pbrMat(rep({ ...T.darkFloor }, 1), { color: '#9a7a62' }),
    parquet: pbrMat(rep({ ...T.parquet }, 1.5)),
    panels: pbrMat(T.panels, { color: '#b9814c' }),
    oak: pbrMat(T.wood, { color: '#8a5a32' }),
    ceilingWood: pbrMat(T.wood, { color: '#c48d55' }),
    marble: pbrMat(T.marble, { color: '#f3efe6' }),
    greyMarble: pbrMat(T.marble, { color: '#8f959c' }),
    velvet: pbrMat(T.velvet, { color: '#6e1820' }),
    stairCarpet: pbrMat(T.velvet, { color: '#7a1f28' }),
    trim: new THREE.MeshStandardMaterial({ color: '#f7f2e6', roughness: 0.6 }),
    skirting: new THREE.MeshStandardMaterial({ color: '#3b2618', roughness: 0.5 }),
    wallpaper: new THREE.MeshStandardMaterial({ map: TX.wallpaper(), roughness: 0.9 }),
    tiles: new THREE.MeshStandardMaterial({ map: TX.greenTiles(), roughness: 0.25 }),
    slate: new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.7 }),
    soot: new THREE.MeshStandardMaterial({ color: '#0d0b0a', roughness: 1 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c9a050', metalness: 1, roughness: 0.3 }),
    iron: new THREE.MeshStandardMaterial({ color: '#1e1e1e', metalness: 0.7, roughness: 0.5 }),
    daylight: new THREE.MeshStandardMaterial({ color: '#e8f0f4', emissive: '#d8e6ef', emissiveIntensity: 1.3, roughness: 0.1 }),
    flame: new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  mats.wallpaper.map.repeat.set(1.2, 1.2);

  const H = ROOMS.hall, Q = ROOMS.quiet, S = ROOMS.stairs;
  const SPRING = 3.6, RISE = 2.0, HALL_H = SPRING + RISE;

  // ---------- openings ----------
  const hallOpen = {
    s: [{ from: -1.1, to: 1.1, bottom: 0, top: 2.9 }, { from: -5.2, to: -3.6, bottom: 0.5, top: 3.3 }, { from: 3.6, to: 5.2, bottom: 0.5, top: 3.3 }],
    e: [{ from: -3.4, to: -1.6, bottom: 0.5, top: 3.3 }, { from: 1.6, to: 3.4, bottom: 0.5, top: 3.3 }],
    w: [{ from: 1.4, to: 3.6, bottom: 0, top: 2.8 }],
    n: [{ from: -6.2, to: -3.6, bottom: 0, top: 3.2 }],
  };
  const quietOpen = {
    s: [-17.2, -13.5, -9.8].map((x) => ({ from: x - 0.8, to: x + 0.8, bottom: 0.6, top: 3.3 })),
    e: [{ from: 1.4, to: 3.6, bottom: 0, top: 2.8 }],
  };
  const stairOpen = {
    s: [{ from: -6.2, to: -3.6, bottom: 0, top: 3.2 }],
    n: [{ from: -6.6, to: -5.4, bottom: 3.2, top: 5.3 }],
  };

  // ---------- shells ----------
  {
    const plaster = [], wallpaperG = [], panels = [], skirting = [], trim = [];
    roomWalls(plaster, H, HALL_H, hallOpen);
    roomWalls(plaster, S, 6, stairOpen);
    roomWalls(wallpaperG, Q, 4.2, quietOpen);
    // skirting boards, a dado rail in the hall, panelling in the Quiet Room
    roomWalls(skirting, H, 0.22, hallOpen, { t: 0.04, inset: 0.0001 });
    roomWalls(skirting, S, 0.22, stairOpen, { t: 0.04, inset: 0.0001 });
    roomWalls(trim, H, 1.05, hallOpen, { t: 0.05, inset: 0.0001, y0: 0.98 });
    roomWalls(panels, Q, 2.3, quietOpen, { t: 0.06, inset: 0.0001 });
    roomWalls(trim, Q, 2.42, quietOpen, { t: 0.07, inset: 0.0001, y0: 2.3 });
    // cornices
    roomWalls(trim, S, 6, stairOpen, { t: 0.12, inset: 0.0001, y0: 5.8 });
    roomWalls(trim, Q, 4.2, quietOpen, { t: 0.14, inset: 0.0001, y0: 3.95 });
    group.add(merged(plaster, mats.plaster), merged(wallpaperG, mats.wallpaper), merged(panels, mats.panels),
      merged(skirting, mats.skirting), merged(trim, mats.trim));

    group.add(floor(H, mats.darkFloor), floor(S, mats.darkFloor), floor(Q, mats.parquet));
    group.add(floor(L.DOORWAYS.quiet, mats.darkFloor), floor(L.DOORWAYS.stairs, mats.darkFloor), floor(L.DOORWAYS.front, mats.darkFloor));

    // hall: groin vaults, 3 bays by 2, on marble columns
    const vaults = [], marble = [], pil = [];
    const bw = (H.maxX - H.minX) / 3, bd = (H.maxZ - H.minZ) / 2;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      vaults.push(groinVault(H.minX + bw * (i + 0.5), H.minZ + bd * (j + 0.5), bw, bd, SPRING, RISE));
    }
    const col = (x, z) => {
      marble.push(box(0.62, 0.22, 0.62, x, 0.11, z), cyl(0.22, 0.26, SPRING - 0.5, x, 0.22 + (SPRING - 0.5) / 2, z, 20),
        box(0.66, 0.28, 0.66, x, SPRING - 0.14, z), cyl(0.3, 0.24, 0.18, x, SPRING - 0.34, z, 20));
      L.addInCircle(x, z, 0.38);
    };
    col(H.minX + bw, 0); col(H.minX + 2 * bw, 0);
    for (const x of [H.minX + bw, H.minX + 2 * bw]) for (const z of [H.minZ + 0.09, H.maxZ - 0.09]) pil.push(box(0.5, SPRING, 0.18, x, SPRING / 2, z));
    for (const x of [H.minX + 0.09, H.maxX - 0.09]) pil.push(box(0.18, SPRING, 0.5, x, SPRING / 2, 0));
    const v = new THREE.Mesh(mergeAll(vaults), mats.vault);
    v.receiveShadow = true;
    group.add(v, merged(marble, mats.marble), merged(pil, mats.trim));

    // Quiet Room: beamed timber ceiling with a carved rosette
    const ceil = [box(Q.maxX - Q.minX, 0.1, Q.maxZ - Q.minZ, (Q.minX + Q.maxX) / 2, 4.25, (Q.minZ + Q.maxZ) / 2)];
    const beams = [];
    for (let x = Q.minX + 2.1; x < Q.maxX - 1; x += 2.1) beams.push(box(0.28, 0.32, Q.maxZ - Q.minZ, x, 4.04, (Q.minZ + Q.maxZ) / 2));
    for (let z = Q.minZ + 3; z < Q.maxZ - 1; z += 3) beams.push(box(Q.maxX - Q.minX, 0.32, 0.28, (Q.minX + Q.maxX) / 2, 4.04, z));
    group.add(merged(ceil, mats.ceilingWood), merged(beams, mats.oak));
    const rosette = [];
    const rc = [(Q.minX + Q.maxX) / 2, -0.5];
    for (const [dx, dz, r] of [[0, 0, 0.32], [0.55, 0, 0.22], [-0.55, 0, 0.22], [0, 0.55, 0.22], [0, -0.55, 0.22]]) {
      const t = new THREE.TorusGeometry(r, 0.07, 8, 20); t.rotateX(Math.PI / 2); t.translate(rc[0] + dx, 4.15, rc[1] + dz);
      const d = new THREE.SphereGeometry(r * 0.55, 12, 8); d.scale(1, 0.4, 1); d.translate(rc[0] + dx, 4.17, rc[1] + dz);
      rosette.push(t, d);
    }
    group.add(merged(rosette, mats.oak));

    // stair hall ceiling
    group.add(merged([box(S.maxX - S.minX + 0.4, 0.1, S.maxZ - S.minZ + 0.4, (S.minX + S.maxX) / 2, 6.05, (S.minZ + S.maxZ) / 2)], mats.plaster));
    // hall: close the top of the shared walls above the vault line
    group.add(merged([box(H.maxX - H.minX + 0.4, 0.1, H.maxZ - H.minZ + 0.4, 0, HALL_H + 0.08, 0)], mats.plaster));
  }

  // ---------- windows, doors and curtains ----------
  {
    const glass = [], bars = [], frames = [], curtains = [];
    const sash = (axis, at, from, to, bottom, top, inward) => {
      const w = to - from, h = top - bottom, mid = (from + to) / 2, ym = (bottom + top) / 2;
      const mk = (a, b, c, x, y, z) => (axis === 'x' ? box(a, b, c, x, y, z) : box(c, b, a, z, y, x));
      glass.push(mk(w, h, 0.04, mid, ym, at));
      bars.push(mk(w, 0.06, 0.08, mid, ym, at)); // meeting rail
      for (const k of [1, 2]) bars.push(mk(0.04, h, 0.06, from + (w * k) / 3, ym, at));
      for (const k of [0.25, 0.75]) bars.push(mk(w, 0.04, 0.06, mid, bottom + h * k, at));
      frames.push(mk(w + 0.24, 0.12, 0.14, mid, top + 0.06, at + inward * 0.06), mk(w + 0.24, 0.1, 0.3, mid, bottom - 0.05, at + inward * 0.12));
      for (const s of [-1, 1]) frames.push(mk(0.12, h + 0.2, 0.14, mid + s * (w / 2 + 0.06), ym, at + inward * 0.06));
      return { mk, mid, w, h, top, ym };
    };
    const withCurtains = (o, at, inward) => {
      for (const s of [-1, 1]) curtains.push(o.mk(0.55, o.h + 0.6, 0.12, o.mid + s * (o.w / 2 + 0.2), o.ym + 0.2, at + inward * 0.25));
      curtains.push(o.mk(o.w + 1.4, 0.4, 0.16, o.mid, o.top + 0.45, at + inward * 0.25));
    };
    for (const o of hallOpen.e) withCurtains(sash('z', H.maxX + 0.1, o.from, o.to, o.bottom, o.top, -1), H.maxX + 0.1, -1);
    for (const o of hallOpen.s.slice(1)) withCurtains(sash('x', H.maxZ + 0.1, o.from, o.to, o.bottom, o.top, -1), H.maxZ + 0.1, -1);
    for (const o of quietOpen.s) sash('x', Q.maxZ + 0.1, o.from, o.to, o.bottom, o.top, -1);
    for (const o of stairOpen.n) sash('x', S.minZ - 0.1, o.from, o.to, o.bottom, o.top, 1);
    group.add(merged(glass, mats.daylight, { cast: false }), merged(bars, mats.trim), merged(frames, mats.trim), merged(curtains, mats.velvet));

    // front doors with a fanlight
    const doors = [box(1.05, 2.85, 0.08, -0.55, 1.43, H.maxZ + 0.12), box(1.05, 2.85, 0.08, 0.55, 1.43, H.maxZ + 0.12)];
    const doorTrim = [box(2.6, 0.18, 0.2, 0, 3.0, H.maxZ - 0.02), box(0.18, 3.0, 0.2, -1.2, 1.5, H.maxZ - 0.02), box(0.18, 3.0, 0.2, 1.2, 1.5, H.maxZ - 0.02)];
    for (const x of [-0.85, -0.25, 0.25, 0.85]) for (const y of [0.7, 1.9]) doorTrim.push(box(0.36, 0.8, 0.03, x, y, H.maxZ + 0.07));
    group.add(merged(doors, mats.skirting), merged(doorTrim, mats.trim));
    // inner door architraves
    const arch = [];
    const qd = L.DOORWAYS.quiet;
    for (const z of [qd.minZ - 0.08, qd.maxZ + 0.08]) arch.push(box(0.9, 2.9, 0.16, -7.2, 1.45, z));
    arch.push(box(0.9, 0.2, 2.5, -7.2, 2.9, (qd.minZ + qd.maxZ) / 2));
    group.add(merged(arch, mats.oak));
    const sd = L.DOORWAYS.stairs;
    const sArch = [];
    for (const x of [sd.minX - 0.1, sd.maxX + 0.1]) sArch.push(box(0.2, 3.3, 0.5, x, 1.65, -5.2));
    sArch.push(box(sd.maxX - sd.minX + 0.4, 0.22, 0.5, (sd.minX + sd.maxX) / 2, 3.3, -5.2));
    group.add(merged(sArch, mats.trim));
  }

  // ---------- fireplaces ----------
  const fireplace = (x, wallZ, style) => {
    const z = wallZ + 0.2;
    const surround = [], dark = [], hearth = [];
    const m = style === 'marble' ? mats.greyMarble : mats.oak;
    surround.push(box(0.45, 1.3, 0.38, x - 0.95, 0.65, z), box(0.45, 1.3, 0.38, x + 0.95, 0.65, z),
      box(2.35, 0.36, 0.4, x, 1.48, z), box(2.75, 0.08, 0.52, x, 1.7, z + 0.04));
    dark.push(box(1.45, 1.3, 0.32, x, 0.65, z - 0.04));
    hearth.push(box(2.8, 0.05, 0.95, x, 0.025, wallZ + 0.5));
    if (style === 'marble') {
      surround.push(box(2.4, 1.05, 0.16, x, 2.28, wallZ + 0.08));
      for (const dx of [-0.75, -0.25, 0.25, 0.75]) {
        const g = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 24); g.rotateX(Math.PI / 2); g.translate(x + dx, 2.28, wallZ + 0.19);
        dark.push(g);
      }
      group.add(merged(surround, m), merged(dark, mats.slate), merged(hearth, mats.slate));
    } else {
      // tall carved oak overmantel with corbels, green tiled slips and hearth
      surround.push(box(2.7, 1.9, 0.22, x, 2.7, wallZ + 0.11), box(2.95, 0.14, 0.42, x, 3.7, wallZ + 0.21));
      for (const dx of [-1.25, 1.25]) surround.push(box(0.2, 0.5, 0.36, x + dx, 3.4, wallZ + 0.24), box(0.14, 1.2, 0.08, x + dx, 2.4, wallZ + 0.25));
      for (const dx of [-0.6, 0, 0.6]) surround.push(box(0.5, 0.8, 0.05, x + dx, 2.55, wallZ + 0.24));
      group.add(merged(surround, m), merged(dark, mats.soot), merged(hearth, mats.tiles),
        merged([box(0.25, 1.3, 0.3, x - 0.6, 0.65, z + 0.02), box(0.25, 1.3, 0.3, x + 0.6, 0.65, z + 0.02)], mats.tiles));
    }
    // the fire
    const fire = new THREE.Group();
    fire.position.set(x, 0.12, z + 0.05);
    const logs = merged([box(0.7, 0.12, 0.14, 0, 0.06, 0, 0.3), box(0.6, 0.12, 0.14, 0, 0.12, 0.05, -0.4)], mats.oak);
    fire.add(logs);
    const flames = [];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.1 + Math.random() * 0.06, 0.4 + Math.random() * 0.3, 8, 1, true), mats.flame);
      f.position.set(-0.25 + i * 0.12, 0.35, 0.02 * (i % 2));
      fire.add(f);
      flames.push(f);
    }
    group.add(fire);
    const light = new THREE.PointLight('#ff9a4a', 5, 7, 1.6);
    light.position.set(x, 0.7, z + 0.6);
    group.add(light);
    lights.push(light);
    fires.push({ flames, light });
    L.addInBox(x, wallZ + 0.4, 2.9, 0.8);
  };
  fireplace(0, H.minZ, 'marble');
  fireplace((Q.minX + Q.maxX) / 2, Q.minZ, 'oak');

  // ---------- stag's head above the hall fireplace ----------
  {
    const brown = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.9 });
    const antler = new THREE.MeshStandardMaterial({ color: '#d8c8a8', roughness: 0.7 });
    const head = new THREE.Group();
    head.position.set(0, 3.35, H.minZ + 0.12);
    const plaque = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 6), mats.oak);
    plaque.rotation.x = Math.PI / 2; plaque.scale.set(1, 1, 1.25);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.3, 12), brown);
    neck.rotation.x = Math.PI / 2.4; neck.position.set(0, -0.03, 0.15);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), brown);
    skull.scale.set(1, 1, 1.5); skull.position.set(0, 0.04, 0.32);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), brown);
    muzzle.scale.set(1, 0.9, 1.3); muzzle.position.set(0, -0.03, 0.48);
    head.add(plaque, neck, skull, muzzle);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), brown);
      ear.position.set(s * 0.14, 0.12, 0.26); ear.rotation.z = -s * 1.1;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.6, 6), antler);
      beam.position.set(s * 0.2, 0.38, 0.28); beam.rotation.z = -s * 0.45;
      head.add(ear, beam);
      for (const [h, a] of [[0.12, 0.9], [0.3, 0.7], [0.48, 0.5]]) {
        const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.018, 0.2, 5), antler);
        tine.position.set(s * (0.1 + h * 0.45), 0.12 + h, 0.32);
        tine.rotation.set(0.5, 0, -s * a);
        head.add(tine);
      }
    }
    head.traverse((c) => { if (c.isMesh) c.castShadow = true; });
    group.add(head);
  }

  // ---------- rugs ----------
  const rug = (tex, w, d, x, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    m.rotation.set(-Math.PI / 2, 0, ry);
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    group.add(m);
  };
  rug(TX.persianRug(4), 4.4, 3.2, 0, -2.1);
  rug(TX.persianRug(9), 3.6, 2.4, -4.4, 2.6);
  rug(TX.persianRug(15), 1.4, 3.6, -4.9, -7.5);
  rug(TX.tartanRug(), 5.2, 4.2, (Q.minX + Q.maxX) / 2, -0.4);

  // ---------- staircase ----------
  {
    const st = L.STAIRS, n = 10, run = (st.bottomZ - st.topZ) / n, rise = st.rise / n;
    const wood = [], carpet = [], rail = [], posts = [];
    const sx = (st.minX + st.maxX) / 2, sw = st.maxX - st.minX;
    for (let i = 0; i < n; i++) {
      const z0 = st.bottomZ - i * run, h = (i + 1) * rise;
      wood.push(box(sw, h, run, sx, h / 2, z0 - run / 2));
      carpet.push(box(sw * 0.62, 0.02, run, sx, h + 0.01, z0 - run / 2));
    }
    wood.push(box(sw, st.rise, st.topZ - S.minZ, sx, st.rise / 2, (st.topZ + S.minZ) / 2)); // landing
    carpet.push(box(sw * 0.62, 0.02, st.topZ - S.minZ, sx, st.rise + 0.01, (st.topZ + S.minZ) / 2));
    // banister: newel post, balusters and a brass handrail following the slope
    const bx = st.maxX + 0.07;
    posts.push(box(0.14, 1.15, 0.14, bx, 0.58, st.bottomZ - 0.05));
    for (let i = 0; i <= n; i++) {
      const z = st.bottomZ - i * run - run / 2, y = Math.min(st.rise, (i + 1) * rise);
      posts.push(box(0.04, 0.9, 0.04, bx, y + 0.45, z));
    }
    for (let z = st.topZ - 0.2; z > S.minZ; z -= 0.3) posts.push(box(0.04, 0.9, 0.04, bx, st.rise + 0.45, z));
    const len = Math.hypot(st.bottomZ - st.topZ, st.rise);
    const handrail = new THREE.CylinderGeometry(0.035, 0.035, len, 10);
    handrail.rotateX(Math.PI / 2 - Math.atan2(st.rise, st.bottomZ - st.topZ));
    handrail.translate(bx, st.rise / 2 + 0.95, (st.bottomZ + st.topZ) / 2);
    rail.push(handrail);
    const top = new THREE.CylinderGeometry(0.035, 0.035, st.topZ - S.minZ, 10); top.rotateX(Math.PI / 2);
    top.translate(bx, st.rise + 0.95, (st.topZ + S.minZ) / 2);
    rail.push(top);
    group.add(merged(wood, mats.oak), merged(carpet, mats.stairCarpet), merged(posts, mats.skirting), merged(rail, mats.brass));
    L.addInBox(bx, (S.minZ + st.bottomZ - 0.4) / 2, 0.14, st.bottomZ - 0.4 - S.minZ);
  }

  // ---------- furniture (Poly Haven) ----------
  {
    const armchair = normalised(P.armchair.scene, 1.0);
    const olive = tinted(armchair, '#a59a52'), leather = tinted(armchair, '#a8714a');
    const ottoman = normalised(P.ottoman.scene, 0.95, 'xz');
    const navyOttoman = tinted(ottoman, '#55507a'), leatherOttoman = tinted(ottoman, '#9a6a45');
    const sofa = normalised(P.sofa.scene, 2.1, 'xz');
    const drawers = normalised(P.drawers.scene, 1.6, 'xz');
    const mirror = normalised(P.mirror.scene, 1.15);
    const clock = normalised(P.clock.scene, 2.2);
    const shelf = normalised(P.bookshelf.scene, 2.1);
    const roundTable = normalised(P.roundTable.scene, 0.75);
    const sideTable = normalised(P.sideTable.scene, 0.6);
    const plant = normalised(P.plant.scene, 0.75);
    const vase = normalised(P.vase.scene, 0.3);

    // Front Hall: armchairs round an ottoman in front of the fire
    const ot = [0, -2.0];
    put(group, navyOttoman, ot[0], 0, ot[1], Math.PI / 2);
    for (const [x, z] of [[-1.55, -2.5], [1.55, -2.5], [0, -0.2]]) {
      put(group, olive, x, 0, z, face(x, z, ot[0], ot[1]));
      L.addInCircle(x, z, 0.5);
    }
    L.addInBox(ot[0], ot[1], 0.7, 1.0);
    put(group, olive, -4.9, 0, 3.3, face(-4.9, 3.3, -3.6, 2.2)); L.addInCircle(-4.9, 3.3, 0.5);
    put(group, drawers, H.maxX - 0.5, 0, 0, -Math.PI / 2); L.addInBox(H.maxX - 0.45, 0, 0.9, 1.7);
    put(group, mirror, H.maxX - 0.04, 1.35, 0, -Math.PI / 2);
    for (const dz of [-0.5, 0.5]) put(group, vase, H.maxX - 0.5, 1.1, dz);
    for (const dx of [-1.1, 1.1]) put(group, vase, dx, 1.74, H.minZ + 0.25);
    put(group, sideTable, H.minX + 0.45, 0, 4.4, Math.PI / 2); put(group, plant, H.minX + 0.45, 0.6, 4.4);
    L.addInCircle(H.minX + 0.45, 4.4, 0.4);
    put(group, sideTable, H.maxX - 0.45, 0, 4.4, -Math.PI / 2); put(group, plant, H.maxX - 0.45, 0.6, 4.4);
    L.addInCircle(H.maxX - 0.45, 4.4, 0.4);

    // pictures of the Borders hills
    const frameModel = normalised(P.frame.scene, 1.3, 'xz');
    const picture = (seed, x, y, z, ry) => {
      const f = frameModel.clone(true);
      f.traverse((c) => {
        if (c.isMesh && c.material.name.endsWith('canvas')) { c.material = new THREE.MeshStandardMaterial({ map: TX.painting(seed), roughness: 0.6 }); }
      });
      put(group, f, x, y, z, ry);
    };
    picture(2, H.minX + 0.03, 1.6, -2.5, Math.PI / 2);
    picture(5, -4.4, 1.7, H.maxZ - 0.03, Math.PI);
    picture(8, -13.7 - 3.6, 2.8, Q.minZ + 0.03, 0);
    picture(11, -13.7 + 3.6, 2.8, Q.minZ + 0.03, 0);
    picture(14, -2.03, 3.6, -8.6, -Math.PI / 2);

    // Quiet Room: leather armchairs on the tartan rug, a sofa, books and a table by the window
    const qc = [(Q.minX + Q.maxX) / 2, -0.4];
    put(group, leatherOttoman, qc[0], 0, qc[1]);
    L.addInBox(qc[0], qc[1], 1.0, 0.7);
    for (const [dx, dz] of [[-1.7, -1.1], [1.7, -1.1], [-1.7, 1.1], [1.7, 1.1]]) {
      const x = qc[0] + dx, z = qc[1] + dz;
      put(group, leather, x, 0, z, face(x, z, qc[0], qc[1]));
      L.addInCircle(x, z, 0.5);
    }
    put(group, tinted(sofa, '#b9b49a'), Q.minX + 0.5, 0, -0.4, Math.PI / 2); L.addInBox(Q.minX + 0.45, -0.4, 0.9, 2.1);
    put(group, shelf, -7.8, 0, -3.0, -Math.PI / 2); L.addInBox(-7.75, -3.0, 0.6, 1.4);
    put(group, roundTable, -17.2, 0, 2.8); L.addInCircle(-17.2, 2.8, 0.45);
    put(group, sideTable, -9.6, 0, 3.4); put(group, plant, -9.6, 0.6, 3.4); L.addInCircle(-9.6, 3.4, 0.35);

    // stair hall: a grandfather clock
    put(group, clock, S.maxX - 0.3, 0, -8.2, -Math.PI / 2); L.addInBox(S.maxX - 0.3, -8.2, 0.5, 0.7);
  }

  // ---------- lights: brass lanterns, iron chandeliers, daylight from the windows ----------
  {
    const lantern = normalised(P.hallLantern.scene, 1.05);
    lantern.traverse((c) => {
      if (c.isMesh && c.material.name.endsWith('lamp')) { c.material = c.material.clone(); c.material.emissive = new THREE.Color('#ffc870'); c.material.emissiveIntensity = 2.5; }
    });
    const chandelier = normalised(P.chandelier.scene, 0.85);
    chandelier.traverse((c) => {
      if (c.isMesh && c.material.name.endsWith('bulb')) { c.material = c.material.clone(); c.material.emissive = new THREE.Color('#ffd28a'); c.material.emissiveIntensity = 3; }
    });
    const chains = [];
    const hang = (model, x, z, bottom, height, ceiling, withLight) => {
      put(group, model, x, bottom, z);
      chains.push(cyl(0.015, 0.015, ceiling - (bottom + height), x, (ceiling + bottom + height) / 2, z, 6));
      if (withLight) {
        const l = new THREE.PointLight('#ffd08a', 7, 10, 1.5);
        l.position.set(x, bottom + height * 0.4, z);
        group.add(l); lights.push(l);
      }
    };
    const bw = (H.maxX - H.minX) / 3;
    hang(lantern, 0, -2.5, 2.9, 1.05, HALL_H - 0.02, true);
    hang(lantern, -bw, 2.5, 2.9, 1.05, HALL_H - 0.02, true);
    hang(lantern, bw, 2.5, 2.9, 1.05, HALL_H - 0.02, false);
    hang(lantern, -4.5, -8.2, 3.6, 1.05, 6, true);
    hang(chandelier, -16.5, -0.4, 3.0, 0.85, 4.2, false);
    hang(chandelier, -10.9, -0.4, 3.0, 0.85, 4.2, false);
    const ql = new THREE.PointLight('#ffd08a', 9, 12, 1.4);
    ql.position.set(-13.7, 3.3, -0.4); group.add(ql); lights.push(ql);
    group.add(merged(chains, mats.brass, { cast: false }));
    // soft daylight coming in from the windows
    for (const [x, y, z] of [[5.6, 2, 0], [0, 2, 3.8], [-13.7, 2.2, 2.6]]) {
      const l = new THREE.PointLight('#dbe8f5', 6, 11, 1.2);
      l.position.set(x, y, z); group.add(l); lights.push(l);
    }
  }

  group.traverse((c) => { if (c.isMesh && c.castShadow === undefined) c.castShadow = true; });

  function update(t) {
    if (!group.visible) return;
    for (const f of fires) {
      f.light.intensity = 4.5 + Math.sin(t * 13) * 0.6 + Math.sin(t * 7.3) * 0.5;
      f.flames.forEach((m, i) => { m.scale.y = 0.8 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.5; m.scale.x = 0.9 + Math.sin(t * 11 + i) * 0.1; });
    }
  }

  return { group, lights, update };
}

function mergeAll(geos) {
  const g = merged(geos, null).geometry;
  return g;
}
