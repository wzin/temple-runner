import * as THREE from 'three';
import { sprite } from './textures';
import { mistPatches } from './modelView';

const PATCH_MAX = 160;
let patches: THREE.InstancedMesh;
const dummy = new THREE.Object3D();

/** A drifting cloud layer high above the track, following the camera in XZ. */
const wisps: THREE.Mesh[] = [];

export function initClouds(scene: THREE.Scene): void {
  // The sky panorama carries the clouds; a separate cloud sheet read as a hanging texture, so there is none.
  // Ground mist: a few large wisps floating over the low land.
  const wmat = new THREE.MeshBasicMaterial({ map: sprite('fog-wisp'), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(70, 22), wmat); w.renderOrder = 2; wisps.push(w); scene.add(w); }
  // Low mist pooled around the ruin clusters on the low ground, so they read as one place rather than scattered props.
  const pmat = new THREE.MeshBasicMaterial({ map: sprite('fog-wisp'), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  patches = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.32), pmat, PATCH_MAX);
  patches.count = 0; patches.frustumCulled = false; patches.renderOrder = 2;
  scene.add(patches);
}

export function updateClouds(camera: THREE.Camera, timeMs: number): void {
  wisps.forEach((w, i) => {
    const a = i * 0.52 + timeMs * 0.00004; const r = 40 + (i % 4) * 22;
    w.position.set(camera.position.x + Math.sin(a) * r, -14 + 2.5 + Math.sin(timeMs * 0.0003 + i) * 0.8, camera.position.z + Math.cos(a) * r);
    w.rotation.set(0, Math.atan2(camera.position.x - w.position.x, camera.position.z - w.position.z), 0);
  });
  let n = 0;
  for (const m of mistPatches) {
    if (n >= PATCH_MAX) break;
    // Two crossed camera-facing sheets per cluster, slowly breathing.
    const breathe = 1 + Math.sin(timeMs * 0.0004 + m.seed) * 0.12;
    const yaw = Math.atan2(camera.position.x - m.x, camera.position.z - m.z);
    for (const k of [0, 1]) {
      if (n >= PATCH_MAX) break;
      dummy.position.set(m.x + (k ? Math.sin(m.seed) * 2 : 0), -14 + 1.6 + k * 0.6, m.z + (k ? Math.cos(m.seed) * 2 : 0));
      dummy.rotation.set(0, yaw + (k ? 0.9 : -0.4), 0); dummy.scale.set(m.r * 2.6 * breathe, m.r * 2.2, 1); dummy.updateMatrix();
      patches.setMatrixAt(n++, dummy.matrix);
    }
  }
  patches.count = n; patches.instanceMatrix.needsUpdate = true;
}
