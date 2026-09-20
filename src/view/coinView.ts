import * as THREE from 'three';
import type { Game } from '../core/game';
import { remoteSet } from './textures';

const MAX_COINS = 512;
let mesh: THREE.InstancedMesh;
let big: THREE.InstancedMesh;
const dummy = new THREE.Object3D();

export function initCoinView(scene: THREE.Scene): void {
  const geometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 24);
  geometry.rotateX(Math.PI / 2);
  // Groups: [side, top cap, bottom cap]. Caps carry the embossed sun-glyph coin face.
  const face = remoteSet('coin', 0xffd700);
  const rim = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.4, metalness: 0.9, roughness: 0.25 });
  const cap = new THREE.MeshStandardMaterial({ map: face.map, normalMap: face.normalMap, color: 0xffe8a0, emissive: 0xaa7700, emissiveIntensity: 0.35, metalness: 0.85, roughness: 0.3 });
  mesh = new THREE.InstancedMesh(geometry, [rim, cap, cap], MAX_COINS);
  mesh.count = 0;
  const bigGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.14, 28); bigGeo.rotateX(Math.PI / 2);
  const bigFace = remoteSet('coin-big', 0xffc040);
  const bigCap = new THREE.MeshStandardMaterial({ map: bigFace.map, normalMap: bigFace.normalMap, color: 0xffe0a0, emissive: 0xcc8800, emissiveIntensity: 0.45, metalness: 0.85, roughness: 0.3 });
  big = new THREE.InstancedMesh(bigGeo, [rim, bigCap, bigCap], 64);
  big.count = 0; big.frustumCulled = false; scene.add(big);
  scene.add(mesh);
  // The shared bounding sphere sits at the origin; culling would hide every instance once the camera moves away.
  mesh.frustumCulled = false;
}

export function updateCoinView(game: Game, timeMs: number): void {
  let i = 0; let b = 0;
  const spin = timeMs * 0.003;
  for (const c of game.spawner.coins) {
    if (c.collected) continue;
    for (const p of game.track.samplesAt(c.s, c.x, c.y)) {
      const target = c.value >= 5 ? big : mesh;
      const idx = c.value >= 5 ? b : i;
      if (idx >= (c.value >= 5 ? 64 : MAX_COINS)) break;
      dummy.position.set(p.x, p.y + (c.value >= 5 ? 0.7 : 0.4), p.z);
      dummy.rotation.set(0, spin * (c.value >= 5 ? 0.6 : 1) + c.id, 0);
      dummy.updateMatrix();
      target.setMatrixAt(idx, dummy.matrix);
      if (c.value >= 5) b++; else i++;
    }
  }
  mesh.count = i; mesh.instanceMatrix.needsUpdate = true;
  big.count = b; big.instanceMatrix.needsUpdate = true;
}
