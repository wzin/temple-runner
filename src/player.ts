import * as THREE from 'three';
import { scene } from './scene';
import { input, wasJustPressed } from './input';
import { gameState, triggerFall } from './gameState';

export interface Player {
  mesh: THREE.Group;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  velocity: THREE.Vector3;
  laneOffset: number;
  isJumping: boolean;
  isSliding: boolean;
  jumpVelocity: number;
  turnDirection: 'left' | 'right' | null;
  isTurning: boolean;
  turnProgress: number;
  targetDirection: THREE.Vector3;
}

const LANE_WIDTH = 2;
const MAX_LANE_OFFSET = LANE_WIDTH;
const LATERAL_SPEED = 8;
const JUMP_FORCE = 12;
const GRAVITY = 30;
const SLIDE_DURATION = 0.6;
const TURN_DURATION = 0.3;

let player: Player;
let slideTimer = 0;
let bodyMesh: THREE.Mesh;
let headMesh: THREE.Mesh;

export function initPlayer(): Player {
  const group = new THREE.Group();

  // Body - capsule shape (cylinder + spheres)
  const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x4ade80,
    emissive: 0x2d8f4e,
    emissiveIntensity: 0.2,
  });
  bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
  bodyMesh.position.y = 0.8;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // Head
  const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0x4ade80,
    emissive: 0x2d8f4e,
    emissiveIntensity: 0.2,
  });
  headMesh = new THREE.Mesh(headGeometry, headMaterial);
  headMesh.position.y = 1.6;
  headMesh.castShadow = true;
  group.add(headMesh);

  // Eyes
  const eyeGeometry = new THREE.SphereGeometry(0.08, 6, 6);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });

  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.12, 1.65, 0.25);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.12, 1.65, 0.25);
  group.add(rightEye);

  group.position.set(0, 0, 0);
  scene.add(group);

  player = {
    mesh: group,
    position: new THREE.Vector3(0, 0, 0),
    direction: new THREE.Vector3(0, 0, -1),
    velocity: new THREE.Vector3(0, 0, 0),
    laneOffset: 0,
    isJumping: false,
    isSliding: false,
    jumpVelocity: 0,
    turnDirection: null,
    isTurning: false,
    turnProgress: 0,
    targetDirection: new THREE.Vector3(0, 0, -1),
  };

  return player;
}

export function getPlayer(): Player {
  return player;
}

export function updatePlayer(delta: number): void {
  if (gameState.isFalling) {
    updateFallingAnimation(delta);
    return;
  }

  if (gameState.isStumbling) {
    updateStumbleAnimation(delta);
  }

  // Handle turning
  if (player.isTurning) {
    player.turnProgress += delta / TURN_DURATION;
    if (player.turnProgress >= 1) {
      player.turnProgress = 1;
      player.isTurning = false;
      player.direction.copy(player.targetDirection);
    } else {
      // Interpolate direction during turn
      player.direction.lerp(player.targetDirection, player.turnProgress);
      player.direction.normalize();
    }
  }

  // Forward movement
  const forwardMovement = player.direction.clone().multiplyScalar(gameState.speed * delta);
  player.position.add(forwardMovement);

  // Lateral movement (A/D keys)
  if (!player.isTurning) {
    if (input.left) {
      player.laneOffset -= LATERAL_SPEED * delta;
    }
    if (input.right) {
      player.laneOffset += LATERAL_SPEED * delta;
    }
    player.laneOffset = THREE.MathUtils.clamp(player.laneOffset, -MAX_LANE_OFFSET, MAX_LANE_OFFSET);
  }

  // Jump
  if (wasJustPressed('jump') && !player.isJumping && !player.isSliding) {
    player.isJumping = true;
    player.jumpVelocity = JUMP_FORCE;
  }

  // Slide
  if (wasJustPressed('slide') && !player.isJumping && !player.isSliding) {
    player.isSliding = true;
    slideTimer = SLIDE_DURATION;
  }

  // Apply gravity and update vertical position
  if (player.isJumping) {
    player.jumpVelocity -= GRAVITY * delta;
    player.position.y += player.jumpVelocity * delta;

    if (player.position.y <= 0) {
      player.position.y = 0;
      player.isJumping = false;
      player.jumpVelocity = 0;
    }
  }

  // Update slide timer
  if (player.isSliding) {
    slideTimer -= delta;
    if (slideTimer <= 0) {
      player.isSliding = false;
    }
  }

  // Update mesh position
  updateMeshPosition();
  updatePlayerAnimation(delta);
}

function updateMeshPosition(): void {
  // Calculate position with lane offset (direction × up = right)
  const right = new THREE.Vector3().crossVectors(player.direction, new THREE.Vector3(0, 1, 0)).normalize();
  const offsetPosition = player.position.clone().add(right.multiplyScalar(player.laneOffset));

  player.mesh.position.copy(offsetPosition);

  // Update rotation to face direction
  const angle = Math.atan2(player.direction.x, player.direction.z);
  player.mesh.rotation.y = angle + Math.PI;
}

function updatePlayerAnimation(_delta: number): void {
  // Slide animation - squash body
  if (player.isSliding) {
    bodyMesh.scale.y = 0.5;
    bodyMesh.position.y = 0.4;
    headMesh.position.y = 0.9;
  } else {
    bodyMesh.scale.y = 1;
    bodyMesh.position.y = 0.8;
    headMesh.position.y = 1.6;
  }

  // Running bob when not jumping or sliding
  if (!player.isJumping && !player.isSliding && gameState.speed > 0) {
    const bob = Math.sin(Date.now() * 0.015) * 0.05;
    bodyMesh.position.y = 0.8 + bob;
    headMesh.position.y = 1.6 + bob;
  }
}

function updateStumbleAnimation(_delta: number): void {
  // Wobble effect during stumble
  const wobble = Math.sin(Date.now() * 0.03) * 0.2;
  player.mesh.rotation.z = wobble;
}

function updateFallingAnimation(delta: number): void {
  // Fall down and rotate
  player.position.y -= 15 * delta;
  player.mesh.rotation.x += 3 * delta;
  player.mesh.rotation.z += 2 * delta;

  updateMeshPosition();
  player.mesh.position.y = player.position.y;
}

export function startTurn(direction: 'left' | 'right'): void {
  if (player.isTurning) return;

  player.isTurning = true;
  player.turnProgress = 0;
  player.turnDirection = direction;

  // Calculate new direction (90 degree turn)
  const angle = direction === 'left' ? Math.PI / 2 : -Math.PI / 2;
  player.targetDirection = player.direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
}

export function missedTurn(): void {
  triggerFall();
}

export function resetPlayer(): void {
  player.position.set(0, 0, 0);
  player.direction.set(0, 0, -1);
  player.targetDirection.set(0, 0, -1);
  player.velocity.set(0, 0, 0);
  player.laneOffset = 0;
  player.isJumping = false;
  player.isSliding = false;
  player.jumpVelocity = 0;
  player.isTurning = false;
  player.turnProgress = 0;
  player.mesh.rotation.set(0, 0, 0);
  player.mesh.position.set(0, 0, 0);

  bodyMesh.scale.y = 1;
  bodyMesh.position.y = 0.8;
  headMesh.position.y = 1.6;
}

export function getPlayerWorldPosition(): THREE.Vector3 {
  const right = new THREE.Vector3().crossVectors(player.direction, new THREE.Vector3(0, 1, 0)).normalize();
  return player.position.clone().add(right.multiplyScalar(player.laneOffset));
}

export function getPlayerBoundingBox(): THREE.Box3 {
  const pos = getPlayerWorldPosition();
  const halfWidth = 0.4;
  const height = player.isSliding ? 0.8 : 1.8;

  return new THREE.Box3(
    new THREE.Vector3(pos.x - halfWidth, pos.y, pos.z - halfWidth),
    new THREE.Vector3(pos.x + halfWidth, pos.y + height, pos.z + halfWidth)
  );
}
