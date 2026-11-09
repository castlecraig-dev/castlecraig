// Builds the estate from Poly Haven textures/props and KayKit models:
// terrain, water, castle, walled garden, dining hall, bridge, trees and grass.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from './layout.js';
import * as TX from './textures.js';
import { normalised, instanced, placed } from './assets.js';
import { ITEMS, NPCS, PATROL } from './quests.js';

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

// Triangular prism roof running along x.
function gableRoof(span, rise, len, x, y, z) {
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0); shape.lineTo(span / 2, 0); shape.lineTo(0, rise); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TEX_M, uv.getY(i) / TEX_M);
  g.rotateY(Math.PI / 2);
  g.translate(x - len / 2, y, z);
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

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const mat4 = (x, y, z, ry = 0, sc = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(sc, sc, sc));

// ---------- the world ----------
export function buildWorld(scene, { quality, assets }) {
  const R = L.rng(42);
  const time = { value: 0 };
  const base = L.FLAT_Y;
  const T = assets.tex;
  const high = quality === 'high';

  const mats = {
    stone: pbrMat(T.stone),
    slate: pbrMat(T.slate, { color: '#7d8590' }), // darker, bluer Scottish slate
    wood: pbrMat(T.wood),
    trim: new THREE.MeshStandardMaterial({ color: '#cfc6b4', roughness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: '#1c2a38', roughness: 0.05, metalness: 0.8 }),
    warmGlass: new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffb050', emissiveIntensity: 1.6, roughness: 0.3 }),
    door: new THREE.MeshStandardMaterial({ color: '#4a2f1c', roughness: 0.7 }),
    hedge: new THREE.MeshStandardMaterial({ map: TX.leafTexture(), roughness: 1 }),
    soil: new THREE.MeshStandardMaterial({ map: T.mud.diff, normalMap: T.mud.nor, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
  };
  mats.hedge.map.repeat.set(1.5, 1.5);
  T.slate.diff.repeat.set(1, 1);

  // ----- terrain with blended grass / gravel / mud / forest floor -----
  {
    const SX = 320, SZ = 300, CZ = 5;
    const g = new THREE.PlaneGeometry(SX, SZ, 256, 240);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, CZ);
    const pos = g.attributes.position;
    const tint = new Float32Array(pos.count * 3);
    const splat = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = L.groundHeight(x, z);
      pos.setY(i, h);
      const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17 - x * 0.05);
      const gravel = 1 - L.smooth(L.PATH_HALF - 0.5, L.PATH_HALF + 0.6, L.pathDist(x, z));
      const mud = Math.max(1 - L.smooth(-0.6, 0.2, h), 0);
      const forest = Math.max(L.smooth(47, 56, z), L.smooth(3, 10, h)) * (0.55 + 0.45 * n);
      const grass = Math.max(0, 1 - gravel - mud - forest);
      splat.set([grass, gravel, mud, forest], i * 4);
      // gentle colour variation to hide tiling; browner on the hills
      const k = 0.85 + n * 0.25;
      const hill = L.smooth(3, 12, h);
      tint.set([k * (0.62 + hill * 0.3), k * (0.92 - hill * 0.05), k * (0.48 + hill * 0.2)], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    g.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    g.computeVertexNormals();

    const rep = [SX / 5, SZ / 5];
    for (const set of [T.grass, T.gravel, T.mud, T.forest]) for (const t of [set.diff, set.nor]) t.repeat.set(...rep);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: T.grass.diff, normalMap: T.grass.nor, roughness: 0.95,
      normalScale: new THREE.Vector2(0.8, 0.8),
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        tGravel: { value: T.gravel.diff }, tMud: { value: T.mud.diff }, tForest: { value: T.forest.diff },
        nGravel: { value: T.gravel.nor }, nMud: { value: T.mud.nor }, nForest: { value: T.forest.nor },
      });
      shader.vertexShader = 'attribute vec4 splat;\nvarying vec4 vSplat;\n' + shader.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;');
      shader.fragmentShader = `uniform sampler2D tGravel, tMud, tForest, nGravel, nMud, nForest;
        varying vec4 vSplat;\n` + shader.fragmentShader
        .replace('#include <map_fragment>', `
          vec4 sw = vSplat / max(dot(vSplat, vec4(1.0)), 1e-4);
          vec4 cG = mix(texture2D(map, vMapUv), texture2D(map, vMapUv * 0.27 + 0.13), 0.45);
          vec4 cP = texture2D(tGravel, vMapUv * 1.6);
          vec4 cM = texture2D(tMud, vMapUv);
          vec4 cF = texture2D(tForest, vMapUv);
          diffuseColor *= cG * sw.x + cP * sw.y + cM * sw.z + cF * sw.w;`)
        .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
          vec3 mapN = (texture2D(normalMap, vNormalMapUv).xyz * sw.x + texture2D(nGravel, vNormalMapUv * 1.6).xyz * sw.y
            + texture2D(nMud, vNormalMapUv).xyz * sw.z + texture2D(nForest, vNormalMapUv).xyz * sw.w) * 2.0 - 1.0;`);
    };
    const terrain = new THREE.Mesh(g, mat);
    terrain.receiveShadow = true;
    scene.add(terrain);
  }

  // ----- water: reflects the sky through the environment map -----
  const waterNormals = TX.waterNormals();
  waterNormals.repeat.set(36, 36);
  {
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: '#29505a', roughness: 0.04, metalness: 0, normalMap: waterNormals,
      normalScale: new THREE.Vector2(0.3, 0.3), transparent: true, opacity: 0.88, envMapIntensity: 1.1,
    });
    const g = new THREE.PlaneGeometry(320, 300);
    g.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(g, waterMat);
    water.position.set(0, L.WATER_Y, 5);
    water.receiveShadow = true;
    scene.add(water);
  }

  // ----- the castle -----
  {
    const C = L.CASTLE, H = 10;
    const front = C.z + C.d / 2;
    const stone = [], trim = [], slate = [], glass = [], door = [];

    stone.push(box(C.w, H, C.d, C.x, base + H / 2, C.z));
    stone.push(box(8, H + 3, 3, C.x, base + (H + 3) / 2, front + 1.5)); // gatehouse
    const towers = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = C.x + sx * C.w / 2, tz = C.z + sz * C.d / 2;
      towers.push([tx, tz]);
      stone.push(cyl(3, 3.2, H + 4, tx, base + (H + 4) / 2, tz));
      trim.push(cyl(3.5, 3.0, 0.7, tx, base + H + 4 - 0.1, tz));
      slate.push(cone(3.8, 6.5, tx, base + H + 4 + 3.2, tz));
      const len = Math.hypot(sx, sz), dx = sx / len, dz = sz / len, ry = Math.atan2(dx, dz);
      for (const wy of [4, 8.5]) {
        trim.push(box(0.95, 1.9, 0.2, tx + dx * 3.08, base + wy, tz + dz * 3.08, ry));
        glass.push(box(0.55, 1.5, 0.2, tx + dx * 3.14, base + wy, tz + dz * 3.14, ry));
      }
    }
    const merlon = (x, z, y) => stone.push(box(0.9, 1, 0.9, x, y + 0.5, z));
    for (let x = -C.w / 2 + 3.5; x <= C.w / 2 - 3.5; x += 2) { merlon(C.x + x, C.z - C.d / 2 + 0.45, base + H); merlon(C.x + x, front - 0.45, base + H); }
    for (let z = -C.d / 2 + 3.5; z <= C.d / 2 - 3.5; z += 2) { merlon(C.x - C.w / 2 + 0.45, C.z + z, base + H); merlon(C.x + C.w / 2 - 0.45, C.z + z, base + H); }
    for (let x = -3.5; x <= 3.5; x += 1.75) merlon(C.x + x, front + 2.55, base + H + 3);
    trim.push(box(C.w + 0.4, 0.4, C.d + 0.4, C.x, base + H - 0.2, C.z));
    trim.push(box(8.4, 0.4, 3.4, C.x, base + H + 2.8, front + 1.5));
    slate.push(gableRoof(C.d - 3, 4.2, C.w - 6, C.x, base + H, C.z));
    for (const [cx, cz] of [[-7, -3], [7, -3], [-7, 3], [7, 3]]) stone.push(box(1.3, 3.2, 1.3, C.x + cx, base + H + 2.4, C.z + cz));

    const win = (x, y, z, ry) => {
      trim.push(box(1.7, 2.4, 0.2, x, y, z, ry));
      glass.push(box(1.2, 1.9, 0.26, x, y, z, ry));
    };
    for (const x of [-10, -6.2, 6.2, 10]) for (const y of [3.2, 7]) {
      win(C.x + x, base + y, front, 0);
      win(C.x + x, base + y, C.z - C.d / 2, 0);
    }
    for (const z of [-3, 3]) for (const y of [3.2, 7]) {
      win(C.x - C.w / 2, base + y, C.z + z, Math.PI / 2);
      win(C.x + C.w / 2, base + y, C.z + z, Math.PI / 2);
    }
    win(C.x, base + 7, front + 3, 0);
    win(C.x, base + 10.6, front + 3, 0);

    door.push(box(2.6, 3.4, 0.3, C.x, base + 1.7, front + 3.02));
    {
      const g = new THREE.CylinderGeometry(1.3, 1.3, 0.3, 20, 1, false, Math.PI / 2, Math.PI);
      g.rotateX(Math.PI / 2);
      g.translate(C.x, base + 3.4, front + 3.02);
      door.push(g);
    }
    trim.push(box(3.4, 0.5, 0.4, C.x, base + 4.95, front + 3.0));
    trim.push(box(4, 0.25, 1.6, C.x, base + 0.12, front + 3.6));
    door.push(box(0.3, 2.6, 1.5, C.x + C.w / 2 + 0.02, base + 1.3, -20));

    scene.add(merged(stone, mats.stone), merged(trim, mats.trim), merged(slate, mats.slate),
      merged(glass, mats.glass), merged(door, mats.door));

    // flags on the tower tops
    const flag = normalised(assets.kk.flag.scene, 3.2);
    for (const [tx, tz] of towers) scene.add(placed(flag, tx, base + H + 4 + 6.2, tz, Math.PI / 4));

    // barrels and crates by the kitchen door
    const barrel = normalised(assets.kk.barrel.scene, 1.1), crate = normalised(assets.kk.crate.scene, 0.9);
    const bucket = normalised(assets.kk.bucket.scene, 0.5);
    scene.add(placed(barrel, 14.2, base, -22.6), placed(barrel, 14.4, base, -23.9, 1), placed(crate, 14.3, base, -17.4, 0.3),
      placed(bucket, 15, base, -16.4));
    L.addCircle(14.3, -23.2, 1.2); L.addCircle(14.3, -17.4, 0.7);

    L.addBox(C.x, C.z, C.w, C.d, 15);
    L.addBox(C.x, front + 1.5, 8, 3, 14);
    for (const [tx, tz] of towers) L.addCircle(tx, tz, 3.3, 24);
  }

  // ----- walled garden -----
  {
    const G = L.GARDEN, hh = 2.2, t = 1.2, gap = 4;
    const hedge = [], stone = [], wood = [], soil = [];
    const seg = (x, z, w, d) => { hedge.push(box(w, hh, d, x, base + hh / 2, z)); L.addBox(x, z, w, d, hh); };
    seg(G.x, G.z - G.d / 2, G.w, t);
    seg(G.x - G.w / 2, G.z, t, G.d);
    seg(G.x + G.w / 2, G.z, t, G.d);
    const half = (G.w - gap) / 2;
    seg(G.x - gap / 2 - half / 2, G.z + G.d / 2, half, t);
    seg(G.x + gap / 2 + half / 2, G.z + G.d / 2, half, t);
    for (const sx of [-1, 1]) {
      const px = G.x + sx * (gap / 2 + 0.3);
      stone.push(box(0.8, 2.8, 0.8, px, base + 1.4, G.z + G.d / 2));
      const ball = new THREE.SphereGeometry(0.35, 16, 12); ball.translate(px, base + 3.15, G.z + G.d / 2);
      stone.push(ball);
    }
    for (const b of L.BEDS) {
      wood.push(box(b.w, 0.45, b.d, b.x, base + 0.22, b.z));
      soil.push(box(b.w - 0.3, 0.06, b.d - 0.3, b.x, base + 0.46, b.z));
      L.addBox(b.x, b.z, b.w, b.d);
    }
    stone.push(cyl(0.3, 0.4, 1.1, G.x, base + 0.55, G.z - 4.2, 12));
    stone.push(cyl(0.55, 0.55, 0.1, G.x, base + 1.15, G.z - 4.2, 16));
    L.addCircle(G.x, G.z - 4.2, 0.6);
    scene.add(merged(hedge, mats.hedge), merged(stone, mats.stone), merged(wood, mats.wood), merged(soil, mats.soil));

    const plantGeo = new THREE.IcosahedronGeometry(0.3, 1);
    const plants = new THREE.InstancedMesh(plantGeo, mats.leaf, L.BEDS.length * 14);
    const col = new THREE.Color();
    let k = 0;
    for (const b of L.BEDS) for (let i = 0; i < 7; i++) for (const r of [-0.45, 0.45]) {
      _p.set(b.x - b.w / 2 + 0.6 + i * ((b.w - 1.2) / 6), base + 0.6, b.z + r);
      const sc = 0.8 + R() * 0.5; _s.set(sc, sc * 0.7, sc);
      _q.setFromAxisAngle(UP, R() * 6.28);
      plants.setMatrixAt(k, _m.compose(_p, _q, _s));
      plants.setColorAt(k, col.setHSL(0.24 + R() * 0.1, 0.5, 0.32 + R() * 0.15));
      k++;
    }
    plants.castShadow = true;
    scene.add(plants);
  }

  // ----- dining hall -----
  {
    const D = L.DINING_HALL, wh = 4.2, front = D.z + D.d / 2, dw = 2;
    const stone = [], glass = [], trim = [], slate = [], door = [];
    stone.push(box(D.w, wh, 0.5, D.x, base + wh / 2, D.z - D.d / 2));
    stone.push(box(0.5, wh, D.d, D.x - D.w / 2, base + wh / 2, D.z));
    stone.push(box(0.5, wh, D.d, D.x + D.w / 2, base + wh / 2, D.z));
    const side = (D.w - dw) / 2;
    stone.push(box(side, wh, 0.5, D.x - dw / 2 - side / 2, base + wh / 2, front));
    stone.push(box(side, wh, 0.5, D.x + dw / 2 + side / 2, base + wh / 2, front));
    stone.push(box(dw, wh - 2.8, 0.5, D.x, base + 2.8 + (wh - 2.8) / 2, front));
    // gable end walls
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-D.d / 2, 0); shape.lineTo(D.d / 2, 0); shape.lineTo(0, 3.2); shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / TEX_M, uv.getY(i) / TEX_M);
      g.rotateY(Math.PI / 2);
      g.translate(D.x + sx * D.w / 2 - 0.25, base + wh, D.z);
      stone.push(g);
    }
    slate.push(gableRoof(D.d + 1.2, 3.6, D.w + 1, D.x, base + wh - 0.2, D.z));
    trim.push(box(D.w + 0.6, 0.3, D.d + 0.6, D.x, base + 0.15, D.z));
    for (const x of [-4.8, -2.4, 2.4, 4.8]) {
      trim.push(box(1.4, 2.2, 0.2, D.x + x, base + 2.2, front + 0.2));
      glass.push(box(1.0, 1.8, 0.3, D.x + x, base + 2.2, front + 0.2));
    }
    for (const sx of [-1, 1]) glass.push(box(0.3, 1.8, 1.4, D.x + sx * D.w / 2, base + 2.2, D.z));
    door.push(box(dw, 2.8, 0.15, D.x - 0.6, base + 1.4, front + 0.6, -1.2)); // door standing open
    scene.add(merged(stone, mats.stone), merged(slate, mats.slate), merged(trim, mats.trim),
      merged(glass, mats.warmGlass), merged(door, mats.door));
    const glow = new THREE.PointLight('#ffb866', 8, 10, 1.6);
    glow.position.set(D.x, base + 2.5, front + 1.2);
    scene.add(glow);
    const lantern = normalised(assets.ph.lantern.scene, 0.55);
    scene.add(placed(lantern, D.x + 1.7, base, front + 0.9));
    L.addBox(D.x, D.z, D.w + 0.5, D.d + 0.5, 8);
  }

  // ----- bridge -----
  {
    const B = L.BRIDGE, wood = [], stone = [];
    wood.push(box(B.halfW * 2, 0.3, B.halfL * 2, B.x, B.deckY - 0.15, B.z));
    for (const sx of [-1, 1]) {
      const x = B.x + sx * (B.halfW - 0.1);
      for (let z = -B.halfL; z <= B.halfL + 0.01; z += 2) wood.push(box(0.18, 1.05, 0.18, x, B.deckY + 0.5, B.z + z));
      wood.push(box(0.14, 0.14, B.halfL * 2, x, B.deckY + 1.0, B.z));
      wood.push(box(0.1, 0.1, B.halfL * 2, x, B.deckY + 0.55, B.z));
      L.addBox(x, B.z, 0.3, B.halfL * 2);
    }
    for (const dz of [-3, 3]) stone.push(box(B.halfW * 2 + 0.4, 2.4, 0.8, B.x, B.deckY - 1.5, B.z + dz));
    scene.add(merged(wood, mats.wood), merged(stone, mats.stone));
  }

  // ----- benches, lamp posts and the estate gate (Poly Haven) -----
  {
    const bench = normalised(assets.ph.bench.scene, 1.6, 'xz');
    for (const [x, z, ry] of [[46, -15.3, 0], [-20, 12.8, Math.PI], [-50, -21.5, 0], [8, 31, -Math.PI / 2], [64, 2.5, 0]]) {
      scene.add(placed(bench, x, L.groundHeight(x, z), z, ry));
      L.addCircle(x, z, 0.8);
    }
    const lamp = normalised(assets.ph.lamp.scene, 3.9);
    for (const x of [-66, -36, -12, 12, 36, 60]) {
      scene.add(placed(lamp, x, base, 12.6, Math.PI));
      L.addCircle(x, 12.6, 0.3);
    }
    const gate = normalised(assets.ph.gate.scene, 3.2);
    scene.add(placed(gate, -86.5, L.groundHeight(-86.5, 10), 10, Math.PI / 2));
    // stone gate piers either side
    scene.add(merged([box(1, 3.6, 1, -86.5, base + 1.8, 7.6), box(1, 3.6, 1, -86.5, base + 1.8, 12.4)], mats.stone));
  }

  // ----- trees (KayKit), placed with spacing -----
  const keepClear = [
    ...Object.values(ITEMS).map((i) => [i.x, i.z]),
    ...NPCS.map((n) => [n.x, n.z]),
    [0, 2],
  ];
  const cell = 4, grid = new Map(), trees = [];
  const near = (x, z, d) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      for (const t of grid.get(`${cx + i},${cz + j}`) || []) if (Math.hypot(t.x - x, t.z - z) < d) return true;
    }
    return false;
  };
  const patrolArea = { x: 0, z: -1, w: 36, d: 18 };
  const treeOk = (x, z, pad = 0) =>
    L.rectDist(x, z, L.CASTLE) > 9 + pad && L.rectDist(x, z, L.GARDEN) > 3 + pad && L.rectDist(x, z, L.DINING_HALL) > 5 + pad &&
    L.rectDist(x, z, patrolArea) > 2 &&
    L.pondDist(x, z) > 1.35 && L.riverDist(x, z) > 7.5 + pad && L.pathDist(x, z) > 3.6 + pad &&
    keepClear.every(([kx, kz]) => Math.hypot(kx - x, kz - z) > 4.5 + pad);
  const place = (x, z, minD, kind) => {
    const pad = kind === 'clump' ? 5 : 0;
    if (!treeOk(x, z, pad) || near(x, z, minD)) return;
    const t = { x, z, s: 0.8 + R() * 0.45, kind, rot: R() * 6.28, v: R() < 0.5 };
    trees.push(t);
    const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(t);
  };
  const inside = (x, z, pad) => x > L.BOUNDS.minX + pad && x < L.BOUNDS.maxX - pad && z > L.BOUNDS.minZ + pad && z < L.BOUNDS.maxZ - pad;
  for (let i = 0; i < 4000; i++) { // woodland clumps ringing the estate
    const x = -140 + R() * 280, z = -110 + R() * 230;
    if (!inside(x, z, 4)) place(x, z, 9, 'clump');
  }
  for (let i = 0; i < 3000; i++) { // single trees filling the ring
    const x = -130 + R() * 260, z = -100 + R() * 210;
    if (!inside(x, z, 6)) place(x, z, 3.5, 'single');
  }
  for (let i = 0; i < 2500; i++) { // the south woods
    place(L.BOUNDS.minX + R() * (L.BOUNDS.maxX - L.BOUNDS.minX), 50 + R() * 30, 3.8, 'single');
  }
  for (let c = 0; c < 16; c++) { // parkland groups
    const cx = -80 + R() * 160, cz = -60 + R() * 100;
    for (let i = 0; i < 7; i++) place(cx + (R() - 0.5) * 16, cz + (R() - 0.5) * 16, 5.5, 'single');
  }
  for (let i = 0; i < 70; i++) place(-85 + R() * 170, -65 + R() * 105, 10, 'single');

  {
    const singleA = normalised(assets.kk.treeA.scene, 8), singleB = normalised(assets.kk.treeB.scene, 7.5);
    const clumpA = normalised(assets.kk.clumpA.scene, 15, 'xz'), clumpB = normalised(assets.kk.clumpB.scene, 15, 'xz');
    const groups = { sA: [], sB: [], cA: [], cB: [] };
    for (const t of trees) {
      const y = L.groundHeight(t.x, t.z) - 0.15;
      const key = t.kind === 'clump' ? (t.v ? 'cA' : 'cB') : (t.v ? 'sA' : 'sB');
      groups[key].push(mat4(t.x, y, t.z, t.rot, t.s));
      if (inside(t.x, t.z, -4)) L.addCircle(t.x, t.z, t.kind === 'clump' ? 5 * t.s : 0.5 * t.s);
    }
    const g = new THREE.Group();
    instanced(g, singleA, groups.sA);
    instanced(g, singleB, groups.sB);
    instanced(g, clumpA, groups.cA);
    instanced(g, clumpB, groups.cB);
    scene.add(g);
  }

  // ----- ferns in the woods (Poly Haven) -----
  if (high) {
    const fern = normalised(assets.ph.fern.scene, 0.9);
    const list = [];
    for (let i = 0; i < 400 && list.length < 90; i++) {
      const x = L.BOUNDS.minX + R() * (L.BOUNDS.maxX - L.BOUNDS.minX), z = 49 + R() * 30;
      if (L.pathDist(x, z) < 2.5 || L.riverDist(x, z) < 7) continue;
      list.push(mat4(x, L.groundHeight(x, z), z, R() * 6.28, 0.8 + R() * 0.8));
    }
    const g = new THREE.Group();
    instanced(g, fern, list, { cast: false });
    scene.add(g);
  }

  // ----- rocks along the river (KayKit) -----
  {
    const kinds = ['rockA', 'rockB', 'rockC', 'rockD'].map((k) => normalised(assets.kk[k].scene, 1.6, 'xz'));
    const lists = kinds.map(() => []);
    let n = 0;
    for (let i = 0; i < 500 && n < 70; i++) {
      const x = -85 + R() * 170, z = L.riverZ(x) + (R() < 0.5 ? -1 : 1) * (5.2 + R() * 2.5);
      if (Math.abs(x) < 6 || L.pathDist(x, z) < 3 || keepClear.some(([kx, kz]) => Math.hypot(kx - x, kz - z) < 3)) continue;
      const sc = 0.6 + R() * 1.1;
      lists[n % 4].push(mat4(x, L.groundHeight(x, z) - 0.1, z, R() * 6.28, sc));
      L.addCircle(x, z, 0.6 * sc);
      n++;
    }
    const g = new THREE.Group();
    kinds.forEach((k, i) => instanced(g, k, lists[i]));
    scene.add(g);
  }

  // ----- pond: water lilies and water plants (KayKit), reeds -----
  {
    const lilies = [normalised(assets.kk.lilyA.scene, 1.4, 'xz'), normalised(assets.kk.lilyB.scene, 1.4, 'xz')];
    const plants = [normalised(assets.kk.plantA.scene, 1.6), normalised(assets.kk.plantB.scene, 1.6)];
    const lilyM = [[], []], plantM = [[], []];
    for (let i = 0; i < 30; i++) {
      const a = R() * 6.28, d = Math.sqrt(R()) * 0.7;
      lilyM[i % 2].push(mat4(L.POND.x + Math.cos(a) * L.POND.rx * d, L.WATER_Y - 0.02, L.POND.z + Math.sin(a) * L.POND.rz * d, R() * 6.28, 0.6 + R() * 0.6));
    }
    for (let i = 0; i < 40; i++) {
      const a = R() * 6.28, d = 0.9 + R() * 0.12;
      const x = L.POND.x + Math.cos(a) * L.POND.rx * d, z = L.POND.z + Math.sin(a) * L.POND.rz * d;
      if (Math.hypot(x - ITEMS.drugs.x, z - ITEMS.drugs.z) < 2) continue;
      plantM[i % 2].push(mat4(x, Math.max(L.WATER_Y, L.groundHeight(x, z)) - 0.1, z, R() * 6.28, 0.7 + R() * 0.6));
    }
    const g = new THREE.Group();
    lilies.forEach((m, i) => instanced(g, m, lilyM[i], { cast: false }));
    plants.forEach((m, i) => instanced(g, m, plantM[i]));
    scene.add(g);

    const reedGeo = new THREE.CylinderGeometry(0.02, 0.035, 1.6, 4); reedGeo.translate(0, 0.8, 0);
    const reeds = new THREE.InstancedMesh(reedGeo, mats.leaf, 360);
    const col = new THREE.Color();
    for (let i = 0; i < reeds.count; i++) {
      const a = R() * 6.28, d = 0.92 + R() * 0.16;
      const x = L.POND.x + Math.cos(a) * L.POND.rx * d, z = L.POND.z + Math.sin(a) * L.POND.rz * d;
      _p.set(x, Math.max(L.WATER_Y, L.groundHeight(x, z)) - 0.1, z);
      _q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3));
      _s.set(1, 0.6 + R() * 0.7, 1);
      reeds.setMatrixAt(i, _m.compose(_p, _q, _s));
      reeds.setColorAt(i, col.setHSL(0.18 + R() * 0.06, 0.45, 0.3 + R() * 0.12));
    }
    reeds.castShadow = true;
    scene.add(reeds);
  }

  // ----- grass that sways in the wind -----
  {
    const blades = 5, verts = [], colors = [], normals = [];
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + R(), r = R() * 0.18;
      const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
      const ry = R() * Math.PI, w = 0.045, h = 0.4 + R() * 0.3;
      const lean = (R() - 0.5) * 0.25;
      const cx = Math.cos(ry) * w, cz = Math.sin(ry) * w;
      // both windings, so each side is lit from above instead of flipping dark
      verts.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, ox + lean, h, oz + lean * 0.5);
      verts.push(ox + cx, 0, oz + cz, ox - cx, 0, oz - cz, ox + lean, h, oz + lean * 0.5);
      colors.push(0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 1, 1, 1, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 1, 1, 1);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float sway = sin(uTime * 1.6 + ip.x * 0.3 + ip.z * 0.22) * 0.5 + sin(uTime * 2.7 + ip.x * 0.7 - ip.z * 0.4) * 0.25;
        float bend = position.y * position.y;
        transformed.x += sway * bend * 0.6;
        transformed.z += sway * bend * 0.35;
      `);
    };
    const count = high ? 45000 : 16000;
    const grass = new THREE.InstancedMesh(g, mat, count);
    const col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < count * 3 && k < count; i++) {
      const x = L.BOUNDS.minX - 4 + R() * (L.BOUNDS.maxX - L.BOUNDS.minX + 8);
      const z = L.BOUNDS.minZ - 4 + R() * (L.BOUNDS.maxZ - L.BOUNDS.minZ + 8);
      const h = L.groundHeight(x, z);
      if (h < L.WATER_Y + 0.3 || L.pathDist(x, z) < L.PATH_HALF + 0.2) continue;
      if (L.rectDist(x, z, L.CASTLE) < 3.5 || L.rectDist(x, z, L.DINING_HALL) < 0.5) continue;
      if (L.BEDS.some((b) => L.rectDist(x, z, b) < 0.2)) continue;
      _p.set(x, h - 0.02, z);
      _q.setFromAxisAngle(UP, R() * 6.28);
      const sc = 0.7 + R() * 0.7;
      _s.set(sc, sc * (z > 46 ? 1.3 : 1), sc);
      grass.setMatrixAt(k, _m.compose(_p, _q, _s));
      grass.setColorAt(k, col.setHSL(0.24 + R() * 0.06, 0.55, (z > 46 ? 0.16 : 0.2) + R() * 0.08));
      k++;
    }
    grass.count = k;
    grass.receiveShadow = true;
    grass.frustumCulled = false;
    scene.add(grass);

    const fGeo = new THREE.IcosahedronGeometry(0.05, 0);
    const flowers = new THREE.InstancedMesh(fGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), high ? 4000 : 1500);
    const palette = ['#e86a92', '#f2d14b', '#ffffff', '#b58be0', '#ff8a5c'];
    let f = 0;
    for (let d = 0; d < 60 && f < flowers.count; d++) {
      const cx = -85 + R() * 170, cz = -65 + R() * 140, hue = palette[Math.floor(R() * palette.length)];
      for (let i = 0; i < flowers.count / 50 && f < flowers.count; i++) {
        const x = cx + (R() - 0.5) * 12, z = cz + (R() - 0.5) * 12, h = L.groundHeight(x, z);
        if (h < L.WATER_Y + 0.3 || L.pathDist(x, z) < L.PATH_HALF + 0.3 || L.rectDist(x, z, L.CASTLE) < 2 || L.rectDist(x, z, L.DINING_HALL) < 0.5) continue;
        _p.set(x, h + 0.22 + R() * 0.1, z);
        _s.setScalar(0.8 + R() * 0.6);
        flowers.setMatrixAt(f, _m.compose(_p, _q.identity(), _s));
        flowers.setColorAt(f, col.set(hue).offsetHSL(0, 0, (R() - 0.5) * 0.1));
        f++;
      }
    }
    flowers.count = f;
    scene.add(flowers);
  }

  function update(t) {
    time.value = t;
    waterNormals.offset.set(t * 0.012, t * 0.008);
  }

  return { update, patrolRoute: PATROL.route };
}
