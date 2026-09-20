import * as THREE from 'three';
import type { Game } from '../core/game';
import { Segment, TRACK_HALF_WIDTH } from '../core/track';
import { pbrMaterial, remoteSet, textures } from './textures';
import { activeBiome } from './biome';
import { faceHeading } from './util';

/**
 * The floor is one instanced mesh of 2 m slabs rebuilt from the live segments
 * every frame. A slab that overlaps a gap obstacle is simply not placed, so gaps
 * are real holes with visible slab edges.
 */

export const SLAB = 2;
export const FLOOR_THICKNESS = 0.5;
const MAX = 320;
let slabs: THREE.InstancedMesh;
let slabVariants: THREE.InstancedMesh[] = [];
const counts: number[] = [0, 0, 0];
const dummy = new THREE.Object3D();
const segHash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function slabGeometry(): THREE.BoxGeometry {
  const w = TRACK_HALF_WIDTH * 2;
  const geo = new THREE.BoxGeometry(w, FLOOR_THICKNESS, SLAB);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const sizes: [number, number][] = [[SLAB, FLOOR_THICKNESS], [SLAB, FLOOR_THICKNESS], [w, SLAB], [w, SLAB], [w, FLOOR_THICKNESS], [w, FLOOR_THICKNESS]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const idx = f * 4 + i; uv.setXY(idx, uv.getX(idx) * (sizes[f][0] / 2), uv.getY(idx) * (sizes[f][1] / 2));
  }
  uv.needsUpdate = true;
  return geo;
}

export function initFloorView(scene: THREE.Scene): void {
  const geo = slabGeometry();
  const tint = activeBiome().floorTint;
  slabs = new THREE.InstancedMesh(geo, pbrMaterial(textures().floor, { color: tint }), MAX);
  const broken = new THREE.InstancedMesh(geo, pbrMaterial(remoteSet('floor-broken', 0x807870, 1), { color: tint }), MAX);
  const mossy = new THREE.InstancedMesh(geo, pbrMaterial(remoteSet('floor-mossy', 0x6a8060, 1), { color: tint }), MAX);
  slabVariants = [slabs, broken, mossy];
  for (const m of slabVariants) { m.count = 0; m.frustumCulled = false; m.receiveShadow = true; scene.add(m); }
}

/** Floor look per segment: mostly the worn path, with broken and mossy stretches. */
function variantFor(segId: number): number {
  const r = segHash(segId, 91);
  return r < 0.6 ? 0 : r < 0.8 ? 1 : 2;
}

export function updateFloorView(game: Game): void {
  const gaps = game.spawner.obstacles.filter((o) => o.kind === 'gap');
  const holed = (s: number) => gaps.some((g) => s + SLAB / 2 > g.s0 + 1e-6 && s - SLAB / 2 < g.s1 - 1e-6);
  counts[0] = counts[1] = counts[2] = 0;
  let variant = 0;
  const put = (x: number, z: number, dir: { x: number; z: number }) => {
    if (counts[variant] >= MAX) return;
    dummy.position.set(x, -FLOOR_THICKNESS / 2, z); dummy.scale.setScalar(1); faceHeading(dummy, dir); dummy.updateMatrix();
    slabVariants[variant].setMatrixAt(counts[variant]++, dummy.matrix);
  };
  const track = game.track;
  const along = (seg: Segment, from: number, to: number) => {
    variant = variantFor(seg.id);
    for (let s = from + SLAB / 2; s < to + 1e-6; s += SLAB) {
      if (holed(s)) continue;
      const w = track.sampleSegment(seg, s); put(w.x, w.z, w.dir);
    }
  };
  for (const seg of track.allSegments()) {
    const s1 = seg.s0 + seg.length;
    variant = variantFor(seg.id);
    if (seg.kind === 'straight') { along(seg, seg.s0, s1); continue; }
    const corner = track.cornerOf(seg);
    along(seg, seg.s0, corner - TRACK_HALF_WIDTH);
    // Corner square: three slabs along the incoming heading.
    const c = track.sampleSegment(seg, corner - 1e-6);
    for (const k of [-1, 0, 1]) put(c.x + c.dir.x * k * SLAB, c.z + c.dir.z * k * SLAB, c.dir);
    if (seg.fork) forkStubs(seg, c, put);   // both run-outs before the choice, the unchosen one after
    if (seg.resolved) along(seg, corner + TRACK_HALF_WIDTH, s1);
  }
  for (let i = 0; i < 3; i++) { slabVariants[i].count = counts[i]; slabVariants[i].instanceMatrix.needsUpdate = true; }
}

export const STUB_LENGTH = 10;

/** Dead-end stubs of a fork: both before the choice, the unchosen one after. */
function forkStubs(seg: Segment, c: { x: number; z: number; dir: { x: number; z: number } }, put: (x: number, z: number, dir: { x: number; z: number }) => void): void {
  const left = { x: c.dir.z, z: -c.dir.x }; const right = { x: -c.dir.z, z: c.dir.x };
  for (const [dir, name] of [[left, 'left'], [right, 'right']] as const) {
    if (seg.resolved && seg.turn === name) continue;
    for (let d = TRACK_HALF_WIDTH + SLAB / 2; d < TRACK_HALF_WIDTH + STUB_LENGTH; d += SLAB) put(c.x + dir.x * d, c.z + dir.z * d, dir);
  }
}
