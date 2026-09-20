import * as THREE from 'three';
import type { Game } from '../core/game';
import { TRACK_HALF_WIDTH } from '../core/track';
import { pbrMaterial, remoteSet, sprite } from './textures';
import { faceHeading } from './util';

/**
 * Decals rebuilt per frame from the live segments:
 *  - carved relief band along both walls of every straight (generated PBR strip)
 *  - stone arrow glyphs on corner plates (one for a turn, two for a fork)
 */

const MAX = 128;
let reliefs: THREE.InstancedMesh;
let arrows: THREE.InstancedMesh;
let portals: THREE.InstancedMesh;
let jaguars: THREE.InstancedMesh;
let cornices: THREE.InstancedMesh;
let trims: THREE.InstancedMesh;
let banners: THREE.InstancedMesh;
let mosaic: THREE.Mesh;
const segHash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const dummy = new THREE.Object3D();
const RELIEF_Y = 1.45;
const RELIEF_H = 0.6;

export function initDecals(scene: THREE.Scene): void {
  const relief = remoteSet('relief', 0x6a6060);
  for (const t of [relief.map, relief.normalMap, relief.roughnessMap]) t.repeat.set(5, 1);
  for (const t of [relief.map, relief.normalMap, relief.roughnessMap]) t.repeat.set(1, 1);
  reliefs = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, RELIEF_H), pbrMaterial(relief, { color: 0xd8d0c8, polygonOffset: true, polygonOffsetFactor: -1 }), 512);
  arrows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: sprite('arrow'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX);
  portals = new THREE.InstancedMesh(new THREE.PlaneGeometry(5.2, 3.6), pbrMaterial(remoteSet('portal', 0x6a5a58), { polygonOffset: true, polygonOffsetFactor: -1 }), 32);
  const corn = remoteSet('cornice', 0x8a8088); for (const t of [corn.map, corn.normalMap, corn.roughnessMap]) t.repeat.set(1, 1);
  cornices = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.28, 2), pbrMaterial(corn, { color: 0xd8d0c8 }), 320);
  jaguars = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.2, 4.2), pbrMaterial(remoteSet('jaguar-face', 0x6a5a58), { polygonOffset: true, polygonOffsetFactor: -1 }), 32);
  const trim = remoteSet('gold-trim', 0xc9a24a); for (const t of [trim.map, trim.normalMap, trim.roughnessMap]) t.repeat.set(1, 1);
  trims = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 0.22), pbrMaterial(trim, { color: 0xffe0a0, emissive: 0x6a4a10, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 }), MAX);
  const leafy = (name: string, w: number, h: number, alpha = 0.4) => new THREE.InstancedMesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: sprite(name), transparent: true, alphaTest: alpha, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }), MAX);
  banners = leafy('banner', 1.2, 1.7, 0.4);
  for (const m of [reliefs, arrows, portals, jaguars, cornices, trims, banners]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
  // Start medallion: a 6 x 6 mosaic plate on the first slabs.
  mosaic = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), pbrMaterial(remoteSet('mosaic', 0x907060), { polygonOffset: true, polygonOffsetFactor: -1 }));
  mosaic.rotation.x = -Math.PI / 2;
  mosaic.position.set(0, 0.03, -8);
  scene.add(mosaic);
}

export function updateDecals(game: Game, timeMs: number): void {
  const track = game.track;
  const gaps = game.spawner.obstacles.filter((o) => o.kind === 'gap');
  const holed = (s: number) => gaps.some((g) => s + 1 > g.s0 + 1e-6 && s - 1 < g.s1 - 1e-6);
  let nR = 0; let nA = 0; let nP = 0; let nJ = 0; let nC = 0; let nT = 0; let nB = 0;
  mosaic.visible = track.segments.length > 0 && track.segments[0].s0 === 0;
  const cornice = (x: number, z: number, dir: { x: number; z: number }) => {
    if (nC >= 320) return;
    dummy.position.set(x, 2.14, z); faceHeading(dummy, dir); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    cornices.setMatrixAt(nC++, dummy.matrix);
  };
  for (const seg of track.allSegments()) {
    if (seg.kind === 'straight') {
      for (const side of [-1, 1] as const) {
        const w0 = track.sampleSegment(seg, seg.s0 + seg.length / 2, side * (TRACK_HALF_WIDTH - 0.03));
        const right = { x: -w0.dir.z, z: w0.dir.x };
        const yawIn0 = Math.atan2(-side * right.x, -side * right.z);
        // Relief band and gold trim per 2 m wall block, skipping blocks a gap has removed.
        for (let s = seg.s0 + 1; s < seg.s0 + seg.length; s += 2) {
          if (holed(s) || nR >= 512 || nT >= MAX) continue;
          const w = track.sampleSegment(seg, s, side * (TRACK_HALF_WIDTH - 0.03));
          dummy.position.set(w.x, RELIEF_Y, w.z); dummy.rotation.set(0, yawIn0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          reliefs.setMatrixAt(nR++, dummy.matrix);
          dummy.position.y = 1.9; dummy.updateMatrix(); trims.setMatrixAt(nT++, dummy.matrix);
        }
        // The odd banner, seeded per segment and side. (Hanging-vine decals were dropped: they read as a tree pasted on the wall.)
        const yawIn = Math.atan2(-side * right.x, -side * right.z);
        for (let k = 0; k < 2; k++) {
          const r = segHash(seg.id, 700 + side * 10 + k);
          if (r > 0.9 && nB < MAX && !holed(seg.s0 + 10)) {
            const v = track.sampleSegment(seg, seg.s0 + 10, side * (TRACK_HALF_WIDTH - 0.06));
            dummy.position.set(v.x, 1.15, v.z); dummy.rotation.set(0, yawIn, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
            banners.setMatrixAt(nB++, dummy.matrix);
          }
        }
        // Cornice blocks along the top of this wall, one per 2 m slab.
        for (let s = seg.s0 + 1; s < seg.s0 + seg.length; s += 2) {
          if (holed(s)) continue;
          const c = track.sampleSegment(seg, s, side * (TRACK_HALF_WIDTH + 0.25));
          cornice(c.x, c.z, c.dir);
        }
      }
      continue;
    }
    const corner = track.cornerOf(seg);
    const c = track.sampleSegment(seg, corner - 1e-6);
    // Portal arch on the far wall of the bend (turn: outer wall; fork: the T wall).
    if (nP < 32) {
      const lateral = TRACK_HALF_WIDTH - 0.1;
      const outer = seg.turn === 'left' ? 1 : -1;
      const right = { x: -c.dir.z, z: c.dir.x };
      const px = seg.fork ? c.x + c.dir.x * (TRACK_HALF_WIDTH - 0.08) : c.x + outer * right.x * lateral + c.dir.x * (TRACK_HALF_WIDTH / 2);
      const pz = seg.fork ? c.z + c.dir.z * (TRACK_HALF_WIDTH - 0.08) : c.z + outer * right.z * lateral + c.dir.z * (TRACK_HALF_WIDTH / 2);
      dummy.position.set(px, 1.85, pz);
      const facing = seg.fork ? { x: -c.dir.x, z: -c.dir.z } : { x: -outer * right.x, z: -outer * right.z };
      dummy.rotation.set(0, Math.atan2(facing.x, facing.z), 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      // Every other bend shows a carved jaguar instead of the portal arch.
      if (segHash(seg.id, 5) < 0.5) portals.setMatrixAt(nP++, dummy.matrix);
      else if (nJ < 32) { dummy.position.y = 1.7; dummy.updateMatrix(); jaguars.setMatrixAt(nJ++, dummy.matrix); }
    }
    const dirs = seg.fork && !seg.resolved
      ? [{ x: c.dir.z, z: -c.dir.x }, { x: -c.dir.z, z: c.dir.x }]
      : [seg.outDir];
    for (const d of dirs) {
      if (nA >= MAX) break;
      const pulse = 1 + Math.sin(timeMs * 0.004) * 0.05;
      dummy.position.set(c.x + d.x * 0.2, 0.08, c.z + d.z * 0.2);
      dummy.rotation.set(-Math.PI / 2, 0, 0);      // lie flat
      dummy.rotateZ(-Math.atan2(d.x, -d.z));        // sprite arrow points "up" (−z after lying flat) → align with d
      dummy.scale.set(pulse, pulse, 1); dummy.updateMatrix();
      arrows.setMatrixAt(nA++, dummy.matrix);
    }
  }
  reliefs.count = nR; reliefs.instanceMatrix.needsUpdate = true;
  arrows.count = nA; arrows.instanceMatrix.needsUpdate = true;
  portals.count = nP; portals.instanceMatrix.needsUpdate = true;
  jaguars.count = nJ; jaguars.instanceMatrix.needsUpdate = true;
  cornices.count = nC; cornices.instanceMatrix.needsUpdate = true;
  trims.count = nT; trims.instanceMatrix.needsUpdate = true;
  banners.count = nB; banners.instanceMatrix.needsUpdate = true;
}

export { faceHeading as _fh };
