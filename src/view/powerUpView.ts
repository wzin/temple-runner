import * as THREE from 'three';
import type { Game } from '../core/game';
import { POWERUP_KINDS, PowerUpKind } from '../core/powerups';
import { sprite } from './textures';

/** Spinning gem plus a camera-facing icon billboard above it (generated sprites). */

const MAX = 32;
const gems = new Map<PowerUpKind, THREE.InstancedMesh>();
const icons = new Map<PowerUpKind, THREE.InstancedMesh>();
const dummy = new THREE.Object3D();

const COLORS: Record<PowerUpKind, number> = { magnet: 0x3b82f6, shield: 0x5fd8ff, boost: 0xf97316 };
const ICON: Record<PowerUpKind, string> = { magnet: 'icon-magnet', shield: 'icon-shield', boost: 'icon-bolt' };

export function initPowerUpView(scene: THREE.Scene): void {
  for (const kind of POWERUP_KINDS) {
    const gem = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ color: COLORS[kind], emissive: COLORS[kind], emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3 }), MAX);
    const icon = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: sprite(ICON[kind]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), MAX);
    for (const m of [gem, icon]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
    gems.set(kind, gem); icons.set(kind, icon);
  }
}

export function updatePowerUpView(game: Game, timeMs: number, camera: THREE.Camera): void {
  const counts = new Map<PowerUpKind, number>();
  const camYaw = Math.atan2(camera.position.x - 0, camera.position.z - 0); // placeholder, replaced per instance below
  void camYaw;
  for (const p of game.spawner.powerUps) {
    if (p.taken) continue;
    let k = counts.get(p.kind) ?? 0;
    const gem = gems.get(p.kind)!; const icon = icons.get(p.kind)!;
    for (const w of game.track.samplesAt(p.s, p.x, p.y + Math.sin(timeMs * 0.004 + p.id) * 0.15)) {
      if (k >= MAX) break;
      dummy.position.set(w.x, w.y, w.z); dummy.rotation.set(timeMs * 0.001, timeMs * 0.0017 + p.id, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      gem.setMatrixAt(k, dummy.matrix);
      // Icon faces the camera.
      const yaw = Math.atan2(camera.position.x - w.x, camera.position.z - w.z);
      dummy.position.set(w.x, w.y + 1.0, w.z); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix();
      icon.setMatrixAt(k, dummy.matrix);
      k++;
    }
    counts.set(p.kind, k);
  }
  for (const kind of POWERUP_KINDS) {
    const n = counts.get(kind) ?? 0;
    for (const m of [gems.get(kind)!, icons.get(kind)!]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }
}
