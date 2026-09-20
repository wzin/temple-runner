import * as THREE from 'three';
import type { Game } from '../core/game';
import { OBSTACLES, ObstacleKind } from '../core/spawner';
import { flameMaterial } from './flameMaterial';
import { pbrMaterial, remoteSet, textures } from './textures';
import { GROUND_Y } from './groundView';
import { faceHeading } from './util';

/**
 * Obstacles as instanced meshes placed from track coordinates each frame.
 *  fire   – a bonfire: bed of glowing coals, four shader flame sheets (one facing the camera,
 *           three fanned behind it, one small hot core), a flickering ground glow and a point
 *           light that follows the nearest fire ahead of the runner
 *  log    – bark cylinder with tree-ring end caps (slide or jump)
 *  branch – a low stone gate: two carved posts with pyramid caps, a relief lintel at chest
 *           height and a row of stone teeth on top (must slide)
 *  gap    – real break in the embankment; lava or a river far below marks the drop
 */

const MAX = 64;
const GAP_WIDTH = 6.2;
const dummy = new THREE.Object3D();
const tmpV = new THREE.Vector3();

let fireFront: THREE.InstancedMesh; let fireFanA: THREE.InstancedMesh; let fireFanB: THREE.InstancedMesh; let fireCore: THREE.InstancedMesh;
let fireGlow: THREE.InstancedMesh; let coals: THREE.InstancedMesh;
let fireLight: THREE.PointLight;
let logs: THREE.InstancedMesh;
let gatePosts: THREE.InstancedMesh; let gateCaps: THREE.InstancedMesh; let gateLintels: THREE.InstancedMesh; let gateTeeth: THREE.InstancedMesh;
let pits: THREE.InstancedMesh;
let waterPits: THREE.InstancedMesh;
let waterMaps: ReturnType<typeof remoteSet>;
let gapVeils: THREE.InstancedMesh;

const GATE_POST_X = GAP_WIDTH / 2 - 0.6;
const GATE_POST_H = 2.7;
const GATE_LINTEL_Y0 = OBSTACLES.branch.y0;        // underside: what you slide beneath
const GATE_LINTEL_H = 0.8;
const GATE_TEETH = 5;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,190,90,0.9)'); grad.addColorStop(0.35, 'rgba(255,110,30,0.45)'); grad.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function initObstacleView(scene: THREE.Scene): void {
  const tex = textures();
  const add = (m: THREE.InstancedMesh) => { m.count = 0; m.frustumCulled = false; scene.add(m); return m; };

  // Fire. The sheets are tall so the flames tower above the 0.8 m collision box you jump over.
  fireFront = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(3.0, 3.4), flameMaterial({ scale: 1.0, speed: 1.0, width: 0.95, glow: 1.0 }), MAX));
  fireFanA = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 3.0), flameMaterial({ scale: 1.15, speed: 1.15, width: 0.85, glow: 0.85 }), MAX));
  fireFanB = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 3.0), flameMaterial({ scale: 0.9, speed: 0.9, width: 0.85, glow: 0.85 }), MAX));
  fireCore = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 2.0), flameMaterial({ scale: 1.6, speed: 1.5, width: 0.7, glow: 1.4 }), MAX));
  fireGlow = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), MAX));
  const lavaSet = remoteSet('lava', 0xff5a10);
  const coalMat = pbrMaterial(lavaSet, { color: 0xffffff, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 0.9 });
  coals = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), coalMat, MAX));
  fireLight = new THREE.PointLight(0xff7a20, 0, 26, 2);
  scene.add(fireLight);

  // Log: a real trunk lying across the path, ends showing tree rings.
  const logSpec = OBSTACLES.log; const logR = (logSpec.y1 - logSpec.y0) / 2;
  const logGeo = new THREE.CylinderGeometry(logR, logR, GAP_WIDTH, 14).rotateZ(Math.PI / 2); // groups: side, cap, cap
  const barkMat = pbrMaterial(tex.bark); for (const t of [tex.bark.map, tex.bark.normalMap, tex.bark.roughnessMap]) t.repeat.set(3, 1);
  const logEnd = remoteSet('log-end', 0xc9a877);
  const capMat = pbrMaterial(logEnd);
  logs = add(new THREE.InstancedMesh(logGeo, [barkMat, capMat, capMat], MAX));

  // Gate ("branch" in the core): posts, caps, lintel, teeth. Everything between y 1.0 and 2.6 is the barrier.
  const carved = remoteSet('wall-carved', 0x8a7a68);
  const postMat = pbrMaterial(carved, { color: 0xd8d0c4 });
  gatePosts = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, GATE_POST_H, 0.7), postMat, MAX * 2));
  const stone = remoteSet('rock', 0x807870);
  const stoneMat = pbrMaterial(stone, { color: 0xc8c0b4 });
  gateCaps = add(new THREE.InstancedMesh(new THREE.ConeGeometry(0.58, 0.5, 4), stoneMat, MAX * 2));
  const relief = remoteSet('relief', 0x6a6060); for (const t of [relief.map, relief.normalMap, relief.roughnessMap]) t.repeat.set(3, 1);
  gateLintels = add(new THREE.InstancedMesh(new THREE.BoxGeometry(GAP_WIDTH - 1.0, GATE_LINTEL_H, 0.8), pbrMaterial(relief, { color: 0xd8d0c8 }), MAX));
  gateTeeth = add(new THREE.InstancedMesh(new THREE.ConeGeometry(0.24, 0.75, 4), stoneMat, MAX * GATE_TEETH));

  // A gap is a real break in the embankment (floor and cliff blocks are skipped there). Far below, on
  // the ground, a pool of lava or a river bend marks where you would land.
  const lava = pbrMaterial(lavaSet, { color: 0xffffff, emissive: 0xff6a20, emissiveIntensity: 1.2 });
  pits = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(GAP_WIDTH + 6, OBSTACLES.gap.depth + 10).rotateX(-Math.PI / 2), lava, MAX));
  waterMaps = remoteSet('water', 0x1a3a4a);
  const water = pbrMaterial(waterMaps, { color: 0x9ac0d0, emissive: 0x0a2030, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.15 });
  waterPits = add(new THREE.InstancedMesh(new THREE.PlaneGeometry(GAP_WIDTH + 6, OBSTACLES.gap.depth + 10).rotateX(-Math.PI / 2), water, MAX));

  const veilMaterial = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  gapVeils = add(new THREE.InstancedMesh(new THREE.BoxGeometry(GAP_WIDTH, 0.06, 1), veilMaterial, MAX));
}

export function updateObstacleView(game: Game, timeMs: number, camera?: THREE.Camera): void {
  let nFire = 0; let nLog = 0; let nGate = 0; let nPit = 0; let nWater = 0; let veils = 0;
  const t = timeMs * 0.001;
  const track = game.track;
  const playerS = game.player.s;
  let lightBest = Infinity; let lightX = 0; let lightZ = 0; let lightSeed = 0;
  for (const o of game.spawner.obstacles) {
    const midS = (o.s0 + o.s1) / 2; const midX = (o.x0 + o.x1) / 2;
    const spec = OBSTACLES[o.kind];
    for (const p of track.samplesAt(midS, midX)) {
      const right = { x: -p.dir.z, z: p.dir.x };
      switch (o.kind) {
        case 'fire': {
          if (nFire >= MAX) break;
          const flicker = 1 + Math.sin(t * 19 + o.id) * 0.07 + Math.sin(t * 7.3 + o.id * 2) * 0.05;
          // Main sheet faces the camera; two more fan out behind it so the fire has body from every angle.
          let yaw = Math.atan2(p.dir.x, p.dir.z);
          if (camera) { tmpV.setFromMatrixPosition(camera.matrixWorld); yaw = Math.atan2(tmpV.x - p.x, tmpV.z - p.z); }
          dummy.position.set(p.x, 1.55 * flicker, p.z); dummy.rotation.set(0, yaw, Math.sin(t * 5 + o.id) * 0.04);
          dummy.scale.set(1, flicker, 1); dummy.updateMatrix(); fireFront.setMatrixAt(nFire, dummy.matrix);
          dummy.position.y = 1.4 * flicker; dummy.rotation.y = yaw + 1.1; dummy.updateMatrix(); fireFanA.setMatrixAt(nFire, dummy.matrix);
          dummy.rotation.y = yaw - 1.1; dummy.updateMatrix(); fireFanB.setMatrixAt(nFire, dummy.matrix);
          dummy.position.y = 0.95 * flicker; dummy.rotation.y = yaw + 0.5; dummy.updateMatrix(); fireCore.setMatrixAt(nFire, dummy.matrix);
          // Coal bed the size of the collision box, and a glow disc on the slabs around it.
          const w = Math.max(1.4, o.x1 - o.x0); const d = Math.max(1.0, o.s1 - o.s0);
          dummy.position.set(p.x, 0.12, p.z); faceHeading(dummy, p.dir); dummy.scale.set(w, 0.24, d); dummy.updateMatrix(); coals.setMatrixAt(nFire, dummy.matrix);
          const g = 4.4 + Math.sin(t * 11 + o.id * 3) * 0.35;
          dummy.position.set(p.x, 0.05, p.z); dummy.rotation.set(0, o.id * 0.7, 0); dummy.scale.set(g, 1, g); dummy.updateMatrix(); fireGlow.setMatrixAt(nFire, dummy.matrix);
          nFire++;
          // The light follows the nearest fire that is not yet behind the runner.
          if (!o.hit) { const ahead = midS - playerS; if (ahead > -4 && ahead < lightBest) { lightBest = ahead; lightX = p.x; lightZ = p.z; lightSeed = o.id; } }
          break;
        }
        case 'log': {
          if (nLog >= MAX) break;
          dummy.position.set(p.x, (spec.y0 + spec.y1) / 2, p.z); faceHeading(dummy, p.dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          logs.setMatrixAt(nLog++, dummy.matrix);
          break;
        }
        case 'branch': {
          if (nGate >= MAX) break;
          const wobble = ((o.id * 7919) % 13 - 6) * 0.004;
          faceHeading(dummy, p.dir); dummy.rotation.y += wobble; dummy.scale.set(1, 1, 1);
          for (const side of [-1, 1]) {
            dummy.position.set(p.x + right.x * side * GATE_POST_X, GATE_POST_H / 2, p.z + right.z * side * GATE_POST_X); dummy.updateMatrix();
            gatePosts.setMatrixAt(nGate * 2 + (side + 1) / 2, dummy.matrix);
            dummy.position.y = GATE_POST_H + 0.25; dummy.rotation.y += Math.PI / 4; dummy.updateMatrix();
            gateCaps.setMatrixAt(nGate * 2 + (side + 1) / 2, dummy.matrix);
            dummy.rotation.y -= Math.PI / 4;
          }
          dummy.position.set(p.x, GATE_LINTEL_Y0 + GATE_LINTEL_H / 2, p.z); dummy.updateMatrix(); gateLintels.setMatrixAt(nGate, dummy.matrix);
          for (let k = 0; k < GATE_TEETH; k++) {
            const off = (k - (GATE_TEETH - 1) / 2) * ((GAP_WIDTH - 1.8) / (GATE_TEETH - 1));
            const lean = ((o.id * 31 + k * 17) % 7 - 3) * 0.03;
            dummy.position.set(p.x + right.x * off, GATE_LINTEL_Y0 + GATE_LINTEL_H + 0.36, p.z + right.z * off);
            dummy.rotation.z = lean; dummy.updateMatrix(); gateTeeth.setMatrixAt(nGate * GATE_TEETH + k, dummy.matrix); dummy.rotation.z = 0;
          }
          nGate++;
          break;
        }
        case 'gap': {
          if ((o.id * 2654435761) % 5 < 2) {      // ~40% of gaps are river crossings
            if (nWater < MAX) { dummy.position.set(p.x, GROUND_Y + 0.08, p.z); faceHeading(dummy, p.dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); waterPits.setMatrixAt(nWater++, dummy.matrix); }
          } else if (nPit < MAX) {
            dummy.position.set(p.x, GROUND_Y + 0.08, p.z); faceHeading(dummy, p.dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
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
  }
  if (lightBest < 45) {
    fireLight.position.set(lightX, 1.4, lightZ);
    fireLight.intensity = (60 + Math.sin(t * 17 + lightSeed) * 9 + Math.sin(t * 6.1) * 6) * THREE.MathUtils.clamp(1 - (lightBest - 25) / 20, 0, 1);
  } else {
    fireLight.intensity = 0;
  }
  const flush = (m: THREE.InstancedMesh, n: number) => { m.count = n; m.instanceMatrix.needsUpdate = true; };
  flush(fireFront, nFire); flush(fireFanA, nFire); flush(fireFanB, nFire); flush(fireCore, nFire); flush(fireGlow, nFire); flush(coals, nFire);
  flush(logs, nLog); flush(gatePosts, nGate * 2); flush(gateCaps, nGate * 2); flush(gateLintels, nGate); flush(gateTeeth, nGate * GATE_TEETH);
  flush(pits, nPit); flush(waterPits, nWater); flush(gapVeils, veils);
}

export const OBSTACLE_KINDS: ObstacleKind[] = ['fire', 'log', 'branch', 'gap'];
