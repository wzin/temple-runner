import * as THREE from 'three';
import type { Game } from '../core/game';
import { TRACK_HALF_WIDTH } from '../core/track';
import { GROUND_Y } from './groundView';
import { pbrMaterial, remoteSet, sprite } from './textures';
import { faceHeading } from './util';

/** Ground dressing on the low land: boulders, fallen columns, ferns and bushes, seeded per segment. */

const MAX = 256;
let rocks: THREE.InstancedMesh; let columns: THREE.InstancedMesh; let ferns: THREE.InstancedMesh; let bushes: THREE.InstancedMesh;
const dummy = new THREE.Object3D();
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function initProps(scene: THREE.Scene): void {
  rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.2, 1), pbrMaterial(remoteSet('rock', 0x777777)), MAX);
  const col = remoteSet('column', 0xb0a090); for (const t of [col.map, col.normalMap, col.roughnessMap]) t.repeat.set(2, 1);
  columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.6, 5, 12).rotateZ(Math.PI / 2), pbrMaterial(col), MAX / 4);
  const leafy = (name: string) => new THREE.MeshBasicMaterial({ map: sprite(name), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  ferns = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2), leafy('fern'), MAX);
  bushes = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 3), leafy('bush'), MAX);
  for (const m of [rocks, columns, ferns, bushes]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
}

export function updateProps(game: Game, camera: THREE.Camera): void {
  let nR = 0; let nC = 0; let nF = 0; let nB = 0;
  const track = game.track;
  for (const seg of track.allSegments()) {
    if (seg.kind !== 'straight') continue;
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const r1 = hash(seg.id, 300 + i); const r2 = hash(seg.id, 400 + i); const r3 = hash(seg.id, 500 + i); const kind = hash(seg.id, 600 + i);
      const s = seg.s0 + 1 + r1 * (seg.length - 2);
      const lateral = side * (TRACK_HALF_WIDTH + 6 + r2 * 18);
      const w = track.sampleSegment(seg, s, lateral);
      if (kind < 0.25 && nR < MAX) {
        const sc = 0.6 + r3 * 1.2;
        dummy.position.set(w.x, GROUND_Y + 0.6 * sc, w.z); dummy.rotation.set(r1 * 3, r2 * 6, r3 * 3); dummy.scale.setScalar(sc); dummy.updateMatrix();
        rocks.setMatrixAt(nR++, dummy.matrix);
      } else if (kind < 0.32 && nC < MAX / 4) {
        dummy.position.set(w.x, GROUND_Y + 0.6, w.z); dummy.rotation.set(0, r2 * 6.28, 0.05); dummy.scale.setScalar(1); dummy.updateMatrix();
        columns.setMatrixAt(nC++, dummy.matrix);
      } else if (kind < 0.66 && nF < MAX) {
        const yaw = Math.atan2(camera.position.x - w.x, camera.position.z - w.z);
        dummy.position.set(w.x, GROUND_Y + 1.0, w.z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(0.8 + r3 * 0.6); dummy.updateMatrix();
        ferns.setMatrixAt(nF++, dummy.matrix);
      } else if (nB < MAX) {
        const yaw = Math.atan2(camera.position.x - w.x, camera.position.z - w.z);
        dummy.position.set(w.x, GROUND_Y + 1.4, w.z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(0.8 + r3 * 0.8); dummy.updateMatrix();
        bushes.setMatrixAt(nB++, dummy.matrix);
      }
    }
  }
  const flush = (m: THREE.InstancedMesh, n: number) => { m.count = n; m.instanceMatrix.needsUpdate = true; };
  flush(rocks, nR); flush(columns, nC); flush(ferns, nF); flush(bushes, nB);
}

export { faceHeading as _fh2 };
