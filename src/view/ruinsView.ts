import * as THREE from 'three';
import { GROUND_Y } from './groundView';
import { sprite } from './textures';
import { activeBiome } from './biome';

/** Distant temple ruins on the skyline: four billboards ringing the camera at a fixed distance, tinted towards the fog. */

const DIST = 190;
let ring: THREE.Group;

export function initRuins(scene: THREE.Scene): void {
  ring = new THREE.Group();
  const fog = new THREE.Color(activeBiome().fog.color);
  const mat = new THREE.MeshBasicMaterial({ map: sprite('ruins'), transparent: true, depthWrite: false, fog: false, color: fog.clone().lerp(new THREE.Color(0xffffff), 0.35), opacity: 0.9 });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 86), mat);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    m.position.set(Math.sin(a) * DIST, GROUND_Y + 30, Math.cos(a) * DIST);
    m.lookAt(0, GROUND_Y + 30, 0);
    ring.add(m);
  }
  ring.renderOrder = -5;
  scene.add(ring);
}

export function updateRuins(camera: THREE.Camera): void {
  ring.position.set(camera.position.x, 0, camera.position.z);
}
