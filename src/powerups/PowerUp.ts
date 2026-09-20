import * as THREE from 'three';
import { scene } from '../scene';
import { getPlayer, getPlayerWorldPosition } from '../player';
import { gameState, activatePowerUp, PowerUpType } from '../gameState';
import { getSegments } from '../path/PathGenerator';
import { PathSegment } from '../path/PathSegment';
import { playSound } from '../audio';

interface PowerUp {
  type: PowerUpType;
  mesh: THREE.Group;
  segmentId: PathSegment;
  collected: boolean;
}

let powerUps: PowerUp[] = [];
let lastSpawnDistance = 0;
const SPAWN_INTERVAL = 50;
const MIN_SPAWN_DISTANCE = 40;
const COLLECTION_RADIUS = 2;

const POWERUP_COLORS: Record<PowerUpType, number> = {
  magnet: 0x3b82f6,
  shield: 0x22c55e,
  speed: 0xf59e0b,
};

export function initPowerUps(): void {
  powerUps = [];
  lastSpawnDistance = 0;
}

export function updatePowerUps(delta: number): void {
  if (gameState.screen !== 'playing' || gameState.isFalling) return;

  const player = getPlayer();
  const playerDistance = player.position.length();
  const playerPos = getPlayerWorldPosition();

  // Spawn new power-ups (rare)
  if (playerDistance - lastSpawnDistance > SPAWN_INTERVAL && playerDistance > MIN_SPAWN_DISTANCE) {
    if (Math.random() < 0.4) {
      spawnPowerUp();
    }
    lastSpawnDistance = playerDistance;
  }

  // Update power-up animation and check collection
  const time = Date.now() * 0.001;
  for (const powerUp of powerUps) {
    if (powerUp.collected) continue;

    // Floating and rotating animation
    powerUp.mesh.rotation.y += delta * 2;
    powerUp.mesh.position.y = 1.5 + Math.sin(time * 3) * 0.3;

    // Check collection
    const distance = powerUp.mesh.position.distanceTo(playerPos);
    if (distance < COLLECTION_RADIUS) {
      collectPowerUp(powerUp);
    }
  }

  // Cleanup
  cleanupPowerUps();
}

function spawnPowerUp(): void {
  const segments = getSegments();
  if (segments.length < 3) return;

  for (let i = 2; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.type !== 'straight') continue;

    // Check if segment already has power-up
    const hasPowerUp = powerUps.some(p => p.segmentId === segment);
    if (hasPowerUp) continue;

    // Choose random power-up type
    const types: PowerUpType[] = ['magnet', 'shield', 'speed'];
    const type = types[Math.floor(Math.random() * types.length)];

    const mesh = createPowerUpMesh(type);

    const position = segment.position.clone().add(
      segment.direction.clone().multiplyScalar(segment.length * 0.5)
    );
    position.y = 1.5;

    mesh.position.copy(position);

    scene.add(mesh);
    powerUps.push({ type, mesh, segmentId: segment, collected: false });
    break;
  }
}

function createPowerUpMesh(type: PowerUpType): THREE.Group {
  const group = new THREE.Group();
  const color = POWERUP_COLORS[type];

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    metalness: 0.5,
    roughness: 0.3,
  });

  // Different shapes for different power-ups
  let geometry: THREE.BufferGeometry;

  switch (type) {
    case 'magnet':
      // U-shape for magnet
      geometry = new THREE.TorusGeometry(0.5, 0.15, 8, 16, Math.PI);
      break;
    case 'shield':
      // Shield shape (flat hexagon)
      geometry = new THREE.CylinderGeometry(0.6, 0.4, 0.2, 6);
      break;
    case 'speed':
      // Lightning bolt (cone pointing forward)
      geometry = new THREE.ConeGeometry(0.4, 1, 4);
      break;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;

  if (type === 'magnet') {
    mesh.rotation.x = Math.PI / 2;
  } else if (type === 'speed') {
    mesh.rotation.z = Math.PI / 2;
  }

  group.add(mesh);

  // Glow ring
  const ringGeometry = new THREE.TorusGeometry(0.8, 0.05, 8, 32);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.5,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  return group;
}

function collectPowerUp(powerUp: PowerUp): void {
  powerUp.collected = true;
  activatePowerUp(powerUp.type);
  playSound('powerup');

  // Collection animation
  const animate = () => {
    powerUp.mesh.scale.multiplyScalar(1.1);
    powerUp.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.opacity !== undefined) {
          mat.opacity *= 0.9;
        }
      }
    });

    if (powerUp.mesh.scale.x < 3) {
      requestAnimationFrame(animate);
    } else {
      scene.remove(powerUp.mesh);
    }
  };
  animate();
}

function cleanupPowerUps(): void {
  const player = getPlayer();
  const playerPos = player.position;

  powerUps = powerUps.filter((powerUp) => {
    if (powerUp.collected) return false;

    const toPowerUp = powerUp.mesh.position.clone().sub(playerPos);
    const dot = toPowerUp.dot(player.direction);

    if (dot < -15) {
      scene.remove(powerUp.mesh);
      return false;
    }
    return true;
  });
}

export function resetPowerUps(): void {
  for (const powerUp of powerUps) {
    scene.remove(powerUp.mesh);
  }
  powerUps = [];
  lastSpawnDistance = 0;
}
