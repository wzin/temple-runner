import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Game } from '../core/game';
import { Segment, TRACK_HALF_WIDTH, Track } from '../core/track';
import { GROUND_Y } from './groundView';

/**
 * Real low-poly models (Kenney Nature Kit, CC0) placed as instanced meshes. Each GLB is
 * flattened into its mesh parts; every part becomes an InstancedMesh that receives the same
 * per-instance matrices, so a model with a trunk and two leaf blobs costs three draw calls total.
 * Placement is seeded per segment so the world stays put while the player runs.
 */

type Kind = 'tree' | 'palm' | 'rock' | 'plant' | 'statue' | 'debris';
interface ModelDef { name: string; kind: Kind; scale: number; max: number }
const MODELS: ModelDef[] = [
  { name: 'tree_default', kind: 'tree', scale: 3.2, max: 128 },
  { name: 'tree_oak', kind: 'tree', scale: 3.4, max: 128 },
  { name: 'tree_detailed', kind: 'tree', scale: 3.2, max: 128 },
  { name: 'tree_fat', kind: 'tree', scale: 3.0, max: 128 },
  { name: 'tree_tall', kind: 'tree', scale: 3.6, max: 128 },
  { name: 'tree_pineTallA_detailed', kind: 'tree', scale: 3.4, max: 128 },
  { name: 'tree_plateau', kind: 'tree', scale: 2.6, max: 64 },
  { name: 'tree_palmDetailedTall', kind: 'palm', scale: 3.0, max: 64 },
  { name: 'tree_palmTall', kind: 'palm', scale: 2.8, max: 64 },
  { name: 'rock_largeA', kind: 'rock', scale: 2.0, max: 64 },
  { name: 'rock_largeB', kind: 'rock', scale: 2.0, max: 64 },
  { name: 'stone_tallA', kind: 'rock', scale: 1.8, max: 48 },
  { name: 'stone_tallB', kind: 'rock', scale: 1.8, max: 48 },
  { name: 'plant_bushLarge', kind: 'plant', scale: 2.0, max: 96 },
  { name: 'plant_bushDetailed', kind: 'plant', scale: 1.8, max: 96 },
  { name: 'grass_large', kind: 'plant', scale: 1.6, max: 128 },
  { name: 'flower_purpleA', kind: 'plant', scale: 1.4, max: 64 },
  { name: 'statue_head', kind: 'statue', scale: 2.2, max: 24 },
  { name: 'statue_obelisk', kind: 'statue', scale: 2.4, max: 24 },
  { name: 'rock_smallA', kind: 'debris', scale: 0.35, max: 256 },
  { name: 'rock_smallB', kind: 'debris', scale: 0.3, max: 256 },
];

interface Loaded { def: ModelDef; parts: THREE.InstancedMesh[]; count: number }
const loaded = new Map<string, Loaded>();
const byKind = new Map<Kind, Loaded[]>();
const dummy = new THREE.Object3D();
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function initModels(scene: THREE.Scene): void {
  const loader = new GLTFLoader();
  for (const def of MODELS) {
    loader.load(`/models/kenney/${def.name}.glb`, (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: THREE.InstancedMesh[] = [];
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const geo = (o.geometry as THREE.BufferGeometry).clone();
        geo.applyMatrix4(o.matrixWorld);
        geo.scale(def.scale, def.scale, def.scale);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        // Kenney parts are flat-coloured; keep them but make them react to our lights.
        const mat = (mats[0] as THREE.MeshStandardMaterial).clone();
        mat.roughness = 0.9; mat.metalness = 0;
        // Kenney's foliage is a minty teal; pull anything green-ish towards jungle greens (varies per model).
        const c = mat.color; const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
        if (hsl.h > 0.3 && hsl.h < 0.55 && hsl.s > 0.2) {
          const k = MODELS.indexOf(def) / MODELS.length;
          c.setHSL(0.27 + k * 0.06, 0.45 + hsl.s * 0.3, Math.min(0.42, hsl.l * 0.8));
        }
        const inst = new THREE.InstancedMesh(geo, mat, def.max);
        inst.count = 0; inst.frustumCulled = false;
        scene.add(inst);
        parts.push(inst);
      });
      const entry: Loaded = { def, parts, count: 0 };
      loaded.set(def.name, entry);
      const list = byKind.get(def.kind) ?? []; list.push(entry); byKind.set(def.kind, list);
    }, undefined, () => { /* model missing: nothing placed */ });
  }
}

function pick(kind: Kind, r: number): Loaded | null {
  const list = byKind.get(kind);
  if (!list || list.length === 0) return null;
  return list[Math.floor(r * list.length) % list.length];
}

function place(entry: Loaded, x: number, y: number, z: number, yaw: number, scale: number): void {
  if (entry.count >= entry.def.max) return;
  dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(scale); dummy.updateMatrix();
  for (const p of entry.parts) p.setMatrixAt(entry.count, dummy.matrix);
  entry.count++;
}

/** Trees, palms, rocks, plants and statues on the low ground, plus debris on the path and rubble at gaps. */
export function updateModels(game: Game): void {
  for (const e of loaded.values()) e.count = 0;
  const track = game.track;
  const gaps = game.spawner.obstacles.filter((o) => o.kind === 'gap');
  for (const seg of track.allSegments()) {
    if (seg.kind !== 'straight') { statuesAt(track, seg); continue; }
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const r1 = hash(seg.id, 1000 + i); const r2 = hash(seg.id, 1100 + i); const r3 = hash(seg.id, 1200 + i); const kindR = hash(seg.id, 1300 + i);
      const s = seg.s0 + 1 + r1 * (seg.length - 2);
      const lateral = side * (TRACK_HALF_WIDTH + 5 + r2 * 20);
      const w = track.sampleSegment(seg, s, lateral);
      const kind: Kind = kindR < 0.5 ? 'tree' : kindR < 0.62 ? 'palm' : kindR < 0.74 ? 'rock' : 'plant';
      const entry = pick(kind, r3);
      if (entry) place(entry, w.x, GROUND_Y, w.z, r2 * Math.PI * 2, 0.8 + r3 * 0.6);
    }
    // Small stones lying on the path itself: imperfections you can run over.
    for (let i = 0; i < 3; i++) {
      const r = hash(seg.id, 1400 + i);
      if (r > 0.6) continue;
      const s = seg.s0 + 2 + hash(seg.id, 1500 + i) * (seg.length - 4);
      const x = (hash(seg.id, 1600 + i) - 0.5) * 5;
      if (gaps.some((g) => s > g.s0 - 1 && s < g.s1 + 1)) continue;
      const w = track.sampleSegment(seg, s, x);
      const entry = pick('debris', r * 3);
      if (entry) place(entry, w.x, 0, w.z, r * 6, 0.6 + r);
    }
  }
  // Rubble at the ragged edges of every gap, on the path and tumbled down to the ground.
  for (const g of gaps) {
    for (const edge of [g.s0, g.s1]) {
      const dir = edge === g.s0 ? -1 : 1;
      for (let i = 0; i < 6; i++) {
        const r = hash(g.id, 1700 + i + (dir + 1) * 10);
        for (const w of track.samplesAt(edge + dir * (0.2 + r * 1.2), (hash(g.id, 1800 + i) - 0.5) * 5.5)) {
          const entry = pick('debris', r); if (!entry) continue;
          place(entry, w.x, 0.02, w.z, r * 6, 0.5 + r * 0.8);
          if (i < 3) place(entry, w.x + (r - 0.5) * 4, GROUND_Y + 0.1, w.z + (hash(g.id, 1900 + i) - 0.5) * 4, r * 3, 1 + r);
        }
      }
    }
  }
  for (const e of loaded.values()) for (const p of e.parts) { p.count = e.count; p.instanceMatrix.needsUpdate = true; }
}

function statuesAt(track: Track, seg: Segment): void {
  const corner = track.cornerOf(seg);
  const c = track.sampleSegment(seg, corner - 1e-6);
  const outer = seg.turn === 'left' ? 1 : -1; const right = { x: -c.dir.z, z: c.dir.x };
  const x = c.x + outer * right.x * (TRACK_HALF_WIDTH + 6) + c.dir.x * 5; const z = c.z + outer * right.z * (TRACK_HALF_WIDTH + 6) + c.dir.z * 5;
  const entry = pick('statue', hash(seg.id, 42));
  if (entry) place(entry, x, GROUND_Y, z, Math.atan2(-c.dir.x, -c.dir.z), 1.4);
}
