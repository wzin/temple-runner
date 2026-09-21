import * as THREE from 'three';
import type { Game } from '../core/game';
import { TRACK_HALF_WIDTH } from '../core/track';
import { GROUND_Y } from './groundView';
import { pbrMaterial, textures } from './textures';
import { activeBiome } from './biome';
import { faceHeading } from './util';
import { holesOf } from './holes';

/**
 * The track runs on top of a stone embankment: one instanced block per 2 m of
 * centre line, from the ground far below up to the floor. Falling off means death,
 * which the drop makes obvious.
 */

const SLAB = 2;
const MAX = 400;
const WIDTH = TRACK_HALF_WIDTH * 2 + 1.4;   // a little wider than the walls
let blocks: THREE.InstancedMesh; let halfBlocks: THREE.InstancedMesh;
const HALF_W = WIDTH / 2 - 0.4;
const tint = new THREE.Color();
const h3 = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const dummy = new THREE.Object3D();

export function initCliffs(scene: THREE.Scene): void {
  const height = -0.5 - GROUND_Y;
  const geo = new THREE.BoxGeometry(WIDTH, height, SLAB);
  // Stone texture tiles every 2 m on the side faces.
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const sizes: [number, number][] = [[SLAB, height], [SLAB, height], [WIDTH, SLAB], [WIDTH, SLAB], [WIDTH, height], [WIDTH, height]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const idx = f * 4 + i; uv.setXY(idx, uv.getX(idx) * (sizes[f][0] / 2), uv.getY(idx) * (sizes[f][1] / 2)); }
  uv.needsUpdate = true;
  const mat = pbrMaterial(textures().cliff, { color: activeBiome().cliffTint });
  blocks = new THREE.InstancedMesh(geo, mat, MAX);
  blocks.count = 0;
  blocks.frustumCulled = false;
  scene.add(blocks);
  halfBlocks = new THREE.InstancedMesh(new THREE.BoxGeometry(HALF_W, height, SLAB), mat, 128);
  halfBlocks.count = 0; halfBlocks.frustumCulled = false; scene.add(halfBlocks);
}

export function updateCliffs(game: Game): void {
  const track = game.track;
  const yMid = (GROUND_Y + -0.5) / 2;
  let n = 0; let nh = 0;
  // The embankment is missing where the floor is: a gap is a real break in the ridge; a half gap takes one side.
  const holes = holesOf(game, SLAB);
  const holed = holes.holed;
  const put = (x: number, z: number, dir: { x: number; z: number }) => {
    if (n >= MAX) return;
    dummy.position.set(x, yMid, z); dummy.scale.setScalar(1); faceHeading(dummy, dir); dummy.updateMatrix();
    blocks.setMatrixAt(n, dummy.matrix);
    blocks.setColorAt(n, tint.setRGB(0.88 + h3(Math.round(x * 5), 1) * 0.24, 0.88 + h3(Math.round(z * 5), 2) * 0.22, 0.88 + h3(Math.round((x - z) * 5), 3) * 0.24));
    n++;
  };
  const putHalf = (w: { x: number; z: number; dir: { x: number; z: number } }, hs: -1 | 1) => {
    if (nh >= 128) return;
    const right = { x: -w.dir.z, z: w.dir.x }; const off = -hs * (WIDTH / 2 - HALF_W / 2);
    dummy.position.set(w.x + right.x * off, yMid, w.z + right.z * off); dummy.scale.setScalar(1); faceHeading(dummy, w.dir); dummy.updateMatrix();
    halfBlocks.setMatrixAt(nh++, dummy.matrix);
  };
  for (const seg of game.visibleSegments()) {
    const s1 = seg.s0 + seg.length;
    if (seg.kind === 'straight') {
      for (let s = seg.s0 + SLAB / 2; s < s1; s += SLAB) { if (holed(s)) continue; const w = track.sampleSegment(seg, s); const hs = holes.halfAt(s); if (hs !== 0) putHalf(w, hs); else put(w.x, w.z, w.dir); }
      continue;
    }
    const corner = track.cornerOf(seg);
    for (let s = seg.s0 + SLAB / 2; s < corner - TRACK_HALF_WIDTH; s += SLAB) { const w = track.sampleSegment(seg, s); put(w.x, w.z, w.dir); }
    const c = track.sampleSegment(seg, corner - 1e-6);
    for (const k of [-1, 0, 1]) put(c.x + c.dir.x * k * SLAB, c.z + c.dir.z * k * SLAB, c.dir);
    if (seg.fork) {
      const left = { x: c.dir.z, z: -c.dir.x }; const right = { x: -c.dir.z, z: c.dir.x };
      for (const d of [left, right]) for (let k = TRACK_HALF_WIDTH + SLAB / 2; k < TRACK_HALF_WIDTH + 10; k += SLAB) put(c.x + d.x * k, c.z + d.z * k, d);
    }
    if (seg.resolved) for (let s = corner + TRACK_HALF_WIDTH + SLAB / 2; s < s1; s += SLAB) { const w = track.sampleSegment(seg, s); put(w.x, w.z, w.dir); }
  }
  blocks.count = n;
  blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  halfBlocks.count = nh; halfBlocks.instanceMatrix.needsUpdate = true;
}
