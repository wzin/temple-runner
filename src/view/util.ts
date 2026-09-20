import * as THREE from 'three';
import type { Sample, Vec2 } from '../core/track';

/** Yaw that maps local +z onto a track heading. */
export function yawOf(dir: Vec2): number {
  return Math.atan2(dir.x, dir.z);
}

/** Orient an object so its local +z points along a track heading (pure yaw, no roll/pitch). */
export function faceHeading(obj: THREE.Object3D, dir: Vec2): void {
  obj.rotation.set(0, yawOf(dir), 0);
}

export function placeAt(obj: THREE.Object3D, p: Sample, yOffset = 0): void {
  obj.position.set(p.x, p.y + yOffset, p.z);
  faceHeading(obj, p.dir);
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
}

/** Exponential smoothing factor that is frame-rate independent. */
export function smooth(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
