import * as THREE from 'three';
import type { Game } from '../core/game';
import { Segment, TRACK_HALF_WIDTH, Track } from '../core/track';
import { STUB_LENGTH } from './floorView';
import { activeBiome } from './biome';
import { pbrMaterial, textures } from './textures';
import { disposeGroup, faceHeading } from './util';

const WALL_HEIGHT = 2;
const WALL_THICKNESS = 0.5;

// Textures are created lazily because the canvas needs a DOM; materials are shared by all segments.
let wallMaterial: THREE.MeshStandardMaterial;
const TEXTURE_METRES = 2; // one texture tile covers 2 m of track
const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xe94560, emissive: 0xe94560, emissiveIntensity: 0.3 });

const groups = new Map<number, THREE.Group>();
let root: THREE.Scene;

// Props share geometry/material across segments.
const totemGeo = new THREE.BoxGeometry(0.9, 3.4, 0.9);
let totemMat: THREE.MeshStandardMaterial;
let glyphMat: THREE.MeshStandardMaterial;
const totemEyeGeo = new THREE.BoxGeometry(0.2, 0.12, 0.08);
const totemEyeMat = new THREE.MeshStandardMaterial({ color: 0xffd040, emissive: 0xffb000, emissiveIntensity: 1.5 });


function addTotem(group: THREE.Group, x: number, z: number, dir: { x: number; z: number }): void {
  const totem = new THREE.Group();
  totem.position.set(x, 1.7, z);
  faceHeading(totem, dir);
  const body = new THREE.Mesh(totemGeo, totemMat);
  body.castShadow = true;
  totem.add(body);
  for (const [ey, scale] of [[1.1, 1], [0.2, 0.8], [-0.7, 0.6]] as const) {
    for (const side of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(totemEyeGeo, totemEyeMat);
      eye.position.set(side * scale, ey, -0.47);
      eye.scale.setScalar(scale);
      totem.add(eye);
    }
  }
  group.add(totem);
}

export function initTrackView(scene: THREE.Scene): void {
  root = scene;
  const tex = textures();
  wallMaterial = pbrMaterial(tex.wall, { color: activeBiome().wallTint });
  // The totem is a 0.9 × 3.4 m pole: stack the carved face texture instead of stretching it.
  for (const t of [tex.totem.map, tex.totem.normalMap, tex.totem.roughnessMap]) t.repeat.set(1, 3.5);
  totemMat = pbrMaterial(tex.totem, { color: 0xffffff });
  glyphMat = pbrMaterial(tex.glyph, { color: 0xffe0a0, emissive: 0x6a4a10, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.4 });
}

/** Box with UVs scaled so the texture repeats every TEXTURE_METRES on each face. */
function texturedBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // Face order in BoxGeometry: +x, -x, +y, -y, +z, -z; each face has 4 vertices.
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = sizes[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * (su / TEXTURE_METRES), uv.getY(idx) * (sv / TEXTURE_METRES));
    }
  }
  uv.needsUpdate = true;
  return geo;
}

export function updateTrackView(game: Game): void {
  const live = new Set<number>();
  for (const seg of game.track.allSegments()) {
    live.add(seg.id);
    if (!groups.has(seg.id)) {
      const g = buildSegment(game.track, seg);
      groups.set(seg.id, g);
      root.add(g);
    }
  }
  for (const [id, g] of groups) {
    if (!live.has(id)) {
      root.remove(g);
      disposeGroup(g);
      groups.delete(id);
    }
  }
}

export function resetTrackView(): void {
  for (const g of groups.values()) {
    root.remove(g);
    disposeGroup(g);
  }
  groups.clear();
}

/** Walls covering the centre line from s0 to s1 (world placement from sample()); floors are instanced in floorView. */
function addStraightPiece(group: THREE.Group, track: Track, seg: Segment, s0: number, s1: number, x: number, overhang: number, walls: { left: boolean; right: boolean }): void {
  const length = s1 - s0 + overhang;
  const mid = track.sampleSegment(seg, (s0 + s1) / 2, x);
  const dir = mid.dir;

  for (const side of [-1, 1] as const) {
    if ((side === -1 && !walls.left) || (side === 1 && !walls.right)) continue;
    const wallSample = track.sampleSegment(seg, (s0 + s1) / 2, side * (TRACK_HALF_WIDTH + WALL_THICKNESS / 2));
    const wall = new THREE.Mesh(texturedBox(WALL_THICKNESS, WALL_HEIGHT, length), wallMaterial);
    wall.position.set(wallSample.x, WALL_HEIGHT / 2, wallSample.z);
    faceHeading(wall, dir);
    wall.castShadow = true;
    group.add(wall);
  }
}

function wallBox(length: number): THREE.Mesh {
  const m = new THREE.Mesh(texturedBox(WALL_THICKNESS, WALL_HEIGHT, length), wallMaterial);
  m.position.y = WALL_HEIGHT / 2; m.castShadow = true;
  return m;
}

/** T-junction: far wall across both stubs, near-side stub walls, arrows both ways, a totem facing the runner. */
function buildFork(group: THREE.Group, c: { x: number; z: number; dir: { x: number; z: number } }, at: (dx: number, dz: number) => THREE.Vector3): void {
  const dirIn = c.dir;
  const rightIn = { x: -dirIn.z, z: dirIn.x };
  const lateral = TRACK_HALF_WIDTH + WALL_THICKNESS / 2;
  const span = TRACK_HALF_WIDTH + STUB_LENGTH;
  // Far wall of the T.
  const far = wallBox(span * 2 + WALL_THICKNESS);
  far.position.add(at(dirIn.x * lateral, dirIn.z * lateral));
  faceHeading(far, rightIn);
  group.add(far);
  for (const side of [-1, 1] as const) {
    const dirSide = { x: side * rightIn.x, z: side * rightIn.z };
    // Near-side wall of the stub, from the square edge to the stub end.
    const near = wallBox(STUB_LENGTH);
    const mid = TRACK_HALF_WIDTH + STUB_LENGTH / 2;
    near.position.add(at(dirSide.x * mid - dirIn.x * lateral, dirSide.z * mid - dirIn.z * lateral));
    faceHeading(near, dirSide);
    group.add(near);
    // Arrow pointing into the stub.
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), accentMaterial);
    arrow.position.set(c.x + dirSide.x * 1.5, 0.8, c.z + dirSide.z * 1.5);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dirSide.x, 0, dirSide.z));
    group.add(arrow);
  }
  const marker = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 3), glyphMat);
  marker.position.set(c.x, 0.03, c.z);
  group.add(marker);
  // Totem on the far wall, looking back down the incoming corridor.
  const tot = at(dirIn.x * (TRACK_HALF_WIDTH + 1.0), dirIn.z * (TRACK_HALF_WIDTH + 1.0));
  addTotem(group, tot.x, tot.z, dirIn);
}

function buildSegment(track: Track, seg: Segment): THREE.Group {
  const group = new THREE.Group();
  const s0 = seg.s0;
  const s1 = seg.s0 + seg.length;

  if (seg.kind === 'straight') {
    addStraightPiece(group, track, seg, s0, s1, 0, 0.1, { left: true, right: true });
    return group;
  }

  // Turn: run-in corridor, a full 6x6 corner square, run-out corridor.
  const corner = track.cornerOf(seg);
  const isLeft = seg.turn === 'left';
  addStraightPiece(group, track, seg, s0, corner - TRACK_HALF_WIDTH, 0, 0.1, { left: true, right: true });
  if (!seg.fork) addStraightPiece(group, track, seg, corner + TRACK_HALF_WIDTH, s1, 0, 0.1, { left: true, right: true });

  const c = track.sampleSegment(seg, corner - 1e-6);            // corner point, incoming heading
  const dirIn = c.dir;
  const dirOut = seg.outDir;
  const rightIn = { x: -dirIn.z, z: dirIn.x };
  const rightOut = { x: -dirOut.z, z: dirOut.x };
  const outer = isLeft ? 1 : -1;                     // outer side of the bend (in both headings)
  const lateral = TRACK_HALF_WIDTH + WALL_THICKNESS / 2;
  const at = (dx: number, dz: number) => new THREE.Vector3(c.x + dx, 0, c.z + dz);

  if (seg.fork) { buildFork(group, c, at); return group; }

  // Outer wall, incoming heading: continues the run-in outer wall across the square.
  const wallLen = TRACK_HALF_WIDTH * 2 + WALL_THICKNESS;
  const outerIn = new THREE.Mesh(texturedBox(WALL_THICKNESS, WALL_HEIGHT, wallLen), wallMaterial);
  outerIn.position.copy(at(dirIn.x * (WALL_THICKNESS / 2) + outer * rightIn.x * lateral, dirIn.z * (WALL_THICKNESS / 2) + outer * rightIn.z * lateral));
  outerIn.position.y = WALL_HEIGHT / 2;
  faceHeading(outerIn, dirIn);
  outerIn.castShadow = true;
  group.add(outerIn);

  // Far wall, outgoing heading: closes the square on the side the player runs toward.
  const outerOut = new THREE.Mesh(texturedBox(WALL_THICKNESS, WALL_HEIGHT, wallLen), wallMaterial);
  outerOut.position.copy(at(-dirOut.x * (WALL_THICKNESS / 2) + outer * rightOut.x * lateral, -dirOut.z * (WALL_THICKNESS / 2) + outer * rightOut.z * lateral));
  outerOut.position.y = WALL_HEIGHT / 2;
  faceHeading(outerOut, dirOut);
  outerOut.castShadow = true;
  group.add(outerOut);

  // Inner corner post fills the notch where the two inner walls meet.
  const post = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS), wallMaterial);
  post.position.copy(at(-dirIn.x * lateral - outer * rightIn.x * lateral, -dirIn.z * lateral - outer * rightIn.z * lateral));
  post.position.y = WALL_HEIGHT / 2;
  faceHeading(post, dirIn);
  group.add(post);

  // Totem watching the corner from the far outer side, facing the incoming runner.
  const tot = at(dirIn.x * (TRACK_HALF_WIDTH + 1.0) + outer * rightIn.x * (TRACK_HALF_WIDTH - 0.9), dirIn.z * (TRACK_HALF_WIDTH + 1.0) + outer * rightIn.z * (TRACK_HALF_WIDTH - 0.9));
  addTotem(group, tot.x, tot.z, dirIn);

  // Corner marker and arrow pointing along the new heading.
  const marker = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 3), glyphMat);
  marker.position.set(c.x, 0.03, c.z);
  group.add(marker);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), accentMaterial);
  arrow.position.set(c.x + seg.outDir.x * 1.5, 0.8, c.z + seg.outDir.z * 1.5);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(seg.outDir.x, 0, seg.outDir.z));
  group.add(arrow);

  return group;
}
