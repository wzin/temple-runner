import * as THREE from 'three';
import { sprite } from './textures';

/** A drifting cloud layer high above the track, following the camera in XZ. */
let layer: THREE.Mesh;
let mat: THREE.MeshBasicMaterial;
let canopy: THREE.Mesh;
let canopyMat: THREE.MeshBasicMaterial;
const wisps: THREE.Mesh[] = [];

export function initClouds(scene: THREE.Scene): void {
  const tex = sprite('clouds');
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, fog: false, side: THREE.DoubleSide });
  layer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat);
  layer.rotation.x = Math.PI / 2;
  layer.position.y = 95;
  layer.renderOrder = -4;
  scene.add(layer);
  // Jungle canopy: dark leaf silhouettes much lower, drifting slowly, breaking up the sky.
  const ctex = sprite('canopy'); ctex.wrapS = ctex.wrapT = THREE.RepeatWrapping; ctex.repeat.set(3, 3);
  canopyMat = new THREE.MeshBasicMaterial({ map: ctex, transparent: true, opacity: 0.85, depthWrite: false, fog: false, side: THREE.DoubleSide, color: 0x233522 });
  canopy = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), canopyMat);
  canopy.rotation.x = Math.PI / 2; canopy.position.y = 42; canopy.renderOrder = -3;
  scene.add(canopy);
  // Ground mist: a few large wisps floating over the low land.
  const wmat = new THREE.MeshBasicMaterial({ map: sprite('fog-wisp'), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), wmat); w.renderOrder = 2; wisps.push(w); scene.add(w); }
}

export function updateClouds(camera: THREE.Camera, timeMs: number): void {
  layer.position.x = camera.position.x;
  layer.position.z = camera.position.z;
  canopy.position.x = camera.position.x; canopy.position.z = camera.position.z;
  canopyMat.map!.offset.set(camera.position.x / 700 * 3 + timeMs * 0.000003, camera.position.z / 700 * 3);
  wisps.forEach((w, i) => {
    const a = i * 1.05 + timeMs * 0.00004; const r = 45 + (i % 3) * 25;
    w.position.set(camera.position.x + Math.sin(a) * r, -14 + 2.5 + Math.sin(timeMs * 0.0003 + i) * 0.8, camera.position.z + Math.cos(a) * r);
    w.rotation.set(0, Math.atan2(camera.position.x - w.position.x, camera.position.z - w.position.z), 0);
  });
  const tex = mat.map!;
  tex.offset.set(camera.position.x / 900 * 2 + timeMs * 0.000006, camera.position.z / 900 * 2 + timeMs * 0.000004);
}
