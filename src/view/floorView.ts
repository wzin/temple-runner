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
let brokenEdge: THREE.InstancedMesh;
let wallBlocks: THREE.InstancedMesh[] = [];
const counts: number[] = [0, 0, 0];
const wallCounts: number[] = [0, 0, 0];
let nBroken = 0;
const WALL_H = 2; const WALL_T = 0.5;
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
  // Ragged slab at the lip of a gap: the gap-facing edge is torn back randomly.
  brokenEdge = new THREE.InstancedMesh(brokenSlabGeometry(), pbrMaterial(remoteSet('floor-broken', 0x807870, 1), { color: tint }), 64);
  brokenEdge.count = 0; brokenEdge.frustumCulled = false; scene.add(brokenEdge);
  // Walls of straight segments as 2 m blocks so gaps can cut them; four looks like trackView's.
  const wg = new THREE.BoxGeometry(WALL_T, WALL_H, SLAB);
  const wuv = wg.attributes.uv as THREE.BufferAttribute;
  const wsizes: [number, number][] = [[SLAB, WALL_H], [SLAB, WALL_H], [WALL_T, SLAB], [WALL_T, SLAB], [WALL_T, WALL_H], [WALL_T, WALL_H]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const idx = f * 4 + i; wuv.setXY(idx, wuv.getX(idx) * (wsizes[f][0] / 2), wuv.getY(idx) * (wsizes[f][1] / 2)); }
  wuv.needsUpdate = true;
  const wallTint = activeBiome().wallTint;
  const mk = (folder: string, t: number) => pbrMaterial(remoteSet(folder, 0x8a8088, 1), { color: t });
  wallBlocks = [
    new THREE.InstancedMesh(wg, pbrMaterial(textures().wall, { color: wallTint }), MAX),
    new THREE.InstancedMesh(wg, mk('wall-carved', 0xe0d8c8), MAX),
    new THREE.InstancedMesh(wg, mk('wall-mossy', 0xc8d8c0), MAX),
  ];
  for (const m of wallBlocks) { m.count = 0; m.frustumCulled = false; scene.add(m); }
}

/** A slab whose +z edge is jagged: vertices along that edge are pulled back and dropped a little. */
function brokenSlabGeometry(): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2, FLOOR_THICKNESS, SLAB, 8, 1, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > SLAB / 2 - 1e-6) {
      const r = segHash(Math.round(pos.getX(i) * 100), 7);
      pos.setZ(i, SLAB / 2 - 0.15 - r * 0.9);
      pos.setY(i, pos.getY(i) - r * 0.12);
    }
  }
  pos.needsUpdate = true; geo.computeVertexNormals();
  return geo;
}

/** Wall look per segment, matching trackView.wallFor. */
function wallVariantFor(segId: number): number {
  const r = segHash(segId, 77);
  return r < 0.6 ? 0 : r < 0.8 ? 1 : 2;
}

/** Floor look per segment: mostly the worn path, with broken and mossy stretches. */
function variantFor(segId: number): number {
  const r = segHash(segId, 91);
  return r < 0.6 ? 0 : r < 0.8 ? 1 : 2;
}

export function updateFloorView(game: Game): void {
  const gaps = game.spawner.obstacles.filter((o) => o.kind === 'gap');
  const holed = (s: number) => gaps.some((g) => s + SLAB / 2 > g.s0 + 1e-6 && s - SLAB / 2 < g.s1 - 1e-6);
  counts[0] = counts[1] = counts[2] = 0; wallCounts.fill(0); nBroken = 0;
  let variant = 0;
  /** Slab with per-slab imperfections: a little tilt and height noise, some sunk, looks mixed per slab. */
  const put = (x: number, z: number, dir: { x: number; z: number }, key = 0) => {
    const j = segHash(Math.round(x * 10), Math.round(z * 10) + key);
    const v = key === 0 ? variant : (j < 0.72 ? variant : j < 0.9 ? 1 : 2);
    if (counts[v] >= MAX) return;
    const sunk = j > 0.965 ? 0.12 : 0;
    dummy.position.set(x, -FLOOR_THICKNESS / 2 - sunk + (j - 0.5) * 0.05, z); dummy.scale.setScalar(1);
    faceHeading(dummy, dir);
    dummy.rotation.x += (segHash(Math.round(z * 10), 3) - 0.5) * 0.05;
    dummy.rotation.z += (segHash(Math.round(x * 10), 5) - 0.5) * 0.05;
    dummy.updateMatrix();
    slabVariants[v].setMatrixAt(counts[v]++, dummy.matrix);
  };
  const track = game.track;
  const gapEdge = (s: number): -1 | 1 | 0 => {
    for (const g of gaps) { if (Math.abs(s + SLAB / 2 - g.s0) < 1e-6) return 1; if (Math.abs(s - SLAB / 2 - g.s1) < 1e-6) return -1; }
    return 0;
  };
  const along = (seg: Segment, from: number, to: number) => {
    variant = variantFor(seg.id);
    const wv = wallVariantFor(seg.id);
    for (let s = from + SLAB / 2; s < to + 1e-6; s += SLAB) {
      if (holed(s)) continue;
      const w = track.sampleSegment(seg, s);
      const edge = gapEdge(s);
      if (edge !== 0 && nBroken < 64) {
        // Torn slab facing the gap (its jagged edge is +z locally, so flip when the gap is behind).
        dummy.position.set(w.x, -FLOOR_THICKNESS / 2, w.z); dummy.scale.setScalar(1); faceHeading(dummy, w.dir);
        if (edge === -1) dummy.rotation.y += Math.PI;
        dummy.updateMatrix(); brokenEdge.setMatrixAt(nBroken++, dummy.matrix);
      } else {
        put(w.x, w.z, w.dir, 1);
      }
      if (seg.kind === 'straight') {
        // Wall blocks on both sides; a gap cuts them too.
        for (const side of [-1, 1] as const) {
          if (wallCounts[wv] >= MAX) break;
          const ws = track.sampleSegment(seg, s, side * (TRACK_HALF_WIDTH + WALL_T / 2));
          dummy.position.set(ws.x, WALL_H / 2, ws.z); dummy.scale.setScalar(1); faceHeading(dummy, ws.dir); dummy.updateMatrix();
          wallBlocks[wv].setMatrixAt(wallCounts[wv]++, dummy.matrix);
        }
      }
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
  for (let i = 0; i < 3; i++) { wallBlocks[i].count = wallCounts[i]; wallBlocks[i].instanceMatrix.needsUpdate = true; }
  brokenEdge.count = nBroken; brokenEdge.instanceMatrix.needsUpdate = true;
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
