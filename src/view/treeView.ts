import * as THREE from 'three';
import type { Game } from '../core/game';
import { TRACK_HALF_WIDTH } from '../core/track';
import { Biome } from './biome';
import { GROUND_Y } from './groundView';
import { pbrMaterial, textures } from './textures';
import { faceHeading } from './util';

/** Low-poly trees beside straight segments, seeded per segment so they stay put. */

const MAX = 256;
let trunks: THREE.InstancedMesh;
let canopies: THREE.InstancedMesh;
let canopiesAlt: THREE.InstancedMesh;
const dummy = new THREE.Object3D();
let density = 6;

const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function initTrees(scene: THREE.Scene, biome: Biome): void {
  density = biome.tree.density;
  const tex = textures();
  trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6), pbrMaterial(tex.bark, { color: 0xffffff }), MAX);
  // Canopies wear the (generated) leaf texture, tinted per variant.
  canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 3.6, 8), pbrMaterial(tex.leaves, { color: 0xd8e8d0 }), MAX);
  canopiesAlt = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 3.0, 7), pbrMaterial(tex.leaves2, { color: 0xd0e0c0 }), MAX);
  void biome;
  for (const m of [trunks, canopies, canopiesAlt]) { m.count = 0; m.frustumCulled = false; m.castShadow = false; scene.add(m); }
}

export function updateTrees(game: Game): void {
  let n = 0; let a = 0; let b = 0;
  for (const seg of game.track.allSegments()) {
    if (seg.kind !== 'straight') continue;
    for (let i = 0; i < density * 2 && n < MAX; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const r1 = hash(seg.id, i); const r2 = hash(seg.id, i + 100); const r3 = hash(seg.id, i + 200);
      const s = seg.s0 + 1 + r1 * (seg.length - 2);
      // Trees grow on the low ground beyond the cliff, never on the embankment itself.
      const lateral = side * (TRACK_HALF_WIDTH + 7 + r2 * 14);
      const scale = 1.6 + r3 * 1.6;
      const w = game.track.sampleSegment(seg, s, lateral);
      dummy.position.set(w.x, GROUND_Y + 1.1 * scale, w.z); dummy.scale.setScalar(scale); faceHeading(dummy, w.dir); dummy.rotation.y += r2 * 6;
      dummy.updateMatrix(); trunks.setMatrixAt(n++, dummy.matrix);
      dummy.position.y = GROUND_Y + (2.2 + 1.5) * scale; dummy.updateMatrix();
      if (r3 > 0.5) canopies.setMatrixAt(a++, dummy.matrix); else canopiesAlt.setMatrixAt(b++, dummy.matrix);
    }
  }
  trunks.count = n; canopies.count = a; canopiesAlt.count = b;
  for (const m of [trunks, canopies, canopiesAlt]) m.instanceMatrix.needsUpdate = true;
}
