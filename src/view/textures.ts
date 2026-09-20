import * as THREE from 'three';

/**
 * Seamless procedural textures built once on a canvas. "Super basic" by design:
 * enough to read as stone, brick, bark and leaves, with no asset pipeline.
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

type Paint = (u: number, v: number) => [number, number, number];

function paint(fn: Paint): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = fn(x / SIZE, y / SIZE);
      const i = (y * SIZE + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];

/** Two-by-two stone slabs with dark grout and grime. One texture tile = 2 m. */
export function stoneFloor(): THREE.CanvasTexture {
  const tiles = 2;
  return paint((u, v) => {
    const gx = (u * tiles) % 1; const gy = (v * tiles) % 1;
    const grout = Math.min(gx, 1 - gx, gy, 1 - gy) < 0.035 ? 1 : 0;
    const grime = fbm(u * 8, v * 8, 8, 11);
    const slab = mix([92, 96, 108], [60, 64, 78], grime);
    const perTile = hash(Math.floor(u * tiles), Math.floor(v * tiles), 3) * 18 - 9;
    const c = slab.map((ch) => ch + perTile) as [number, number, number];
    return grout ? [28, 30, 38] : c;
  });
}

/** Running-bond bricks with a mossy tint near the bottom rows. */
export function wallBricks(): THREE.CanvasTexture {
  const rows = 8; const cols = 4;
  return paint((u, v) => {
    const row = Math.floor(v * rows);
    const offset = row % 2 ? 0.5 : 0;
    const gx = ((u + offset / cols) * cols) % 1; const gy = (v * rows) % 1;
    const mortar = gx < 0.06 || gy < 0.1;
    const n = fbm(u * 6, v * 6, 6, 21);
    const brick = mix([74, 62, 70], [48, 40, 52], n);
    const moss = fbm(u * 4, v * 4, 4, 33) * (1 - v) * 0.9;
    const c = mix(brick, [52, 92, 60], Math.max(0, moss - 0.35));
    return mortar ? [30, 28, 36] : c;
  });
}

/** Vertical bark grain for logs. */
export function woodBark(): THREE.CanvasTexture {
  return paint((u, v) => {
    const grain = fbm(u * 24, v * 3, 24, 41);
    const rings = 0.5 + 0.5 * Math.sin(u * Math.PI * 40 + grain * 6);
    return mix([96, 62, 34], [140, 96, 52], rings * 0.6 + grain * 0.4);
  });
}

/** Blotchy leaf canopy for branches. */
export function leaves(): THREE.CanvasTexture {
  return paint((u, v) => {
    const n = fbm(u * 10, v * 10, 10, 51);
    const spots = fbm(u * 30, v * 30, 30, 61) > 0.62 ? 0.25 : 0;
    return mix([40, 92, 46], [110, 160, 70], n + spots);
  });
}

export interface TextureSet { floor: THREE.CanvasTexture; wall: THREE.CanvasTexture; bark: THREE.CanvasTexture; leaves: THREE.CanvasTexture }

let cached: TextureSet | null = null;
export function textures(): TextureSet {
  if (!cached) cached = { floor: stoneFloor(), wall: wallBricks(), bark: woodBark(), leaves: leaves() };
  return cached;
}
