// Extra quests: Michael's stash, Letters home, the Alpaca walk and the
// Night-time round. Each is driven by its quest giver's `type`.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as L from './layout.js';
import { ITEMS, WRITERS, POSTBOX, NIGHT_SPOTS } from './quests.js';

export function buildSideQuests(ctx) {
  const { state, outside, makeChar, say, toast, complete, renderHud, save, animals, michael, player, $ } = ctx;
  const npcOf = (type) => ctx.npcs.find((n) => n.def.quest.type === type);
  const active = (type) => state.quests[npcOf(type).def.id] === 'active';
  const near = (x, z, r) => Math.hypot(x - state.x, z - state.z) < r;

  // ---------- Letters home ----------
  const writers = WRITERS.map((w) => {
    const c = makeChar(w.model, w.tint);
    c.root.position.set(w.x, L.groundHeight(w.x, w.z), w.z);
    c.root.rotation.y = Math.random() * 6;
    outside.add(c.root);
    L.addCircle(w.x, w.z, 0.45);
    const tag = document.createElement('div');
    tag.className = 'npc-tag';
    tag.innerHTML = '<span class="mark"></span><span class="name">Resident</span>';
    const label = new CSS2DObject(tag);
    label.position.set(0, 2.35, 0);
    c.root.add(label);
    ctx.outdoorLabels.push(label);
    return { def: w, char: c, tag };
  });
  // a red pillar box beside the front door
  {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: '#b3161c', roughness: 0.45, metalness: 0.2 });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 1.25, 20).translate(0, 0.62, 0), red));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.31, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.25, 0), red));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.06).translate(0, 1.0, 0.3), new THREE.MeshStandardMaterial({ color: '#111' })));
    g.position.set(POSTBOX.x, L.groundHeight(POSTBOX.x, POSTBOX.z), POSTBOX.z);
    g.rotation.y = -L.HOUSE.angle + Math.PI;
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    outside.add(g);
    L.addCircle(POSTBOX.x, POSTBOX.z, 0.35, 1.5);
  }
  let postTimer = null;
  const letterIds = WRITERS.map((w) => w.letter);
  function resetLetters() {
    state.bag = state.bag.filter((i) => !letterIds.includes(i));
    state.letters = [];
  }

  // ---------- Alpaca walk ----------
  let walk = null; // { stage: 'out' | 'back' }
  const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#c8a060' }));
  rope.visible = false;
  rope.frustumCulled = false;
  outside.add(rope);
  function startWalk() {
    animals.startLead();
    walk = { stage: 'out' };
    toast('Lead her down to the lake.');
  }

  // ---------- Night-time round ----------
  let night = null; // { resident, found }
  function startNight() {
    const [x, z] = NIGHT_SPOTS[Math.floor(Math.random() * NIGHT_SPOTS.length)];
    const c = makeChar('gardener', '#e0d0f0');
    c.root.position.set(x, L.groundHeight(x, z), z);
    c.play('Sit_Floor_Idle', 0);
    outside.add(c.root);
    // a phone screen glowing faintly: the only clue in the dark
    const glow = new THREE.PointLight('#9fc8ff', 3, 7, 2);
    glow.position.set(0, 0.8, 0.3);
    c.root.add(glow);
    night = { char: c, x, z, found: false, glow };
    ctx.setNight(true);
  }
  function endNight() {
    if (!night) return;
    outside.remove(night.char.root);
    night = null;
    ctx.setNight(false);
  }
  // a game reloaded mid-round starts the round over
  if (state.quests.porter === 'active') delete state.quests.porter;
  if (state.quests.coordinator === 'active') delete state.quests.coordinator;
  if (state.quests.receptionist === 'active') { delete state.quests.receptionist; resetLetters(); }

  // ---------- talking ----------
  function talk(npc) {
    const q = npc.def.quest, id = npc.def.id, status = state.quests[id];
    if (q.type === 'stash') {
      if (!state.michaelBanished) { say(npc.def.name, [q.locked]); return; }
      if (!status) { state.quests[id] = 'active'; say(npc.def.name, [q.intro, `New quest: ${q.title}`]); }
      else if (q.items.every((i) => state.bag.includes(i))) {
        state.bag = state.bag.filter((i) => !q.items.includes(i));
        complete(npc, [q.done]);
      } else say(npc.def.name, [q.waiting]);
    } else if (q.type === 'letters') {
      if (status !== 'active') {
        state.quests[id] = 'active';
        resetLetters();
        say(npc.def.name, [q.intro, `New quest: ${q.title}`], () => { postTimer = q.timeLimit; });
      } else say(npc.def.name, [q.waiting]);
    } else if (q.type === 'walk') {
      if (walk) { say(npc.def.name, [q.waiting]); return; }
      const first = !status;
      state.quests[id] = 'active';
      say(npc.def.name, [first ? q.intro : q.retry, ...(first ? [`New quest: ${q.title}`] : [])], startWalk);
    } else if (q.type === 'night') {
      if (status === 'active') {
        if (night?.found && near(night.char.root.position.x, night.char.root.position.z, 6)) {
          endNight();
          complete(npc, [q.done]);
        } else say(npc.def.name, [q.waiting]);
        return;
      }
      state.quests[id] = 'active';
      say(npc.def.name, [q.intro, `New quest: ${q.title}`], startNight);
    }
    save();
    renderHud();
  }

  // Talking to someone who isn't a quest giver (letter writers, the missing resident).
  function talkOther() {
    for (const w of writers) {
      if (!near(w.def.x, w.def.z, 2.6)) continue;
      if (active('letters') && postTimer !== null && !state.letters?.includes(w.def.letter)) {
        state.letters = [...(state.letters || []), w.def.letter];
        state.bag.push(w.def.letter);
        w.char.playOnce('Interact');
        say(w.def.name, [w.def.line]);
        toast(`Got: ${ITEMS[w.def.letter].name}`);
        renderHud();
      } else say('Resident', [w.def.chat]);
      return true;
    }
    if (night && !night.found && near(night.x, night.z, 2.8)) {
      night.found = true;
      night.char.play('Idle');
      say('Missing resident', [npcOf('night').def.quest.found]);
      renderHud();
      return true;
    }
    return false;
  }

  function promptText() {
    if (writers.some((w) => near(w.def.x, w.def.z, 2.6))) return 'talk to the resident';
    if (night && !night.found && near(night.x, night.z, 2.8)) return 'talk to the resident';
    return null;
  }

  // ---------- every frame ----------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function update(dt, realDt, dialogOpen) {
    // letters: the post goes after the time limit; post them in the box
    const timer = $('timer');
    if (postTimer !== null && active('letters')) {
      if (!dialogOpen) postTimer -= realDt;
      const have = letterIds.every((i) => state.bag.includes(i));
      if (have && near(POSTBOX.x, POSTBOX.z, 2.4)) {
        postTimer = null;
        state.bag = state.bag.filter((i) => !letterIds.includes(i));
        complete(npcOf('letters'), [npcOf('letters').def.quest.done]);
      } else if (postTimer <= 0) {
        postTimer = null;
        resetLetters();
        delete state.quests[npcOf('letters').def.id];
        say(npcOf('letters').def.name, [npcOf('letters').def.quest.failed]);
        renderHud();
      }
    }
    if (postTimer !== null && timer.hidden) {
      timer.hidden = false;
      const m = Math.floor(Math.max(0, postTimer) / 60), s = Math.floor(Math.max(0, postTimer) % 60);
      timer.textContent = `Post goes in ${m}:${String(s).padStart(2, '0')}`;
      timer.classList.toggle('urgent', postTimer < 30);
    }
    for (const w of writers) {
      const has = active('letters') && postTimer !== null && !state.letters?.includes(w.def.letter);
      w.tag.querySelector('.mark').textContent = has ? '✉' : '';
      w.char.update(dt);
    }

    // alpaca walk: out to the lake, back to the paddock, and keep her away from Michael
    const lead = animals.leadAlpaca;
    rope.visible = !!(walk && lead);
    if (walk && lead) {
      _a.set(state.x, L.groundHeight(state.x, state.z) + 1.0, state.z);
      lead.head.getWorldPosition(_b);
      rope.geometry.setFromPoints([_a, _b]);
      const q = npcOf('walk').def.quest;
      if (!michael.banished && Math.hypot(michael.pos[0] - lead.x, michael.pos[1] - lead.z) < 18) {
        animals.endLead(true);
        walk = null;
        say(npcOf('walk').def.name, [q.spooked]);
      } else if (walk.stage === 'out' && Math.hypot(lead.x - q.target.x, lead.z - q.target.z) < q.target.r) {
        walk.stage = 'back';
        toast('She loves the lake! Now back to the paddock.', 'good');
        renderHud();
      } else if (walk.stage === 'back' && animals.inPaddock(lead)) {
        animals.endLead();
        walk = null;
        complete(npcOf('walk'), [q.done]);
      }
    }

    // night round: the missing resident follows you once found
    if (night) {
      night.char.update(dt);
      if (night.found) {
        const r = night.char.root, dx = state.x - r.position.x, dz = state.z - r.position.z, d = Math.hypot(dx, dz);
        if (d > 25) { r.position.set(state.x - Math.sin(ctx.facing()) * 2.5, 0, state.z - Math.cos(ctx.facing()) * 2.5); }
        else if (d > 2.2) {
          const step = Math.min(d - 2.2, 7 * dt);
          r.position.x += (dx / d) * step; r.position.z += (dz / d) * step;
          night.char.play('Walking_A');
        } else night.char.play('Idle');
        r.position.y = L.groundHeight(r.position.x, r.position.z);
        r.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  function progress(q) {
    if (q.type === 'stash') return state.michaelBanished ? `${q.items.filter((i) => state.bag.includes(i)).length} of 3 found` : 'Banish Michael first';
    if (q.type === 'letters') {
      const n = letterIds.filter((i) => state.bag.includes(i)).length;
      return n === 3 ? 'Post them in the box by the front door' : `${n} of 3 letters collected`;
    }
    if (q.type === 'walk') return walk ? (walk.stage === 'out' ? 'Walk her to the lake' : 'Bring her back to the paddock') : 'Collect her from the Therapy Coordinator';
    if (q.type === 'night') return night?.found ? 'Bring them back to the Night Porter' : 'Search the grounds by torchlight';
    return '';
  }

  // items in Michael's stash only turn up once he's gone
  const itemReady = (id) => (ITEMS[id].after === 'michael' ? !!state.michaelBanished && active('stash') : true);

  return { talk, talkOther, promptText, update, progress, itemReady, get nightActive() { return !!night; } };
}
