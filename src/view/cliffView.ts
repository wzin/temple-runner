import * as THREE from 'three';
import type { Game } from '../core/game';
import { TRACK_HALF_WIDTH } from '../core/track';
import { GROUND_Y } from './groundView';
import { pbrMaterial, textures } from './textures';
import { activeBiome } from './biome';
import { faceHeading } from './util';

/**
 * The track runs on top of a stone embankment: one instanced block per 2 m of
 * centre line, from the ground far below up to the floor. Falling off means death,
 * which the drop makes obvious.
 */

const SLAB = 2;
const MAX = 400;
const WIDTH = TRACK_HALF_WIDTH * 2 + 1.4;   // a little wider than the walls
let blocks: THREE.InstancedMesh;
const dummy = new THREE.Object3D();

export function initCliffs(scene: THREE.Scene): void {
  const height = -0.5 - GROUND_Y;
  const geo = new THREE.BoxGeometry(WIDTH, height, SLAB);
  // Stone texture tiles every 2 m on the side faces.
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const sizes: [number, number][] = [[SLAB, height], [SLAB, height], [WIDTH, SLAB], [WIDTH, SLAB], [WIDTH, height], [WIDTH, height]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const idx = f * 4 + i; uv.setXY(idx, uv.getX(idx) * (sizes[f][0] / 2), uv.getY(idx) * (sizes[f][1] / 2)); }
  uv.needsUpdate = true;
  blocks = new THREE.InstancedMesh(geo, pbrMaterial(textures().cliff, { color: activeBiome().cliffTint }), MAX);
  blocks.count = 0;
  blocks.frustumCulled = false;
  scene.add(blocks);
}

export function updateCliffs(game: Game): void {
  const track = game.track;
  const yMid = (GROUND_Y + -0.5) / 2;
  let n = 0;
  // The embankment is missing where the floor is: a gap is a real break in the ridge.
  const gaps = game.spawner.obstacles.filter((o) => o.kind === 'gap');
  const holed = (s: number) => gaps.some((g) => s + SLAB / 2 > g.s0 + 1e-6 && s - SLAB / 2 < g.s1 - 1e-6);
  const put = (x: number, z: number, dir: { x: number; z: number }) => {
    if (n >= MAX) return;
    dummy.position.set(x, yMid, z); dummy.scale.setScalar(1); faceHeading(dummy, dir); dummy.updateMatrix();
    blocks.setMatrixAt(n++, dummy.matrix);
  };
  for (const seg of track.allSegments()) {
    const s1 = seg.s0 + seg.length;
    if (seg.kind === 'straight') {
      for (let s = seg.s0 + SLAB / 2; s < s1; s += SLAB) { if (holed(s)) continue; const w = track.sampleSegment(seg, s); put(w.x, w.z, w.dir); }
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
}
