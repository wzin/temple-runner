import * as THREE from 'three';
import type { Game } from '../core/game';
import { OBSTACLES, ObstacleKind } from '../core/spawner';
import { pbrMaterial, textures } from './textures';
import { faceHeading } from './util';

const MAX_PER_KIND = 64;
const PIT_DEPTH = 8;
const meshes = new Map<ObstacleKind, THREE.InstancedMesh>();
let gapRims: THREE.InstancedMesh;
let gapVeils: THREE.InstancedMesh; // translucent bridges shown over gaps while the runner cannot fall
const dummy = new THREE.Object3D();
const GAP_WIDTH = 6.2;

const LOOKS: Record<ObstacleKind, { color: number; emissive?: number; emissiveIntensity?: number }> = {
  fire: { color: 0xff6b1a, emissive: 0xff3300, emissiveIntensity: 0.6 },
  log: { color: 0xa8723a },
  branch: { color: 0x5aa04e },
  // A gap glows violet from below so it reads as a hole in the dark floor, not as more floor.
  gap: { color: 0x0a0614, emissive: 0x2a0f55, emissiveIntensity: 0.35 },
};

export function initObstacleView(scene: THREE.Scene): void {
  for (const kind of Object.keys(OBSTACLES) as ObstacleKind[]) {
    const spec = OBSTACLES[kind];
    const width = spec.lane ? 2 : GAP_WIDTH;
    // The floor slabs over a gap are not drawn (floorView); this is the dark pit below the hole.
    const height = kind === 'gap' ? PIT_DEPTH : spec.y1 - spec.y0;
    const geometry = kind === 'log'
      ? new THREE.CylinderGeometry(height / 2, height / 2, width, 12).rotateZ(Math.PI / 2)
      : new THREE.BoxGeometry(width, height, spec.depth);
    const look = LOOKS[kind];
    const tex = textures();
    const maps = kind === 'log' ? tex.bark : kind === 'branch' ? tex.leaves : null;
    const material = maps
      ? pbrMaterial(maps)
      : new THREE.MeshStandardMaterial({ color: look.color, emissive: look.emissive ?? 0x000000, emissiveIntensity: look.emissiveIntensity ?? 0, roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_PER_KIND);
    mesh.count = 0;
    mesh.castShadow = kind !== 'gap';
    // The shared bounding sphere sits at the origin; culling would hide every instance once the camera moves away.
    mesh.frustumCulled = false;
    meshes.set(kind, mesh);
    scene.add(mesh);
  }
  // Glowing rims on the near and far edge of every gap, so the hole is readable from a distance.
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb000, emissiveIntensity: 1.4 });
  gapRims = new THREE.InstancedMesh(new THREE.BoxGeometry(GAP_WIDTH, 0.16, 0.3), rimMaterial, MAX_PER_KIND * 2);
  gapRims.count = 0;
  gapRims.frustumCulled = false;
  scene.add(gapRims);
  const veilMaterial = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  gapVeils = new THREE.InstancedMesh(new THREE.BoxGeometry(GAP_WIDTH, 0.06, 1), veilMaterial, MAX_PER_KIND);
  gapVeils.count = 0;
  gapVeils.frustumCulled = false;
  scene.add(gapVeils);
}

export function updateObstacleView(game: Game, timeMs: number): void {
  const counts = new Map<ObstacleKind, number>();
  let rims = 0; let veils = 0;
  for (const o of game.spawner.obstacles) {
    if (o.kind === 'gap' && game.invulnerable && veils < MAX_PER_KIND) {
      const m = game.track.sample((o.s0 + o.s1) / 2, (o.x0 + o.x1) / 2);
      dummy.position.set(m.x, 0.04, m.z);
      faceHeading(dummy, m.dir);
      dummy.scale.set(1, 1 + Math.sin(timeMs * 0.01) * 0.3, o.s1 - o.s0);
      dummy.updateMatrix();
      gapVeils.setMatrixAt(veils++, dummy.matrix);
    }
    if (o.kind === 'gap' && rims + 2 <= MAX_PER_KIND * 2) {
      for (const edge of [o.s0, o.s1]) {
        const e = game.track.sample(edge, (o.x0 + o.x1) / 2);
        dummy.position.set(e.x, 0.06, e.z);
        faceHeading(dummy, e.dir);
        dummy.scale.set(1, 1 + Math.sin(timeMs * 0.006) * 0.3, 1);
        dummy.updateMatrix();
        gapRims.setMatrixAt(rims++, dummy.matrix);
      }
    }
    const mesh = meshes.get(o.kind)!;
    const i = counts.get(o.kind) ?? 0;
    if (i >= MAX_PER_KIND) continue;
    const spec = OBSTACLES[o.kind];
    const p = game.track.sample((o.s0 + o.s1) / 2, (o.x0 + o.x1) / 2);
    const y = o.kind === 'gap' ? -0.55 - PIT_DEPTH / 2 : (spec.y0 + spec.y1) / 2;
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
  gapRims.count = rims;
  gapRims.instanceMatrix.needsUpdate = true;
  gapVeils.count = veils;
  gapVeils.instanceMatrix.needsUpdate = true;
}
