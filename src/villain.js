// Michael: a shady character who wanders the grounds trying to tempt
// residents into giving up on their recovery. Confront him and resist his
// temptations until his hold breaks, and he's banished from the estate.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as L from './layout.js';
import { turnTowards } from './characters.js';
import { glowTexture } from './textures.js';
import { SHELTER } from './quests.js';

export const MICHAEL = {
  name: 'Michael',
  reward: { points: 300, badge: 'Unbreakable' },
  lines: [
    "Fancy a drink? I've got a bottle of vodka right here.",
    "Go on, one won't hurt. Nobody would ever know.",
    "I can get you anything you want. Pills, powder, whatever helps.",
    "You've earned a drink after today, surely.",
    "Just this once. Then you can start again on Monday.",
    "You're not like the others here. You can handle it.",
    "First one's free. Think of it as a gift.",
  ],
  taunts: ['Just a little sip?', "Go on, take one. It'll take the edge off.", 'Remember how good it felt?', 'Everyone slips up.', "I've got whatever you need.", 'One drink. Who would know?'],
  route: [[...L.houseToWorld(-6, -40)], [SHELTER.x + 6, SHELTER.z - 4], [-20, 120], [60, 196], [52, 300], [24, 440], [-8, 60]],
};

export function buildMichael(scene, { char, onWin, onLose, say, toast, isBusy }) {
  const glow = glowTexture();
  scene.add(char.root);
  let i = 0;
  const m = { x: MICHAEL.route[0][0], z: MICHAEL.route[0][1], heading: 0, wait: 0, mode: 'wander', hp: 100, banished: false, fade: 1, level: 0, returning: false, visitTime: 0, leaving: false };

  // name tag and speech bubble
  const tag = document.createElement('div');
  tag.className = 'npc-tag villain';
  tag.innerHTML = '<span class="bubble"></span><span class="name">Michael</span>';
  const label = new CSS2DObject(tag);
  label.position.set(0, 2.9, 0); // he's tall
  char.root.add(label);
  const bubble = tag.querySelector('.bubble');
  let lineTimer = 0, lineIdx = 0;

  // projectiles
  const shots = [];
  const shoot = (from, to, kind) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: kind === 'temptation' ? '#b04aff' : '#fff2a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sp.scale.setScalar(kind === 'temptation' ? 1.1 : 0.9);
    sp.position.copy(from);
    scene.add(sp);
    const dir = to.clone().sub(from).normalize();
    shots.push({ sp, dir, kind, life: 3, speed: kind === 'temptation' ? 10 : 18 });
  };

  let throwTimer = 1.5, cooldown = 0;
  const pos = new THREE.Vector3(), target = new THREE.Vector3();

  function startBattle() {
    m.mode = 'battle';
    m.hp = 100;
    throwTimer = 1.5;
  }

  // Player presses resist: fire an affirmation at Michael.
  function resist(player) {
    if (m.mode !== 'battle' || cooldown > 0) return false;
    cooldown = 0.45;
    pos.set(player.x, L.groundHeight(player.x, player.z) + 1.3, player.z);
    target.set(m.x, L.groundHeight(m.x, m.z) + 1.2, m.z);
    shoot(pos, target, 'affirmation');
    return true;
  }

  function endBattle() {
    m.mode = 'wander';
    for (const s of shots) scene.remove(s.sp);
    shots.length = 0;
  }

  function update(dt, t, player, hud) {
    if (m.banished) {
      if (m.fade > 0) {
        m.fade -= dt * 0.5;
        m.z -= dt * 6;
        char.root.position.set(m.x, L.groundHeight(m.x, m.z) + (1 - m.fade) * 3, m.z);
        char.root.traverse((c) => { if (c.isMesh) { c.material.transparent = true; c.material.opacity = Math.max(0, m.fade); } });
        char.update(dt);
        if (m.fade <= 0) { char.root.visible = false; label.visible = false; }
      }
      return;
    }
    cooldown -= dt;
    const dp = Math.hypot(player.x - m.x, player.z - m.z);

    if (m.mode === 'approach') {
      // he's come back: walk up to the player and try his luck
      m.visitTime -= dt;
      if (dp > 3.2) {
        const dx = player.x - m.x, dz = player.z - m.z, step = 2.6 * dt;
        const nx = m.x + (dx / dp) * step, nz = m.z + (dz / dp) * step;
        if (!L.blocked(nx, nz, 0.4)) { m.x = nx; m.z = nz; }
        char.play('Walking_A');
      } else char.play('Idle');
      m.heading = turnTowards(m.heading, Math.atan2(player.x - m.x, player.z - m.z), dt * 4);
      lineTimer -= dt;
      if (lineTimer < 0) { lineTimer = 5; lineIdx = (lineIdx + 1) % MICHAEL.lines.length; bubble.textContent = MICHAEL.lines[lineIdx]; }
      if (m.visitTime <= 0 || dp > 50) leave(dp > 50 ? 'You left Michael behind. He slinks off, for now.' : 'Michael gives up and slinks off. For now.');
    } else if (m.mode === 'wander') {
      const [tx, tz] = MICHAEL.route[(i + 1) % MICHAEL.route.length];
      if (m.wait > 0) {
        m.wait -= dt;
        char.play('Idle');
      } else {
        const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
        if (d < 0.5) { i = (i + 1) % MICHAEL.route.length; m.wait = 6 + Math.random() * 6; }
        else {
          const step = Math.min(d, 1.9 * dt);
          m.x += (dx / d) * step; m.z += (dz / d) * step;
          m.heading = turnTowards(m.heading, Math.atan2(dx, dz), dt * 3);
          char.play('Walking_A');
        }
      }
      if (dp < 10) m.heading = turnTowards(m.heading, Math.atan2(player.x - m.x, player.z - m.z), dt * 3);
      lineTimer -= dt;
      if (lineTimer < 0) { lineTimer = 6; lineIdx = (lineIdx + 1) % MICHAEL.lines.length; bubble.textContent = MICHAEL.lines[lineIdx]; }
    } else {
      // battle: circle the player at a distance, throwing temptations
      const want = 8;
      const ang = Math.atan2(m.x - player.x, m.z - player.z) + dt * 0.35;
      const r = THREE.MathUtils.lerp(dp, want, Math.min(1, dt * 1.5));
      m.x = player.x + Math.sin(ang) * r;
      m.z = player.z + Math.cos(ang) * r;
      m.heading = Math.atan2(player.x - m.x, player.z - m.z);
      char.play('Running_A');
      throwTimer -= dt;
      if (throwTimer < 0 && !isBusy()) {
        throwTimer = Math.max(0.6, (1.3 + Math.random() * 0.8) * Math.pow(0.88, m.level)); // a little quicker each time he's back
        char.playOnce('Interact', 'Running_A');
        pos.set(m.x, L.groundHeight(m.x, m.z) + 1.4, m.z);
        target.set(player.x, L.groundHeight(player.x, player.z) + 1.1, player.z);
        shoot(pos, target, 'temptation');
        bubble.textContent = MICHAEL.taunts[Math.floor(Math.random() * MICHAEL.taunts.length)];
      }
      if (dp > 35) { endBattle(); toast('You walked away. Michael is still out there.'); }
    }

    // move projectiles and check hits
    for (let k = shots.length - 1; k >= 0; k--) {
      const s = shots[k];
      s.life -= dt;
      if (s.kind === 'temptation') {
        target.set(player.x, L.groundHeight(player.x, player.z) + 1.1, player.z);
        s.dir.lerp(target.clone().sub(s.sp.position).normalize(), Math.min(1, dt * 0.8)).normalize(); // slight homing
      } else {
        target.set(m.x, L.groundHeight(m.x, m.z) + 1.2, m.z);
        s.dir.lerp(target.clone().sub(s.sp.position).normalize(), Math.min(1, dt * 8)).normalize(); // affirmations find their mark
      }
      s.sp.position.addScaledVector(s.dir, s.speed * dt);
      s.sp.material.rotation += dt * 4;
      let hit = false;
      if (s.kind === 'temptation' && Math.hypot(s.sp.position.x - player.x, s.sp.position.z - player.z) < 0.8 && Math.abs(s.sp.position.y - (L.groundHeight(player.x, player.z) + 1)) < 1.2) {
        hit = true;
        hud.willpower = Math.max(0, hud.willpower - 15);
        toast(MICHAEL.taunts[Math.floor(Math.random() * MICHAEL.taunts.length)]);
        if (hud.willpower <= 0) { endBattle(); onLose(); return; }
      }
      if (s.kind === 'affirmation' && Math.hypot(s.sp.position.x - m.x, s.sp.position.z - m.z) < 1.2) {
        hit = true;
        m.hp = Math.max(0, m.hp - 12);
        char.playOnce('Interact', 'Running_A');
        if (m.hp <= 0) {
          endBattle();
          m.banished = true;
          char.play('Walking_A');
          const back = m.returning;
          say('Michael', back
            ? ['Not again...', "You got lucky. I'll be back, you know.", 'Michael has been banished again!']
            : ["No... you're stronger than I thought.", "Fine. I'll go. But I'll be watching.", 'Michael has been banished from the grounds!'], () => onWin(back));
          return;
        }
      }
      if (hit || s.life <= 0) { scene.remove(s.sp); s.sp.material.dispose(); shots.splice(k, 1); }
    }

    hud.hold = m.hp;
    char.root.position.set(m.x, L.groundHeight(m.x, m.z), m.z);
    char.root.rotation.y = m.heading;
    char.update(dt);
    tag.style.opacity = dp < 40 ? 1 : 0;
    bubble.style.display = dp < 25 ? '' : 'none';
  }

  // He fades away without a fight (the player ignored or outran him).
  function leave(msg) {
    m.mode = 'wander';
    m.banished = true;
    m.fade = 1;
    toast(msg);
  }

  // Bring him back somewhere ahead of the player. Returns false if there's no clear spot.
  function reappear(player, heading) {
    for (let k = 0; k < 24; k++) {
      const a = heading + (Math.random() - 0.5) * 2.2, d = 18 + Math.random() * 10;
      const x = player.x + Math.sin(a) * d, z = player.z + Math.cos(a) * d;
      if (L.blocked(x, z, 0.6) || L.isWater(x, z)) continue;
      Object.assign(m, { x, z, banished: false, fade: 1, mode: 'approach', hp: 100, visitTime: 40, returning: true });
      m.level += 1;
      m.heading = Math.atan2(player.x - x, player.z - z);
      char.root.traverse((c) => { if (c.isMesh) { c.material.opacity = 1; c.material.transparent = false; } });
      char.root.visible = true;
      label.visible = true;
      bubble.textContent = MICHAEL.lines[Math.floor(Math.random() * MICHAEL.lines.length)];
      lineTimer = 5;
      return true;
    }
    return false;
  }

  function banishNow() { m.banished = true; m.fade = 0; char.root.visible = false; label.visible = false; }

  return {
    update, startBattle, resist, banishNow, reappear,
    get mode() { return m.mode; },
    get banished() { return m.banished; },
    near: (x, z, r = 4) => !m.banished && (m.mode === 'wander' || m.mode === 'approach') && Math.hypot(x - m.x, z - m.z) < r,
    get pos() { return [m.x, m.z]; },
    label,
  };
}
