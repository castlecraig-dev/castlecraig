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

// ---------- interior textures ----------

// Red Persian rug: border bands, a central medallion and a scatter of motifs.
export function persianRug(seed = 4) {
  const r = rng(seed);
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#7e1f24'; g.fillRect(0, 0, s, s);
    const bands = [['#1f2a4a', 0], ['#c9a46a', 18], ['#7e1f24', 26], ['#1f2a4a', 52], ['#c9a46a', 60]];
    for (const [c, inset] of bands) { g.fillStyle = c; g.fillRect(inset, inset, s - inset * 2, s - inset * 2); }
    g.fillStyle = '#8c2329'; g.fillRect(68, 68, s - 136, s - 136);
    // border motifs
    for (let i = 30; i < s - 30; i += 22) for (const [x, y] of [[i, 38], [i, s - 38], [38, i], [s - 38, i]]) {
      g.fillStyle = r() < 0.5 ? '#e0c48a' : '#a8323a';
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    }
    // field motifs
    for (let i = 0; i < 260; i++) {
      const x = 80 + r() * (s - 160), y = 80 + r() * (s - 160);
      g.fillStyle = ['#d8b778', '#2a3a5c', '#5a1418', '#b8484e'][Math.floor(r() * 4)];
      g.save(); g.translate(x, y); g.rotate(r() * Math.PI);
      g.fillRect(-4, -1.5, 8, 3); g.fillRect(-1.5, -4, 3, 8); g.restore();
    }
    // central medallion
    g.save(); g.translate(s / 2, s / 2);
    for (const [rad, c] of [[110, '#1f2a4a'], [96, '#c9a46a'], [84, '#7e1f24'], [58, '#d8b778'], [40, '#1f2a4a'], [18, '#b8484e']]) {
      g.fillStyle = c; g.beginPath();
      for (let a = 0; a <= 16; a++) {
        const ang = (a / 16) * Math.PI * 2, rr = rad * (a % 2 ? 0.82 : 1);
        g.lineTo(Math.cos(ang) * rr * 1.25, Math.sin(ang) * rr);
      }
      g.fill();
    }
    g.restore();
    // wear
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * s, r() * s, 2, 2); }
  }, { repeat: false });
}

// Blue-green tartan.
export function tartanRug() {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#1f4a55'; g.fillRect(0, 0, s, s);
    const stripes = [[0, 60, '#2f6b5a'], [120, 30, '#163640'], [190, 8, '#8fb0a0'], [260, 60, '#2f6b5a'], [380, 30, '#163640'], [450, 8, '#3a5f8a']];
    g.globalAlpha = 0.6;
    for (const [o, w, c] of stripes) { g.fillStyle = c; g.fillRect(o, 0, w, s); g.fillRect(0, o, s, w); }
    g.globalAlpha = 1;
    for (let y = 0; y < s; y += 2) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, y, s, 1); }
    g.strokeStyle = '#d2c9a8'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
  }, { repeat: false });
}

// Gold-on-beige leafy wallpaper, in the spirit of Arts and Crafts designs.
export function wallpaper() {
  const r = rng(12);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#b9a37a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      const x = r() * s, y = r() * s, a = r() * Math.PI * 2;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = r() < 0.5 ? '#a68f63' : '#c8b48a';
      g.beginPath(); g.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#96804f'; g.lineWidth = 1; g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.stroke();
      g.restore();
    }
  });
}

// A simple painted landscape of rolling Border hills for picture frames.
export function painting(seed = 1) {
  const r = rng(seed);
  return canvasTexture(256, (g, s) => {
    const sky = g.createLinearGradient(0, 0, 0, s * 0.6);
    sky.addColorStop(0, '#8fa9c0'); sky.addColorStop(1, '#e8dcc0');
    g.fillStyle = sky; g.fillRect(0, 0, s, s);
    const greens = ['#6f7f4a', '#55663a', '#43552f', '#34452a'];
    greens.forEach((c, i) => {
      g.fillStyle = c; g.beginPath(); g.moveTo(0, s);
      const base = s * (0.45 + i * 0.13), amp = 18 + r() * 20, ph = r() * 6;
      for (let x = 0; x <= s; x += 8) g.lineTo(x, base - Math.sin(x / (40 + i * 10) + ph) * amp);
      g.lineTo(s, s); g.fill();
    });
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(60,40,20,${r() * 0.08})`; g.fillRect(r() * s, r() * s, 2, 2); }
  }, { repeat: false });
}

// Glazed green hearth tiles.
export function greenTiles() {
  const r = rng(6);
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#1d3a2a'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) for (let x = 0; x < s; x += 16) {
      g.fillStyle = shade('#2f6b4a', r, 0.12);
      g.fillRect(x + 1, y + 1, 14, 14);
    }
  });
}

// A painted wooden sign.
export function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 150;
  const g = c.getContext('2d');
  g.fillStyle = '#2f4a3a'; g.fillRect(0, 0, 512, 150);
  g.strokeStyle = '#d8c79a'; g.lineWidth = 8; g.strokeRect(8, 8, 496, 134);
  g.fillStyle = '#efe4c4'; g.font = 'bold 58px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft grey puff for cigarette smoke.
export function smokeTexture() {
  return canvasTexture(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(235,235,235,0.9)');
    grad.addColorStop(0.5, 'rgba(220,220,220,0.35)');
    grad.addColorStop(1, 'rgba(210,210,210,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }, { repeat: false });
}

// ---------- more interior textures (from photos of the real rooms) ----------

// Blue-and-white tiles for the therapy room fireplace.
export function delftTiles() {
  const r = rng(31);
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#e9eef4'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) {
      g.strokeStyle = '#b8c4d4'; g.strokeRect(x + 0.5, y + 0.5, 31, 31);
      g.strokeStyle = '#2f5aa8'; g.lineWidth = 2;
      g.beginPath(); g.arc(x + 16, y + 16, 6 + r() * 4, 0, Math.PI * 2); g.stroke();
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + r() * 0.3; g.beginPath(); g.moveTo(x + 16, y + 16); g.lineTo(x + 16 + Math.cos(a) * 12, y + 16 + Math.sin(a) * 12); g.stroke(); }
    }
  });
}

// Grey-gold wallpaper with pale trailing branches, as in the bedrooms.
export function botanicalWallpaper() {
  const r = rng(44);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#b4a690'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(245,240,228,0.85)'; g.fillStyle = 'rgba(245,240,228,0.85)'; g.lineWidth = 1.6;
    for (let b = 0; b < 6; b++) {
      let x = r() * s, y = s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        const nx = x + (r() - 0.5) * 30, ny = y - 18;
        g.quadraticCurveTo(x + (r() - 0.5) * 20, y - 9, nx, ny);
        g.stroke();
        for (const side of [-1, 1]) { g.beginPath(); g.ellipse(nx + side * 6, ny, 5, 2, side * 0.6, 0, Math.PI * 2); g.fill(); }
        g.beginPath(); g.moveTo(nx, ny);
        x = nx; y = ny;
      }
    }
  });
}

// Tartan for throws and carpets: colours = [ground, stripe, accent].
export function tartan(colours, size = 256) {
  const [base, stripe, accent] = colours;
  return canvasTexture(size, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    g.globalAlpha = 0.55;
    for (const [o, w, c] of [[0, s * 0.18, stripe], [s * 0.5, s * 0.18, stripe], [s * 0.3, s * 0.03, accent], [s * 0.8, s * 0.03, accent]]) {
      g.fillStyle = c; g.fillRect(o, 0, w, s); g.fillRect(0, o, s, w);
    }
    g.globalAlpha = 1;
    for (let y = 0; y < s; y += 2) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, s, 1); }
  });
}

// Lilac floral curtain fabric.
export function floralFabric() {
  const r = rng(52);
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#f2ece4'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      const x = r() * s, y = r() * s;
      g.strokeStyle = '#8a9a6a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + 20); g.stroke();
      g.fillStyle = ['#9a7ab0', '#b896c8', '#7a5a90'][i % 3];
      for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4, 0, Math.PI * 2); g.fill(); }
    }
  });
}

// A cowhide rug.
export function cowhide() {
  const r = rng(61);
  return canvasTexture(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = '#efe7da';
    g.beginPath();
    for (let a = 0; a <= 24; a++) { const t = a / 24 * Math.PI * 2, rr = s * (0.38 + 0.08 * Math.sin(t * 4) + 0.04 * Math.sin(t * 9)); g.lineTo(s / 2 + Math.cos(t) * rr, s / 2 + Math.sin(t) * rr * 0.8); }
    g.fill();
    g.save(); g.clip();
    for (let i = 0; i < 9; i++) {
      g.fillStyle = r() < 0.5 ? '#5a3a24' : '#3a2618';
      g.beginPath(); g.ellipse(r() * s, r() * s, 20 + r() * 40, 15 + r() * 30, r() * 3, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }, { repeat: false });
}

// An eight-by-eight chessboard.
export function chessboard() {
  return canvasTexture(128, (g, s) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#3a2a1e' : '#e8dcc4'; g.fillRect(x * 16, y * 16, 16, 16); }
  }, { repeat: false });
}
