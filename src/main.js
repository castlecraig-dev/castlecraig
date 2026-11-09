import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import './style.css';
import * as L from './layout.js';
import { loadAssets, analyseSky } from './assets.js';
import { buildWorld } from './world.js';
import { buildInterior } from './interior.js';
import { buildAnimals } from './animals.js';
import { Character, turnTowards } from './characters.js';
import { ITEMS, NPCS, PATROL, PLACES, AMBIENT, START } from './quests.js';
import { glowTexture } from './textures.js';

const $ = (id) => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);
const quality = params.get('q') || (touch || innerWidth < 900 ? 'low' : 'high'); // ?q=low|high overrides

// ---------- renderer ----------
const container = $('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
container.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
labels.domElement.className = 'labels';
container.appendChild(labels.domElement);

const scene = new THREE.Scene();
const fovFor = (aspect) => (aspect < 1 ? 72 : 55); // wider view on portrait phones
const camera = new THREE.PerspectiveCamera(fovFor(innerWidth / innerHeight), innerWidth / innerHeight, 0.1, 6000);

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fovFor(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});

// ---------- state ----------
const SAVE_KEY = 'castle-craig-quest-3d-v3'; // v3: the real-world map
const fresh = () => ({ x: START.at[0], z: START.at[1], yaw: START.facing + Math.PI, picked: [], bag: [], quests: {}, finished: false, inside: false });
let state = fresh();
try {
  const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (saved && typeof saved.x === 'number') state = Object.assign(fresh(), saved);
} catch { /* storage unavailable: play without saving */ }
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ } };

const sneakNpc = NPCS.find((n) => n.quest.type === 'sneak');
const isActive = (id) => state.quests[id] === 'active';

// ---------- start ----------
const bar = $('loading-bar');
loadAssets(renderer, (p) => { bar.style.width = `${Math.round(p * 100)}%`; })
  .then(start)
  .catch((err) => {
    console.error(err);
    $('loading-text').textContent = 'Sorry, the game failed to load. Please refresh to try again.';
  });

function start(assets) {
  // ----- the real-world map -----
  assets.map.meta.splatTexture = assets.map.splatTex;
  L.initGeo(assets.map);

  // ----- sky, sun and fog from the HDRI -----
  const sky = assets.sky;
  sky.mapping = THREE.EquirectangularReflectionMapping;
  const { sunDir, horizon } = analyseSky(sky);
  if (sunDir.y < 0.25) { sunDir.y = 0.25; sunDir.normalize(); } // keep shadows a sensible length
  scene.background = sky;
  scene.environment = sky;
  scene.environmentIntensity = 0.85;
  scene.fog = new THREE.Fog(horizon.clone().multiplyScalar(0.9), 160, 2200);
  const fog = scene.fog;

  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.castShadow = true;
  const sm = quality === 'high' ? 4096 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Everything on the grounds lives in `outside`, so it can be hidden while indoors.
  const outside = new THREE.Group();
  scene.add(outside);
  const world = buildWorld(outside, { quality, assets });
  const interior = buildInterior(scene, { assets });
  const animals = buildAnimals(outside, { quality });
  const outdoorLabels = [];

  // ----- characters -----
  const player = new Character(assets.chars.player, { height: 1.75 });
  scene.add(player.root);
  let facing = state.yaw + Math.PI;

  const usedModels = new Set();
  const makeChar = (model, tint) => {
    const c = new Character(assets.chars[model], { height: 1.8, tint: tint || null, clone: usedModels.has(model) });
    usedModels.add(model);
    return c;
  };
  const npcs = NPCS.map((n) => {
    const c = makeChar(n.model, n.tint);
    c.root.position.set(n.x, L.standHeight(n.x, n.z), n.z);
    c.root.rotation.y = n.facing;
    outside.add(c.root);
    L.addCircle(n.x, n.z, 0.5);
    const tag = document.createElement('div');
    tag.className = 'npc-tag';
    tag.innerHTML = `<span class="mark"></span><span class="name">${n.name}</span>`;
    const label = new CSS2DObject(tag);
    label.position.set(0, 2.35, 0);
    c.root.add(label);
    outdoorLabels.push(label);
    return { def: n, char: c, tag };
  });

  // residents chatting at the smoking shelter
  const ambient = AMBIENT.map((a) => {
    const c = makeChar(a.model, a.tint);
    c.root.position.set(a.x, L.standHeight(a.x, a.z) + (a.sit ? 0.42 : 0), a.z); // sitting on the bench
    c.root.rotation.y = a.facing;
    if (a.sit) c.play('Sit_Floor_Idle', 0);
    outside.add(c.root);
    L.addCircle(a.x, a.z, 0.4);
    return { def: a, char: c };
  });

  // The Night Porter on patrol
  const porter = makeChar(PATROL.model, '#8c96c8');
  outside.add(porter.root);
  const porterTag = document.createElement('div');
  porterTag.className = 'npc-tag porter';
  porterTag.innerHTML = `<span class="name">${PATROL.name}</span>`;
  const pl = new CSS2DObject(porterTag); pl.position.set(0, 2.35, 0); porter.root.add(pl); outdoorLabels.push(pl);
  const patrol = { i: 0, x: PATROL.route[0][0], z: PATROL.route[0][1], wait: 0, heading: 0, exposure: 0 };
  // vision cone on the ground
  const coneGeo = new THREE.CircleGeometry(PATROL.viewRange, 32, Math.PI / 2 - PATROL.viewAngle / 2, PATROL.viewAngle);
  coneGeo.rotateX(-Math.PI / 2);
  // drawn over the grass so the player can always see where the porter is looking
  const coneMat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.3, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = 0.12;
  cone.rotation.y = 0;
  cone.visible = false;
  cone.renderOrder = 1;
  porter.root.add(cone);

  // ----- place names -----
  for (const p of PLACES) {
    const d = document.createElement('div');
    d.className = 'place';
    d.textContent = p.name;
    const o = new CSS2DObject(d);
    o.position.set(p.x, L.groundHeight(p.x, p.z) + p.h, p.z);
    outside.add(o);
    outdoorLabels.push(o);
    p.el = d;
  }

  // ----- quest items -----
  const glow = glowTexture();
  const itemObjs = {};
  for (const [id, it] of Object.entries(ITEMS)) {
    const g = new THREE.Group();
    g.add(makeItemMesh(it.kind));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffe2a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.6);
    g.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.y = 20;
    g.add(beam);
    g.position.set(it.x, L.groundHeight(it.x, it.z) + 0.9, it.z);
    outside.add(g);
    itemObjs[id] = { group: g, beam, base: g.position.y };
  }

  // ----- checkpoint ring for the timed run -----
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 12, 48),
    new THREE.MeshStandardMaterial({ color: '#ffcc55', emissive: '#ffaa22', emissiveIntensity: 2.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  outside.add(ring);

  // ---------- input ----------
  const keys = new Set();
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  addEventListener('keydown', (e) => {
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.add('run');
    if (['KeyE', 'Space', 'Enter'].includes(e.code)) { e.preventDefault(); if (!e.repeat) act(); }
  });
  addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.delete('run');
  });
  addEventListener('blur', () => keys.clear());

  const cam = { yaw: state.yaw, pitch: 0.32, dist: innerWidth < innerHeight ? 9 : 7 };
  const joy = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
  const look = { id: null, x: 0, y: 0 };
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    if (touch && e.clientX < innerWidth * 0.45 && joy.id === null) {
      Object.assign(joy, { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
      showJoystick(e.clientX, e.clientY, 0, 0);
    } else if (look.id === null) {
      Object.assign(look, { id: e.pointerId, x: e.clientX, y: e.clientY });
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0;
      const len = Math.hypot(dx, dy), max = 60;
      if (len > max) { dx *= max / len; dy *= max / len; }
      joy.dx = dx / max; joy.dy = dy / max;
      showJoystick(joy.x0, joy.y0, dx, dy);
    } else if (e.pointerId === look.id) {
      cam.yaw -= (e.clientX - look.x) * 0.006;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - look.y) * 0.004, 0.05, 1.2);
      look.x = e.clientX; look.y = e.clientY;
    }
  });
  const endPointer = (e) => {
    if (e.pointerId === joy.id) { joy.id = null; joy.dx = joy.dy = 0; $('joystick').hidden = true; }
    if (e.pointerId === look.id) look.id = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.01, 3.5, L.view.inside ? 6 : 16); }, { passive: true });
  function showJoystick(x, y, dx, dy) {
    const j = $('joystick');
    j.hidden = false;
    j.style.left = `${x}px`; j.style.top = `${y}px`;
    $('joystick-knob').style.transform = `translate(${dx}px, ${dy}px)`;
  }
  $('action').addEventListener('click', act);
  $('dialogue').addEventListener('click', act);
  $('reset').addEventListener('click', () => {
    if (!confirm('Start again from the beginning?')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    location.reload();
  });

  // ---------- dialogue and messages ----------
  const dlg = $('dialogue');
  let queue = [];
  let afterDialogue = null;
  function say(name, lines, then = null) {
    queue = lines.map((text) => ({ name, text }));
    afterDialogue = then;
    next();
  }
  function next() {
    const line = queue.shift();
    if (!line) {
      dlg.hidden = true;
      const f = afterDialogue; afterDialogue = null;
      if (f) f();
      return;
    }
    $('dialogue-name').textContent = line.name;
    $('dialogue-text').textContent = line.text;
    dlg.hidden = false;
  }
  let toastTimer;
  function toast(msg, cls = '') {
    const t = $('toast');
    t.textContent = msg; t.className = cls; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- quests ----------
  let run = null; // the timed run in progress

  function nearestNpc() {
    let best = null, bestD = 3;
    for (const n of npcs) {
      const d = Math.hypot(n.def.x - state.x, n.def.z - state.z);
      if (d < bestD) { best = n; bestD = d; }
    }
    return best;
  }

  function complete(npc, lines) {
    state.quests[npc.def.id] = 'done';
    npc.char.playOnce('Cheer');
    player.playOnce('Cheer');
    const all = NPCS.every((n) => state.quests[n.id] === 'done');
    const extra = all && !state.finished ? ['Every quest is complete. Thanks for playing Castle Craig Quest!'] : [];
    if (all) state.finished = true;
    say(npc.def.name, [...lines, `Quest complete: ${npc.def.quest.title}`, ...extra]);
    save();
    renderHud();
  }

  const nearestAmbient = () => ambient.find((a) => Math.hypot(a.def.x - state.x, a.def.z - state.z) < 2.6);

  function act() {
    if (!dlg.hidden) { next(); return; }
    const npc = nearestNpc();
    if (!npc) {
      const a = nearestAmbient();
      if (a) { say(a.def.name, a.def.lines); return; }
      const pat = animals.interact(state.x, state.z);
      if (pat) toast(pat, 'good');
      return;
    }
    const q = npc.def.quest, id = npc.def.id, status = state.quests[id];
    npc.char.playOnce('Interact');

    if (status === 'done') { say(npc.def.name, ['Thanks again for your help!']); return; }

    if (q.type === 'fetch') {
      if (!status) {
        state.quests[id] = 'active';
        say(npc.def.name, [q.intro, `New quest: ${q.title}`]);
      } else if (q.items.every((i) => state.bag.includes(i))) {
        state.bag = state.bag.filter((i) => !q.items.includes(i));
        complete(npc, [q.done]);
        return;
      } else {
        say(npc.def.name, [q.waiting]);
      }
    } else if (q.type === 'timed') {
      if (run) { say(npc.def.name, ['Go, go, go! The clock is running!']); return; }
      const first = !status;
      state.quests[id] = 'active';
      say(npc.def.name, [first ? q.intro : q.retry], () => {
        run = { npc, left: q.timeLimit, idx: 0 };
        toast(`Run to ${q.checkpoints[0].name}!`);
      });
    } else if (q.type === 'sneak') {
      if (!status) {
        state.quests[id] = 'active';
        say(npc.def.name, [q.intro, `New quest: ${q.title}`]);
      } else {
        say(npc.def.name, [q.waiting]);
      }
    }
    save();
    renderHud();
  }

  function itemAvailable(id) {
    if (state.picked.includes(id)) return false;
    if (id === sneakNpc.quest.item) return isActive(sneakNpc.id); // the vape only appears once asked
    return true;
  }

  function checkPickups() {
    for (const id of Object.keys(ITEMS)) {
      if (!itemAvailable(id)) continue;
      const it = ITEMS[id];
      if (Math.hypot(it.x - state.x, it.z - state.z) < 1.5) {
        state.picked.push(id);
        state.bag.push(id);
        player.playOnce('PickUp', 'Idle');
        toast(`Picked up: ${it.name}`);
        save();
        renderHud();
      }
    }
  }

  const carryingVape = () => state.bag.includes(sneakNpc.quest.item);

  function updateQuests(dt, realDt) {
    // timed run
    if (run && dlg.hidden) {
      const q = run.npc.def.quest;
      run.left -= realDt; // real seconds, even if the frame rate drops
      const cp = q.checkpoints[run.idx];
      if (Math.hypot(cp.x - state.x, cp.z - state.z) < cp.r) {
        run.idx++;
        if (run.idx >= q.checkpoints.length) {
          const { npc, left } = run;
          run = null;
          complete(npc, [q.done, `Time left: ${left.toFixed(1)} seconds.`]);
        } else {
          toast(`Checkpoint! Now back to ${q.checkpoints[run.idx].name}!`, 'good');
        }
      } else if (run.left <= 0) {
        const npc = run.npc;
        run = null;
        say(npc.def.name, [q.failed]);
      }
    }
    const timer = $('timer');
    timer.hidden = !run;
    if (run) {
      timer.textContent = `${Math.max(0, run.left).toFixed(1)}s`;
      timer.classList.toggle('urgent', run.left < 6);
      const cp = run.npc.def.quest.checkpoints[run.idx];
      ring.visible = true;
      ring.position.set(cp.x, L.groundHeight(cp.x, cp.z) + 0.25, cp.z);
    } else {
      ring.visible = false;
    }

    // sneaking the vape in
    if (carryingVape() && isActive(sneakNpc.id) && dlg.hidden) {
      const t = sneakNpc.quest.target;
      if (Math.hypot(t.x - state.x, t.z - state.z) < t.r) {
        state.bag = state.bag.filter((i) => i !== sneakNpc.quest.item);
        complete(npcs.find((n) => n.def === sneakNpc), [sneakNpc.quest.done]);
      }
    }
  }

  // ---------- the Night Porter ----------
  const losBlocked = (x0, z0, x1, z1) => L.losBlocked(x0, z0, x1, z1);


  function updatePorter(dt) {
    const route = PATROL.route;
    const [tx, tz] = route[(patrol.i + 1) % route.length];
    if (patrol.wait > 0) {
      patrol.wait -= dt;
      patrol.heading += Math.sin(patrol.wait * 2.2) * dt * 1.4; // look around
      porter.play('Idle');
    } else {
      const dx = tx - patrol.x, dz = tz - patrol.z, d = Math.hypot(dx, dz);
      if (d < 0.2) {
        patrol.i = (patrol.i + 1) % route.length;
        patrol.wait = 1.6;
      } else {
        const step = Math.min(d, PATROL.speed * dt);
        patrol.x += (dx / d) * step; patrol.z += (dz / d) * step;
        patrol.heading = turnTowards(patrol.heading, Math.atan2(dx, dz), dt * 4);
        porter.play('Walking_A');
      }
    }
    porter.root.position.set(patrol.x, L.standHeight(patrol.x, patrol.z), patrol.z);
    porter.root.rotation.y = patrol.heading;

    const watching = carryingVape() && isActive(sneakNpc.id);
    cone.visible = watching;
    if (!watching || !dlg.hidden) { patrol.exposure = 0; return; }
    const dx = state.x - patrol.x, dz = state.z - patrol.z, d = Math.hypot(dx, dz);
    let diff = Math.atan2(dx, dz) - patrol.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const seen = d < PATROL.viewRange && Math.abs(diff) < PATROL.viewAngle / 2 && !losBlocked(patrol.x, patrol.z, state.x, state.z);
    patrol.exposure = seen ? patrol.exposure + dt : Math.max(0, patrol.exposure - dt);
    coneMat.color.set(seen ? '#ff4a3a' : '#ffd84a');
    coneMat.opacity = seen ? 0.42 : 0.3;
    if (patrol.exposure > 0.35) {
      patrol.exposure = 0;
      const id = sneakNpc.quest.item;
      state.bag = state.bag.filter((i) => i !== id);
      state.picked = state.picked.filter((i) => i !== id);
      porter.playOnce('Interact');
      say(PATROL.name, [sneakNpc.quest.caught]);
      save();
      renderHud();
    }
  }

  // ---------- HUD and minimap ----------
  function renderHud() {
    const log = $('quest-log');
    log.innerHTML = '';
    const known = NPCS.filter((n) => state.quests[n.id]);
    if (!known.length) log.innerHTML = '<li class="empty">Talk to people marked with a gold <b>!</b></li>';
    for (const n of known) {
      const li = document.createElement('li');
      const q = n.quest;
      li.textContent = q.title;
      if (state.quests[n.id] === 'done') li.className = 'done';
      else {
        const p = document.createElement('div');
        p.className = 'progress';
        if (q.type === 'fetch') p.textContent = q.items.every((i) => state.bag.includes(i)) ? `Return to ${n.name}` : `Search the grounds`;
        if (q.type === 'timed') p.textContent = `Talk to ${n.name} to start the clock`;
        if (q.type === 'sneak') p.textContent = carryingVape() ? 'Reach the castle door unseen' : 'Find the vape behind the walled garden';
        li.appendChild(p);
      }
      log.appendChild(li);
    }
    const inv = $('inventory');
    inv.innerHTML = state.bag.length ? '' : '<li class="empty">Empty</li>';
    for (const id of state.bag) {
      const li = document.createElement('li');
      li.textContent = ITEMS[id].name;
      inv.appendChild(li);
    }
  }
  renderHud();

  const mini = $('minimap'), mctx = mini.getContext('2d');
  // a 1 m/pixel map of the estate drawn from the real map data
  const SP = L.geo.meta.splat;
  const mapBg = document.createElement('canvas');
  {
    mapBg.width = SP.w; mapBg.height = SP.h;
    const c = mapBg.getContext('2d'), img = c.createImageData(SP.w, SP.h), d = L.geo.splat;
    for (let k = 0; k < SP.w * SP.h; k++) {
      const r = d[k * 4] / 255, g = d[k * 4 + 1] / 255, b = d[k * 4 + 2] / 255;
      const col = [118 - 40 * g, 158 - 40 * g, 86 - 26 * g];
      for (let ch = 0; ch < 3; ch++) col[ch] = col[ch] * (1 - r) + [214, 198, 160][ch] * r;
      img.data.set([col[0], col[1], col[2], 255], k * 4);
    }
    c.putImageData(img, 0, 0);
    const P = ([x, z]) => [x - SP.minX, z - SP.minZ];
    const fill = (pts, color) => { c.fillStyle = color; c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](...P(p))); c.closePath(); c.fill(); };
    for (const lk of L.geo.meta.lakes) fill(lk.pts, '#4a7fa8');
    for (const b of L.geo.meta.buildings) fill(b.pts, b.house ? '#c9b48a' : '#8e8478');
  }
  const VIEW = 260; // metres across the minimap
  function drawMinimap() {
    if (L.view.inside) { drawInteriorMap(); return; }
    const w = mini.width, h = mini.height, k = w / VIEW;
    mctx.fillStyle = '#4c6a3c'; mctx.fillRect(0, 0, w, h);
    mctx.drawImage(mapBg, state.x - SP.minX - VIEW / 2, state.z - SP.minZ - (VIEW * h) / w / 2, VIEW, (VIEW * h) / w, 0, 0, w, h);
    const mx = (x) => THREE.MathUtils.clamp(w / 2 + (x - state.x) * k, 4, w - 4), mz = (z) => THREE.MathUtils.clamp(h / 2 + (z - state.z) * k, 4, h - 4);
    const dot = (x, z, r, color) => { mctx.fillStyle = color; mctx.strokeStyle = 'rgba(0,0,0,0.6)'; mctx.beginPath(); mctx.arc(mx(x), mz(z), r, 0, Math.PI * 2); mctx.fill(); mctx.stroke(); };
    for (const n of npcs) {
      const s = state.quests[n.def.id];
      dot(n.def.x, n.def.z, 3.5, s === 'done' ? '#9ab' : '#ffd24a');
    }
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!itemAvailable(id)) continue;
      const owner = NPCS.find((n) => (n.quest.items || [n.quest.item]).includes(id));
      if (owner && isActive(owner.id)) dot(it.x, it.z, 3, '#ff9d2a');
    }
    if (run) { const cp = run.npc.def.quest.checkpoints[run.idx]; dot(cp.x, cp.z, 5, '#ffcc55'); }
    if (carryingVape()) dot(patrol.x, patrol.z, 3.5, '#ff4a3a');
    // player arrow
    mctx.save();
    mctx.translate(w / 2, h / 2);
    mctx.rotate(-facing + Math.PI);
    mctx.fillStyle = '#fff'; mctx.strokeStyle = '#000'; mctx.lineWidth = 1;
    mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
    mctx.restore();
  }

  // ---------- movement and camera ----------
  const WALK = 4.2, RUN = 8.5;
  function updatePlayer(dt) {
    let fx = 0, fz = 0;
    if (dlg.hidden) {
      const f = (keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) - joy.dy;
      const r = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0) + joy.dx;
      // forward is from the camera towards the player
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      fx = -sy * f + cy * r;
      fz = -cy * f - sy * r;
    }
    const mag = Math.min(1, Math.hypot(fx, fz));
    if (mag > 0.08) {
      const running = keys.has('run') || Math.hypot(joy.dx, joy.dy) > 0.9;
      const speed = (running ? RUN : WALK) * (touch ? Math.max(mag, 0.4) : 1);
      const nx = fx / Math.hypot(fx, fz), nz = fz / Math.hypot(fx, fz);
      const sx = nx * speed * dt, sz = nz * speed * dt;
      if (!L.blocked(state.x + sx, state.z)) state.x += sx;
      if (!L.blocked(state.x, state.z + sz)) state.z += sz;
      facing = turnTowards(facing, Math.atan2(nx, nz), dt * 12);
      if (!player.busy) player.play(running ? 'Running_A' : 'Walking_A', 0.2);
    } else {
      if (!player.busy) player.play('Idle', 0.25);
    }
    checkPickups();
    player.root.position.set(state.x, L.standHeight(state.x, state.z), state.z);
    player.root.rotation.y = facing;
    state.yaw = cam.yaw;
  }

  const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
  function updateCamera(dt) {
    camTarget.set(state.x, player.root.position.y + 1.5, state.z);
    const cp = Math.cos(cam.pitch);
    camPos.set(state.x + Math.sin(cam.yaw) * cp * cam.dist, camTarget.y + Math.sin(cam.pitch) * cam.dist, state.z + Math.cos(cam.yaw) * cp * cam.dist);
    // pull the camera in front of walls and the ground instead of passing through them
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const x = camTarget.x + (camPos.x - camTarget.x) * k, y = camTarget.y + (camPos.y - camTarget.y) * k, z = camTarget.z + (camPos.z - camTarget.z) * k;
      if (L.solidAt(x, y, z)) {
        const back = Math.max(0, (i - 2) / steps);
        camPos.set(camTarget.x + (camPos.x - camTarget.x) * back, camTarget.y + (camPos.y - camTarget.y) * back, camTarget.z + (camPos.z - camTarget.z) * back);
        break;
      }
    }
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 10));
    camera.lookAt(camTarget);
    // shadows follow the player
    sun.target.position.set(state.x, 0, state.z);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 120);
  }

  function updateNpcs(dt, t) {
    for (const n of npcs) {
      const d = Math.hypot(n.def.x - state.x, n.def.z - state.z);
      const want = d < 6 ? Math.atan2(state.x - n.def.x, state.z - n.def.z) : n.def.facing;
      n.char.root.rotation.y = turnTowards(n.char.root.rotation.y, want, dt * 3);
      n.char.update(dt);
      const s = state.quests[n.def.id];
      const q = n.def.quest;
      let mark = '';
      if (!s) mark = '!';
      else if (s === 'active' && q.type === 'fetch' && q.items.every((i) => state.bag.includes(i))) mark = '?';
      else if (s === 'active' && q.type === 'timed' && !run) mark = '↻';
      n.tag.querySelector('.mark').textContent = mark;
      n.tag.style.opacity = d < 45 ? 1 : 0;
    }
    for (const p of PLACES) {
      const d = Math.hypot(p.x - state.x, p.z - state.z);
      p.el.style.opacity = d > 12 && d < 110 ? 0.9 : 0;
    }
    porterTag.style.opacity = carryingVape() ? 1 : 0;
    for (const [id, o] of Object.entries(itemObjs)) {
      const show = itemAvailable(id);
      o.group.visible = show;
      if (!show) continue;
      o.group.position.y = o.base + Math.sin(t * 2 + o.base) * 0.12;
      o.group.children[0].rotation.y = t * 1.2;
      const owner = NPCS.find((n) => (n.quest.items || [n.quest.item]).includes(id));
      o.beam.visible = !!owner && isActive(owner.id);
      o.beam.material.opacity = 0.1 + Math.sin(t * 3) * 0.04;
    }
  }

  function updatePrompt() {
    const free = dlg.hidden && !L.view.inside;
    const n = free ? nearestNpc() : null;
    const a = free && !n ? nearestAmbient() : null;
    const alpaca = free && !n && !a && animals.nearAlpaca(state.x, state.z);
    const p = $('prompt');
    const verb = touch ? 'Tap Talk to' : 'Press E to';
    if (n || a) {
      p.textContent = `${verb} talk to ${(n || a).def.name}`;
      p.hidden = false;
    } else if (alpaca) {
      p.textContent = `${verb} pat the alpaca`;
      p.hidden = false;
    } else p.hidden = true;
    $('action').classList.toggle('ready', !!(n || a || alpaca) || !dlg.hidden);
  }

  // ---------- going in and out of the castle ----------
  const IN = L.INTERIOR;
  const ROOM_NAMES = { hall: 'Front Hall', quiet: 'Quiet Room', stairs: 'Staircase' };
  let transitioning = false, currentRoom = null;
  function setInside(inside) {
    L.view.inside = inside;
    state.inside = inside;
    outside.visible = !inside;
    interior.group.visible = inside;
    for (const l of outdoorLabels) l.visible = !inside;
    sun.intensity = inside ? 0 : 2.6;
    sun.castShadow = !inside;
    scene.environmentIntensity = inside ? 0.3 : 0.85;
    scene.fog = inside ? null : fog;
    if (inside) cam.dist = Math.min(cam.dist, 4.5);
    currentRoom = null;
  }
  function moveThroughDoor(inside) {
    transitioning = true;
    $('fade').classList.add('on');
    setTimeout(() => {
      setInside(inside);
      if (inside) { state.x = IN.x; state.z = IN.z + 2.6; facing = Math.PI; cam.yaw = 0; }
      else {
        [state.x, state.z] = L.houseToWorld(0, -7.5);
        const [dx, dz] = L.houseToWorld(0, -1);
        facing = Math.atan2(dx, dz); cam.yaw = facing + Math.PI;
      }
      updatePlayer(0); updateCamera(1); camera.position.copy(camPos);
      $('fade').classList.remove('on');
      save();
      setTimeout(() => { transitioning = false; }, 400);
    }, 350);
  }
  function updateDoors() {
    if (transitioning || !dlg.hidden) return;
    const [hx, hz] = L.worldToHouse(state.x, state.z);
    if (!L.view.inside && Math.abs(hx) < 1.2 && hz > -3.05 && hz < -2) moveThroughDoor(true);
    else if (L.view.inside && state.z - IN.z > 5.35) moveThroughDoor(false);
    if (L.view.inside) {
      const lx = state.x - IN.x, lz = state.z - IN.z;
      const room = Object.keys(L.ROOMS).find((k) => { const r = L.ROOMS[k]; return lx >= r.minX && lx <= r.maxX && lz >= r.minZ && lz <= r.maxZ; });
      if (room && room !== currentRoom) { currentRoom = room; toast(ROOM_NAMES[room]); }
    }
  }
  if (state.inside) setInside(true);

  // floor plan for the minimap while indoors
  function drawInteriorMap() {
    const w = mini.width, h = mini.height, ext = { minX: -21, maxX: 8, minZ: -12, maxZ: 6.5 };
    const k = Math.min(w / (ext.maxX - ext.minX), h / (ext.maxZ - ext.minZ));
    const ox = (w - (ext.maxX - ext.minX) * k) / 2, oz = (h - (ext.maxZ - ext.minZ) * k) / 2;
    const mx = (x) => ox + (x - ext.minX) * k, mz = (z) => oz + (z - ext.minZ) * k;
    mctx.fillStyle = '#2a2420'; mctx.fillRect(0, 0, w, h);
    mctx.fillStyle = '#d9c9a3';
    for (const r of [...Object.values(L.ROOMS), ...Object.values(L.DOORWAYS)]) mctx.fillRect(mx(r.minX), mz(r.minZ), (r.maxX - r.minX) * k, (r.maxZ - r.minZ) * k);
    mctx.fillStyle = '#7a5a3a'; mctx.font = '9px Georgia';
    for (const [key, name] of Object.entries(ROOM_NAMES)) {
      const r = L.ROOMS[key];
      mctx.fillText(name, mx(r.minX) + 3, mz(r.minZ) + 10);
    }
    mctx.save();
    mctx.translate(mx(state.x - IN.x), mz(state.z - IN.z));
    mctx.rotate(-facing + Math.PI);
    mctx.fillStyle = '#fff'; mctx.strokeStyle = '#000';
    mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
    mctx.restore();
  }

  // ---------- loop ----------
  const frameTimer = new THREE.Timer();
  let saveTimer = 0;
  function frame() {
    frameTimer.update(); // advance the frame clock
    const realDt = Math.min(0.5, frameTimer.getDelta());
    const dt = Math.min(0.05, realDt);
    const t = frameTimer.getElapsed();
    updatePlayer(dt);
    player.update(dt);
    porter.update(dt);
    updatePorter(dt);
    updateNpcs(dt, t);
    for (const a of ambient) a.char.update(dt);
    if (!L.view.inside) animals.update(dt, t, state);
    updateQuests(dt, realDt);
    updateDoors();
    updateCamera(dt);
    updatePrompt();
    world.update(t, state);
    interior.update(t);
    ring.rotation.z = t;
    composer.render();
    labels.render(scene, camera);
    drawMinimap();
    saveTimer += dt;
    if (saveTimer > 3) { saveTimer = 0; save(); }
    requestAnimationFrame(frame);
  }

  // first frame, then reveal
  updatePlayer(0);
  updateCamera(1);
  camera.position.copy(camPos);
  frame();
  $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 800);
  if (!Object.keys(state.quests).length) {
    say('Welcome', [
      'Welcome to the grounds of Castle Craig.',
      touch
        ? 'Drag on the left of the screen to walk (push further to run) and on the right to look around.'
        : 'Move with WASD or the arrow keys, hold Shift to run, and drag the mouse to look around.',
      'People with a gold ! have a quest for you. Walk up to them and press E to talk.',
    ]);
  }

  window.__game = { state, act, L, npcs, ITEMS, renderer, scene, camera, composer, cam, patrol, renderHud, moveThroughDoor }; // handy for debugging in the console
}

// ---------- item models ----------
function makeItemMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'bottle') {
    const pts = [[0, 0], [0.11, 0], [0.12, 0.02], [0.12, 0.32], [0.1, 0.38], [0.045, 0.46], [0.04, 0.58], [0.046, 0.6], [0, 0.6]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe8e0', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, envMapIntensity: 2 });
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), glass);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.14, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#e8e2d0', roughness: 0.6 }));
    label.position.y = 0.18;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.05, 16), new THREE.MeshStandardMaterial({ color: '#b03030', roughness: 0.4 }));
    cap.position.y = 0.62;
    g.add(bottle, label, cap);
    g.position.y = -0.3;
    g.scale.setScalar(1.3);
  } else if (kind === 'bag') {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.06),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.2, transparent: true, opacity: 0.45 }));
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.065), new THREE.MeshStandardMaterial({ color: '#c03030' }));
    seal.position.y = 0.17;
    g.add(bag, seal);
    const pill = new THREE.SphereGeometry(0.035, 10, 8);
    const pm = new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.5 });
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(pill, pm);
      p.position.set((i % 3 - 1) * 0.08, -0.12 + Math.floor(i / 3) * 0.07, 0);
      g.add(p);
    }
    g.scale.setScalar(1.4);
  } else if (kind === 'vape') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.035), new THREE.MeshStandardMaterial({ color: '#2a6fd6', metalness: 0.7, roughness: 0.3 }));
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.025), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 }));
    tip.position.y = 0.16;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.04), new THREE.MeshStandardMaterial({ color: '#7ff', emissive: '#4ff', emissiveIntensity: 3 }));
    led.position.y = -0.09;
    g.add(body, tip, led);
    g.scale.setScalar(2);
  } else if (kind === 'cigarettes') {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 128, 160);
    x.fillStyle = '#b8282e'; x.fillRect(0, 0, 128, 52);
    x.fillStyle = '#222'; x.font = 'bold 15px Arial'; x.textAlign = 'center';
    x.fillText('SMOKING', 64, 92); x.fillText('KILLS', 64, 112);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    g.add(pack);
    g.scale.setScalar(1.6);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
