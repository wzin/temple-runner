import * as THREE from 'three';

export let camera: THREE.PerspectiveCamera;

const CAMERA_OFFSET = new THREE.Vector3(0, 5, 12);
const CAMERA_LOOK_AHEAD = 5;
const CAMERA_SMOOTHING = 5;

let targetPosition = new THREE.Vector3();
let targetLookAt = new THREE.Vector3();

export function initCamera(): void {
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5, 12);
  camera.lookAt(0, 0, 0);

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

export function updateCamera(
  playerPosition: THREE.Vector3,
  playerDirection: THREE.Vector3,
  delta: number
): void {
  // Calculate offset based on player direction
  const behindOffset = playerDirection.clone().multiplyScalar(-CAMERA_OFFSET.z);
  const upOffset = new THREE.Vector3(0, CAMERA_OFFSET.y, 0);

  targetPosition.copy(playerPosition).add(behindOffset).add(upOffset);

  // Look ahead of player
  targetLookAt.copy(playerPosition).add(playerDirection.clone().multiplyScalar(CAMERA_LOOK_AHEAD));
  targetLookAt.y = playerPosition.y + 1;

  // Smooth camera movement
  camera.position.lerp(targetPosition, CAMERA_SMOOTHING * delta);

  // Smooth look at
  const currentLookAt = new THREE.Vector3();
  camera.getWorldDirection(currentLookAt);
  currentLookAt.multiplyScalar(10).add(camera.position);
  currentLookAt.lerp(targetLookAt, CAMERA_SMOOTHING * delta);
  camera.lookAt(targetLookAt);
}

export function setCameraPosition(position: THREE.Vector3, direction: THREE.Vector3): void {
  const behindOffset = direction.clone().multiplyScalar(-CAMERA_OFFSET.z);
  const upOffset = new THREE.Vector3(0, CAMERA_OFFSET.y, 0);
  camera.position.copy(position).add(behindOffset).add(upOffset);

  const lookAt = position.clone().add(direction.clone().multiplyScalar(CAMERA_LOOK_AHEAD));
  lookAt.y = position.y + 1;
  camera.lookAt(lookAt);
}
