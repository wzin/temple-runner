import * as THREE from 'three';
import type { Game } from '../core/game';
import { OBSTACLES, ObstacleKind } from '../core/spawner';
import { TRACK_HALF_WIDTH } from '../core/track';
import { flameMaterial } from './flameMaterial';
import { pbrMaterial, remoteSet, textures } from './textures';
import { GROUND_Y } from './groundView';
import { faceHeading } from './util';

/**
 * Obstacles as instanced meshes placed from track coordinates each frame.
 *  fire   – a bonfire: bed of glowing coals, four shader flame sheets (one facing the camera,
 *           three fanned behind it, one small hot core), a flickering ground glow and a point
 *           light that follows the nearest fire ahead of the runner
 *  log    – a stone column (three stone looks by id) standing on one wall top that topples across the path as the runner approaches
 *           (62 → 34 m ahead), bounces off the far wall and drops to rest wedged at chest height: the
 *           fall is visible from far away, so you know a slide is coming (jumping works too)
 *  branch – a tall gate (must slide): posts 4.2 m high, a lintel at chest height to slide under, a solid panel above it up
 *           to 4 m and teeth on top, so it clearly cannot be jumped; three looks by id: carved stone, wooden stakes, obsidian with gold
 *  gap    – real break in the embankment; lava or a river far below marks the drop
 */

const MAX = 64;
const GAP_WIDTH = 6.2;
const dummy = new THREE.Object3D();
const tmpV = new THREE.Vector3();

let fireFront: THREE.InstancedMesh; let fireFanA: THREE.InstancedMesh; let fireFanB: THREE.InstancedMesh; let fireCore: THREE.InstancedMesh;
let fireGlow: THREE.InstancedMesh; let coals: THREE.InstancedMesh; let burnLogs: THREE.InstancedMesh; let braziers: THREE.InstancedMesh;
let fireLight: THREE.PointLight;
interface ColumnSet { shafts: THREE.InstancedMesh; caps: THREE.InstancedMesh; count: number }
const columns: ColumnSet[] = [];
const FALL_START = 62; const FALL_END = 34;   // metres ahead of the runner (inside the fog's clear zone)
interface GateSet { posts: THREE.InstancedMesh; caps: THREE.InstancedMesh; lintels: THREE.InstancedMesh; panels: THREE.InstancedMesh; teeth: THREE.InstancedMesh; count: number }
const gates: GateSet[] = [];
let pits: THREE.InstancedMesh;
let waterPits: THREE.InstancedMesh;
let waterMaps: ReturnType<typeof remoteSet>;
let gapVeils: THREE.InstancedMesh;

const GATE_POST_X = GAP_WIDTH / 2 - 0.6;
const GATE_POST_H = 4.2;
const GATE_PANEL_TOP = 4.0;                          // solid wall above the lintel: nothing to jump through
const GATE_LINTEL_Y0 = OBSTACLES.branch.y0;        // underside: what you slide beneath
const GATE_LINTEL_H = 0.8;
const GATE_TEETH = 5;

/** Concatenate a few small geometries into one (all non-indexed, position/normal/uv only). */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => g.index ? g.toNonIndexed() : g);
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const size = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(count * size); let o = 0;
    for (const g of parts) { const a = g.attributes[name] as THREE.BufferAttribute; arr.set(a.array as Float32Array, o); o += a.count * size; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

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
  // Variant 1: a fallen log burning where it lies (bark with an ember glow); variant 2: a ring of stones.
  const charred = pbrMaterial(tex.bark, { color: 0x6a4a38, emissive: 0xff5a10, emissiveIntensity: 0.35 });
  burnLogs = add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.32, 1, 10).rotateZ(Math.PI / 2), charred, MAX));
  braziers = add(new THREE.InstancedMesh(new THREE.TorusGeometry(0.85, 0.22, 8, 14).rotateX(Math.PI / 2), pbrMaterial(remoteSet('rock', 0x807870), { color: 0xb0a898 }), MAX));
  fireLight = new THREE.PointLight(0xff7a20, 0, 26, 2);
  scene.add(fireLight);

  // Falling column (the 'log' obstacle). Local frame: base at the origin, shaft along +y; the per-obstacle matrix
  // rotates it about the heading axis to topple it across the path. Three stone looks by id.
  const logSpec = OBSTACLES.log; const logR = (logSpec.y1 - logSpec.y0) / 2;
  const COL_LEN = GAP_WIDTH + 0.9;
  const shaftGeo = new THREE.CylinderGeometry(logR * 0.9, logR * 1.1, COL_LEN - 0.6, 12).translate(0, (COL_LEN - 0.6) / 2, 0);
  const capsGeo = mergeSimple([new THREE.BoxGeometry(0.95, 0.35, 0.95).translate(0, COL_LEN - 0.42, 0), new THREE.BoxGeometry(0.8, 0.3, 0.8).translate(0, 0.15, 0)]);
  for (const mat of [
    pbrMaterial(remoteSet('column', 0x9a9088), { color: 0xd0c8bc }),
    pbrMaterial(remoteSet('wall-carved', 0x8a7a68), { color: 0xd8d0c4 }),
    pbrMaterial(remoteSet('floor-obsidian', 0x2a2a30), { color: 0xffffff, metalness: 0.3, roughness: 0.4 }),
  ]) columns.push({ shafts: add(new THREE.InstancedMesh(shaftGeo, mat, MAX)), caps: add(new THREE.InstancedMesh(capsGeo, mat, MAX)), count: 0 });

  // Gate ("branch" in the core): posts, caps, lintel, teeth in three looks. Everything between y 1.0 and 2.6 is the barrier.
  const postGeo = new THREE.BoxGeometry(0.7, GATE_POST_H, 0.7);
  const capGeo = new THREE.ConeGeometry(0.58, 0.5, 4);
  const lintelGeo = new THREE.BoxGeometry(GAP_WIDTH - 1.0, GATE_LINTEL_H, 0.8);
  const panelGeo = new THREE.BoxGeometry(GAP_WIDTH - 1.0, GATE_PANEL_TOP - (GATE_LINTEL_Y0 + GATE_LINTEL_H), 0.5);
  const toothGeo = new THREE.ConeGeometry(0.24, 0.75, 4);
  const stone = remoteSet('rock', 0x807870);
  const stoneMat = pbrMaterial(stone, { color: 0xc8c0b4 });
  const relief = remoteSet('relief', 0x6a6060); for (const t of [relief.map, relief.normalMap, relief.roughnessMap]) t.repeat.set(3, 1);
  const wood = pbrMaterial(tex.bark, { color: 0xc8a070 });
  const obsidian = pbrMaterial(remoteSet('floor-obsidian', 0x2a2a30), { color: 0xffffff, metalness: 0.3, roughness: 0.4 });
  const gold = pbrMaterial(remoteSet('gold-trim', 0xc9a24a), { color: 0xffe0a0, emissive: 0x6a4a10, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.3 });
  const gateSet = (post: THREE.Material, cap: THREE.Material, lintel: THREE.Material, tooth: THREE.Material, toothGeometry: THREE.BufferGeometry, postGeometry: THREE.BufferGeometry) => ({
    posts: add(new THREE.InstancedMesh(postGeometry, post, MAX * 2)), caps: add(new THREE.InstancedMesh(capGeo, cap, MAX * 2)),
    lintels: add(new THREE.InstancedMesh(lintelGeo, lintel, MAX)), panels: add(new THREE.InstancedMesh(panelGeo, post, MAX)), teeth: add(new THREE.InstancedMesh(toothGeometry, tooth, MAX * GATE_TEETH)), count: 0,
  });
  gates.push(
    gateSet(pbrMaterial(remoteSet('wall-carved', 0x8a7a68), { color: 0xd8d0c4 }), stoneMat, pbrMaterial(relief, { color: 0xd8d0c8 }), stoneMat, toothGeo, postGeo),
    // Wooden barricade: round posts, a rough beam, sharpened stakes.
    gateSet(wood, wood, wood, wood, new THREE.ConeGeometry(0.16, 1.1, 5), new THREE.CylinderGeometry(0.3, 0.36, GATE_POST_H, 8)),
    // Obsidian and gold.
    gateSet(obsidian, gold, obsidian, gold, toothGeo, postGeo),
  );

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
  let nFire = 0; let nCoal = 0; let nBurn = 0; let nBraz = 0; let nPit = 0; let nWater = 0; let veils = 0;
  for (const g of gates) g.count = 0;
  for (const c of columns) c.count = 0;
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
          // The base: coal bed / burning log / stone ring by id, sized to the collision box; plus a glow disc on the slabs.
          const w = Math.max(1.4, o.x1 - o.x0); const d = Math.max(1.0, o.s1 - o.s0);
          const fv = o.id % 3;
          dummy.position.set(p.x, 0.12, p.z); faceHeading(dummy, p.dir);
          if (fv === 0) { dummy.scale.set(w, 0.24, d); dummy.updateMatrix(); coals.setMatrixAt(nCoal++, dummy.matrix); }
          else if (fv === 1) { dummy.position.y = 0.3; dummy.rotation.y += 0.25; dummy.scale.set(w + 0.6, 1, 1); dummy.updateMatrix(); burnLogs.setMatrixAt(nBurn++, dummy.matrix); }
          else { dummy.position.y = 0.16; dummy.scale.set(w / 1.9, 1, d / 1.2); dummy.updateMatrix(); braziers.setMatrixAt(nBraz++, dummy.matrix); }
          const g = 4.4 + Math.sin(t * 11 + o.id * 3) * 0.35;
          dummy.position.set(p.x, 0.05, p.z); dummy.rotation.set(0, o.id * 0.7, 0); dummy.scale.set(g, 1, g); dummy.updateMatrix(); fireGlow.setMatrixAt(nFire, dummy.matrix);
          nFire++;
          // The light follows the nearest fire that is not yet behind the runner.
          if (!o.hit) { const ahead = midS - playerS; if (ahead > -4 && ahead < lightBest) { lightBest = ahead; lightX = p.x; lightZ = p.z; lightSeed = o.id; } }
          break;
        }
        case 'log': {
          const col = columns[o.id % columns.length];
          if (col.count >= MAX) break;
          // Topple progress from distance: standing until FALL_START m ahead, at rest from FALL_END m.
          const ahead = midS - playerS;
          const k = THREE.MathUtils.clamp((FALL_START - ahead) / (FALL_START - FALL_END), 0, 1);
          const side = (o.id & 1) ? 1 : -1;                       // which wall the tree stands on
          const fall = Math.min(1, k / 0.72);                     // rotation phase
          const angle = (Math.PI / 2) * fall * fall;              // gravity: slow start, fast finish
          const dropK = THREE.MathUtils.clamp((k - 0.72) / 0.28, 0, 1);
          const bounce = Math.sin(dropK * Math.PI) * 0.18 * (1 - dropK);
          const restY = (spec.y0 + spec.y1) / 2;
          const y = 2.0 - (2.0 - restY) * dropK + bounce;
          dummy.position.set(p.x + right.x * side * (TRACK_HALF_WIDTH + 0.25), y, p.z + right.z * side * (TRACK_HALF_WIDTH + 0.25));
          faceHeading(dummy, p.dir);
          // Local +x points to the runner's left (faceHeading maps +z to the heading), so a tree on the right wall
          // (side +1) must rotate towards +x: negative angle about z.
          dummy.rotateZ(-side * angle);
          // Once wedged, roll a little so the broken end sits lower than the roots.
          dummy.rotateX(dropK * 0.08);
          dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          col.shafts.setMatrixAt(col.count, dummy.matrix); col.caps.setMatrixAt(col.count, dummy.matrix); col.count++;
          break;
        }
        case 'branch': {
          const gate = gates[o.id % gates.length]; const nGate = gate.count;
          if (nGate >= MAX) break;
          const wobble = ((o.id * 7919) % 13 - 6) * 0.004;
          faceHeading(dummy, p.dir); dummy.rotation.y += wobble; dummy.scale.set(1, 1, 1);
          for (const side of [-1, 1]) {
            dummy.position.set(p.x + right.x * side * GATE_POST_X, GATE_POST_H / 2, p.z + right.z * side * GATE_POST_X); dummy.updateMatrix();
            gate.posts.setMatrixAt(nGate * 2 + (side + 1) / 2, dummy.matrix);
            dummy.position.y = GATE_POST_H + 0.25; dummy.rotation.y += Math.PI / 4; dummy.updateMatrix();
            gate.caps.setMatrixAt(nGate * 2 + (side + 1) / 2, dummy.matrix);
            dummy.rotation.y -= Math.PI / 4;
          }
          dummy.position.set(p.x, GATE_LINTEL_Y0 + GATE_LINTEL_H / 2, p.z); dummy.updateMatrix(); gate.lintels.setMatrixAt(nGate, dummy.matrix);
          dummy.position.y = (GATE_LINTEL_Y0 + GATE_LINTEL_H + GATE_PANEL_TOP) / 2; dummy.updateMatrix(); gate.panels.setMatrixAt(nGate, dummy.matrix);
          for (let k = 0; k < GATE_TEETH; k++) {
            const off = (k - (GATE_TEETH - 1) / 2) * ((GAP_WIDTH - 1.8) / (GATE_TEETH - 1));
            const lean = ((o.id * 31 + k * 17) % 7 - 3) * 0.03;
            dummy.position.set(p.x + right.x * off, GATE_PANEL_TOP + 0.36, p.z + right.z * off);
            dummy.rotation.z = lean; dummy.updateMatrix(); gate.teeth.setMatrixAt(nGate * GATE_TEETH + k, dummy.matrix); dummy.rotation.z = 0;
          }
          gate.count++;
          break;
        }
        case 'gap': case 'halfgap': {
          if ((o.id * 2654435761) % 5 < 2) {      // ~40% of gaps are river crossings
            if (nWater < MAX) { dummy.position.set(p.x, GROUND_Y + 0.08, p.z); faceHeading(dummy, p.dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); waterPits.setMatrixAt(nWater++, dummy.matrix); }
          } else if (nPit < MAX) {
            dummy.position.set(p.x, GROUND_Y + 0.08, p.z); faceHeading(dummy, p.dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
            pits.setMatrixAt(nPit++, dummy.matrix);
          }
          if (game.invulnerable && veils < MAX && !(game.boostEnding && Math.floor(timeMs / 120) % 2 === 0)) {
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
  flush(fireFront, nFire); flush(fireFanA, nFire); flush(fireFanB, nFire); flush(fireCore, nFire); flush(fireGlow, nFire); flush(coals, nCoal); flush(burnLogs, nBurn); flush(braziers, nBraz);
  for (const c of columns) { flush(c.shafts, c.count); flush(c.caps, c.count); }
  for (const g of gates) { flush(g.posts, g.count * 2); flush(g.caps, g.count * 2); flush(g.lintels, g.count); flush(g.panels, g.count); flush(g.teeth, g.count * GATE_TEETH); }
  flush(pits, nPit); flush(waterPits, nWater); flush(gapVeils, veils);
}

export const OBSTACLE_KINDS: ObstacleKind[] = ['fire', 'log', 'branch', 'gap', 'halfgap'];
