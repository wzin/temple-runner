import * as THREE from 'three';
import { sprite } from './textures';

/** A drifting cloud layer high above the track, following the camera in XZ. */
const wisps: THREE.Mesh[] = [];

export function initClouds(scene: THREE.Scene): void {
  // The sky panorama carries the clouds; a separate cloud sheet read as a hanging texture, so there is none.
  // Ground mist: a few large wisps floating over the low land.
  const wmat = new THREE.MeshBasicMaterial({ map: sprite('fog-wisp'), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), wmat); w.renderOrder = 2; wisps.push(w); scene.add(w); }
}

export function updateClouds(camera: THREE.Camera, timeMs: number): void {
  wisps.forEach((w, i) => {
    const a = i * 1.05 + timeMs * 0.00004; const r = 45 + (i % 3) * 25;
    w.position.set(camera.position.x + Math.sin(a) * r, -14 + 2.5 + Math.sin(timeMs * 0.0003 + i) * 0.8, camera.position.z + Math.cos(a) * r);
    w.rotation.set(0, Math.atan2(camera.position.x - w.position.x, camera.position.z - w.position.z), 0);
  });
}
