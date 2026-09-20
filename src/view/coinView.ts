import * as THREE from 'three';
import type { Game } from '../core/game';

const MAX_COINS = 512;
let mesh: THREE.InstancedMesh;
const dummy = new THREE.Object3D();

export function initCoinView(scene: THREE.Scene): void {
  const geometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.2 });
  mesh = new THREE.InstancedMesh(geometry, material, MAX_COINS);
  mesh.count = 0;
  scene.add(mesh);
}

export function updateCoinView(game: Game, timeMs: number): void {
  let i = 0;
  const spin = timeMs * 0.003;
  for (const c of game.spawner.coins) {
    if (c.collected || i >= MAX_COINS) continue;
    const p = game.track.sample(c.s, c.x, c.y);
    dummy.position.set(p.x, p.y + 0.4, p.z);
    dummy.rotation.set(0, spin + c.id, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i++, dummy.matrix);
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
}
