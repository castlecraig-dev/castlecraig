// Animated characters built from the KayKit glTF models.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export class Character {
  constructor(gltf, { height = 1.8, clone = false, tint = null } = {}) {
    const model = clone ? cloneSkinned(gltf.scene) : gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const k = height / (box.max.y - box.min.y);
    const scaler = new THREE.Group();
    scaler.scale.setScalar(k);
    scaler.position.y = -box.min.y * k;
    scaler.add(model);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds don't follow the animation
      if (tint) { o.material = o.material.clone(); o.material.color.set(tint); }
    });
    this.root = new THREE.Group();
    this.root.add(scaler);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.oneShot = null;
    this.play('Idle');
  }

  // Loop an animation, cross-fading from the current one.
  play(name, fade = 0.25) {
    const a = this.actions[name];
    if (!a || this.current === a) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
    this.oneShot = null;
  }

  // Play an animation once, then go back to `then`.
  playOnce(name, then = 'Idle') {
    const a = this.actions[name];
    if (!a) return;
    a.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.15).play();
    a.clampWhenFinished = true;
    if (this.current && this.current !== a) this.current.fadeOut(0.15);
    this.current = a;
    this.oneShot = { then, until: a.getClip().duration - 0.25 };
  }

  get busy() { return !!this.oneShot; }

  update(dt) {
    this.mixer.update(dt);
    if (this.oneShot && this.current.time >= this.oneShot.until) {
      const next = this.oneShot.then;
      this.oneShot = null;
      const prev = this.current;
      this.current = null;
      this.play(next, 0.3);
      if (prev !== this.current) prev.fadeOut(0.3);
    }
  }
}

// Smoothly turn an angle towards a target, the short way round.
export function turnTowards(current, target, maxStep) {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}
