import * as THREE from 'three';
import type { Game } from '../core/game';
import { TRACK_HALF_WIDTH } from '../core/track';
import { pbrMaterial, remoteSet, sprite } from './textures';
import { faceHeading } from './util';

/**
 * Decals rebuilt per frame from the live segments:
 *  - carved relief band along both walls of every straight (generated PBR strip)
 *  - stone arrow glyphs on corner plates (one for a turn, two for a fork)
 */

const MAX = 128;
let reliefs: THREE.InstancedMesh;
let arrows: THREE.InstancedMesh;
const dummy = new THREE.Object3D();
const RELIEF_Y = 1.45;
const RELIEF_H = 0.6;

export function initDecals(scene: THREE.Scene): void {
  const relief = remoteSet('relief', 0x6a6060);
  for (const t of [relief.map, relief.normalMap, relief.roughnessMap]) t.repeat.set(5, 1);
  reliefs = new THREE.InstancedMesh(new THREE.PlaneGeometry(20, RELIEF_H), pbrMaterial(relief, { color: 0xd8d0c8, polygonOffset: true, polygonOffsetFactor: -1 }), MAX);
  arrows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: sprite('arrow'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX);
  for (const m of [reliefs, arrows]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
}

export function updateDecals(game: Game, timeMs: number): void {
  const track = game.track;
  let nR = 0; let nA = 0;
  for (const seg of track.allSegments()) {
    if (seg.kind === 'straight') {
      for (const side of [-1, 1] as const) {
        if (nR >= MAX) break;
        const w = track.sampleSegment(seg, seg.s0 + seg.length / 2, side * (TRACK_HALF_WIDTH - 0.03));
        dummy.position.set(w.x, RELIEF_Y, w.z);
        // Plane faces +z locally; rotate so it faces into the corridor.
        const right = { x: -w.dir.z, z: w.dir.x };
        dummy.rotation.set(0, Math.atan2(-side * right.x, -side * right.z), 0);
        dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        reliefs.setMatrixAt(nR++, dummy.matrix);
      }
      continue;
    }
    const corner = track.cornerOf(seg);
    const c = track.sampleSegment(seg, corner - 1e-6);
    const dirs = seg.fork && !seg.resolved
      ? [{ x: c.dir.z, z: -c.dir.x }, { x: -c.dir.z, z: c.dir.x }]
      : [seg.outDir];
    for (const d of dirs) {
      if (nA >= MAX) break;
      const pulse = 1 + Math.sin(timeMs * 0.004) * 0.05;
      dummy.position.set(c.x + d.x * 0.2, 0.08, c.z + d.z * 0.2);
      dummy.rotation.set(-Math.PI / 2, 0, 0);      // lie flat
      dummy.rotateZ(-Math.atan2(d.x, -d.z));        // sprite arrow points "up" (−z after lying flat) → align with d
      dummy.scale.set(pulse, pulse, 1); dummy.updateMatrix();
      arrows.setMatrixAt(nA++, dummy.matrix);
    }
  }
  reliefs.count = nR; reliefs.instanceMatrix.needsUpdate = true;
  arrows.count = nA; arrows.instanceMatrix.needsUpdate = true;
}

export { faceHeading as _fh };
