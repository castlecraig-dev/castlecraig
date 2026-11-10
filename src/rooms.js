// More rooms inside the house, modelled on photos from castlecraig.co.uk's
// Facilities & Rooms page: the Drawing Room, the Common Room, the Group Therapy
// Room and, upstairs, a bedroom corridor with two bedrooms.
import * as THREE from 'three';
import * as L from './layout.js';
import * as TX from './textures.js';
import { box, cyl, merged, pbrMat } from './world.js';
import { normalised } from './assets.js';
import { roomWalls, floor, put, tinted, face } from './interior.js';

const R = L.ROOMS;

export function buildMoreRooms(group, { assets, mats, lights, fireplace }) {
  const T = assets.tex, P = assets.ph;
  const paint = (c) => pbrMat(T.plaster, { color: c });
  const plain = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...extra });
  const cm = {
    sage: paint('#b7c2a8'), white: paint('#f2efe7'), cream: paint('#efe6d2'), peach: paint('#f1c9a8'),
    botanical: new THREE.MeshStandardMaterial({ map: TX.botanicalWallpaper(), roughness: 0.9 }),
    ceiling: plain('#f7f4ec'), moulding: plain('#ffffff', { roughness: 0.5 }),
    greenVelvet: pbrMat(T.velvet, { color: '#2f5a3e' }), floral: new THREE.MeshStandardMaterial({ map: TX.floralFabric(), roughness: 0.9 }),
    carpet: plain('#c9bba2', { roughness: 1 }), plaid: new THREE.MeshStandardMaterial({ map: TX.tartan(['#b88a9a', '#8a5a78', '#f0e0d0']), roughness: 1 }),
    whiteWood: plain('#f4f2ec', { roughness: 0.5 }), brass: new THREE.MeshStandardMaterial({ color: '#c9a050', metalness: 1, roughness: 0.3 }),
    glow: new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe2b0', emissiveIntensity: 1.6 }),
  };
  cm.botanical.map.repeat.set(1.2, 1.2);
  cm.plaid.map.repeat.set(3, 3);

  const rug = (tex, w, d, x, z, ry = 0, y = 0.012, transparent = false) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent, alphaTest: transparent ? 0.5 : 0 }));
    m.rotation.set(-Math.PI / 2, 0, ry);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    return m;
  };
  const light = (parent, x, y, z, intensity = 7, dist = 11, color = '#ffd8a0') => {
    const l = new THREE.PointLight(color, intensity, dist, 1.4);
    l.position.set(x, y, z);
    parent.add(l);
    lights.push(l);
  };
  // a sash window with curtains, built into an opening
  const windowIn = (parent, axis, at, o, inward, curtainMat) => {
    const w = o.to - o.from, h = o.top - o.bottom, mid = (o.from + o.to) / 2, ym = (o.top + o.bottom) / 2;
    const mk = (a, b, c, x, y, z) => (axis === 'x' ? box(a, b, c, x, y, z) : box(c, b, a, z, y, x));
    const glass = [mk(w, h, 0.04, mid, ym, at)], bars = [mk(w, 0.06, 0.08, mid, ym, at)];
    for (const k of [1, 2]) bars.push(mk(0.04, h, 0.06, o.from + (w * k) / 3, ym, at));
    for (const k of [0.25, 0.75]) bars.push(mk(w, 0.04, 0.06, mid, o.bottom + h * k, at));
    bars.push(mk(w + 0.2, 0.08, 0.3, mid, o.bottom - 0.04, at + inward * 0.12));
    parent.add(merged(glass, mats.daylight, { cast: false }), merged(bars, mats.trim));
    if (curtainMat) {
      const c = [];
      for (const sgn of [-1, 1]) c.push(mk(0.55, h + 0.5, 0.12, mid + sgn * (w / 2 + 0.2), ym + 0.15, at + inward * 0.22));
      c.push(mk(w + 1.3, 0.3, 0.14, mid, o.top + 0.35, at + inward * 0.22));
      parent.add(merged(c, curtainMat));
    }
  };
  const ceiling = (parent, r, h, mat = cm.ceiling) => parent.add(merged([box(r.maxX - r.minX + 0.4, 0.1, r.maxZ - r.minZ + 0.4, (r.minX + r.maxX) / 2, h + 0.05, (r.minZ + r.maxZ) / 2)], mat));
  const trims = (parent, r, h, open, dado) => {
    const sk = [], tr = [];
    roomWalls(sk, r, 0.2, open, { t: 0.04, inset: 0.0001 });
    roomWalls(tr, r, h, open, { t: 0.12, inset: 0.0001, y0: h - 0.2 }); // cornice
    if (dado) roomWalls(tr, r, dado + 0.06, open, { t: 0.05, inset: 0.0001, y0: dado });
    parent.add(merged(sk, mats.skirting), merged(tr, cm.moulding));
  };

  const armchair = normalised(P.armchair.scene, 1.0), sofa = normalised(P.sofa.scene, 2.1, 'xz');
  const ottoman = normalised(P.ottoman.scene, 0.95, 'xz'), shelf = normalised(P.bookshelf.scene, 2.1);
  const plant = normalised(P.plant.scene, 1.1), sideTable = normalised(P.sideTable.scene, 0.6);
  const roundTable = normalised(P.roundTable.scene, 0.72), chandelier = normalised(P.chandelier.scene, 0.85);
  const vase = normalised(P.vase.scene, 0.32);
  chandelier.traverse((c) => { if (c.isMesh && c.material.name.endsWith('bulb')) { c.material = c.material.clone(); c.material.emissive = new THREE.Color('#ffd28a'); c.material.emissiveIntensity = 3; } });
  const brassChandelier = tinted(chandelier, '#e0b860', { metalness: 0.9, roughness: 0.3 });
  const hang = (parent, model, x, z, ceilingY) => {
    put(parent, model, x, ceilingY - 1.15, z);
    parent.add(merged([cyl(0.015, 0.015, 0.3, x, ceilingY - 0.15, z, 6)], cm.brass, { cast: false }));
  };

  // ---------- the Drawing Room: sage walls over oak panelling, plaster ceiling, brass chandeliers ----------
  {
    const r = R.drawing, h = r.ceil;
    const open = {
      w: [{ from: -1.1, to: 1.1, bottom: 0, top: 2.8 }],
      n: [{ from: 13, to: 15, bottom: 0, top: 2.6 }],
      s: [9.6, 14.2, 18.8].map((x) => ({ from: x - 0.85, to: x + 0.85, bottom: 0.45, top: 3.9 })), // big Georgian windows onto the front lawn
      e: [{ from: 0.6, to: 2.4, bottom: 0.45, top: 3.9 }],
    };
    const walls = [], panels = [];
    roomWalls(walls, r, h, open);
    roomWalls(panels, r, 1.25, open, { t: 0.06, inset: 0.0001 });
    group.add(merged(walls, cm.sage), merged(panels, mats.panels), floor(r, mats.darkFloor));
    trims(group, r, h, open, 1.25);
    ceiling(group, r, h);
    // ornate plaster: a raised border and two medallions
    const plaster = [];
    for (const [x0, x1] of [[r.minX + 0.5, 14], [14, r.maxX - 0.5]]) {
      const cx = (x0 + x1) / 2, cz = (r.minZ + r.maxZ) / 2, w = x1 - x0 - 0.6, d = r.maxZ - r.minZ - 1.2;
      plaster.push(box(w, 0.06, 0.12, cx, h - 0.03, cz - d / 2), box(w, 0.06, 0.12, cx, h - 0.03, cz + d / 2), box(0.12, 0.06, d, cx - w / 2, h - 0.03, cz), box(0.12, 0.06, d, cx + w / 2, h - 0.03, cz));
      const t = new THREE.TorusGeometry(0.55, 0.06, 8, 32); t.rotateX(Math.PI / 2); t.translate(cx, h - 0.04, cz); plaster.push(t);
      hang(group, brassChandelier, cx, cz, h);
    }
    group.add(merged(plaster, cm.moulding, { cast: false }));
    for (const o of open.s) windowIn(group, 'x', r.maxZ + 0.1, o, -1, cm.greenVelvet);
    windowIn(group, 'z', r.maxX + 0.1, open.e[0], -1, cm.greenVelvet);
    fireplace(10.2, r.minZ, 'oak');
    group.add(rug(TX.persianRug(21), 5.6, 4.2, 15, 1.6));
    const c = [15, 1.6];
    put(group, tinted(sofa, '#3f7f88'), 15, 0, 4.1, Math.PI); L.addInBox(15, 4.1, 2.1, 0.9);
    put(group, tinted(sofa, '#6a2340'), 18.6, 0, 1.6, -Math.PI / 2); L.addInBox(18.6, 1.6, 0.9, 2.1);
    put(group, tinted(armchair, '#9a9450'), 12.4, 0, 0.3, face(12.4, 0.3, ...c)); L.addInCircle(12.4, 0.3, 0.5);
    put(group, tinted(armchair, '#a8b0a0'), 12.4, 0, 3.0, face(12.4, 3.0, ...c)); L.addInCircle(12.4, 3.0, 0.5);
    put(group, tinted(ottoman, '#9fb8b0'), 15, 0, 1.6, Math.PI / 2); L.addInBox(15, 1.6, 0.7, 1.0);
    // guitar on a stand and a standard lamp by the fireplace
    const guitar = new THREE.Group();
    const wood = plain('#8a4a22', { roughness: 0.4 });
    guitar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 20).rotateX(Math.PI / 2).translate(0, 0.25, 0), wood));
    guitar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 20).rotateX(Math.PI / 2).translate(0, 0.52, 0), wood));
    guitar.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03).translate(0, 0.88, 0.02), plain('#3a2416')));
    guitar.position.set(19.8, 0, -1.4); guitar.rotation.set(-0.2, -0.6, 0);
    group.add(guitar);
    const lamp = merged([cyl(0.015, 0.015, 1.5, 20.5, 0.75, -0.3, 8), cyl(0.15, 0.15, 0.03, 20.5, 0.015, -0.3, 16)], cm.brass);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 20, 1, true).translate(20.5, 1.6, -0.3), plain('#f0e2c4', { side: THREE.DoubleSide, emissive: '#ffd8a0', emissiveIntensity: 0.6 }));
    group.add(lamp, shade);
    L.addInCircle(19.8, -1.4, 0.3); L.addInCircle(20.5, -0.3, 0.25);
    put(group, sideTable, r.maxX - 0.45, 0, 4.4); put(group, plant, r.maxX - 0.45, 0.6, 4.4); L.addInCircle(r.maxX - 0.45, 4.4, 0.4);
    light(group, 11, 3.4, 1.5, 7, 12); light(group, 18, 3.4, 1.5, 7, 12);
  }

  // ---------- the Common Room: white panelling, yellow velvet, black leather, a cowhide and chess ----------
  {
    const r = R.common, h = r.ceil;
    const open = {
      s: [{ from: 13, to: 15, bottom: 0, top: 2.6 }],
      n: [10.5, 17.8].map((x) => ({ from: x - 0.8, to: x + 0.8, bottom: 0.5, top: 3.2 })),
      e: [{ from: -7, to: -5.2, bottom: 0.5, top: 3.2 }],
    };
    const walls = [], frames = [];
    roomWalls(walls, r, h, open);
    group.add(merged(walls, cm.white), floor(r, mats.darkFloor));
    trims(group, r, h, open, 1.0);
    // raised panel frames on the long walls
    for (let x = r.minX + 1.4; x < r.maxX - 1; x += 2.2) {
      if (x > 12.4 && x < 15.6) continue;
      for (const z of [r.minZ + 0.03, r.maxZ - 0.03]) {
        if (z < -5 && open.n.some((o) => x > o.from - 1 && x < o.to + 1)) continue;
        frames.push(box(1.6, 0.04, 0.04, x, 2.9, z), box(1.6, 0.04, 0.04, x, 1.3, z), box(0.04, 1.6, 0.04, x - 0.8, 2.1, z), box(0.04, 1.6, 0.04, x + 0.8, 2.1, z));
      }
    }
    group.add(merged(frames, cm.moulding, { cast: false }));
    ceiling(group, r, h);
    for (const o of open.n) windowIn(group, 'x', r.minZ - 0.1, o, 1, null);
    windowIn(group, 'z', r.maxX + 0.1, open.e[0], -1, null);
    group.add(rug(TX.cowhide(), 3.4, 2.8, 14, -6.2, 0.3, 0.013, true));
    const c = [14, -6.2];
    put(group, roundTable, 14, 0, -6.2);
    group.add(rug(TX.chessboard(), 0.45, 0.45, 14, -6.2, 0.2, 0.74));
    L.addInCircle(14, -6.2, 0.5);
    for (const [x, z, col, model] of [[12.2, -7.4, '#e0b020', armchair], [15.8, -7.4, '#e0b020', armchair]]) {
      put(group, tinted(model, col), x, 0, z, face(x, z, ...c)); L.addInCircle(x, z, 0.5);
    }
    put(group, tinted(sofa, '#3d6b35'), 14, 0, -8.9, 0); L.addInBox(14, -8.9, 2.1, 0.9);
    put(group, tinted(sofa, '#262626'), 11.0, 0, -5.0, Math.PI / 2); L.addInBox(11.0, -5.0, 0.9, 2.1);
    put(group, tinted(sofa, '#262626'), 17.2, 0, -4.6, -Math.PI / 2); L.addInBox(17.2, -4.6, 0.9, 2.1);
    put(group, shelf, r.maxX - 0.35, 0, -3.6, -Math.PI / 2); L.addInBox(r.maxX - 0.35, -3.6, 0.6, 1.4);
    put(group, plant, 8.0, 0, -9.0); put(group, plant, 20.4, 0, -9.0); L.addInCircle(8.0, -9.0, 0.3); L.addInCircle(20.4, -9.0, 0.3);
    // round convex mirrors on the wall
    for (const [z, rad] of [[-7.2, 0.32], [-5.9, 0.42], [-4.7, 0.28]]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 32), new THREE.MeshStandardMaterial({ color: '#cfd8e0', metalness: 1, roughness: 0.05 }));
      m.position.set(r.minX + 0.03, 2.3, z); m.rotation.y = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.035, 8, 32), cm.brass);
      rim.position.copy(m.position); rim.rotation.y = Math.PI / 2;
      group.add(m, rim);
    }
    // red fringed pendant lamp
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.4, 24, 1, true).translate(14, h - 0.75, -6.2), plain('#b02a2a', { side: THREE.DoubleSide, emissive: '#ff5a3a', emissiveIntensity: 0.4 })));
    light(group, 14, h - 1.0, -6.2, 8, 12);
  }

  // ---------- the Group Therapy Room: cream panelling, a ring of tub chairs, blue-tiled fireplace ----------
  {
    const r = R.therapy, h = r.ceil;
    const open = { s: [{ from: 3.6, to: 5.2, bottom: 0, top: 2.6 }], n: [{ from: -0.6, to: 1.0, bottom: 0.6, top: 3.2 }] };
    const walls = [], frames = [];
    roomWalls(walls, r, h, open);
    group.add(merged(walls, cm.cream), floor(r, mats.darkFloor));
    trims(group, r, h, open, 0.95);
    for (const z of [r.minZ + 0.03, r.maxZ - 0.03]) for (const x of [-0.8, 1.5]) {
      if (z > -6 && x > 3) continue;
      frames.push(box(1.4, 0.04, 0.04, x, 3.0, z), box(1.4, 0.04, 0.04, x, 1.3, z), box(0.04, 1.7, 0.04, x - 0.7, 2.15, z), box(0.04, 1.7, 0.04, x + 0.7, 2.15, z));
    }
    group.add(merged(frames, cm.moulding, { cast: false }));
    ceiling(group, r, h);
    windowIn(group, 'x', r.minZ - 0.1, open.n[0], 1, null);
    fireplace(4.3, r.minZ, 'delft');
    for (const dx of [-0.9, 0, 0.9]) put(group, tinted(vase, '#e8eef8'), 4.3 + dx, 1.74, r.minZ + 0.25);
    group.add(rug(TX.persianRug(33), 3.6, 2.8, 2.6, -7.3));
    const c = [2.6, -7.3];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, x = c[0] + Math.sin(a) * 1.45, z = c[1] + Math.cos(a) * 1.25;
      put(group, tinted(armchair, '#c8ccd8'), x, 0, z, face(x, z, ...c), 0.85);
      L.addInCircle(x, z, 0.42);
    }
    // brass wall sconces
    for (const x of [0, 6]) {
      group.add(merged([cyl(0.05, 0.03, 0.2, x, 2.4, r.minZ + 0.1, 8)], cm.brass), new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8).translate(x, 2.55, r.minZ + 0.12), cm.glow));
    }
    light(group, 2.6, 2.8, -7.3, 6, 9);
  }

  // ---------- upstairs: a bedroom corridor and two bedrooms ----------
  const upstairs = new THREE.Group();
  group.add(upstairs);
  {
    const cor = R.corridor, A = R.bedroomA, B = R.bedroomB;
    const corOpen = { n: [{ from: -4.6, to: -3.4, bottom: 0, top: 2.3 }, { from: 3.4, to: 4.6, bottom: 0, top: 2.3 }], w: [{ from: -41.6, to: -39.4, bottom: 0, top: 2.3 }] };
    const walls = [];
    roomWalls(walls, cor, cor.ceil, corOpen);
    upstairs.add(merged(walls, cm.cream), floor(cor, cm.carpet));
    trims(upstairs, cor, cor.ceil, corOpen, 0);
    ceiling(upstairs, cor, cor.ceil);
    // the top of the stairs going back down, at the west end
    upstairs.add(merged([box(0.8, 0.05, 2.2, -8.2, -0.4, -40.5), box(0.06, 0.9, 2.2, -7.85, 0.45, -40.5)], mats.oak));
    for (let x = -6; x <= 6; x += 4) {
      upstairs.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20).translate(x, cor.ceil - 0.03, -40.5), cm.glow));
    }
    light(upstairs, 0, 2.6, -40.5, 6, 14);

    // Bedroom one: botanical wallpaper over white panelling, single bed with a green tartan throw
    {
      const open = { n: [{ from: -4.6, to: -3.4, bottom: 0, top: 2.3 }].map((o) => o), s: [{ from: -5, to: -3.4, bottom: 0.8, top: 2.5 }] };
      // doors are on the corridor side (maxZ), the window on the far wall (minZ)
      const o2 = { s: open.n, n: open.s };
      const walls2 = [], wains = [];
      roomWalls(walls2, A, A.ceil, o2);
      roomWalls(wains, A, 1.0, o2, { t: 0.05, inset: 0.0001 });
      upstairs.add(merged(walls2, cm.botanical), merged(wains, cm.whiteWood), floor(A, cm.carpet));
      trims(upstairs, A, A.ceil, o2, 1.0);
      ceiling(upstairs, A, A.ceil);
      windowIn(upstairs, 'x', A.minZ - 0.1, o2.n[0], 1, cm.greenVelvet);
      buildBed(upstairs, -6.8, -46.4, 1.0, 2.0, '#6b8a5a', TX.tartan(['#2f5a3e', '#1e3a2a', '#e0d8b0']), Math.PI / 2, cm);
      L.addInBox(-6.8, -46.4, 2.1, 1.1);
      buildDesk(upstairs, -2.0, -47.6, 0, cm, mats);
      buildWardrobe(upstairs, -0.8, -43.6, -Math.PI / 2, cm);
      L.addInBox(-2.0, -47.6, 1.3, 0.6); L.addInBox(-0.8, -43.6, 0.6, 1.0);
      upstairs.add(merged([cyl(0.04, 0.04, 0.15, -7.7, 1.7, -45.3, 8)], cm.brass), new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8).translate(-7.6, 1.8, -45.3), cm.glow));
      light(upstairs, -4, 2.4, -45.2, 6, 10);
    }
    // Bedroom two: peach walls, plaid carpet, floral curtains, purple headboard
    {
      const o2 = { s: [{ from: 3.4, to: 4.6, bottom: 0, top: 2.3 }], n: [{ from: 4.6, to: 6.4, bottom: 0.6, top: 2.5 }] };
      const walls2 = [];
      roomWalls(walls2, B, B.ceil, o2);
      upstairs.add(merged(walls2, cm.peach), floor(B, cm.plaid));
      trims(upstairs, B, B.ceil, o2, 1.0);
      ceiling(upstairs, B, B.ceil);
      windowIn(upstairs, 'x', B.minZ - 0.1, o2.n[0], 1, cm.floral);
      buildBed(upstairs, 2.4, -46.2, 1.5, 2.0, '#5a2a4a', TX.tartan(['#e8c8c0', '#c89890', '#f8f0e8']), Math.PI / 2, cm);
      L.addInBox(2.4, -46.2, 2.1, 1.6);
      put(upstairs, tinted(armchair, '#e8dcc8'), 7.0, 0, -47.0, face(7.0, -47.0, 4, -45)); L.addInCircle(7.0, -47.0, 0.5);
      put(upstairs, sideTable, 1.2, 0, -44.6); L.addInCircle(1.2, -44.6, 0.35);
      light(upstairs, 4, 2.4, -45.2, 6, 10);
    }
  }

  return { upstairs };
}

// A bed: base, mattress, duvet, pillows, a throw across the foot and a headboard.
function buildBed(parent, x, z, w, len, headboard, throwTex, ry, cm) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f6f4ef', roughness: 0.9 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, len).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ color: '#d8d0c4', roughness: 0.9 })));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.22, len - 0.05).translate(0, 0.46, 0.02), white));
  for (const sx of w > 1.2 ? [-0.35, 0.35] : [0]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.35).translate(sx * w, 0.64, -len / 2 + 0.3), white));
  const th = throwTex.clone(); th.needsUpdate = true; th.repeat.set(2, 1);
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.04, 0.6).translate(0, 0.59, len / 2 - 0.4), new THREE.MeshStandardMaterial({ map: th, roughness: 1 })));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 1.0, 0.08).translate(0, 0.65, -len / 2 - 0.02), new THREE.MeshStandardMaterial({ color: headboard, roughness: 0.9 })));
  for (const sx of [-1, 1]) {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.4).translate(sx * (w / 2 + 0.35), 0.28, -len / 2 + 0.2), cm.whiteWood));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.2, 16).translate(sx * (w / 2 + 0.35), 0.85, -len / 2 + 0.2), new THREE.MeshStandardMaterial({ color: '#efe4d0', emissive: '#ffd8a0', emissiveIntensity: 0.5 })));
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  parent.add(g);
}

function buildDesk(parent, x, z, ry, cm, mats) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.5).translate(0, 0.75, 0), cm.whiteWood));
  for (const sx of [-0.55, 0.55]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.46).translate(sx, 0.37, 0), cm.whiteWood));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, 0.46, 0.55), mats.oak));
  for (const [sx, sz] of [[-0.18, 0.38], [0.18, 0.38], [-0.18, 0.72], [0.18, 0.72]]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04).translate(sx, 0.23, sz), mats.oak));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.04).translate(0, 0.72, 0.75), mats.oak));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  parent.add(g);
}

function buildWardrobe(parent, x, z, ry, cm) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.55).translate(0, 1.0, 0), cm.whiteWood));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.8, 0.02).translate(0, 1.0, 0.28), new THREE.MeshStandardMaterial({ color: '#c8c0b4' })));
  for (const sx of [-0.06, 0.06]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8).translate(sx, 1.05, 0.3), cm.brass));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  parent.add(g);
}
