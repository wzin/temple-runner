import * as THREE from 'three';
import { scene } from './scene';
import { getPlayer } from './player';
import { gameState, decreaseProximity, gameOver } from './gameState';

interface Monkey {
  mesh: THREE.Group;
}

let monkeys: Monkey[] = [];
const NUM_MONKEYS = 3;
const MONKEY_OFFSET = 15;
const MONKEY_SPREAD = 3;

const monkeyMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b4513,
  roughness: 0.8,
});

const eyeMaterial = new THREE.MeshStandardMaterial({
  color: 0xff0000,
  emissive: 0xff0000,
  emissiveIntensity: 0.5,
});

export function initMonkeys(): void {
  monkeys = [];

  for (let i = 0; i < NUM_MONKEYS; i++) {
    const mesh = createMonkeyMesh();
    mesh.position.set((i - 1) * MONKEY_SPREAD, 0, MONKEY_OFFSET);
    scene.add(mesh);
    monkeys.push({ mesh });
  }
}

function createMonkeyMesh(): THREE.Group {
  const group = new THREE.Group();

  // Body
  const bodyGeometry = new THREE.SphereGeometry(0.6, 8, 8);
  const body = new THREE.Mesh(bodyGeometry, monkeyMaterial);
  body.position.y = 0.8;
  body.scale.y = 1.2;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeometry = new THREE.SphereGeometry(0.4, 8, 8);
  const head = new THREE.Mesh(headGeometry, monkeyMaterial);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);

  // Eyes (glowing red)
  const eyeGeometry = new THREE.SphereGeometry(0.1, 6, 6);
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.15, 1.65, 0.3);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.15, 1.65, 0.3);
  group.add(rightEye);

  // Arms
  const armGeometry = new THREE.CapsuleGeometry(0.15, 0.6, 4, 8);
  const leftArm = new THREE.Mesh(armGeometry, monkeyMaterial);
  leftArm.position.set(-0.6, 1, 0);
  leftArm.rotation.z = -0.5;
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeometry, monkeyMaterial);
  rightArm.position.set(0.6, 1, 0);
  rightArm.rotation.z = 0.5;
  rightArm.castShadow = true;
  group.add(rightArm);

  // Legs
  const legGeometry = new THREE.CapsuleGeometry(0.15, 0.5, 4, 8);
  const leftLeg = new THREE.Mesh(legGeometry, monkeyMaterial);
  leftLeg.position.set(-0.25, 0.25, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeometry, monkeyMaterial);
  rightLeg.position.set(0.25, 0.25, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  return group;
}

export function updateMonkeys(delta: number): void {
  if (gameState.screen !== 'playing' || gameState.isFalling) return;

  const player = getPlayer();
  const playerPos = player.position;
  const playerDir = player.direction;

  // Calculate base position behind player
  const behindPlayer = playerDir.clone().multiplyScalar(-MONKEY_OFFSET);
  const basePos = playerPos.clone().add(behindPlayer);

  // Proximity affects how close monkeys get
  const proximityFactor = gameState.proximityBar / 100;
  const distanceModifier = 1 - proximityFactor * 0.5;

  // Update each monkey
  const time = Date.now() * 0.001;
  const right = new THREE.Vector3().crossVectors(playerDir, new THREE.Vector3(0, 1, 0)).normalize();

  for (let i = 0; i < monkeys.length; i++) {
    const monkey = monkeys[i];
    const offset = (i - 1) * MONKEY_SPREAD;

    // Target position
    const targetPos = basePos.clone()
      .add(right.clone().multiplyScalar(offset))
      .add(playerDir.clone().multiplyScalar(-distanceModifier * 5));

    // Smooth follow
    monkey.mesh.position.lerp(targetPos, 3 * delta);

    // Running animation
    const bobOffset = Math.sin(time * 10 + i * 2) * 0.2;
    monkey.mesh.position.y = bobOffset;

    // Face player
    const toPlayer = playerPos.clone().sub(monkey.mesh.position);
    const angle = Math.atan2(toPlayer.x, toPlayer.z);
    monkey.mesh.rotation.y = angle;

    // Arm swing animation
    monkey.mesh.children[3].rotation.x = Math.sin(time * 15 + i) * 0.5;
    monkey.mesh.children[4].rotation.x = -Math.sin(time * 15 + i) * 0.5;

    // Leg animation
    monkey.mesh.children[5].rotation.x = Math.sin(time * 15 + i) * 0.4;
    monkey.mesh.children[6].rotation.x = -Math.sin(time * 15 + i) * 0.4;
  }

  // Decrease proximity while running clean
  if (!gameState.isStumbling) {
    decreaseProximity(2 * delta);
  }

  // Check for game over
  if (gameState.proximityBar >= 100) {
    gameOver();
  }
}

export function resetMonkeys(): void {
  const player = getPlayer();

  for (let i = 0; i < monkeys.length; i++) {
    const monkey = monkeys[i];
    monkey.mesh.position.set(
      (i - 1) * MONKEY_SPREAD,
      0,
      player.position.z + MONKEY_OFFSET
    );
  }
}
