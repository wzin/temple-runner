import * as THREE from 'three';

/**
 * Seamless procedural PBR textures built once on canvases: colour, normal and
 * roughness maps derived from one tileable height field per material, so light
 * catches slab edges, mortar lines and bark ridges. No asset pipeline needed.
 */

const SIZE = 512;

/** Deterministic hash → [0,1). */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise: lattice coordinates wrap at `period`. */
function noise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const fx = x - x0; const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number) => ((v % period) + period) % period;
  const v = (i: number, j: number) => hash(wrap(i), wrap(j), seed);
  const a = v(x0, y0); const b = v(x0 + 1, y0); const c = v(x0, y0 + 1); const d = v(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, period: number, seed: number, octaves = 4): number {
  let sum = 0; let amp = 0.5; let freq = 1; let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * freq, y * freq, period * freq, seed + o) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface Maps { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }

interface Recipe {
  /** Height in [0,1] at texture coords (u,v). */
  height: (u: number, v: number) => number;
  /** Base colour given (u,v) and the height there. */
  color: (u: number, v: number, h: number) => RGB;
  /** Roughness 0..1 given (u,v) and height. */
  roughness: (u: number, v: number, h: number) => number;
  /** How strongly height differences tilt the normal. */
  normalStrength: number;
}

function canvasTexture(fill: (data: Uint8ClampedArray) => void, srgb: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function bake(recipe: Recipe): Maps {
  const H = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) H[y * SIZE + x] = recipe.height(x / SIZE, y / SIZE);
  const at = (x: number, y: number) => H[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];

  const map = canvasTexture((d) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = recipe.color(x / SIZE, y / SIZE, at(x, y));
      const i = (y * SIZE + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }, true);

  const normalMap = canvasTexture((d) => {
    const k = recipe.normalStrength;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k;
      const dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      d[i] = (-dx / len * 0.5 + 0.5) * 255; d[i + 1] = (-dy / len * 0.5 + 0.5) * 255; d[i + 2] = (1 / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }, false);

  const roughnessMap = canvasTexture((d) => {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const r = clamp01(recipe.roughness(x / SIZE, y / SIZE, at(x, y))) * 255;
      const i = (y * SIZE + x) * 4; d[i] = r; d[i + 1] = r; d[i + 2] = r; d[i + 3] = 255;
    }
  }, false);

  return { map, normalMap, roughnessMap };
}

/** Two-by-two stone slabs, bevelled edges, recessed grout, grime. One tile = 2 m. */
function stoneFloor(): Maps {
  const tiles = 2;
  const edge = (u: number, v: number) => { const gx = (u * tiles) % 1; const gy = (v * tiles) % 1; return Math.min(gx, 1 - gx, gy, 1 - gy); };
  return bake({
    height: (u, v) => {
      const e = edge(u, v);
      const bevel = clamp01((e - 0.03) / 0.05);           // 0 in the grout, 1 on the slab face
      const perTile = hash(Math.floor(u * tiles), Math.floor(v * tiles), 3) * 0.08;
      return bevel * (0.85 + perTile) + fbm(u * 16, v * 16, 16, 11) * 0.12;
    },
    color: (u, v, h) => {
      const grime = fbm(u * 8, v * 8, 8, 12);
      const slab = mix([118, 122, 134], [70, 74, 90], grime);
      const perTile = hash(Math.floor(u * tiles), Math.floor(v * tiles), 3) * 22 - 11;
      const c = slab.map((ch) => ch + perTile) as RGB;
      return h < 0.3 ? [30, 32, 40] : c;
    },
    roughness: (u, v, h) => (h < 0.3 ? 0.98 : 0.72 + fbm(u * 12, v * 12, 12, 13) * 0.2),
    normalStrength: 6,
  });
}

/** Running-bond bricks with recessed mortar and moss creeping up from the base. */
function wallBricks(): Maps {
  const rows = 8; const cols = 4;
  const cell = (u: number, v: number) => {
    const row = Math.floor(v * rows);
    const offset = row % 2 ? 0.5 : 0;
    const gx = ((u + offset / cols) * cols) % 1; const gy = (v * rows) % 1;
    return { gx, gy, row, col: Math.floor((u + offset / cols) * cols) };
  };
  return bake({
    height: (u, v) => {
      const { gx, gy, row, col } = cell(u, v);
      const mortar = gx < 0.06 || gy < 0.1;
      const face = clamp01(Math.min(gx - 0.06, gy - 0.1) / 0.04);
      const wobble = hash(col, row, 5) * 0.1;
      return mortar ? 0.1 : 0.7 + face * 0.15 + wobble + fbm(u * 20, v * 20, 20, 21) * 0.1;
    },
    color: (u, v, h) => {
      const n = fbm(u * 6, v * 6, 6, 22);
      const brick = mix([96, 76, 82], [58, 46, 60], n);
      const moss = fbm(u * 4, v * 4, 4, 33) * (1 - v) * 0.9;
      const c = mix(brick, [60, 110, 66], Math.max(0, moss - 0.35));
      return h < 0.3 ? [34, 32, 40] : c;
    },
    roughness: (u, v, h) => (h < 0.3 ? 0.97 : 0.8 + fbm(u * 9, v * 9, 9, 23) * 0.15),
    normalStrength: 5,
  });
}

/** Bark: ridged vertical grain. */
function woodBark(): Maps {
  return bake({
    height: (u, v) => {
      const grain = fbm(u * 24, v * 3, 24, 41);
      return 0.5 + 0.35 * Math.sin(u * Math.PI * 40 + grain * 6) + grain * 0.15;
    },
    color: (_u, _v, h) => mix([84, 52, 28], [150, 104, 58], h),
    roughness: () => 0.9,
    normalStrength: 4,
  });
}

/** Leaves: blotchy canopy with small bright spots. */
function leaves(): Maps {
  return bake({
    height: (u, v) => fbm(u * 10, v * 10, 10, 51),
    color: (u, v, h) => {
      const spots = fbm(u * 30, v * 30, 30, 61) > 0.62 ? 0.25 : 0;
      return mix([40, 92, 46], [118, 170, 74], h + spots);
    },
    roughness: () => 0.85,
    normalStrength: 3,
  });
}

/** Vertical sky gradient used as the scene background. */
export function skyGradient(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0b0a1e');
  grad.addColorStop(0.55, '#1c1a3a');
  grad.addColorStop(1, '#3a2340');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Grass and earth for the ground plane beside the track. */
function ground(): Maps {
  return bake({
    height: (u, v) => fbm(u * 6, v * 6, 6, 71) * 0.6 + fbm(u * 40, v * 40, 40, 72, 2) * 0.4,
    color: (u, v, h) => {
      const patch = fbm(u * 3, v * 3, 3, 73);
      const grass = mix([46, 92, 44], [88, 128, 58], h);
      return mix(grass, [86, 68, 46], Math.max(0, patch - 0.55) * 2);
    },
    roughness: () => 0.95,
    normalStrength: 2.5,
  });
}

export interface TextureSet { floor: Maps; wall: Maps; bark: Maps; leaves: Maps; leaves2: Maps; ground: Maps; cliff: Maps; totem: Maps; glyph: Maps }

let cached: TextureSet | null = null;
export function textures(): TextureSet {
  if (!cached) {
    const t0 = performance.now();
    // Procedural fallbacks; real sets from /textures replace their images in place (loadRealTextures).
    cached = { floor: stoneFloor(), wall: wallBricks(), bark: woodBark(), leaves: leaves(), leaves2: leaves(), ground: ground(), cliff: wallBricks(), totem: wallBricks(), glyph: stoneFloor() };
    console.info(`[textures] baked in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  return cached;
}

/**
 * Swap in real PBR sets from /textures/<name>/{color,normal,roughness}.jpg when they exist.
 * The procedural canvases stay as the fallback and are replaced in place, so materials
 * never need to know which source they show.
 */
export function loadRealTextures(): void {
  const loader = new THREE.TextureLoader();
  // [set, folder, priority]: 0 = before anything else, 1 = soon after the first frame, 2 = whenever.
  const sets: [keyof TextureSet, string, number][] = [
    ['floor', 'floor-path', 0], ['wall', 'wall-inca', 0], ['cliff', 'cliff-rock', 0], ['ground', 'ground-jungle', 1],
    ['bark', 'bark-tropical', 1], ['leaves', 'leaves', 1], ['leaves2', 'leaves2', 2], ['totem', 'totem', 2], ['glyph', 'gold-glyph', 2],
  ];
  for (const [key, folder, priority] of sets) {
    const maps = textures()[key];
    const swap = (target: THREE.CanvasTexture, file: string) => schedule(priority, () => {
      loader.load(`/textures/${folder}/${file}.${ASSET_EXT}`, (tex) => { target.dispose(); target.image = tex.image; target.needsUpdate = true; finished(); }, undefined, () => finished());
    });
    swap(maps.map, 'color'); swap(maps.normalMap, 'normal'); swap(maps.roughnessMap, 'roughness');
  }
}

/**
 * Progressive asset queue. Priority 0 (the world you see first: floor, walls, cliffs, sky) starts
 * immediately; everything else waits until `releaseAssets()` (after the first frame) and is
 * started a few at a time so the first seconds are not one big download.
 */
type Job = () => void;
const queued: { priority: number; job: Job }[] = [];
let released = false;
let pending = 0; let done = 0;
const listeners: ((done: number, total: number) => void)[] = [];
export function onAssetProgress(cb: (done: number, total: number) => void): void { listeners.push(cb); }
function notify(): void { for (const cb of listeners) cb(done, done + pending); }
function schedule(priority: number, job: Job): void {
  pending++; notify();
  if (priority === 0 || released) job(); else queued.push({ priority, job });
}
function finished(): void { pending--; done++; notify(); }
export function releaseAssets(): void {
  if (released) return;
  released = true;
  queued.sort((a, b) => a.priority - b.priority);
  let i = 0;
  const step = () => { for (let k = 0; k < 3 && i < queued.length; k++) queued[i++].job(); if (i < queued.length) setTimeout(step, 120); };
  setTimeout(step, 250);
}
export const ASSET_EXT = 'webp';

/** A PBR set that starts as flat colour placeholders and fills in from /textures/<folder>/ when the images load. */
export function remoteSet(folder: string, fallback: number, priority = 1): Maps {
  const tiny = (r: number, g: number, b: number, srgb: boolean) => {
    const c = document.createElement('canvas'); c.width = c.height = 2;
    const ctx = c.getContext('2d')!; ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, 2, 2);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  };
  const maps: Maps = {
    map: tiny((fallback >> 16) & 255, (fallback >> 8) & 255, fallback & 255, true),
    normalMap: tiny(128, 128, 255, false),
    roughnessMap: tiny(200, 200, 200, false),
  };
  const loader = new THREE.TextureLoader();
  const swap = (target: THREE.CanvasTexture, file: string) => schedule(priority, () => {
    loader.load(`/textures/${folder}/${file}.${ASSET_EXT}`, (tex) => { target.dispose(); target.image = tex.image; target.needsUpdate = true; finished(); }, undefined, () => finished());
  });
  swap(maps.map, 'color'); swap(maps.normalMap, 'normal'); swap(maps.roughnessMap, 'roughness');
  return maps;
}

const spriteCache = new Map<string, THREE.Texture>();
/** RGBA sprite from /sprites/<name>.png (transparent until loaded). */
export function sprite(name: string): THREE.Texture {
  let t = spriteCache.get(name);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 2; // fully transparent placeholder
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const target = t;
  schedule(2, () => {
    new THREE.TextureLoader().load(`/sprites/${name}.${ASSET_EXT}`, (tex) => { target.dispose(); target.image = tex.image; target.needsUpdate = true; finished(); }, undefined, () => finished());
  });
  spriteCache.set(name, t);
  return t;
}

/** Standard material wired to a PBR map set. */
export function pbrMaterial(maps: Maps, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  // Anisotropic filtering keeps the slabs crisp at the grazing angles a runner camera always has.
  for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({
    map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap,
    normalScale: new THREE.Vector2(1, 1), roughness: 1, metalness: 0.02, ...extra,
  });
}
