import * as THREE from 'three';
import type { Game } from '../core/game';
import { SEGMENT_LENGTH, Segment, TRACK_HALF_WIDTH, Track } from '../core/track';
import { disposeGroup, faceHeading } from './util';

const WALL_HEIGHT = 2;
const WALL_THICKNESS = 0.5;
const FLOOR_THICKNESS = 0.5;

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.8 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1a202c, roughness: 0.6 });
const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xe94560, emissive: 0xe94560, emissiveIntensity: 0.3 });
const stripeGeometry = new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2, 0.02, 0.4);

const groups = new Map<number, THREE.Group>();
let root: THREE.Scene;

export function initTrackView(scene: THREE.Scene): void {
  root = scene;
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

  const floor = new THREE.Mesh(new THREE.BoxGeometry(TRACK_HALF_WIDTH * 2, FLOOR_THICKNESS, length), floorMaterial);
  floor.position.set(mid.x, -FLOOR_THICKNESS / 2, mid.z);
  faceHeading(floor, dir);
  floor.receiveShadow = true;
  group.add(floor);

  for (const side of [-1, 1] as const) {
    if ((side === -1 && !walls.left) || (side === 1 && !walls.right)) continue;
    const wallSample = track.sample((s0 + s1) / 2, side * (TRACK_HALF_WIDTH + WALL_THICKNESS / 2));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, length), wallMaterial);
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

  // Turn: run-in up to the corner, corner square, run-out after it.
  const corner = track.cornerOf(seg);
  const isLeft = seg.turn === 'left';
  // Inner wall stops TRACK_HALF_WIDTH before the corner so the bend is open on the inside.
  addStraightPiece(group, track, s0, corner - TRACK_HALF_WIDTH, 0, 0.1, { left: true, right: true });
  addStraightPiece(group, track, corner - TRACK_HALF_WIDTH, corner, 0, 0, { left: !isLeft, right: isLeft });
  // Corner square: open on both sides, so running straight past the corner drops off the edge.
  addStraightPiece(group, track, corner, corner + TRACK_HALF_WIDTH, 0, 0, { left: false, right: false });
  addStraightPiece(group, track, corner + TRACK_HALF_WIDTH, s1, 0, 0.1, { left: true, right: true });

  // No wall on the far side of the corner square: missing the turn means running off the edge.
  const c = track.sample(corner - 1e-6);

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
