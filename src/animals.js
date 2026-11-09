// Wildlife and livestock: alpacas in their paddock, rabbits in the meadows,
// garden birds on the lawns and flocks of rooks over the woods.
// Low-poly models built in code so they match the KayKit art style.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from './layout.js';
import { PADDOCK, LOST_ALPACAS } from './quests.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
const g = {
  sphere: (r, x, y, z, sx = 1, sy = 1, sz = 1, detail = 1) => new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz).translate(x, y, z),
  cyl: (rt, rb, h, x, y, z, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z),
  cone: (r, h, x, y, z, seg = 6) => new THREE.ConeGeometry(r, h, seg).translate(x, y, z),
};
const merge = (list) => mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal'].includes(k)) x.deleteAttribute(k); return x; }));

// Lumpy fleece: displace an icosphere a little.
function fleece(r, sx, sy, sz, seed) {
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.07 * Math.sin(x * 23 + seed) * Math.cos(y * 19 + z * 17 + seed);
    p.setXYZ(i, x * k * sx, y * k * sy, z * k * sz);
  }
  geo.computeVertexNormals();
  return geo;
}

const shadowy = (o, cast = true) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = true; } }); return o; };
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (cur, target, step) => cur + Math.max(-step, Math.min(step, ang(target - cur)));

// ---------- alpaca ----------
function makeAlpaca(color, seed) {
  const wool = mat(color), dark = mat('#2a2420'), face = mat(new THREE.Color(color).offsetHSL(0, 0, -0.08));
  const root = new THREE.Group();
  const body = new THREE.Mesh(merge([fleece(0.42, 1, 0.95, 1.65, seed), g.sphere(0.12, 0, 0.18, -0.68, 1, 1, 1)]), wool);
  body.position.y = 1.05;
  root.add(body);
  const neck = new THREE.Group();
  neck.position.set(0, 1.25, 0.55);
  const neckMesh = new THREE.Mesh(merge([fleece(0.15, 1, 3.6, 1, seed + 1).translate(0, 0.45, 0)]), wool);
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.05);
  head.add(new THREE.Mesh(merge([fleece(0.16, 1, 1, 1.15, seed + 2), g.sphere(0.09, 0, -0.05, 0.19, 1, 0.9, 1.2)]), face));
  head.add(new THREE.Mesh(merge([g.cone(0.045, 0.2, -0.09, 0.2, -0.03), g.cone(0.045, 0.2, 0.09, 0.2, -0.03)]), face));
  head.add(new THREE.Mesh(merge([g.sphere(0.025, -0.1, 0.03, 0.12, 1, 1, 1, 0), g.sphere(0.025, 0.1, 0.03, 0.12, 1, 1, 1, 0), g.sphere(0.03, 0, -0.06, 0.29, 1.2, 0.8, 0.8, 0)]), dark));
  neck.add(neckMesh, head);
  neck.rotation.x = 0.25;
  root.add(neck);
  const legs = [];
  for (const [x, z] of [[-0.2, 0.42], [0.2, 0.42], [-0.2, -0.42], [0.2, -0.42]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.85, z);
    hip.add(new THREE.Mesh(merge([g.cyl(0.075, 0.055, 0.82, 0, -0.41, 0), g.sphere(0.06, 0, -0.84, 0.03, 1, 0.6, 1.3, 0)]), face));
    root.add(hip);
    legs.push(hip);
  }
  return { root: shadowy(root), neck, head, legs };
}

// ---------- rabbit ----------
function makeRabbit(color) {
  const geo = merge([
    g.sphere(0.12, 0, 0.13, 0, 1, 0.9, 1.4), g.sphere(0.075, 0, 0.24, 0.15, 1, 1, 1.1),
    g.sphere(0.03, 0, 0.47, 0.12, 0.7, 3.4, 0.5).rotateX(-0.25).translate(-0.035, 0.03, 0),
    g.sphere(0.03, 0, 0.47, 0.12, 0.7, 3.4, 0.5).rotateX(-0.25).translate(0.035, 0.03, 0),
    g.sphere(0.05, 0, 0.06, 0.09, 1.4, 0.5, 1.6), // folded back legs
  ]);
  const root = new THREE.Group();
  const body = new THREE.Mesh(geo, mat(color));
  const tail = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 1).translate(0, 0.14, -0.17), mat('#f4f0e8'));
  root.add(body, tail);
  return { root: shadowy(root) };
}

// ---------- bird ----------
function makeBird(color, size, beakColor = '#e0a030', breast = null) {
  const root = new THREE.Group();
  const bodyGeo = merge([g.sphere(0.07, 0, 0, 0, 0.9, 0.85, 1.6), g.sphere(0.045, 0, 0.05, 0.1), g.cone(0.045, 0.12, 0, -0.01, -0.13, 4).rotateX(-Math.PI / 2 - 0.2)]);
  root.add(new THREE.Mesh(bodyGeo, mat(color)));
  if (breast) root.add(new THREE.Mesh(g.sphere(0.045, 0, 0.0, 0.07, 0.9, 0.9, 0.7), mat(breast)));
  root.add(new THREE.Mesh(g.cone(0.014, 0.05, 0, 0.045, 0.16, 4).rotateX(Math.PI / 2), mat(beakColor)));
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.05, 0.02, 0.0);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.1).translate(s * 0.1, 0, 0), mat(color));
    pivot.add(w);
    root.add(pivot);
    wings.push({ pivot, s });
  }
  root.scale.setScalar(size);
  return { root: shadowy(root, false), wings };
}

// ---------- the herds and flocks ----------
export function buildAnimals(scene, { quality }) {
  const R = L.rng(77);
  const high = quality === 'high';
  const group = new THREE.Group();
  scene.add(group);
  const P = PADDOCK;

  // grassy, walkable ground for rabbits and garden birds
  const meadowPoint = (cx, cz, spread) => {
    for (let i = 0; i < 40; i++) {
      const x = cx + (R() - 0.5) * spread, z = cz + (R() - 0.5) * spread;
      const s = L.splatAt(x, z);
      if (s[0] < 0.05 && s[1] < 0.35 && s[2] < 0.05 && !L.blocked(x, z, 0.3) && !(x > P.minX - 1 && x < P.maxX + 1 && z > P.minZ - 1 && z < P.maxZ + 1)) return [x, z];
    }
    return null;
  };

  // alpacas
  const alpacas = [];
  const fleeceColors = ['#f3ead8', '#c79a62', '#6b4a33', '#ffffff', '#9a8a7a', '#2f2a26'];
  for (let i = 0; i < 6; i++) {
    const a = makeAlpaca(fleeceColors[i], i * 3.1);
    const x = P.minX + 6 + R() * (P.maxX - P.minX - 12), z = P.minZ + 6 + R() * (P.maxZ - P.minZ - 12);
    a.root.scale.setScalar(0.9 + R() * 0.2);
    group.add(a.root);
    alpacas.push({ ...a, x, z, heading: R() * 6.28, state: 'graze', timer: 2 + R() * 5, tx: x, tz: z, phase: R() * 6, neckTilt: 0.25, happy: 0 });
  }
  // the three that escaped (for the Alpaca Keeper's quest)
  const lost = LOST_ALPACAS.map(([x, z], i) => {
    const a = makeAlpaca(['#d9b38c', '#fbf7ee', '#8a6a4a'][i], 20 + i);
    group.add(a.root);
    const o = { ...a, x, z, homeX: x, homeZ: z, heading: R() * 6.28, state: 'lost', timer: R() * 4, tx: x, tz: z, phase: R() * 6, neckTilt: 0.25, happy: 0, lost: true };
    alpacas.push(o);
    return o;
  });
  const inPaddock = (a) => a.x > P.minX + 1 && a.x < P.maxX - 1 && a.z > P.minZ + 1 && a.z < P.maxZ - 1;

  // rabbits
  const rabbits = [];
  const rabbitColors = ['#8a7560', '#7a6a58', '#9a8670', '#6e5e4e'];
  for (let i = 0; i < (high ? 26 : 14); i++) {
    const p = meadowPoint(-40 + R() * 160, -120 + R() * 380, 120);
    if (!p) continue;
    const r = makeRabbit(rabbitColors[i % 4]);
    group.add(r.root);
    rabbits.push({ ...r, x: p[0], z: p[1], heading: R() * 6.28, state: 'idle', timer: R() * 4, hop: 0, hopFrom: null, hopTo: null, flee: 0 });
  }

  // garden birds on the lawns
  const groundBirds = [];
  const kinds = [['#5a4a3a', 1, '#e8a030', '#d8653a'], ['#1e1e22', 1.15, '#e8b030', null], ['#8a8f9a', 1.5, '#c8a070', '#b0a0b8']];
  for (let i = 0; i < (high ? 14 : 8); i++) {
    const p = meadowPoint(R() * 120 - 60, R() * 200 - 60, 140);
    if (!p) continue;
    const [c, s, beak, breast] = kinds[i % 3];
    const b = makeBird(c, s, beak, breast);
    group.add(b.root);
    groundBirds.push({ ...b, x: p[0], z: p[1], y: L.groundHeight(...p), heading: R() * 6.28, state: 'ground', timer: R() * 3, flight: null });
  }

  // rooks circling over the woods
  const flocks = [];
  for (const [cx, cz, n] of [[60, 60, 8], [-140, 300, 7], [180, 150, 7]]) {
    const birds = [];
    for (let i = 0; i < n; i++) {
      const b = makeBird('#18181c', 2.1, '#3a3a3a');
      group.add(b.root);
      birds.push({ ...b, off: R() * 6.28, rad: 25 + R() * 25, alt: 22 + R() * 14, speed: 0.18 + R() * 0.08, flap: R() * 6 });
    }
    flocks.push({ cx, cz, birds, drift: R() * 6.28 });
  }

  const tmp = new THREE.Vector3();

  function update(dt, t, player) {
    if (!group.visible) return;
    const px = player.x, pz = player.z;

    // ----- alpacas: graze, wander, and come over to look at you -----
    for (const a of alpacas) {
      a.timer -= dt;
      const dp = Math.hypot(px - a.x, pz - a.z);
      let moving = false;
      if (a.state === 'follow') {
        // trot along behind the player, single file
        const idx = lost.filter((o) => o.state === 'follow').indexOf(a);
        const back = 2.6 + idx * 2.2, fx = px - Math.sin(player.heading ?? 0) * back, fz = pz - Math.cos(player.heading ?? 0) * back;
        const dx = fx - a.x, dz = fz - a.z, d = Math.hypot(dx, dz);
        if (d > 30 && !L.blocked(fx, fz, 0.5)) { a.x = fx; a.z = fz; } // fell far behind: catch up
        else if (d > 0.6) {
          a.heading = turn(a.heading, Math.atan2(dx, dz), dt * 4);
          const step = Math.min(d, Math.min(9.5, 1 + d * 1.6) * dt), nx = a.x + Math.sin(a.heading) * step, nz = a.z + Math.cos(a.heading) * step;
          if (!L.blocked(nx, nz, 0.5) || inPaddock({ x: nx, z: nz })) { a.x = nx; a.z = nz; a.stuck = 0; }
          else if ((a.stuck = (a.stuck || 0) + dt) > 1.5 && !L.blocked(fx, fz, 0.5)) { a.x = fx; a.z = fz; a.stuck = 0; } // caught on a fence: catch up
          moving = true;
        }
        if (inPaddock(a)) { a.state = 'graze'; a.lost = false; a.home = true; a.timer = 2; a.happy = 1.2; }
      } else if (a.state === 'lost' && a.timer < 0) {
        a.state = 'wander';
        a.tx = a.homeX + (R() - 0.5) * 14; a.tz = a.homeZ + (R() - 0.5) * 14;
      }
      if (a.state === 'wander') {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.4) { a.state = 'lost'; a.timer = 3 + R() * 6; }
        else {
          a.heading = turn(a.heading, Math.atan2(dx, dz), dt * 1.5);
          const nx = a.x + Math.sin(a.heading) * 0.8 * dt, nz = a.z + Math.cos(a.heading) * 0.8 * dt;
          if (!L.blocked(nx, nz, 0.5)) { a.x = nx; a.z = nz; moving = true; } else { a.state = 'lost'; a.timer = 1; }
        }
      }
      if (a.state === 'graze' && a.timer < 0) {
        a.state = 'walk';
        a.tx = THREE.MathUtils.clamp(a.x + (R() - 0.5) * 24, P.minX + 3, P.maxX - 3);
        a.tz = THREE.MathUtils.clamp(a.z + (R() - 0.5) * 24, P.minZ + 3, P.maxZ - 3);
      }
      if (a.state === 'walk') {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.4) { a.state = 'graze'; a.timer = 3 + R() * 7; }
        else {
          a.heading = turn(a.heading, Math.atan2(dx, dz), dt * 1.5);
          if (Math.abs(ang(Math.atan2(dx, dz) - a.heading)) < 0.6) {
            a.x += Math.sin(a.heading) * 0.85 * dt; a.z += Math.cos(a.heading) * 0.85 * dt;
            moving = true;
          }
        }
      }
      if (dp < 1.6) { // don't let the player walk through them
        a.x += ((a.x - px) / dp) * (1.6 - dp); a.z += ((a.z - pz) / dp) * (1.6 - dp);
      }
      if (!a.lost && a.state !== 'follow') {
        a.x = THREE.MathUtils.clamp(a.x, P.minX + 1, P.maxX - 1);
        a.z = THREE.MathUtils.clamp(a.z, P.minZ + 1, P.maxZ - 1);
      }
      const curious = dp < 9 && (a.state === 'graze' || a.state === 'lost');
      if (curious) a.heading = turn(a.heading, Math.atan2(px - a.x, pz - a.z), dt * 1.2);
      a.phase += dt * (moving ? 6 : 0);
      a.legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(a.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.4 : leg.rotation.x * 0.9; });
      const grazing = (a.state === 'graze' || a.state === 'lost') && !curious && a.timer > 1;
      a.neckTilt += ((grazing ? 1.7 : 0.15 + Math.sin(t * 0.7 + a.phase) * 0.06) - a.neckTilt) * Math.min(1, dt * 2);
      a.neck.rotation.x = a.neckTilt;
      a.head.rotation.x = grazing ? 0.3 : -0.1;
      a.happy = Math.max(0, a.happy - dt);
      a.root.position.set(a.x, L.groundHeight(a.x, a.z) + (a.happy > 0 ? Math.abs(Math.sin(a.happy * 9)) * 0.25 : 0), a.z);
      a.root.rotation.y = a.heading;
    }

    // ----- rabbits: nibble, hop about, and bolt when you come close -----
    for (const r of rabbits) {
      r.timer -= dt;
      const dp = Math.hypot(px - r.x, pz - r.z);
      if (dp < 7 && r.flee <= 0) { r.flee = 2.5; r.state = 'idle'; r.timer = 0; }
      r.flee -= dt;
      if (r.hopTo) {
        r.hop += dt * (r.flee > 0 ? 4.5 : 2.6);
        const k = Math.min(1, r.hop);
        r.x = r.hopFrom[0] + (r.hopTo[0] - r.hopFrom[0]) * k;
        r.z = r.hopFrom[1] + (r.hopTo[1] - r.hopFrom[1]) * k;
        r.y = L.groundHeight(r.x, r.z) + Math.sin(k * Math.PI) * (r.flee > 0 ? 0.35 : 0.2);
        r.root.rotation.x = Math.cos(k * Math.PI) * -0.4;
        if (k >= 1) { r.hopTo = null; r.timer = r.flee > 0 ? 0 : 0.4 + R() * 3; r.root.rotation.x = 0; }
      } else if (r.timer <= 0) {
        const away = r.flee > 0 ? Math.atan2(r.x - px, r.z - pz) + (R() - 0.5) * 0.8 : R() * 6.28;
        const len = r.flee > 0 ? 1.6 : 0.5 + R() * 0.9;
        const nx = r.x + Math.sin(away) * len, nz = r.z + Math.cos(away) * len;
        const s = L.splatAt(nx, nz);
        if (s[0] < 0.4 && s[2] < 0.2 && !L.blocked(nx, nz, 0.15)) {
          r.hopFrom = [r.x, r.z]; r.hopTo = [nx, nz]; r.hop = 0; r.heading = away;
        } else r.timer = 0.3;
      } else {
        r.y = L.groundHeight(r.x, r.z);
        r.root.rotation.x = Math.sin(t * 9 + r.x) * 0.04; // nibbling
      }
      r.root.position.set(r.x, r.y ?? L.groundHeight(r.x, r.z), r.z);
      r.root.rotation.y = r.heading;
    }

    // ----- garden birds: peck, hop, fly off when startled -----
    for (const b of groundBirds) {
      b.timer -= dt;
      const dp = Math.hypot(px - b.x, pz - b.z);
      if (b.state === 'ground') {
        if (dp < 5) {
          const dest = meadowPoint(b.x, b.z, 70) || [b.x + 20, b.z + 20];
          b.flight = { from: [b.x, b.y, b.z], to: [dest[0], L.groundHeight(...dest), dest[1]], k: 0, peak: 5 + R() * 6 };
          b.flight.len = Math.hypot(dest[0] - b.x, dest[1] - b.z);
          b.state = 'fly';
        } else if (b.timer < 0) {
          const a = R() * 6.28;
          const nx = b.x + Math.sin(a) * 0.3, nz = b.z + Math.cos(a) * 0.3;
          if (!L.blocked(nx, nz, 0.1)) { b.x = nx; b.z = nz; b.heading = a; }
          b.timer = 0.3 + R() * 1.5;
        }
        b.y = L.groundHeight(b.x, b.z) + 0.06 * b.root.scale.x;
        b.root.rotation.x = Math.max(0, Math.sin(t * 6 + b.x * 3)) * 0.5; // pecking
        for (const w of b.wings) w.pivot.rotation.z = 0;
      } else {
        const f = b.flight;
        f.k = Math.min(1, f.k + (dt * 9) / Math.max(8, f.len));
        b.x = f.from[0] + (f.to[0] - f.from[0]) * f.k;
        b.z = f.from[2] + (f.to[2] - f.from[2]) * f.k;
        b.y = f.from[1] + (f.to[1] - f.from[1]) * f.k + Math.sin(f.k * Math.PI) * f.peak + 0.06;
        b.heading = Math.atan2(f.to[0] - f.from[0], f.to[2] - f.from[2]);
        b.root.rotation.x = -0.2;
        for (const w of b.wings) w.pivot.rotation.z = w.s * Math.sin(t * 28) * 0.9;
        if (f.k >= 1) { b.state = 'ground'; b.timer = 1; }
      }
      b.root.position.set(b.x, b.y, b.z);
      b.root.rotation.y = b.heading;
    }

    // ----- rooks wheeling over the trees -----
    for (const fl of flocks) {
      const cx = fl.cx + Math.sin(t * 0.03 + fl.drift) * 30, cz = fl.cz + Math.cos(t * 0.025 + fl.drift) * 30;
      for (const b of fl.birds) {
        const a = t * b.speed + b.off;
        const rad = b.rad + Math.sin(t * 0.3 + b.off) * 6;
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
        const y = L.groundHeight(cx, cz) + b.alt + Math.sin(t * 0.5 + b.off * 2) * 3;
        b.root.position.set(x, y, z);
        tmp.set(-Math.sin(a), 0, Math.cos(a)); // direction of travel
        b.root.rotation.set(0, Math.atan2(tmp.x, tmp.z), 0);
        b.root.rotation.z = -0.25; // bank into the turn
        const gliding = Math.sin(t * 0.8 + b.off * 3) > 0.3;
        b.flap += dt * (gliding ? 0 : 14);
        for (const w of b.wings) w.pivot.rotation.z = gliding ? w.s * 0.08 : w.s * Math.sin(b.flap) * 0.8;
      }
    }
  }

  // Pat an alpaca if one is close enough. A lost one starts following you if you're looking for them.
  function interact(x, z, searching = false) {
    let best = null, bd = 2.6;
    for (const a of alpacas) { const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a; } }
    if (!best) return null;
    best.happy = 1.2;
    if (best.lost && searching) {
      if (best.state === 'follow') return 'This alpaca is already following you.';
      best.state = 'follow';
      return 'The alpaca hums and starts following you!';
    }
    if (best.state !== 'follow') { best.state = best.lost ? 'lost' : 'graze'; best.timer = 4; }
    return ['The alpaca hums happily.', 'The alpaca nuzzles your hand.', 'Soft! The alpaca leans in for more.'][Math.floor(Math.random() * 3)];
  }
  const herdStatus = () => ({ home: lost.filter((a) => a.home).length, following: lost.filter((a) => a.state === 'follow').length });
  // Put alpacas already brought home (from a saved game) back in the paddock.
  function restoreHome(n) {
    lost.slice(0, n).forEach((a, i) => { a.lost = false; a.home = true; a.state = 'graze'; a.x = -10 + i * 8; a.z = -150; });
  }
  const nearAlpaca = (x, z) => alpacas.some((a) => Math.hypot(a.x - x, a.z - z) < 2.6);

  return { group, update, interact, nearAlpaca, alpacas, rabbits, lost, herdStatus, restoreHome };
}
