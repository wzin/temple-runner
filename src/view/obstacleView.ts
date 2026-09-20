import * as THREE from 'three';
import type { Game } from '../core/game';
import { OBSTACLES, ObstacleKind } from '../core/spawner';
import { faceHeading } from './util';

const MAX_PER_KIND = 64;
const meshes = new Map<ObstacleKind, THREE.InstancedMesh>();
const dummy = new THREE.Object3D();

const LOOKS: Record<ObstacleKind, { color: number; emissive?: number }> = {
  fire: { color: 0xff6b1a, emissive: 0xff3300 },
  log: { color: 0x8b5a2b },
  branch: { color: 0x3f7d3a },
  gap: { color: 0x05070d },
};

export function initObstacleView(scene: THREE.Scene): void {
  for (const kind of Object.keys(OBSTACLES) as ObstacleKind[]) {
    const spec = OBSTACLES[kind];
    const width = spec.lane ? 2 : 6.2;
    const height = kind === 'gap' ? 0.6 : spec.y1 - spec.y0;
    const geometry = kind === 'log'
      ? new THREE.CylinderGeometry(height / 2, height / 2, width, 12).rotateZ(Math.PI / 2)
      : new THREE.BoxGeometry(width, height, spec.depth);
    const look = LOOKS[kind];
    const material = new THREE.MeshStandardMaterial({ color: look.color, emissive: look.emissive ?? 0x000000, emissiveIntensity: look.emissive ? 0.6 : 0, roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_PER_KIND);
    mesh.count = 0;
    mesh.castShadow = kind !== 'gap';
    // The shared bounding sphere sits at the origin; culling would hide every instance once the camera moves away.
    mesh.frustumCulled = false;
    meshes.set(kind, mesh);
    scene.add(mesh);
  }
}

export function updateObstacleView(game: Game, timeMs: number): void {
  const counts = new Map<ObstacleKind, number>();
  for (const o of game.spawner.obstacles) {
    const mesh = meshes.get(o.kind)!;
    const i = counts.get(o.kind) ?? 0;
    if (i >= MAX_PER_KIND) continue;
    const spec = OBSTACLES[o.kind];
    const p = game.track.sample((o.s0 + o.s1) / 2, (o.x0 + o.x1) / 2);
    const y = o.kind === 'gap' ? -0.3 - 0.5 : (spec.y0 + spec.y1) / 2;
    dummy.position.set(p.x, y, p.z);
    faceHeading(dummy, p.dir);
    if (o.kind === 'fire') {
      const flicker = 1 + Math.sin(timeMs * 0.02 + o.id) * 0.08;
      dummy.scale.set(1, flicker, 1);
    } else {
      dummy.scale.set(1, 1, 1);
    }
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    counts.set(o.kind, i + 1);
  }
  for (const [kind, mesh] of meshes) {
    mesh.count = counts.get(kind) ?? 0;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
