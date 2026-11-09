// Loads the CC0 vendor assets (see CREDITS.md) from public/assets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const BASE = `${import.meta.env.BASE_URL}assets/`;

async function settle(obj) {
  const keys = Object.keys(obj);
  const vals = await Promise.all(keys.map((k) => obj[k]));
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
}

export async function loadAssets(renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress(loaded / total);
  const gltf = new GLTFLoader(manager);
  const texLoader = new THREE.TextureLoader(manager);
  // Half-float: linear filtering works on every WebGL2 device (32-bit float doesn't on iOS).
  const hdr = new HDRLoader(manager).setDataType(THREE.HalfFloatType);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const tex = (name, srgb) => texLoader.loadAsync(`${BASE}textures/${name}.jpg`).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  const pbr = (n) => settle({ diff: tex(`${n}_diff`, true), nor: tex(`${n}_nor`), arm: tex(`${n}_arm`) });
  const model = (path) => gltf.loadAsync(BASE + path);
  const kk = (n) => model(`models/kaykit/${n}.gltf`);
  const ph = (n) => model(`models/polyhaven/${n}/${n}_1k.gltf`);

  // real-world map data (scripts/build-map.py)
  const fileLoader = new THREE.FileLoader(manager).setResponseType('arraybuffer');
  const bin = (name) => fileLoader.loadAsync(`${BASE}map/${name}`).then((b) => new Float32Array(b));
  const mapData = settle({
    meta: new THREE.FileLoader(manager).setResponseType('json').loadAsync(`${BASE}map/map.json`),
    H: bin('height.bin'),
    far: bin('far.bin'),
    splatTex: texLoader.loadAsync(`${BASE}map/splat.png`),
  }).then((m) => {
    // read the ground mask on the CPU too, for placing trees and testing the ground
    const img = m.splatTex.image;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    m.splat = ctx.getImageData(0, 0, img.width, img.height).data;
    m.splatTex.flipY = false;
    m.splatTex.needsUpdate = true;
    return m;
  });

  return settle({
    map: mapData,
    sky: hdr.loadAsync(`${BASE}sky/sky_2k.hdr`),
    tex: settle({
      stone: pbr('castle_wall_slates'),
      slate: pbr('roof_slates_02'),
      gravel: pbr('gravel_road'),
      grass: pbr('leafy_grass'),
      forest: pbr('forest_leaves_02'),
      mud: pbr('brown_mud_02'),
      wood: pbr('wood_planks'),
      // castle interior
      darkFloor: pbr('dark_wooden_planks'),
      parquet: pbr('herringbone_parquet'),
      panels: pbr('wooden_panels'),
      plaster: pbr('plastered_wall'),
      marble: pbr('marble_01'),
      velvet: pbr('velour_velvet'),
      leather: pbr('brown_leather'),
    }),
    chars: settle({
      player: model('characters/player.glb'),
      gardener: model('characters/gardener.glb'),
      cook: model('characters/cook.glb'),
      groundskeeper: model('characters/groundskeeper.glb'),
      guide: model('characters/guide.glb'),
    }),
    kk: settle({
      treeA: kk('tree_single_A'), treeB: kk('tree_single_B'),
      clumpA: kk('trees_A_large'), clumpB: kk('trees_B_large'),
      rockA: kk('rock_single_A'), rockB: kk('rock_single_B'), rockC: kk('rock_single_C'), rockD: kk('rock_single_D'),
      lilyA: kk('waterlily_A'), lilyB: kk('waterlily_B'), plantA: kk('waterplant_A'), plantB: kk('waterplant_B'),
      barrel: kk('barrel'), crate: kk('crate_A_big'), bucket: kk('bucket_water'), flag: kk('flag_blue'),
    }),
    ph: settle({
      bench: ph('painted_wooden_bench'),
      lamp: ph('street_lamp_01'),
      gate: ph('large_iron_gate'),
      fern: ph('fern_02'),
      lantern: ph('wooden_lantern_01'),
      // castle interior furniture
      armchair: ph('ArmChair_01'),
      ottoman: ph('Ottoman_01'),
      sofa: ph('Sofa_01'),
      hallLantern: ph('lantern_chandelier_01'),
      chandelier: ph('Chandelier_02'),
      mirror: ph('ornate_mirror_01'),
      frame: ph('fancy_picture_frame_01'),
      roundTable: ph('round_wooden_table_02'),
      sideTable: ph('side_table_01'),
      clock: ph('vintage_grandfather_clock_01'),
      vase: ph('brass_vase_03'),
      plant: ph('potted_plant_04'),
      bookshelf: ph('wooden_bookshelf_worn'),
      drawers: ph('vintage_wooden_drawer_01'),
    }),
  });
}

// Find the sun in the HDRI (its brightest pixel) and the average horizon colour.
export function analyseSky(texture) {
  const { data: raw, width: w, height: h } = texture.image;
  const data = raw instanceof Uint16Array ? Float32Array.from(raw, THREE.DataUtils.fromHalfFloat) : raw;
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < h / 2; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    if (l > best) { best = l; bx = x; by = y; }
  }
  const el = (0.5 - (by + 0.5) / h) * Math.PI;
  const az = ((bx + 0.5) / w - 0.5) * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
  const horizon = new THREE.Color(0, 0, 0);
  const row = Math.floor(h * 0.47);
  for (let x = 0; x < w; x++) {
    const i = (row * w + x) * 4;
    horizon.r += data[i]; horizon.g += data[i + 1]; horizon.b += data[i + 2];
  }
  horizon.multiplyScalar(1 / w);
  return { sunDir, horizon };
}

// Normalise a model: scale so its largest chosen dimension equals `size`,
// with its base on y = 0 and centred on x/z.
export function normalised(gltfScene, size, axis = 'y') {
  const root = new THREE.Group();
  const s = gltfScene.clone(true);
  const box = new THREE.Box3().setFromObject(s);
  const dim = box.getSize(new THREE.Vector3());
  const k = size / (axis === 'xz' ? Math.max(dim.x, dim.z) : dim[axis]);
  s.scale.multiplyScalar(k);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
  s.position.set(-c.x, -box.min.y * k, -c.z);
  root.add(s);
  root.updateMatrixWorld(true);
  return root;
}

// Draw many copies of a model with one InstancedMesh per mesh part.
export function instanced(group, modelRoot, matrices, { cast = true, receive = true } = {}) {
  modelRoot.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  modelRoot.traverse((o) => {
    if (!o.isMesh || !matrices.length) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    matrices.forEach((M, i) => im.setMatrixAt(i, m.multiplyMatrices(M, o.matrixWorld)));
    im.castShadow = cast;
    im.receiveShadow = receive;
    im.computeBoundingSphere();
    group.add(im);
  });
}

// A single placed copy of a model.
export function placed(modelRoot, x, y, z, ry = 0, scale = 1) {
  const o = modelRoot.clone(true);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.scale.setScalar(scale);
  o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
}
