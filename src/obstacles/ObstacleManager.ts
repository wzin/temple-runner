import * as THREE from 'three';
import { scene } from '../scene';
import { createFallenTree, getFallenTreeBoundingBox } from './FallenTree';
import { createFire, getFireBoundingBox } from './Fire';
import { getPlayer, getPlayerBoundingBox } from '../player';
import { triggerStumble, gameState } from '../gameState';
import { getSegments } from '../path/PathGenerator';
import { PathSegment } from '../path/PathSegment';
import { playSound } from '../audio';

export type ObstacleType = 'tree' | 'fire';

interface Obstacle {
  type: ObstacleType;
  mesh: THREE.Group;
  segmentId: PathSegment;
  hit: boolean;
}

let obstacles: Obstacle[] = [];
let lastSpawnDistance = 0;
const SPAWN_INTERVAL = 60;
const MIN_SPAWN_DISTANCE = 80;
const MIN_OBSTACLE_SEPARATION = 40;

export function initObstacleManager(): void {
  obstacles = [];
  lastSpawnDistance = 0;
}

export function updateObstacles(_delta: number): void {
  if (gameState.screen !== 'playing' || gameState.isFalling) return;

  const player = getPlayer();
  const playerDistance = player.position.length();

  // Spawn new obstacles
  if (playerDistance - lastSpawnDistance > SPAWN_INTERVAL && playerDistance > MIN_SPAWN_DISTANCE) {
    spawnObstacle();
    lastSpawnDistance = playerDistance;
  }

  // Update fire animations
  const time = Date.now() * 0.001;
  for (const obstacle of obstacles) {
    if (obstacle.type === 'fire' && obstacle.mesh.userData.animate) {
      obstacle.mesh.userData.animate(time);
    }
  }

  // Check collisions
  checkCollisions();

  // Cleanup old obstacles
  cleanupObstacles();
}

function spawnObstacle(): void {
  const segments = getSegments();
  if (segments.length < 3) return;

  for (let i = 2; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.type !== 'straight') continue;

    // Check if segment already has obstacle
    const hasObstacle = obstacles.some(o => o.segmentId === segment);
    if (hasObstacle) continue;

    // Random chance to skip (only 15% chance to spawn)
    if (Math.random() > 0.15) continue;

    // Calculate potential position
    const potentialPos = segment.position.clone().add(
      segment.direction.clone().multiplyScalar(segment.length * 0.5)
    );

    // Check minimum separation from all existing obstacles
    const tooClose = obstacles.some(o => {
      const dist = o.mesh.position.distanceTo(potentialPos);
      return dist < MIN_OBSTACLE_SEPARATION;
    });
    if (tooClose) continue;

    // Choose obstacle type
    const type: ObstacleType = Math.random() > 0.5 ? 'tree' : 'fire';
    const mesh = type === 'tree' ? createFallenTree() : createFire();

    // Position along segment
    const segmentCenter = segment.position.clone().add(
      segment.direction.clone().multiplyScalar(segment.length * (0.3 + Math.random() * 0.4))
    );

    mesh.position.copy(segmentCenter);

    // Rotate to align with path
    const angle = Math.atan2(segment.direction.x, segment.direction.z);
    mesh.rotation.y = angle;

    // Random lane offset for trees
    if (type === 'tree') {
      const laneOffset = (Math.random() - 0.5) * 2;
      const right = new THREE.Vector3().crossVectors(segment.direction, new THREE.Vector3(0, 1, 0));
      mesh.position.add(right.multiplyScalar(laneOffset));
    }

    scene.add(mesh);
    obstacles.push({ type, mesh, segmentId: segment, hit: false });
    break;
  }
}

function checkCollisions(): void {
  const player = getPlayer();
  if (player.isTurning) return;

  const playerBox = getPlayerBoundingBox();

  for (const obstacle of obstacles) {
    if (obstacle.hit) continue;

    let obstacleBox: THREE.Box3;
    if (obstacle.type === 'tree') {
      obstacleBox = getFallenTreeBoundingBox(obstacle.mesh);
    } else {
      obstacleBox = getFireBoundingBox(obstacle.mesh);
    }

    if (playerBox.intersectsBox(obstacleBox)) {
      // Check if player avoided obstacle
      if (obstacle.type === 'tree') {
        // Tree must be jumped over or slid under
        if (!player.isJumping && !player.isSliding) {
          handleCollision(obstacle);
        }
      } else {
        // Fire must be jumped over (can't slide through fire!)
        if (!player.isJumping) {
          handleCollision(obstacle);
        }
      }
    }
  }
}

function handleCollision(obstacle: Obstacle): void {
  obstacle.hit = true;
  triggerStumble();
  playSound('stumble');

  // Flash obstacle
  obstacle.mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const originalColor = (child.material as THREE.MeshStandardMaterial).color.clone();
      (child.material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
      setTimeout(() => {
        (child.material as THREE.MeshStandardMaterial).color.copy(originalColor);
      }, 100);
    }
  });
}

function cleanupObstacles(): void {
  const player = getPlayer();
  const playerPos = player.position;

  obstacles = obstacles.filter((obstacle) => {
    const obstaclePos = obstacle.mesh.position;
    const toObstacle = obstaclePos.clone().sub(playerPos);
    const dot = toObstacle.dot(player.direction);

    // Remove if far behind player
    if (dot < -20) {
      scene.remove(obstacle.mesh);
      obstacle.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
      return false;
    }
    return true;
  });
}

export function resetObstacles(): void {
  for (const obstacle of obstacles) {
    scene.remove(obstacle.mesh);
    obstacle.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
  }
  obstacles = [];
  lastSpawnDistance = 0;
}
