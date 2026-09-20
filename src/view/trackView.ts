import * as THREE from 'three';
import type { Game } from '../core/game';
import { SEGMENT_LENGTH, Segment, TRACK_HALF_WIDTH, Track } from '../core/track';
import { textures } from './textures';
import { disposeGroup, faceHeading } from './util';

const WALL_HEIGHT = 2;
const WALL_THICKNESS = 0.5;
const FLOOR_THICKNESS = 0.5;

// Textures are created lazily because the canvas needs a DOM; materials are shared by all segments.
let floorMaterial: THREE.MeshStandardMaterial;
let wallMaterial: THREE.MeshStandardMaterial;
const TEXTURE_METRES = 2; // one texture tile covers 2 m of track
const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xe94560, emissive: 0xe94560, emissiveIntensity: 0.3 });
const stripeGeometry = new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2, 0.02, 0.4);

const groups = new Map<number, THREE.Group>();
let root: THREE.Scene;

export function initTrackView(scene: THREE.Scene): void {
  root = scene;
  const t = textures();
  floorMaterial = new THREE.MeshStandardMaterial({ map: t.floor, color: 0xb0b8c8, roughness: 0.9 });
  wallMaterial = new THREE.MeshStandardMaterial({ map: t.wall, color: 0x9a9aa8, roughness: 0.8 });
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
  for (const seg of game.track.segments) {
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

/** Floor slab plus two walls covering the centre line from s0 to s1 (world placement from sample()). */
function addStraightPiece(group: THREE.Group, track: Track, s0: number, s1: number, x: number, overhang: number, walls: { left: boolean; right: boolean }): void {
  const length = s1 - s0 + overhang;
  const mid = track.sample((s0 + s1) / 2, x);
  const dir = mid.dir;

  const floor = new THREE.Mesh(texturedBox(TRACK_HALF_WIDTH * 2, FLOOR_THICKNESS, length), floorMaterial);
  floor.position.set(mid.x, -FLOOR_THICKNESS / 2, mid.z);
  faceHeading(floor, dir);
  floor.receiveShadow = true;
  group.add(floor);

  for (const side of [-1, 1] as const) {
    if ((side === -1 && !walls.left) || (side === 1 && !walls.right)) continue;
    const wallSample = track.sample((s0 + s1) / 2, side * (TRACK_HALF_WIDTH + WALL_THICKNESS / 2));
    const wall = new THREE.Mesh(texturedBox(WALL_THICKNESS, WALL_HEIGHT, length), wallMaterial);
    wall.position.set(wallSample.x, WALL_HEIGHT / 2, wallSample.z);
    faceHeading(wall, dir);
    wall.castShadow = true;
    group.add(wall);
  }
}

function buildSegment(track: Track, seg: Segment): THREE.Group {
  const group = new THREE.Group();
  const s0 = seg.s0;
  const s1 = seg.s0 + seg.length;

  if (seg.kind === 'straight') {
    addStraightPiece(group, track, s0, s1, 0, 0.1, { left: true, right: true });
    for (let i = 1; i <= 4; i++) {
      const p = track.sample(s0 + (i * SEGMENT_LENGTH) / 5);
      const stripe = new THREE.Mesh(stripeGeometry, accentMaterial);
      stripe.position.set(p.x, 0.01, p.z);
      faceHeading(stripe, p.dir);
      group.add(stripe);
    }
    return group;
  }

  // Turn: run-in corridor, a full 6x6 corner square, run-out corridor.
  const corner = track.cornerOf(seg);
  const isLeft = seg.turn === 'left';
  addStraightPiece(group, track, s0, corner - TRACK_HALF_WIDTH, 0, 0.1, { left: true, right: true });
  addStraightPiece(group, track, corner + TRACK_HALF_WIDTH, s1, 0, 0.1, { left: true, right: true });

  const c = track.sample(corner - 1e-6);            // corner point, incoming heading
  const dirIn = c.dir;
  const dirOut = seg.outDir;
  const rightIn = { x: -dirIn.z, z: dirIn.x };
  const rightOut = { x: -dirOut.z, z: dirOut.x };
  const outer = isLeft ? 1 : -1;                     // outer side of the bend (in both headings)
  const lateral = TRACK_HALF_WIDTH + WALL_THICKNESS / 2;
  const at = (dx: number, dz: number) => new THREE.Vector3(c.x + dx, 0, c.z + dz);

  const square = new THREE.Mesh(texturedBox(TRACK_HALF_WIDTH * 2, FLOOR_THICKNESS, TRACK_HALF_WIDTH * 2), floorMaterial);
  square.position.copy(at(0, 0)); square.position.y = -FLOOR_THICKNESS / 2;
  faceHeading(square, dirIn);
  square.receiveShadow = true;
  group.add(square);

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

  // Corner marker and arrow pointing along the new heading.
  const marker = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 3), accentMaterial);
  marker.position.set(c.x, 0.03, c.z);
  group.add(marker);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), accentMaterial);
  arrow.position.set(c.x + seg.outDir.x * 1.5, 0.8, c.z + seg.outDir.z * 1.5);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(seg.outDir.x, 0, seg.outDir.z));
  group.add(arrow);

  return group;
}
