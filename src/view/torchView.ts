import * as THREE from 'three';
import type { Game } from '../core/game';
import { Segment, TRACK_HALF_WIDTH, Track } from '../core/track';
import { faceHeading } from './util';

/** Wall torches as four instanced meshes (handle, bowl, flame, glow), rebuilt per frame from the live segments. */

const MAX = 128;
const SPACING = 10;
let handle: THREE.InstancedMesh; let bowl: THREE.InstancedMesh; let flame: THREE.InstancedMesh; let glow: THREE.InstancedMesh;
const dummy = new THREE.Object3D();
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function initTorches(scene: THREE.Scene): void {
  handle = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.9 }), MAX);
  bowl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.1, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0x6b6b70, metalness: 0.6, roughness: 0.4 }), MAX);
  flame = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 0.45, 7), new THREE.MeshStandardMaterial({ color: 0xffa030, emissive: 0xff6a00, emissiveIntensity: 1.8 }), MAX);
  glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }), MAX);
  for (const m of [handle, bowl, flame, glow]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
}

/** Positions of torches for a segment: every SPACING m on alternating walls, 20% skipped; turns get one on the outer wall. */
export function* torchSpots(track: Track, seg: Segment): Generator<{ s: number; side: -1 | 1 }> {
  if (seg.kind === 'straight') {
    for (let s = seg.s0 + 5; s < seg.s0 + seg.length; s += SPACING) {
      if (hash(seg.id, Math.round(s)) < 0.2) continue;
      yield { s, side: Math.round(s / SPACING) % 2 === 0 ? -1 : 1 };
    }
  } else if (seg.fork) {
    yield { s: seg.s0 + 4, side: -1 }; yield { s: seg.s0 + 4, side: 1 };
  } else {
    yield { s: seg.s0 + 4, side: seg.turn === 'left' ? 1 : -1 };
  }
  void track;
}

export function updateTorches(game: Game, timeMs: number): void {
  let n = 0;
  const track = game.track;
  for (const seg of track.allSegments()) {
    for (const spot of torchSpots(track, seg)) {
      if (n >= MAX) break;
      const w = track.sampleSegment(seg, spot.s, spot.side * (TRACK_HALF_WIDTH - 0.05));
      const right = { x: -w.dir.z, z: w.dir.x };
      const off = -spot.side * 0.22;
      // handle, tilted toward the track
      dummy.position.set(w.x + right.x * (-spot.side * 0.1), 1.5, w.z + right.z * (-spot.side * 0.1));
      faceHeading(dummy, w.dir); dummy.rotation.z = spot.side * 0.35; dummy.scale.setScalar(1); dummy.updateMatrix();
      handle.setMatrixAt(n, dummy.matrix);
      dummy.position.set(w.x + right.x * off, 1.9, w.z + right.z * off); dummy.rotation.z = 0; dummy.updateMatrix();
      bowl.setMatrixAt(n, dummy.matrix);
      const flicker = 1 + Math.sin(timeMs * 0.02 + seg.id + spot.s) * 0.12;
      dummy.position.y = 2.22; dummy.scale.set(1, flicker, 1); dummy.updateMatrix();
      flame.setMatrixAt(n, dummy.matrix);
      dummy.scale.setScalar(0.9 + flicker * 0.1); dummy.updateMatrix();
      glow.setMatrixAt(n, dummy.matrix);
      n++;
    }
  }
  for (const m of [handle, bowl, flame, glow]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
}
