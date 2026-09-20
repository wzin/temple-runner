import * as THREE from 'three';
import type { Game } from '../core/game';
import { POWERUP_KINDS, PowerUpKind } from '../core/powerups';
import { pbrMaterial, remoteSet, sprite, textures } from './textures';

/** Spinning gem plus a camera-facing icon billboard above it (generated sprites). */

const MAX = 32;
const gems = new Map<PowerUpKind, THREE.InstancedMesh>();
const icons = new Map<PowerUpKind, THREE.InstancedMesh>();
const dummy = new THREE.Object3D();

const ICON: Record<PowerUpKind, string> = { magnet: 'icon-magnet', shield: 'icon-shield', boost: 'icon-bolt' };

export function initPowerUpView(scene: THREE.Scene): void {
  // Artefacts: an iron horseshoe (magnet), a gold sun disc (shield), a condor feather (boost).
  const shells: Record<PowerUpKind, () => THREE.InstancedMesh> = {
    magnet: () => new THREE.InstancedMesh(new THREE.TorusGeometry(0.32, 0.11, 8, 14, Math.PI * 1.5).rotateZ(-Math.PI * 0.75), pbrMaterial(remoteSet('iron', 0x444448), { emissive: 0x3b82f6, emissiveIntensity: 0.25, metalness: 0.8 }), MAX),
    shield: () => new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24).rotateX(Math.PI / 2), pbrMaterial(textures().glyph, { color: 0xffe0a0, emissive: 0x5fd8ff, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.35 }), MAX),
    boost: () => new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 1.1, 6).rotateZ(0.5), pbrMaterial(remoteSet('feather', 0x222222), { emissive: 0xf97316, emissiveIntensity: 0.3 }), MAX),
  };
  for (const kind of POWERUP_KINDS) {
    const gem = shells[kind]();
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
