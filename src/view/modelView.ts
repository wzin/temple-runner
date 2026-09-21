import * as THREE from 'three';
import type { Game } from '../core/game';
import { Segment, TRACK_HALF_WIDTH, Track } from '../core/track';
import { GROUND_Y } from './groundView';
import { loadGLB } from './loading';

/**
 * Real low-poly models placed as instanced meshes:
 *  - Kenney kits (Nature, Castle, Graveyard, Mini Dungeon, Pirate, Platformer; CC0): one GLB per model.
 *  - Quaternius Modular Ruins pack (CC0): one library GLB (`ruins.glb`) whose named pieces are used
 *    individually (arches, columns, broken walls, statues, pots, skulls...).
 * Each model is flattened into its mesh parts; every part becomes an InstancedMesh receiving the same
 * per-instance matrices, so a model with a trunk and two leaf blobs costs three draw calls in total.
 * Models are normalised so their base sits at y = 0 and they are centred on x/z.
 * Placement is seeded per segment so the world stays put while the player runs.
 */

type Kind = 'tree' | 'palm' | 'rock' | 'plant' | 'statue' | 'debris' | 'column' | 'ruin' | 'tower' | 'prop' | 'shrine' | 'crest' | 'idol' | 'landmark';
interface ModelDef { name: string; kind: Kind; scale: number; max: number; lib?: string; gold?: boolean }
const RUINS = 'ruins';
const NATURE = 'nature';
const MODELS: ModelDef[] = [
  // Quaternius Stylized Nature (textured, normal-mapped): the forest on the low ground
  { name: 'NormalTree_1', kind: 'tree', scale: 1.6, max: 96, lib: NATURE },
  { name: 'NormalTree_2', kind: 'tree', scale: 1.6, max: 96, lib: NATURE },
  { name: 'NormalTree_3', kind: 'tree', scale: 1.7, max: 96, lib: NATURE },
  { name: 'NormalTree_4', kind: 'tree', scale: 1.7, max: 96, lib: NATURE },
  { name: 'NormalTree_5', kind: 'tree', scale: 2.2, max: 96, lib: NATURE },
  { name: 'PineTree_5', kind: 'tree', scale: 1.8, max: 96, lib: NATURE },
  { name: 'PineTree_1', kind: 'tree', scale: 2.0, max: 96, lib: NATURE },
  { name: 'PineTree_2', kind: 'tree', scale: 1.6, max: 96, lib: NATURE },
  { name: 'PineTree_4', kind: 'tree', scale: 2.0, max: 96, lib: NATURE },
  { name: 'DeadTree_6', kind: 'tree', scale: 1.5, max: 48, lib: NATURE },
  { name: 'DeadTree_8', kind: 'tree', scale: 1.4, max: 48, lib: NATURE },
  { name: 'DeadTree_10', kind: 'tree', scale: 1.5, max: 48, lib: NATURE },
  { name: 'TwistedTree_1', kind: 'landmark', scale: 1.0, max: 12, lib: NATURE },
  { name: 'PalmTree_1', kind: 'palm', scale: 2.0, max: 96, lib: NATURE },
  { name: 'PalmTree_2', kind: 'palm', scale: 2.0, max: 96, lib: NATURE },
  { name: 'PalmTree_3', kind: 'palm', scale: 2.2, max: 96, lib: NATURE },
  { name: 'PalmTree_4', kind: 'palm', scale: 2.0, max: 96, lib: NATURE },
  { name: 'PalmTree_5', kind: 'palm', scale: 2.4, max: 96, lib: NATURE },
  { name: 'Rock_1', kind: 'rock', scale: 2.4, max: 64, lib: NATURE },
  { name: 'Rock_2', kind: 'rock', scale: 2.4, max: 64, lib: NATURE },
  { name: 'Rock_3', kind: 'rock', scale: 2.6, max: 64, lib: NATURE },
  { name: 'Rock_4', kind: 'rock', scale: 2.2, max: 64, lib: NATURE },
  { name: 'Rock_5', kind: 'rock', scale: 2.4, max: 64, lib: NATURE },
  { name: 'Bush', kind: 'plant', scale: 2.4, max: 192, lib: NATURE },
  { name: 'Bush_Flowers', kind: 'plant', scale: 2.4, max: 192, lib: NATURE },
  { name: 'Plant_1', kind: 'plant', scale: 2.2, max: 192, lib: NATURE },
  { name: 'Plant_Flowers', kind: 'plant', scale: 1.8, max: 192, lib: NATURE },
  { name: 'Plant_2', kind: 'plant', scale: 2.0, max: 192, lib: NATURE },
  { name: 'Grass_Large_Extruded', kind: 'plant', scale: 3.0, max: 256, lib: NATURE },
  // Kenney fillers that still fit
  { name: 'rock_largeA', kind: 'rock', scale: 2.0, max: 64 },
  { name: 'stone_tallA', kind: 'rock', scale: 1.8, max: 48 },
  { name: 'stone_tallB', kind: 'rock', scale: 1.8, max: 48 },
  { name: 'rocks-tall', kind: 'rock', scale: 1.3, max: 48 },
  { name: 'flower_purpleA', kind: 'plant', scale: 1.4, max: 64 },
  { name: 'flowers-tall', kind: 'plant', scale: 1.6, max: 64 },
  { name: 'mushrooms', kind: 'plant', scale: 1.4, max: 64 },
  { name: 'Bush_Round', kind: 'plant', scale: 1.6, max: 64, lib: RUINS },
  // Statues at the bends
  { name: 'statue_head', kind: 'statue', scale: 2.2, max: 24 },
  { name: 'statue_obelisk', kind: 'statue', scale: 2.4, max: 24 },
  { name: 'Statue_Stag', kind: 'statue', scale: 1.5, max: 24, lib: RUINS },
  { name: 'Statue_Fox', kind: 'statue', scale: 1.6, max: 24, lib: RUINS },
  // Golden idols on the T wall of every fork (the same statues, cast in gold)
  { name: 'Statue_Fox', kind: 'idol', scale: 1.1, max: 16, lib: RUINS, gold: true },
  { name: 'Statue_Stag', kind: 'idol', scale: 0.9, max: 16, lib: RUINS, gold: true },
  // Path stones and rubble
  { name: 'rock_smallA', kind: 'debris', scale: 0.35, max: 384 },
  { name: 'rock_smallB', kind: 'debris', scale: 0.3, max: 384 },
  { name: 'stones', kind: 'debris', scale: 0.5, max: 256 },
  { name: 'debris', kind: 'debris', scale: 0.6, max: 256 },
  // Crests on the wall tops between the columns: spikes and skulls
  { name: 'spike-block', kind: 'crest', scale: 0.7, max: 128 },
  { name: 'trap-spikes', kind: 'crest', scale: 0.8, max: 128 },
  { name: 'Skull', kind: 'crest', scale: 0.9, max: 128, lib: RUINS },
  // Columns on the wall tops at segment joints
  { name: 'Column_Round', kind: 'column', scale: 0.8, max: 96, lib: RUINS },
  { name: 'Column_Square', kind: 'column', scale: 0.8, max: 96, lib: RUINS },
  { name: 'Column_Round_Short', kind: 'column', scale: 1.4, max: 96, lib: RUINS },
  { name: 'column-large', kind: 'column', scale: 1.6, max: 64 },
  { name: 'pillar-obelisk', kind: 'column', scale: 1.8, max: 64 },
  { name: 'pillar-large', kind: 'column', scale: 1.6, max: 64 },
  // Ruined walls and towers on the low ground
  { name: 'Wall_ArchRound_Overgrown', kind: 'ruin', scale: 2.8, max: 96, lib: RUINS },
  { name: 'Wall_ArchRound_Overgrown_Broken', kind: 'ruin', scale: 2.8, max: 96, lib: RUINS },
  { name: 'Wall_ArchRound_Broken', kind: 'ruin', scale: 2.8, max: 96, lib: RUINS },
  { name: 'Wall_Broken', kind: 'ruin', scale: 2.8, max: 96, lib: RUINS },
  { name: 'Wall_Overgrown', kind: 'ruin', scale: 2.8, max: 96, lib: RUINS },
  { name: 'Wall_Double_Broken', kind: 'ruin', scale: 2.8, max: 96, lib: RUINS },
  { name: 'Window_Bars_Overgrown', kind: 'ruin', scale: 2.8, max: 96, lib: RUINS },
  { name: 'Support_Tall', kind: 'ruin', scale: 2.4, max: 96, lib: RUINS },
  { name: 'Column_BridgeSupport', kind: 'ruin', scale: 2.4, max: 96, lib: RUINS },
  { name: 'stone-wall-damaged', kind: 'ruin', scale: 3.0, max: 96 },
  { name: 'tower-square-base', kind: 'tower', scale: 3.2, max: 24 },
  { name: 'tower-square-mid-open', kind: 'tower', scale: 3.2, max: 24 },
  { name: 'tower-square-top', kind: 'tower', scale: 3.2, max: 24 },
  { name: 'tower-square-arch', kind: 'tower', scale: 3.2, max: 24 },
  // Small props at the foot of the walls, on the path
  { name: 'Pot1', kind: 'prop', scale: 0.7, max: 128, lib: RUINS },
  { name: 'Pot1_Broken', kind: 'prop', scale: 0.7, max: 128, lib: RUINS },
  { name: 'Pot2', kind: 'prop', scale: 0.8, max: 128, lib: RUINS },
  { name: 'Pot3', kind: 'prop', scale: 0.8, max: 128, lib: RUINS },
  { name: 'Barrel', kind: 'prop', scale: 0.7, max: 128, lib: RUINS },
  { name: 'Crate', kind: 'prop', scale: 0.7, max: 128, lib: RUINS },
  { name: 'Candles_1', kind: 'prop', scale: 0.7, max: 128, lib: RUINS },
  { name: 'urn-round', kind: 'prop', scale: 0.9, max: 128 },
  { name: 'urn-square', kind: 'prop', scale: 0.9, max: 128 },
  { name: 'chest', kind: 'prop', scale: 0.8, max: 64 },
  { name: 'pot', kind: 'prop', scale: 0.8, max: 128 },
  // Shrines in the ruin clusters
  { name: 'altar-stone', kind: 'shrine', scale: 2.2, max: 24 },
  { name: 'fire-basket', kind: 'shrine', scale: 2.0, max: 24 },
  { name: 'Chest_Base', kind: 'shrine', scale: 1.6, max: 24, lib: RUINS },
];

interface Loaded { def: ModelDef; parts: THREE.InstancedMesh[]; count: number; width: number; height: number }
const loaded = new Map<string, Loaded>();
const byKind = new Map<Kind, Loaded[]>();
const dummy = new THREE.Object3D();
const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const WALL_TOP = 2;
(window as unknown as { __models?: unknown }).__models = loaded; // debug: per-model instance counts

/** Turn a model's meshes into instanced parts: world transforms baked, base at y = 0, centred on x/z. */
function register(scene: THREE.Scene, def: ModelDef, root: THREE.Object3D, meshes: THREE.Mesh[]): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const geos: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  for (const o of meshes) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const geo = (o.geometry as THREE.BufferGeometry).clone();
    geo.applyMatrix4(o.matrixWorld);
    if (geo.groups.length > 1 && mats.length > 1) {
      // Multi-material mesh: split by group so every part has one material.
      for (const g of geo.groups) {
        const sub = geo.clone(); const idx = geo.getIndex();
        if (idx) sub.setIndex(new THREE.BufferAttribute(idx.array.slice(g.start, g.start + g.count), 1));
        sub.clearGroups();
        geos.push({ geo: sub, mat: mats[g.materialIndex ?? 0] });
      }
    } else geos.push({ geo, mat: mats[0] });
    geo.computeBoundingBox(); box.union(geo.boundingBox!);
  }
  const size = box.getSize(new THREE.Vector3());
  const cx = (box.min.x + box.max.x) / 2; const cz = (box.min.z + box.max.z) / 2;
  const parts: THREE.InstancedMesh[] = [];
  for (const { geo, mat } of geos) {
    geo.translate(-cx, -box.min.y, -cz);
    geo.scale(def.scale, def.scale, def.scale);
    const m = (mat as THREE.MeshStandardMaterial).clone();
    m.roughness = Math.max(m.roughness, 0.85); m.metalness = 0;
    if (def.gold) { m.map = null; m.color.set(0xd9a52a); m.emissive.set(0x5a3a08); m.emissiveIntensity = 0.5; m.metalness = 0.85; m.roughness = 0.3; }
    if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 4; }
    // Kenney's flat foliage is a minty teal; pull anything green-ish towards jungle greens (varies per model).
    const c = m.color; const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    if (!m.map && hsl.h > 0.3 && hsl.h < 0.55 && hsl.s > 0.2) {
      const k = MODELS.indexOf(def) / MODELS.length;
      c.setHSL(0.27 + k * 0.06, 0.45 + hsl.s * 0.3, Math.min(0.42, hsl.l * 0.8));
    }
    const inst = new THREE.InstancedMesh(geo, m, def.max);
    inst.count = 0; inst.frustumCulled = false;
    scene.add(inst);
    parts.push(inst);
  }
  const entry: Loaded = { def, parts, count: 0, width: Math.max(size.x, size.z) * def.scale, height: size.y * def.scale };
  loaded.set(def.kind + ':' + def.name, entry);
  const list = byKind.get(def.kind) ?? []; list.push(entry); byKind.set(def.kind, list);
}

export function initModels(scene: THREE.Scene): void {
  for (const def of MODELS.filter((d) => !d.lib)) {
    loadGLB(`/models/kenney/${def.name}.glb`).then((gltf) => {
      const meshes: THREE.Mesh[] = [];
      gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
      register(scene, def, gltf.scene, meshes);
    }).catch(() => { /* model missing: nothing placed */ });
  }
  // Library GLBs: one file, many named pieces.
  for (const lib of new Set(MODELS.filter((d) => d.lib).map((d) => d.lib!))) {
    loadGLB(`/models/${lib}/${lib}.glb`).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      for (const def of MODELS.filter((d) => d.lib === lib)) {
        const node = gltf.scene.getObjectByName(def.name);
        if (!node) continue;
        // Pieces are laid out in a grid in the pack: strip the node's own translation, keep rotation/scale.
        const pos = new THREE.Vector3(); const quat = new THREE.Quaternion(); const scl = new THREE.Vector3();
        node.matrixWorld.decompose(pos, quat, scl);
        const local = new THREE.Matrix4().compose(new THREE.Vector3(), quat, scl);
        const meshes: THREE.Mesh[] = [];
        node.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
        // Temporarily rewrite matrixWorld so register() bakes a translation-free transform.
        const saved = meshes.map((m) => m.matrixWorld.clone());
        const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
        meshes.forEach((m, i) => m.matrixWorld.copy(local).multiply(inv).multiply(saved[i]));
        const holder = new THREE.Object3D(); holder.matrixWorld.identity();
        register(scene, def, holder, meshes);
        meshes.forEach((m, i) => m.matrixWorld.copy(saved[i]));
      }
    }).catch(() => { /* library missing */ });
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
/** Centres of the ruin clusters laid this frame; cloudView drapes mist over them. */
export interface MistPatch { x: number; z: number; r: number; seed: number }
export const mistPatches: MistPatch[] = [];

export function updateModels(game: Game): void {
  for (const e of loaded.values()) e.count = 0;
  mistPatches.length = 0;
  const track = game.track;
  const gaps = game.spawner.obstacles.filter((o) => o.kind === 'gap');
  const nearGap = (s: number, pad = 1) => gaps.some((g) => s > g.s0 - pad && s < g.s1 + pad);
  for (const seg of track.allSegments()) {
    if (seg.kind !== 'straight') { statuesAt(track, seg); continue; }
    const start = track.sampleSegment(seg, seg.s0 + 0.01);
    const yaw = Math.atan2(start.dir.x, start.dir.z);
    // Forest on the low ground.
    for (let i = 0; i < 40; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const r1 = hash(seg.id, 1000 + i); const r2 = hash(seg.id, 1100 + i); const r3 = hash(seg.id, 1200 + i); const kindR = hash(seg.id, 1300 + i);
      const s = seg.s0 + 1 + r1 * (seg.length - 2);
      const lateral = side * (TRACK_HALF_WIDTH + 5 + r2 * 20);
      const w = track.sampleSegment(seg, s, lateral);
      const kind: Kind = kindR < 0.5 ? 'tree' : kindR < 0.62 ? 'palm' : kindR < 0.74 ? 'rock' : 'plant';
      const entry = pick(kind, r3);
      if (entry) place(entry, w.x, GROUND_Y, w.z, r2 * Math.PI * 2, 0.8 + r3 * 0.6);
    }
    // Ruin clusters: wall pieces and a shrine around a centre 10–25 m out, walls snapped to right angles. The
    // cluster is tied together by a ring of undergrowth, rubble between the pieces and a mist patch (cloudView).
    if (hash(seg.id, 2000) < 0.75) {
      const side = hash(seg.id, 2001) < 0.5 ? -1 : 1;
      const cs = seg.s0 + 4 + hash(seg.id, 2002) * (seg.length - 8);
      const cl = side * (TRACK_HALF_WIDTH + 10 + hash(seg.id, 2003) * 14);
      const n = 3 + Math.floor(hash(seg.id, 2004) * 3);
      for (let i = 0; i < n; i++) {
        const r = hash(seg.id, 2010 + i);
        const w = track.sampleSegment(seg, cs + (hash(seg.id, 2020 + i) - 0.5) * 12, cl + (hash(seg.id, 2030 + i) - 0.5) * 12);
        const entry = pick(r < 0.8 ? 'ruin' : 'tower', hash(seg.id, 2040 + i));
        if (entry) place(entry, w.x, GROUND_Y - 0.2, w.z, yaw + Math.floor(r * 4) * Math.PI / 2 + (r - 0.5) * 0.2, 0.9 + hash(seg.id, 2050 + i) * 0.4);
      }
      if (hash(seg.id, 2005) < 0.6) {
        const w = track.sampleSegment(seg, cs, cl);
        const entry = pick('shrine', hash(seg.id, 2006));
        if (entry) place(entry, w.x, GROUND_Y, w.z, yaw, 1);
      }
      for (let i = 0; i < 14; i++) {
        const a = hash(seg.id, 2060 + i) * Math.PI * 2; const d = 4 + hash(seg.id, 2080 + i) * 7;
        const w = track.sampleSegment(seg, cs + Math.cos(a) * d, cl + Math.sin(a) * d);
        const r = hash(seg.id, 2100 + i);
        const entry = pick(r < 0.65 ? 'plant' : r < 0.85 ? 'debris' : 'rock', hash(seg.id, 2120 + i));
        if (entry) place(entry, w.x, GROUND_Y, w.z, a, r < 0.65 ? 0.9 + r : 1.2 + r);
      }
      const c = track.sampleSegment(seg, cs, cl);
      mistPatches.push({ x: c.x, z: c.z, r: 9 + hash(seg.id, 2007) * 5, seed: seg.id });
    }
    // A giant twisted tree as a landmark now and then, far out.
    if (hash(seg.id, 2500) < 0.12) {
      const w = track.sampleSegment(seg, seg.s0 + 10, (hash(seg.id, 2501) < 0.5 ? -1 : 1) * (TRACK_HALF_WIDTH + 22 + hash(seg.id, 2502) * 12));
      const entry = pick('landmark', hash(seg.id, 2503));
      if (entry) place(entry, w.x, GROUND_Y - 0.3, w.z, hash(seg.id, 2504) * Math.PI * 2, 0.9 + hash(seg.id, 2505) * 0.4);
    }
    // Mist over the low ground on both sides, so the scattered ruins and trees sit in one haze.
    for (const side of [-1, 1]) {
      const c = track.sampleSegment(seg, seg.s0 + 6 + hash(seg.id, 2600 + side) * 8, side * (TRACK_HALF_WIDTH + 12 + hash(seg.id, 2610 + side) * 10));
      mistPatches.push({ x: c.x, z: c.z, r: 10 + hash(seg.id, 2620 + side) * 6, seed: seg.id * 3 + side });
    }
    // Columns on the wall tops where segments meet.
    if (seg.s0 > 20 && hash(seg.id, 2140) < 0.6 && !nearGap(seg.s0, 2)) {
      const entry = pick('column', hash(seg.id, 2141));
      if (entry) for (const side of [-1, 1]) {
        const w = track.sampleSegment(seg, seg.s0, side * (TRACK_HALF_WIDTH + 0.25));
        place(entry, w.x, WALL_TOP, w.z, yaw, 1);
      }
    }
    // Spikes and skulls along the wall tops (never where a gap cuts the wall).
    for (let i = 0; i < 6; i++) {
      const r = hash(seg.id, 2200 + i);
      if (r > 0.45) continue;
      const side = i % 2 === 0 ? -1 : 1;
      const s = seg.s0 + 1.5 + hash(seg.id, 2210 + i) * (seg.length - 3);
      if (nearGap(s, 1.5)) continue;
      const w = track.sampleSegment(seg, s, side * (TRACK_HALF_WIDTH + 0.25));
      const entry = pick('crest', hash(seg.id, 2220 + i));
      if (entry) place(entry, w.x, WALL_TOP, w.z, yaw + (r < 0.2 ? Math.PI / 2 : 0), 0.9 + hash(seg.id, 2230 + i) * 0.3);
    }
    // Pots, crates and skulls at the foot of the walls; small stones on the path itself.
    for (let i = 0; i < 10; i++) {
      const r = hash(seg.id, 2300 + i);
      if (r > 0.6) continue;
      const side = i % 2 === 0 ? -1 : 1;
      const s = seg.s0 + 2 + hash(seg.id, 2310 + i) * (seg.length - 4);
      if (nearGap(s, 1.5)) continue;
      const w = track.sampleSegment(seg, s, side * (TRACK_HALF_WIDTH - 0.45));
      const entry = pick('prop', hash(seg.id, 2320 + i));
      if (entry) place(entry, w.x, 0, w.z, r * 20, 0.8 + hash(seg.id, 2330 + i) * 0.4);
    }
    for (let i = 0; i < 10; i++) {
      const r = hash(seg.id, 1400 + i);
      if (r > 0.65) continue;
      const s = seg.s0 + 2 + hash(seg.id, 1500 + i) * (seg.length - 4);
      const x = (hash(seg.id, 1600 + i) - 0.5) * 5;
      if (nearGap(s)) continue;
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
  // Forks: a golden idol on top of the T wall, facing the runner, glinting between the two choices.
  if (seg.fork) {
    const idol = pick('idol', hash(seg.id, 44));
    if (idol) {
      const w = track.sampleSegment(seg, corner + TRACK_HALF_WIDTH + 0.25, 0);
      place(idol, w.x, WALL_TOP, w.z, Math.atan2(-c.dir.x, -c.dir.z), 1);
    }
  }
  // A pair of columns flanking the corner on the wall tops.
  const col = pick('column', hash(seg.id, 43));
  if (col) for (const side of [-1, 1]) {
    const w = track.sampleSegment(seg, seg.s0, side * (TRACK_HALF_WIDTH + 0.25));
    place(col, w.x, WALL_TOP, w.z, Math.atan2(w.dir.x, w.dir.z), 1);
  }
}
