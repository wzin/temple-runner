import * as THREE from 'three';
import type { Game } from '../core/game';
import { POWERUP_KINDS, PowerUpKind } from '../core/powerups';

const MAX = 32;
const meshes = new Map<PowerUpKind, THREE.InstancedMesh>();
const dummy = new THREE.Object3D();

const COLORS: Record<PowerUpKind, number> = { magnet: 0x3b82f6, shield: 0x5fd8ff, boost: 0xf97316 };

export function initPowerUpView(scene: THREE.Scene): void {
  for (const kind of POWERUP_KINDS) {
    const material = new THREE.MeshStandardMaterial({ color: COLORS[kind], emissive: COLORS[kind], emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.3 });
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.45, 0), material, MAX);
    mesh.count = 0;
    mesh.frustumCulled = false;
    meshes.set(kind, mesh);
    scene.add(mesh);
  }
}

export function updatePowerUpView(game: Game, timeMs: number): void {
  const counts = new Map<PowerUpKind, number>();
  for (const p of game.spawner.powerUps) {
    if (p.taken) continue;
    const mesh = meshes.get(p.kind)!;
    const i = counts.get(p.kind) ?? 0;
    if (i >= MAX) continue;
    let k = i;
    for (const w of game.track.samplesAt(p.s, p.x, p.y + Math.sin(timeMs * 0.004 + p.id) * 0.15)) {
      if (k >= MAX) break;
      dummy.position.set(w.x, w.y, w.z);
      dummy.rotation.set(timeMs * 0.001, timeMs * 0.0017 + p.id, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(k++, dummy.matrix);
    }
    counts.set(p.kind, k);
  }
  for (const [kind, mesh] of meshes) {
    mesh.count = counts.get(kind) ?? 0;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
