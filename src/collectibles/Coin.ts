import * as THREE from 'three';
import { scene } from '../scene';
import { getPlayer, getPlayerWorldPosition } from '../player';
import { addCoin, gameState } from '../gameState';
import { getSegments } from '../path/PathGenerator';
import { PathSegment } from '../path/PathSegment';
import { playSound } from '../audio';

interface Coin {
  mesh: THREE.Mesh;
  segmentId: PathSegment;
  collected: boolean;
}

const coinGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
const coinMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd700,
  emissive: 0xffaa00,
  emissiveIntensity: 0.5,
  metalness: 0.8,
  roughness: 0.2,
});

let coins: Coin[] = [];
let lastSpawnDistance = 0;
const SPAWN_INTERVAL = 8;
const COLLECTION_RADIUS = 1.5;
const MAGNET_RADIUS = 8;

export function initCoins(): void {
  coins = [];
  lastSpawnDistance = 0;
}

export function updateCoins(delta: number): void {
  if (gameState.screen !== 'playing' || gameState.isFalling) return;

  const player = getPlayer();
  const playerDistance = player.position.length();
  const playerPos = getPlayerWorldPosition();

  // Spawn new coins
  if (playerDistance - lastSpawnDistance > SPAWN_INTERVAL) {
    spawnCoins();
    lastSpawnDistance = playerDistance;
  }

  // Update coin rotation and check collection
  for (const coin of coins) {
    if (coin.collected) continue;

    // Rotate coin
    coin.mesh.rotation.y += delta * 3;

    // Magnet effect
    if (gameState.activePowerUp === 'magnet') {
      const toCoin = coin.mesh.position.clone().sub(playerPos);
      const distance = toCoin.length();

      if (distance < MAGNET_RADIUS) {
        // Pull coin towards player
        const pullStrength = (1 - distance / MAGNET_RADIUS) * 20;
        toCoin.normalize().multiplyScalar(-pullStrength * delta);
        coin.mesh.position.add(toCoin);
      }
    }

    // Check collection
    const distance = coin.mesh.position.distanceTo(playerPos);
    if (distance < COLLECTION_RADIUS) {
      collectCoin(coin);
    }
  }

  // Cleanup old coins
  cleanupCoins();
}

function spawnCoins(): void {
  const segments = getSegments();
  if (segments.length < 2) return;

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.type !== 'straight') continue;

    // Check if segment already has coins
    const hasCoins = coins.some(c => c.segmentId === segment);
    if (hasCoins) continue;

    // Random chance to spawn coin line
    if (Math.random() > 0.7) continue;

    // Create a line of coins
    const numCoins = 3 + Math.floor(Math.random() * 4);
    const laneOffset = (Math.random() - 0.5) * 3;
    const right = new THREE.Vector3().crossVectors(segment.direction, new THREE.Vector3(0, 1, 0));

    for (let j = 0; j < numCoins; j++) {
      const coin = new THREE.Mesh(coinGeometry, coinMaterial.clone());

      const position = segment.position.clone().add(
        segment.direction.clone().multiplyScalar(segment.length * (0.2 + j * 0.12))
      );
      position.add(right.clone().multiplyScalar(laneOffset));
      position.y = 1 + Math.sin(j * 0.5) * 0.3;

      coin.position.copy(position);
      coin.rotation.x = Math.PI / 2;
      coin.castShadow = true;

      scene.add(coin);
      coins.push({ mesh: coin, segmentId: segment, collected: false });
    }
    break;
  }
}

function collectCoin(coin: Coin): void {
  coin.collected = true;
  addCoin();
  playSound('coin');

  // Collection animation
  const animate = () => {
    coin.mesh.scale.multiplyScalar(0.9);
    coin.mesh.position.y += 0.1;

    if (coin.mesh.scale.x > 0.1) {
      requestAnimationFrame(animate);
    } else {
      scene.remove(coin.mesh);
      coin.mesh.geometry.dispose();
    }
  };
  animate();
}

function cleanupCoins(): void {
  const player = getPlayer();
  const playerPos = player.position;

  coins = coins.filter((coin) => {
    if (coin.collected) return false;

    const toCoin = coin.mesh.position.clone().sub(playerPos);
    const dot = toCoin.dot(player.direction);

    // Remove if far behind player
    if (dot < -15) {
      scene.remove(coin.mesh);
      coin.mesh.geometry.dispose();
      return false;
    }
    return true;
  });
}

export function resetCoins(): void {
  for (const coin of coins) {
    scene.remove(coin.mesh);
    coin.mesh.geometry.dispose();
  }
  coins = [];
  lastSpawnDistance = 0;
}
