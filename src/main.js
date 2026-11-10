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
import { buildMichael, MICHAEL } from './villain.js';
import { buildSideQuests } from './sidequests.js';
import { Character, turnTowards } from './characters.js';
import { ITEMS, NPCS, PATROL, PLACES, AMBIENT, START, FINAL_REWARD, SHELTER } from './quests.js';
const SHELTER_POS = [SHELTER.x, SHELTER.z];
import { glowTexture, smokeTexture } from './textures.js';

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
const fresh = () => ({ x: START.at[0], z: START.at[1], yaw: START.facing + Math.PI, picked: [], bag: [], quests: {}, finished: false, inside: false, points: 0, badges: [], perks: [], alpacasHome: 0 });
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
  const npcs = NPCS.filter((n) => !n.usePorter).map((n) => {
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

  // ----- Michael, who wanders about tempting people -----
  // Very tall, rake-thin and pale, with a bottle in one hand and a bag of pills in the other.
  function makeMichael() {
    const c = new Character(assets.chars.guide, { height: 2.5, clone: true });
    // recolour his texture: pale white skin, everything else a black outfit
    c.root.traverse((o) => {
      if (!o.isMesh || !o.material.map) return;
      const src = o.material.map, img = src.image;
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, cv.width, cv.height), d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gr = d[i + 1], b = d[i + 2];
        const skin = r > 140 && r > gr && gr > b && r - b > 35 && r - b < 140;
        const v = (r + gr + b) / 3;
        if (skin) { const k = 0.9 + (v / 255) * 0.1; d[i] = 255 * k; d[i + 1] = 228 * k; d[i + 2] = 212 * k; } // warm pale: the sky light cools it
        else { const k = 0.18 + (v / 255) * 0.22; d[i] = 255 * k; d[i + 1] = 255 * k * 0.97; d[i + 2] = 255 * k * 0.94; }
      }
      g.putImageData(px, 0, 0);
      const tex = new THREE.CanvasTexture(cv);
      tex.flipY = src.flipY; tex.colorSpace = src.colorSpace; tex.magFilter = src.magFilter; tex.minFilter = src.minFilter;
      o.material = o.material.clone();
      o.material.color.set('#ffffff'); // don't inherit another character's tint from the shared base model
      o.material.map = tex;
    });
    const scaler = c.root.children[0];
    scaler.scale.x *= 0.68; scaler.scale.z *= 0.68;
    c.root.updateMatrixWorld(true);
    const hold = (bone, item, rx) => {
      const b = c.root.getObjectByName(bone);
      if (!b) return;
      const ws = b.getWorldScale(new THREE.Vector3());
      const m = makeItemMesh(item);
      m.scale.multiply(new THREE.Vector3(1 / ws.x, 1 / ws.y, 1 / ws.z)).multiplyScalar(0.75);
      m.rotation.x = rx;
      b.add(m);
    };
    hold('handslot.r', 'bottle', 0.3);
    hold('handslot.l', 'bag', -0.2);
    return c;
  }
  const battleHud = { willpower: 100, hold: 100 };
  const michael = buildMichael(outside, {
    char: makeMichael(),
    say: (...a) => say(...a),
    toast: (m) => toast(m),
    isBusy: () => !dlg.hidden,
    onWin: (returning) => {
      state.michaelBanished = true;
      state.michaelDefeats = (state.michaelDefeats || 0) + 1;
      grant(returning ? { points: 60, badge: MICHAEL.reward.badge } : MICHAEL.reward);
      $('battle').hidden = true;
      nextVisit = 90 + Math.random() * 90;
      save(); renderHud();
    },
    onLose: () => {
      $('battle').hidden = true;
      battleHud.willpower = 100;
      say('You', ["Michael's words got to you. Take a breath, regroup and try again when you're ready."], () => {
        [state.x, state.z] = L.houseToWorld(0, -12);
      });
    },
  });
  outdoorLabels.push(michael.label);
  if (state.michaelBanished) michael.banishNow();
  // Once you've beaten him, he keeps turning up again somewhere ahead of you.
  let nextVisit = 90 + Math.random() * 90;
  function updateMichaelVisits(dt) {
    if (!state.michaelBanished || !michael.banished || L.view.inside || !dlg.hidden || run || michael.mode === 'battle') return;
    nextVisit -= dt;
    if (nextVisit > 0) return;
    nextVisit = 90 + Math.random() * 90;
    if (michael.reappear(state, facing)) toast('You feel a chill... Michael is back.');
  }
  function confrontMichael() {
    state.michaelMet = true;
    say('Michael', [MICHAEL.lines[Math.floor(Math.random() * MICHAEL.lines.length)], "Oh, you think you can stop me? Let's see how strong you really are."], () => {
      battleHud.willpower = 100;
      michael.startBattle();
      $('battle').hidden = false;
      toast(touch ? 'Tap Resist to fight back!' : 'Press F to resist! Dodge his temptations.');
    });
    renderHud();
  }
  function resist() {
    if (michael.resist(state)) player.playOnce('Interact');
  }
  $('resist').addEventListener('click', resist);

  // labels over the escaped alpacas while you're looking for them
  const lostLabels = animals.lost.map((a) => {
    const d = document.createElement('div');
    d.className = 'npc-tag';
    d.innerHTML = '<span class="mark">?</span><span class="name">Lost alpaca</span>';
    const o = new CSS2DObject(d);
    o.position.set(0, 2.4, 0);
    a.root.add(o);
    return { a, o };
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

  // ----- everyone at the smoking shelter has a cigarette on the go -----
  const smokeTex = smokeTexture();
  const puffs = [];
  const smokers = [...ambient.map((a) => a.char), npcs.find((n) => n.def.id === 'smokers').char].map((char, i) => {
    const hand = char.root.getObjectByName('handslot.r'), head = char.root.getObjectByName('head') || char.root.getObjectByName('Head');
    if (!hand) return null;
    char.root.updateMatrixWorld(true);
    const ws = hand.getWorldScale(new THREE.Vector3()).x;
    const cig = new THREE.Group();
    cig.add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.13, 8).translate(0, 0.065, 0), new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 })));
    cig.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.035, 8).translate(0, 0.0175, 0), new THREE.MeshStandardMaterial({ color: '#c8873a', roughness: 0.7 })));
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshStandardMaterial({ color: '#ff6a20', emissive: '#ff4a10', emissiveIntensity: 2 }));
    ember.position.y = 0.132;
    cig.add(ember);
    cig.scale.setScalar(1.6 / ws); // a bit oversized so you can see it on these chunky characters
    cig.rotation.set(0.6, 0, -0.4);
    hand.add(cig);
    return { char, ember, head, next: Math.random(), exhale: 2 + i * 1.7 };
  }).filter(Boolean);
  const _tip = new THREE.Vector3();
  function puff(pos, size, life, rise) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.position.copy(pos);
    sp.scale.setScalar(size);
    outside.add(sp);
    puffs.push({ sp, age: 0, life, size, rise, drift: (Math.random() - 0.5) * 0.15 });
  }
  function updateSmoke(dt, t) {
    const near = Math.hypot(SHELTER_POS[0] - state.x, SHELTER_POS[1] - state.z) < 70 && !L.view.inside;
    for (const s of smokers) {
      if (!near) continue;
      s.ember.material.emissiveIntensity = 1.6 + Math.max(0, Math.sin(t * 0.9 + s.exhale)) * 2.5; // drawing on it now and then
      if ((s.next -= dt) < 0) { s.next = 0.35 + Math.random() * 0.3; s.ember.getWorldPosition(_tip); puff(_tip, 0.12, 2.8, 0.35); }
      if ((s.exhale -= dt) < 0 && s.head) {
        s.exhale = 5 + Math.random() * 4;
        s.head.getWorldPosition(_tip);
        const f = s.char.root.rotation.y;
        _tip.x += Math.sin(f) * 0.25; _tip.z += Math.cos(f) * 0.25; _tip.y -= 0.05;
        for (let k = 0; k < 3; k++) puff(_tip, 0.25 + k * 0.08, 2.4, 0.25);
      }
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { outside.remove(p.sp); p.sp.material.dispose(); puffs.splice(i, 1); continue; }
      p.sp.position.y += p.rise * dt;
      p.sp.position.x += (p.drift + Math.sin(t * 1.3 + i) * 0.05) * dt;
      p.sp.scale.setScalar(p.size * (1 + k * 3));
      p.sp.material.opacity = Math.min(1, k * 6) * (1 - k) * 0.55;
    }
  }


  // The Night Porter on patrol
  const porter = makeChar(PATROL.model, '#8c96c8');
  outside.add(porter.root);
  const porterTag = document.createElement('div');
  porterTag.className = 'npc-tag porter';
  porterTag.innerHTML = `<span class="name">${PATROL.name}</span>`;
  const pl = new CSS2DObject(porterTag); pl.position.set(0, 2.35, 0); porter.root.add(pl); outdoorLabels.push(pl);
  const patrol = { i: 0, x: PATROL.route[0][0], z: PATROL.route[0][1], wait: 0, heading: 0, exposure: 0 };
  // the Night Porter also gives a quest, so add him to the list of people you can talk to
  {
    const def = NPCS.find((n) => n.usePorter);
    Object.defineProperty(def, 'x', { get: () => patrol.x });
    Object.defineProperty(def, 'z', { get: () => patrol.z });
    const tag = document.createElement('div');
    tag.className = 'npc-tag';
    tag.innerHTML = `<span class="mark"></span><span class="name">${def.name}</span>`;
    const label = new CSS2DObject(tag);
    label.position.set(0, 2.35, 0);
    porter.root.add(label);
    outdoorLabels.push(label);
    npcs.push({ def, char: porter, tag, isPorter: true });
  }
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
    if (it.x === undefined) continue; // handed over by people, not found on the ground
    const g = new THREE.Group();
    const mesh = makeItemMesh(it.kind);
    mesh.rotation.set(-Math.PI / 2, 0, (it.x * 7.3) % 6.28); // lying on its side in the grass
    g.add(mesh);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffe2a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.9);
    halo.position.y = 0.15;
    g.add(halo);
    g.position.set(it.x, L.groundHeight(it.x, it.z) + 0.1, it.z);
    outside.add(g);
    itemObjs[id] = { group: g, halo, base: g.position.y };
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
    if (e.code === 'KeyV' && !e.repeat) toggleView();
    if (e.code === 'KeyF' && !e.repeat) resist();
  });
  addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.delete('run');
  });
  addEventListener('blur', () => keys.clear());

  const cam = { yaw: state.yaw, pitch: 0.32, dist: innerWidth < innerHeight ? 9 : 7, first: false };
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
  // zooming all the way in switches to first person; zooming out switches back
  canvas.addEventListener('wheel', (e) => {
    if (cam.first) { if (e.deltaY > 0) toggleView(); return; }
    const before = cam.dist;
    cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.01, 3.5, L.view.inside ? 6 : 16);
    if (e.deltaY < 0 && before <= 3.5) toggleView();
  }, { passive: true });
  function toggleView() {
    cam.first = !cam.first;
    if (!cam.first) cam.dist = Math.max(cam.dist, 4.5);
    toast(cam.first ? 'First-person view (press V to switch back)' : 'Third-person view');
  }
  $('view').addEventListener('click', toggleView);
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

  function grant(reward) {
    state.points += reward.points;
    if (!state.badges.includes(reward.badge)) state.badges.push(reward.badge);
    if (reward.perk && !state.perks.includes(reward.perk)) state.perks.push(reward.perk);
    const el = $('reward');
    el.innerHTML = `<span class="badge-icon">★</span><b>${reward.badge}</b><span>+${reward.points} recovery points</span>${reward.perkText ? `<em>${reward.perkText}</em>` : ''}`;
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(grant.timer);
    grant.timer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  function complete(npc, lines) {
    state.quests[npc.def.id] = 'done';
    npc.char.playOnce('Cheer');
    player.playOnce('Cheer');
    const reward = npc.def.quest.reward;
    const all = NPCS.every((n) => state.quests[n.id] === 'done');
    const extra = all && !state.finished ? [`Every quest is complete! You've earned the ${FINAL_REWARD.badge} badge. Thanks for playing Castle Craig Quest!`] : [];
    const rewardLine = reward ? [`Reward: the ${reward.badge} badge and ${reward.points} recovery points.${reward.perkText ? ' ' + reward.perkText : ''}`] : [];
    if (reward) grant(reward);
    if (all && !state.finished) setTimeout(() => grant(FINAL_REWARD), 4400);
    if (all) state.finished = true;
    say(npc.def.name, [...lines, `Quest complete: ${npc.def.quest.title}`, ...rewardLine, ...extra]);
    save();
    renderHud();
  }

  const nearestAmbient = () => ambient.find((a) => Math.hypot(a.def.x - state.x, a.def.z - state.z) < 2.6);

  function act() {
    if (!dlg.hidden) { next(); return; }
    if (!L.view.inside && michael.near(state.x, state.z)) { confrontMichael(); return; }
    const npc = nearestNpc();
    if (!npc) {
      if (sideq.talkOther()) return;
      const a = nearestAmbient();
      if (a) { say(a.def.name, a.def.lines); return; }
      const pat = animals.interact(state.x, state.z, isActive('keeper'));
      if (pat) toast(pat, 'good');
      return;
    }
    const q = npc.def.quest, id = npc.def.id, status = state.quests[id];
    npc.char.playOnce('Interact');

    if (status === 'done') { say(npc.def.name, ['Thanks again for your help!']); return; }
    if (['stash', 'letters', 'walk', 'night'].includes(q.type)) { sideq.talk(npc); return; }

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
    } else if (q.type === 'herd') {
      if (!status) {
        state.quests[id] = 'active';
        say(npc.def.name, [q.intro, `New quest: ${q.title}`]);
      } else {
        const h = animals.herdStatus();
        say(npc.def.name, [`${q.waiting} (${h.home} of ${q.count} home${h.following ? `, ${h.following} following you` : ''}.)`]);
      }
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
    if (state.picked.includes(id) || ITEMS[id].x === undefined) return false;
    if (!sideq.itemReady(id)) return false;
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

  const sideq = buildSideQuests({
    state, outside, makeChar, say, toast, complete, renderHud, save, animals, michael, player, $, npcs, outdoorLabels,
    setNight: (on) => setNight(on), facing: () => facing,
  });

  const keeper = npcs.find((n) => n.def.quest.type === 'herd');
  if (state.quests[keeper.def.id] === 'done') animals.restoreHome(3);
  else animals.restoreHome(state.alpacasHome || 0);

  function updateQuests(dt, realDt) {
    // lost alpacas coming home
    if (isActive(keeper.def.id)) {
      const h = animals.herdStatus();
      if (h.home !== state.alpacasHome) {
        state.alpacasHome = h.home;
        renderHud();
        if (h.home >= keeper.def.quest.count) complete(keeper, [keeper.def.quest.done]);
        else toast(`Alpaca home! ${h.home} of ${keeper.def.quest.count}`, 'good');
        save();
      }
    }
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
    porter.update(dt);
    if (sideq.nightActive) {
      // waiting on the porch for the missing resident
      [patrol.x, patrol.z] = L.houseToWorld(2.5, -11);
      const [dx, dz] = L.houseToWorld(0, -1);
      patrol.heading = Math.atan2(dx, dz);
      porter.play('Idle');
      porter.root.position.set(patrol.x, L.standHeight(patrol.x, patrol.z), patrol.z);
      porter.root.rotation.y = patrol.heading;
      cone.visible = false;
      return;
    }
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
    if (state.michaelMet || state.michaelBanished) {
      const li = document.createElement('li');
      li.textContent = 'Banish Michael from the grounds';
      if (state.michaelBanished) li.className = 'done';
      else { const p = document.createElement('div'); p.className = 'progress'; p.textContent = 'Find him and resist his temptations'; li.appendChild(p); }
      log.appendChild(li);
    }
    if (!known.length && !state.michaelMet) log.innerHTML = '<li class="empty">Talk to people marked with a gold <b>!</b></li>';
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
        if (q.type === 'sneak') p.textContent = carryingVape() ? 'Reach the front door unseen' : 'Find the hidden vape';
        if (q.type === 'herd') p.textContent = `${state.alpacasHome || 0} of ${q.count} alpacas back in the paddock`;
        if (['stash', 'letters', 'walk', 'night'].includes(q.type)) p.textContent = sideq.progress(q);
        li.appendChild(p);
      }
      log.appendChild(li);
    }
    $('points').textContent = `${state.points} recovery points`;
    const badges = $('badges');
    badges.innerHTML = state.badges.length ? '' : '<li class="empty">None yet</li>';
    for (const b of state.badges) { const li = document.createElement('li'); li.textContent = `★ ${b}`; badges.appendChild(li); }
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
    }
    for (const o of objectives()) dot(o.x, o.z, 5, '#7fe8ff');
    if (carryingVape()) dot(patrol.x, patrol.z, 3.5, '#ff4a3a');
    if (!michael.banished) dot(...michael.pos, 3.5, '#a050e0');
    if (isActive(keeper.def.id)) for (const a of animals.lost) if (a.state === 'follow') dot(a.x, a.z, 3.5, '#fff3c0'); // only the ones you've found
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
  let stepPhase = 0;
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
      const speed = (running ? RUN * (state.perks.includes('shoes') ? 1.15 : 1) : WALK) * (touch ? Math.max(mag, 0.4) : 1);
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
    const movingNow = mag > 0.08 && dlg.hidden;
    const runningNow = movingNow && (keys.has('run') || Math.hypot(joy.dx, joy.dy) > 0.9);
    moveAmount += ((movingNow ? 1 : 0) - moveAmount) * Math.min(1, dt * 3);
    runAmount += ((runningNow ? 1 : 0) - runAmount) * Math.min(1, dt * 2.5);
    stepPhase += dt * (runningNow ? 11 : 7) * (movingNow ? 1 : 0);
    player.root.position.set(state.x, L.standHeight(state.x, state.z), state.z);
    player.root.rotation.y = facing;
    state.yaw = cam.yaw;
  }

  const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3();
  const baseFov = () => fovFor(camera.aspect);
  let moveAmount = 0, runAmount = 0;
  function updateCamera(dt) {
    // field of view opens up as you speed up, and closes again when you stop
    const targetFov = baseFov() + runAmount * 9 + moveAmount * 2 + (cam.first ? 8 : 0);
    if (Math.abs(camera.fov - targetFov) > 0.01) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
    // ease round behind the player while walking forwards (unless the player is steering the camera)
    if (moveAmount > 0.2 && look.id === null && !cam.first && dlg.hidden) {
      const behind = facing + Math.PI;
      const diff = Math.atan2(Math.sin(behind - cam.yaw), Math.cos(behind - cam.yaw));
      if (Math.abs(diff) < 2.2) cam.yaw += diff * Math.min(1, dt * 0.9 * moveAmount);
    }
    player.root.visible = !cam.first;
    if (cam.first) {
      const eye = player.root.position.y + 1.6, look = (cam.pitch - 0.32) * 1.6;
      camera.position.set(state.x, eye + Math.sin(stepPhase * 2) * 0.03 * moveAmount, state.z);
      camTarget.set(state.x - Math.sin(cam.yaw) * Math.cos(look), eye - Math.sin(look), state.z - Math.cos(cam.yaw) * Math.cos(look));
      camera.lookAt(camTarget);
      sun.target.position.set(state.x, 0, state.z);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 120);
      return;
    }
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
    const searching = isActive('keeper');
    for (const { a, o } of lostLabels) o.visible = searching && !L.view.inside && a.lost && a.state !== 'follow' && Math.hypot(a.x - state.x, a.z - state.z) < 10; // only once you're close
    for (const n of npcs) {
      const d = Math.hypot(n.def.x - state.x, n.def.z - state.z);
      if (!n.isPorter) {
        const want = d < 6 ? Math.atan2(state.x - n.def.x, state.z - n.def.z) : n.def.facing;
        n.char.root.rotation.y = turnTowards(n.char.root.rotation.y, want, dt * 3);
        n.char.update(dt);
      }
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
    porterTag.style.opacity = 0; // his name is shown on his quest tag
    for (const [id, o] of Object.entries(itemObjs)) {
      const show = itemAvailable(id);
      o.group.visible = show;
      if (!show) continue;
      // no beacons: just a faint glint when you're right on top of it
      const near = Math.hypot(ITEMS[id].x - state.x, ITEMS[id].z - state.z);
      o.halo.visible = near < 6;
      o.halo.material.opacity = (1 - near / 6) * (0.35 + Math.sin(t * 4) * 0.15);
    }
  }

  function updatePrompt() {
    const free = dlg.hidden && !L.view.inside;
    if (free && michael.near(state.x, state.z)) {
      $('prompt').textContent = `${touch ? 'Tap Talk to' : 'Press E to'} confront Michael`;
      $('prompt').hidden = false;
      $('action').classList.add('ready');
      return;
    }
    const other = free ? sideq.promptText() : null;
    if (other) { $('prompt').textContent = `${touch ? 'Tap Talk to' : 'Press E to'} ${other}`; $('prompt').hidden = false; $('action').classList.add('ready'); return; }
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

  // ---------- objective markers for quests against the clock ----------
  const beacons = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 80, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.visible = false;
    outside.add(m);
    return m;
  });
  function objectives() {
    const list = sideq.objectives();
    if (run) { const cp = run.npc.def.quest.checkpoints[run.idx]; list.unshift({ x: cp.x, z: cp.z, name: cp.name.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase()) }); }
    return list;
  }
  function updateObjectives(t) {
    const list = L.view.inside ? [] : objectives();
    beacons.forEach((b, i) => {
      const o = list[i];
      b.visible = !!o;
      if (!o) return;
      b.position.set(o.x, L.groundHeight(o.x, o.z) + 40, o.z);
      b.material.opacity = 0.18 + Math.sin(t * 3 + i) * 0.06;
    });
    const el = $('objective');
    if (!list.length) { el.hidden = true; return; }
    let best = list[0], bd = Infinity;
    for (const o of list) { const d = Math.hypot(o.x - state.x, o.z - state.z); if (d < bd) { bd = d; best = o; } }
    const f = cam.yaw + Math.PI, a = Math.atan2(best.x - state.x, best.z - state.z);
    el.hidden = false;
    el.querySelector('.arrow').style.transform = `rotate(${f - a}rad)`;
    el.querySelector('.label').textContent = `${best.name} · ${Math.round(bd)} m`;
  }

  // ---------- going in and out of the castle ----------
  const IN = L.INTERIOR;
  const ROOM_NAMES = { hall: 'Front Hall', quiet: 'Quiet Room', stairs: 'Staircase', drawing: 'Drawing Room', common: 'Common Room', therapy: 'Group Therapy Room', corridor: 'Bedroom Corridor', bedroomA: 'Bedroom', bedroomB: 'Bedroom' };
  let transitioning = false, currentRoom = null;
  function setInside(inside) {
    L.view.inside = inside;
    state.inside = inside;
    outside.visible = !inside;
    interior.group.visible = inside;
    if (inside) {
      // upstairs only if we're already standing upstairs (e.g. a saved game); coming in the front door is always the ground floor
      const lx = state.x - L.INTERIOR.x, lz = state.z - L.INTERIOR.z;
      interior.showFloor(Math.abs(lx) < 100 && lz > -100 && lz < L.UPSTAIRS_Z);
    }
    for (const l of outdoorLabels) l.visible = !inside;
    applyLighting();
    if (inside) cam.dist = Math.min(cam.dist, 4.5);
    currentRoom = null;
  }

  // ----- day and night -----
  let nightMode = false;
  const dayFog = fog.color.clone(), nightFog = new THREE.Color('#0a1222');
  const torch = new THREE.SpotLight('#ffe6b0', 0, 45, 0.45, 0.55, 1.2);
  torch.position.set(0.25, 1.5, 0.2);
  torch.target.position.set(0, 0.2, 8);
  player.root.add(torch, torch.target);
  const moon = new THREE.HemisphereLight('#6f88c0', '#10141c', 0);
  scene.add(moon);
  function applyLighting() {
    const inside = L.view.inside;
    sun.intensity = inside ? 0 : nightMode ? 0.12 : 2.6;
    sun.color.set(nightMode ? '#9fb4ff' : '#fff1dc');
    sun.castShadow = !inside && !nightMode;
    scene.environmentIntensity = inside ? 0.3 : nightMode ? 0.06 : 0.85;
    scene.backgroundIntensity = nightMode ? 0.06 : 1;
    fog.color.copy(nightMode ? nightFog : dayFog);
    fog.near = nightMode ? 15 : 160; fog.far = nightMode ? 220 : 2200;
    scene.fog = inside ? null : fog;
    moon.intensity = nightMode && !inside ? 0.35 : 0;
    torch.intensity = nightMode && !inside ? 60 : 0;
    document.body.classList.toggle('night', nightMode);
  }
  function setNight(on) {
    nightMode = on;
    $('fade').classList.add('on');
    setTimeout(() => {
      applyLighting();
      $('fade').classList.remove('on');
      if (on) toast('Night falls. Your torch is on.');
    }, 400);
  }
  function moveThroughDoor(inside) {
    transitioning = true;
    $('fade').classList.add('on');
    setTimeout(() => {
      setInside(inside);
      if (inside) { state.x = IN.x; state.z = IN.z + 2.6; facing = Math.PI; cam.yaw = 0; }
      else {
        [state.x, state.z] = L.houseToWorld(0, -10);
        const [dx, dz] = L.houseToWorld(0, -1);
        facing = Math.atan2(dx, dz); cam.yaw = facing + Math.PI;
      }
      updatePlayer(0); updateCamera(1); camera.position.copy(camPos);
      $('fade').classList.remove('on');
      save();
      setTimeout(() => { transitioning = false; }, 400);
    }, 350);
  }
  function changeFloor(up) {
    transitioning = true;
    $('fade').classList.add('on');
    setTimeout(() => {
      interior.showFloor(up);
      if (up) { state.x = IN.x - 6.6; state.z = IN.z - 40.5; facing = Math.PI / 2; cam.yaw = facing + Math.PI; }
      else { state.x = IN.x - 6.0; state.z = IN.z - 8.4; facing = 0; cam.yaw = Math.PI; }
      currentRoom = null;
      updatePlayer(0); updateCamera(1); camera.position.copy(camPos);
      $('fade').classList.remove('on');
      setTimeout(() => { transitioning = false; }, 400);
    }, 350);
  }

  function updateDoors() {
    if (transitioning || !dlg.hidden) return;
    const [hx, hz] = L.worldToHouse(state.x, state.z);
    if (!L.view.inside && Math.abs(hx) < 1.2 && hz > -3.05 && hz < -2) moveThroughDoor(true);
    else if (L.view.inside && state.z - IN.z > 5.35) moveThroughDoor(false);
    else if (L.view.inside) {
      // up and down the stairs
      const lx = state.x - IN.x, lz = state.z - IN.z;
      if (lz > L.UPSTAIRS_Z && lx < L.STAIRS.maxX && lz < -9.0) changeFloor(true);
      else if (lz < L.UPSTAIRS_Z && lx < -7.8) changeFloor(false);
    }
    if (L.view.inside) {
      const lx = state.x - IN.x, lz = state.z - IN.z;
      const room = Object.keys(L.ROOMS).find((k) => { const r = L.ROOMS[k]; return lx >= r.minX && lx <= r.maxX && lz >= r.minZ && lz <= r.maxZ; });
      if (room && room !== currentRoom) { currentRoom = room; toast(ROOM_NAMES[room]); }
    }
  }
  if (state.inside) setInside(true);

  // floor plan for the minimap while indoors
  function drawInteriorMap() {
    const up = state.z - IN.z < L.UPSTAIRS_Z;
    const onFloor = (r) => (r.maxZ < L.UPSTAIRS_Z) === up;
    const w = mini.width, h = mini.height, ext = up ? { minX: -9.5, maxX: 9.5, minZ: -49, maxZ: -38 } : { minX: -21, maxX: 22, minZ: -10.5, maxZ: 6.5 };
    const k = Math.min(w / (ext.maxX - ext.minX), h / (ext.maxZ - ext.minZ));
    const ox = (w - (ext.maxX - ext.minX) * k) / 2, oz = (h - (ext.maxZ - ext.minZ) * k) / 2;
    const mx = (x) => ox + (x - ext.minX) * k, mz = (z) => oz + (z - ext.minZ) * k;
    mctx.fillStyle = '#2a2420'; mctx.fillRect(0, 0, w, h);
    mctx.fillStyle = '#d9c9a3';
    for (const r of [...Object.values(L.ROOMS), ...Object.values(L.DOORWAYS)].filter(onFloor)) mctx.fillRect(mx(r.minX), mz(r.minZ), (r.maxX - r.minX) * k, (r.maxZ - r.minZ) * k);
    mctx.fillStyle = '#7a5a3a'; mctx.font = '9px Georgia';
    for (const [key, name] of Object.entries(ROOM_NAMES)) {
      const r = L.ROOMS[key];
      if (onFloor(r) && r.maxX - r.minX > 3) mctx.fillText(name, mx(r.minX) + 3, mz(r.minZ) + 10);
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
    updatePorter(dt);
    updateNpcs(dt, t);
    for (const a of ambient) a.char.update(dt);
    updateSmoke(dt, t);
    if (!L.view.inside) michael.update(dt, t, state, battleHud);
    updateMichaelVisits(realDt);
    const fighting = michael.mode === 'battle';
    $('battle').hidden = !fighting;
    $('resist').hidden = !fighting;
    if (fighting) { $('will').style.width = `${battleHud.willpower}%`; $('hold').style.width = `${battleHud.hold}%`; }
    if (!L.view.inside) animals.update(dt, t, { x: state.x, z: state.z, heading: facing });
    updateQuests(dt, realDt);
    sideq.update(dt, realDt, !dlg.hidden);
    updateObjectives(t);
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

  window.__game = { setVisit: (s) => { nextVisit = s; }, sideq, michael, battleHud, state, act, L, npcs, ITEMS, renderer, scene, camera, composer, cam, patrol, renderHud, moveThroughDoor, animals }; // handy for debugging in the console
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
  } else if (kind === 'flask') {
    const steel = new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.9, roughness: 0.25 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.05), steel));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 12).translate(0, 0.135, 0), steel));
    g.scale.setScalar(1.6);
  } else if (kind === 'card') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.004), new THREE.MeshStandardMaterial({ color: '#f0d040', roughness: 0.6 })));
    g.scale.setScalar(1.8);
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
