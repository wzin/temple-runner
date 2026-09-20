import * as THREE from 'three';
import { PathSegment, SegmentType, createPathSegment, removePathSegment } from './PathSegment';
import { getPlayer, startTurn, missedTurn } from '../player';
import { wasJustPressed } from '../input';
import { gameState } from '../gameState';

const SEGMENTS_AHEAD = 5;

let segments: PathSegment[] = [];
let nextPosition = new THREE.Vector3(0, 0, 0);
let nextDirection = new THREE.Vector3(0, 0, -1);
let straightCountSinceTurn = 0;

export function initPathGenerator(): void {
  segments = [];
  nextPosition.set(0, 0, 0);
  nextDirection.set(0, 0, -1);

  // Generate initial segments
  for (let i = 0; i < SEGMENTS_AHEAD; i++) {
    spawnNextSegment(i < 3 ? 'straight' : getRandomSegmentType());
  }
}

export function updatePathGenerator(): void {
  if (gameState.screen !== 'playing') return;

  const player = getPlayer();
  const playerPos = player.position;

  // Check if player is in a turn zone
  checkTurnZones(player);

  // Spawn new segments ahead
  while (shouldSpawnSegment(playerPos)) {
    spawnNextSegment(getRandomSegmentType());
  }

  // Remove segments behind player
  cleanupOldSegments(playerPos);
}

function shouldSpawnSegment(playerPos: THREE.Vector3): boolean {
  if (segments.length === 0) return true;

  const lastSegment = segments[segments.length - 1];
  const distanceToEnd = lastSegment.endPosition.distanceTo(playerPos);

  return distanceToEnd < SEGMENTS_AHEAD * 20;
}

function spawnNextSegment(type: SegmentType): void {
  // Always follow a turn with at least 2 straight segments
  if (straightCountSinceTurn < 2 && type !== 'straight') {
    type = 'straight';
  }

  const segment = createPathSegment(type, nextPosition.clone(), nextDirection.clone());
  segments.push(segment);

  nextPosition.copy(segment.endPosition);
  nextDirection.copy(segment.endDirection);

  if (type === 'straight') {
    straightCountSinceTurn++;
  } else {
    straightCountSinceTurn = 0;
  }
}

function cleanupOldSegments(playerPos: THREE.Vector3): void {
  while (segments.length > 0) {
    const segment = segments[0];

    // Check if segment is behind player
    const toSegment = segment.endPosition.clone().sub(playerPos);
    const player = getPlayer();
    const dotProduct = toSegment.dot(player.direction);

    if (dotProduct < -10) {
      removePathSegment(segment);
      segments.shift();
    } else {
      break;
    }
  }
}

function getRandomSegmentType(): SegmentType {
  const rand = Math.random();
  // 85% straight, 7.5% left, 7.5% right
  if (rand < 0.85) return 'straight';
  if (rand < 0.925) return 'left';
  return 'right';
}

function checkTurnZones(player: ReturnType<typeof getPlayer>): void {
  const playerPos = player.position.clone();
  playerPos.y = 1;

  for (const segment of segments) {
    if (segment.type !== 'straight' && segment.turnZone && !segment.turnHandled) {
      if (segment.turnZone.containsPoint(playerPos)) {
        handleTurnZone(segment, player);
        break;
      }
    }
  }
}

function handleTurnZone(segment: PathSegment, player: ReturnType<typeof getPlayer>): void {
  const requiredTurn = segment.type as 'left' | 'right';

  // Check for player input
  if (wasJustPressed('turnLeft')) {
    if (requiredTurn === 'left') {
      startTurn('left');
      segment.turnHandled = true;
    } else {
      // Wrong turn
      missedTurn();
      segment.turnHandled = true;
    }
  } else if (wasJustPressed('turnRight')) {
    if (requiredTurn === 'right') {
      startTurn('right');
      segment.turnHandled = true;
    } else {
      // Wrong turn
      missedTurn();
      segment.turnHandled = true;
    }
  } else {
    // Check if player has passed through turn zone without turning
    const turnCenter = new THREE.Vector3(
      (segment.turnZone!.min.x + segment.turnZone!.max.x) / 2,
      1,
      (segment.turnZone!.min.z + segment.turnZone!.max.z) / 2
    );

    const toCenter = turnCenter.clone().sub(player.position);
    const dot = toCenter.dot(player.direction);

    // If player is past the center and hasn't turned, they fall
    if (dot < -3 && !player.isTurning) {
      missedTurn();
      segment.turnHandled = true;
    }
  }
}

export function getSegments(): PathSegment[] {
  return segments;
}

export function resetPathGenerator(): void {
  for (const segment of segments) {
    removePathSegment(segment);
  }
  segments = [];
  nextPosition.set(0, 0, 0);
  nextDirection.set(0, 0, -1);
  straightCountSinceTurn = 0;

  initPathGenerator();
}
