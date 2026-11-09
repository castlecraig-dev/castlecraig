// Procedural textures drawn on canvases, so the game needs no image files.
import * as THREE from 'three';
import { rng } from './layout.js';

function canvasTexture(size, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const shade = (base, r, amt) => {
  const c = new THREE.Color(base);
  c.offsetHSL(0, 0, (r() - 0.5) * amt);
  return `#${c.getHexString()}`;
};



// Leafy hedge.
export function leafTexture() {
  const r = rng(3);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#2c5426';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = shade('#3f7a35', r, 0.22);
      g.beginPath();
      g.ellipse(r() * s, r() * s, 2 + r() * 4, 1.5 + r() * 2.5, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  });
}



// Tileable water ripple normal map from summed integer-frequency waves.
export function waterNormals() {
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  const waves = [];
  const r = rng(21);
  for (let i = 0; i < 9; i++) {
    waves.push({ fx: Math.round((r() - 0.5) * 14), fy: Math.round((r() - 0.5) * 14) || 1, a: 0.6 / (i + 1.5), p: r() * 6.28 });
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) {
      const ph = ((w.fx * x + w.fy * y) / n) * Math.PI * 2 + w.p;
      const c = Math.cos(ph) * w.a;
      dx += c * w.fx; dy += c * w.fy;
    }
    const len = Math.hypot(dx * 0.08, dy * 0.08, 1);
    const i = (y * n + x) * 4;
    data[i] = ((-dx * 0.08 / len) * 0.5 + 0.5) * 255;
    data[i + 1] = ((-dy * 0.08 / len) * 0.5 + 0.5) * 255;
    data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Soft round glow for item highlights.
export function glowTexture() {
  return canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,240,190,1)');
    grad.addColorStop(0.25, 'rgba(255,220,140,0.55)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }, { repeat: false });
}
