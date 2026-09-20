import * as THREE from 'three';
import type { Game } from '../core/game';
import { OBSTACLES, ObstacleKind } from '../core/spawner';
import { flameMaterial } from './flameMaterial';
import { pbrMaterial, remoteSet, sprite, textures } from './textures';
import { faceHeading } from './util';

/**
 * Obstacles as instanced meshes placed from track coordinates each frame.
 *  fire   – two crossed flame billboards (generated sprite), additive, flickering
 *  log    – bark cylinder with tree-ring end caps
 *  branch – bark trunk higher up plus three leaf puffs
 *  gap    – open pit seen from inside: stone walls, glowing lava floor
 */

const MAX = 64;
const PIT_DEPTH = 8;
const GAP_WIDTH = 6.2;
const dummy = new THREE.Object3D();

let fireA: THREE.InstancedMesh; let fireB: THREE.InstancedMesh; let fireC: THREE.InstancedMesh;
let logs: THREE.InstancedMesh;
let branches: THREE.InstancedMesh; let puffs: THREE.InstancedMesh;
let pits: THREE.InstancedMesh;
let gapRims: THREE.InstancedMesh;
let gapVeils: THREE.InstancedMesh;

export function initObstacleView(scene: THREE.Scene): void {
  const tex = textures();
  const add = (m: THREE.InstancedMesh) => { m.count = 0; m.frustumCulled = false; scene.add(m); return m; };

  // Fire: 2.4 m wide, 1.8 m tall quads, crossed at 90°, additive so the sprite's black is invisible.
  const fireMat = new THREE.MeshBasicMaterial({ map: sprite('fire'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  fireA = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 1.8), fireMat, MAX));
  fireB = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 1.8), fireMat, MAX));
  fireC = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 2.2), flameMaterial({ scale: 0.8, speed: 1.1 }), MAX));

  const logSpec = OBSTACLES.log; const logR = (logSpec.y1 - logSpec.y0) / 2;
  const logGeo = new THREE.CylinderGeometry(logR, logR, GAP_WIDTH, 14).rotateZ(Math.PI / 2); // groups: side, cap, cap
  const barkMat = pbrMaterial(tex.bark); for (const t of [tex.bark.map, tex.bark.normalMap, tex.bark.roughnessMap]) t.repeat.set(3, 1);
  const logEnd = remoteSet('log-end', 0xc9a877);
  const capMat = pbrMaterial(logEnd);
  logs = add(new THREE.InstancedMesh(logGeo, [barkMat, capMat, capMat], MAX));
  logs.castShadow = false;

  const brSpec = OBSTACLES.branch;
  const branchGeo = new THREE.CylinderGeometry(0.22, 0.28, GAP_WIDTH, 10).rotateZ(Math.PI / 2);
  branches = add(new THREE.InstancedMesh(branchGeo, [barkMat, capMat, capMat], MAX));
  puffs = add(new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 10, 8), pbrMaterial(tex.leaves, { color: 0xd0e0c0 }), MAX * 3));
  void brSpec;

  // Pit: BoxGeometry groups [+x, -x, +y, -y, +z, -z]; back faces only, so the camera looks into it.
  const stone = pbrMaterial(tex.cliff, { color: 0x4a4a52, side: THREE.BackSide });
  const lavaSet = remoteSet('lava', 0xff5a10);
  const lava = pbrMaterial(lavaSet, { color: 0xffffff, emissive: 0xff6a20, emissiveIntensity: 1.2, side: THREE.BackSide });
  const none = new THREE.MeshBasicMaterial({ visible: false });
  pits = add(new THREE.InstancedMesh(new THREE.BoxGeometry(GAP_WIDTH, PIT_DEPTH, OBSTACLES.gap.depth), [stone, stone, none, lava, stone, stone], MAX));

  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb000, emissiveIntensity: 1.4 });
  gapRims = add(new THREE.InstancedMesh(new THREE.BoxGeometry(GAP_WIDTH, 0.16, 0.3), rimMaterial, MAX * 2));
  const veilMaterial = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  gapVeils = add(new THREE.InstancedMesh(new THREE.BoxGeometry(GAP_WIDTH, 0.06, 1), veilMaterial, MAX));
}

export function updateObstacleView(game: Game, timeMs: number): void {
  let nFire = 0; let nLog = 0; let nBranch = 0; let nPuff = 0; let nPit = 0; let rims = 0; let veils = 0;
  const track = game.track;
  for (const o of game.spawner.obstacles) {
    const midS = (o.s0 + o.s1) / 2; const midX = (o.x0 + o.x1) / 2;
    const spec = OBSTACLES[o.kind];
    for (const p of track.samplesAt(midS, midX)) {
      switch (o.kind) {
        case 'fire': {
          if (nFire >= MAX) break;
          const flicker = 1 + Math.sin(timeMs * 0.02 + o.id) * 0.1;
          const sway = Math.sin(timeMs * 0.011 + o.id * 2) * 0.06;
          dummy.position.set(p.x, 0.9 * flicker, p.z); faceHeading(dummy, p.dir); dummy.rotation.z = sway;
          dummy.scale.set(1, flicker, 1); dummy.updateMatrix(); fireA.setMatrixAt(nFire, dummy.matrix);
          dummy.rotation.y += Math.PI / 2; dummy.updateMatrix(); fireB.setMatrixAt(nFire, dummy.matrix);
          dummy.rotation.y -= Math.PI / 4; dummy.position.y = 1.3 * flicker; dummy.updateMatrix(); fireC.setMatrixAt(nFire, dummy.matrix);
          nFire++;
          break;
        }
        case 'log': {
          if (nLog >= MAX) break;
          dummy.position.set(p.x, (spec.y0 + spec.y1) / 2, p.z); faceHeading(dummy, p.dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          logs.setMatrixAt(nLog++, dummy.matrix);
          break;
        }
        case 'branch': {
          if (nBranch >= MAX) break;
          const y = spec.y0 + 0.35;
          dummy.position.set(p.x, y, p.z); faceHeading(dummy, p.dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          branches.setMatrixAt(nBranch++, dummy.matrix);
          const right = { x: -p.dir.z, z: p.dir.x };
          for (const k of [-1.9, 0, 1.9]) {
            if (nPuff >= MAX * 3) break;
            const bob = Math.sin(timeMs * 0.002 + o.id + k) * 0.05;
            dummy.position.set(p.x + right.x * k, y + 0.9 + bob, p.z + right.z * k); dummy.rotation.set(0, o.id + k, 0); dummy.scale.setScalar(1 + (k === 0 ? 0.25 : 0)); dummy.updateMatrix();
            puffs.setMatrixAt(nPuff++, dummy.matrix);
          }
          break;
        }
        case 'gap': {
          if (nPit < MAX) {
            dummy.position.set(p.x, -0.5 - PIT_DEPTH / 2, p.z); faceHeading(dummy, p.dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
            pits.setMatrixAt(nPit++, dummy.matrix);
          }
          if (game.invulnerable && veils < MAX) {
            dummy.position.set(p.x, 0.04, p.z); faceHeading(dummy, p.dir);
            dummy.scale.set(1, 1 + Math.sin(timeMs * 0.01) * 0.3, o.s1 - o.s0); dummy.updateMatrix();
            gapVeils.setMatrixAt(veils++, dummy.matrix);
          }
          break;
        }
      }
    }
    if (o.kind === 'gap') {
      for (const edge of [o.s0, o.s1]) for (const e of track.samplesAt(edge, midX)) {
        if (rims >= MAX * 2) break;
        dummy.position.set(e.x, 0.06, e.z); faceHeading(dummy, e.dir); dummy.scale.set(1, 1 + Math.sin(timeMs * 0.006) * 0.3, 1); dummy.updateMatrix();
        gapRims.setMatrixAt(rims++, dummy.matrix);
      }
    }
  }
  const flush = (m: THREE.InstancedMesh, n: number) => { m.count = n; m.instanceMatrix.needsUpdate = true; };
  flush(fireA, nFire); flush(fireB, nFire); flush(fireC, nFire); flush(logs, nLog); flush(branches, nBranch); flush(puffs, nPuff); flush(pits, nPit); flush(gapRims, rims); flush(gapVeils, veils);
}

export const OBSTACLE_KINDS: ObstacleKind[] = ['fire', 'log', 'branch', 'gap'];
