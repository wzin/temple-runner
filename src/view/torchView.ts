import * as THREE from 'three';
import type { Game } from '../core/game';
import { Segment, TRACK_HALF_WIDTH, Track } from '../core/track';
import { flameMaterial } from './flameMaterial';
import { pbrMaterial, remoteSet, sprite } from './textures';
import { faceHeading } from './util';

/** Wall torches as four instanced meshes (handle, bowl, flame, glow), rebuilt per frame from the live segments. */

const MAX = 128;
const SPACING = 10;
let handle: THREE.InstancedMesh; let bowl: THREE.InstancedMesh; let flame: THREE.InstancedMesh; let flame2: THREE.InstancedMesh; let glow: THREE.InstancedMesh; let soot: THREE.InstancedMesh;
const dummy = new THREE.Object3D();
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function initTorches(scene: THREE.Scene): void {
  handle = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.9 }), MAX);
  bowl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.1, 0.18, 8), pbrMaterial(remoteSet('bronze', 0x8a6a3a), { metalness: 0.7 }), MAX);
  // Procedural shader flame on two crossed quads (see flameMaterial.ts).
  const flameMat = flameMaterial({ scale: 1.0, speed: 1.3 });
  flame = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 1.0), flameMat, MAX);
  flame2 = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.6, 1.0), flameMat, MAX);
  glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }), MAX);
  soot = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 1.6), new THREE.MeshBasicMaterial({ map: sprite('soot'), transparent: true, depthWrite: false, opacity: 0.85, side: THREE.DoubleSide }), MAX);
  for (const m of [handle, bowl, flame, flame2, glow, soot]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
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
      dummy.position.y = 2.5; dummy.scale.set(1, flicker, 1); dummy.updateMatrix();
      flame.setMatrixAt(n, dummy.matrix);
      dummy.rotation.y += Math.PI / 2; dummy.updateMatrix(); flame2.setMatrixAt(n, dummy.matrix); dummy.rotation.y -= Math.PI / 2;
      dummy.scale.setScalar(0.9 + flicker * 0.1); dummy.position.y = 2.25; dummy.updateMatrix();
      glow.setMatrixAt(n, dummy.matrix);
      // Soot stain on the wall behind the flame.
      dummy.position.set(w.x + right.x * (-spot.side * 0.02), 2.9, w.z + right.z * (-spot.side * 0.02)); dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, Math.atan2(-spot.side * right.x, -spot.side * right.z), 0); dummy.updateMatrix();
      soot.setMatrixAt(n, dummy.matrix);
      n++;
    }
  }
  for (const m of [handle, bowl, flame, flame2, glow, soot]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
}
