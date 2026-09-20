import * as THREE from 'three';
import { scene } from '../scene';

export type SegmentType = 'straight' | 'left' | 'right';

export interface PathSegment {
  type: SegmentType;
  mesh: THREE.Group;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  endPosition: THREE.Vector3;
  endDirection: THREE.Vector3;
  length: number;
  turnZone: THREE.Box3 | null;
  turnHandled: boolean;
}

const SEGMENT_WIDTH = 6;
const SEGMENT_LENGTH = 20;
const WALL_HEIGHT = 2;
const WALL_THICKNESS = 0.5;

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x2d3748,
  roughness: 0.8,
});

const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a202c,
  roughness: 0.6,
});

const accentMaterial = new THREE.MeshStandardMaterial({
  color: 0xe94560,
  emissive: 0xe94560,
  emissiveIntensity: 0.3,
});

export function createPathSegment(
  type: SegmentType,
  startPosition: THREE.Vector3,
  startDirection: THREE.Vector3
): PathSegment {
  const group = new THREE.Group();

  // Calculate perpendicular (right) vector
  const right = new THREE.Vector3().crossVectors(startDirection, new THREE.Vector3(0, 1, 0)).normalize();

  if (type === 'straight') {
    createStraightSegment(group, startPosition, startDirection, right);
  } else {
    createTurnSegment(group, startPosition, startDirection, right, type);
  }

  scene.add(group);

  // Calculate end position and direction
  let endPosition: THREE.Vector3;
  let endDirection: THREE.Vector3;
  let turnZone: THREE.Box3 | null = null;

  if (type === 'straight') {
    endDirection = startDirection.clone();
    endPosition = startPosition.clone().add(startDirection.clone().multiplyScalar(SEGMENT_LENGTH));
  } else {
    const turnAngle = type === 'left' ? Math.PI / 2 : -Math.PI / 2;
    endDirection = startDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turnAngle);

    const halfLength = SEGMENT_LENGTH / 2;
    const cornerPos = startPosition.clone().add(startDirection.clone().multiplyScalar(halfLength));
    endPosition = cornerPos.clone().add(endDirection.clone().multiplyScalar(halfLength));

    const zoneSize = 4;
    turnZone = new THREE.Box3(
      new THREE.Vector3(cornerPos.x - zoneSize, 0, cornerPos.z - zoneSize),
      new THREE.Vector3(cornerPos.x + zoneSize, 5, cornerPos.z + zoneSize)
    );
  }

  return {
    type,
    mesh: group,
    position: startPosition.clone(),
    direction: startDirection.clone(),
    endPosition,
    endDirection,
    length: SEGMENT_LENGTH,
    turnZone,
    turnHandled: false,
  };
}

function createStraightSegment(
  group: THREE.Group,
  startPos: THREE.Vector3,
  dir: THREE.Vector3,
  right: THREE.Vector3
): void {
  // Floor - positioned in world space directly
  const floorGeometry = new THREE.BoxGeometry(SEGMENT_WIDTH, 0.5, SEGMENT_LENGTH + 2);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);

  // Center of floor is at startPos + dir * SEGMENT_LENGTH/2
  const floorCenter = startPos.clone().add(dir.clone().multiplyScalar(SEGMENT_LENGTH / 2));
  floor.position.copy(floorCenter);
  floor.position.y = -0.25;

  // Rotate floor to align with direction
  floor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  floor.receiveShadow = true;
  group.add(floor);

  // Accent stripes
  const stripeGeometry = new THREE.BoxGeometry(SEGMENT_WIDTH, 0.02, 0.5);
  for (let i = 1; i <= 4; i++) {
    const stripe = new THREE.Mesh(stripeGeometry, accentMaterial);
    const stripePos = startPos.clone().add(dir.clone().multiplyScalar(i * SEGMENT_LENGTH / 5));
    stripe.position.copy(stripePos);
    stripe.position.y = 0.01;
    stripe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    group.add(stripe);
  }

  // Left wall
  const wallGeometry = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, SEGMENT_LENGTH + 2);
  const leftWallCenter = floorCenter.clone().add(right.clone().multiplyScalar(-SEGMENT_WIDTH / 2 - WALL_THICKNESS / 2));
  const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
  leftWall.position.copy(leftWallCenter);
  leftWall.position.y = WALL_HEIGHT / 2;
  leftWall.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  leftWall.castShadow = true;
  group.add(leftWall);

  // Right wall
  const rightWallCenter = floorCenter.clone().add(right.clone().multiplyScalar(SEGMENT_WIDTH / 2 + WALL_THICKNESS / 2));
  const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
  rightWall.position.copy(rightWallCenter);
  rightWall.position.y = WALL_HEIGHT / 2;
  rightWall.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  rightWall.castShadow = true;
  group.add(rightWall);
}

function createTurnSegment(
  group: THREE.Group,
  startPos: THREE.Vector3,
  dir: THREE.Vector3,
  right: THREE.Vector3,
  turnType: 'left' | 'right'
): void {
  const halfLength = SEGMENT_LENGTH / 2;
  const isLeft = turnType === 'left';

  // Calculate corner position
  const cornerPos = startPos.clone().add(dir.clone().multiplyScalar(halfLength));

  // Calculate new direction after turn
  const turnAngle = isLeft ? Math.PI / 2 : -Math.PI / 2;
  const newDir = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turnAngle);
  const newRight = new THREE.Vector3().crossVectors(newDir, new THREE.Vector3(0, 1, 0)).normalize();

  // INCOMING SECTION - from start to corner
  const incomingFloorGeom = new THREE.BoxGeometry(SEGMENT_WIDTH, 0.5, halfLength + SEGMENT_WIDTH/2 + 1);
  const incomingFloor = new THREE.Mesh(incomingFloorGeom, floorMaterial);
  const incomingCenter = startPos.clone().add(dir.clone().multiplyScalar((halfLength + SEGMENT_WIDTH/2) / 2));
  incomingFloor.position.copy(incomingCenter);
  incomingFloor.position.y = -0.25;
  incomingFloor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  incomingFloor.receiveShadow = true;
  group.add(incomingFloor);

  // OUTGOING SECTION - from corner to end
  const outgoingFloorGeom = new THREE.BoxGeometry(SEGMENT_WIDTH, 0.5, halfLength + SEGMENT_WIDTH/2 + 1);
  const outgoingFloor = new THREE.Mesh(outgoingFloorGeom, floorMaterial);
  const outgoingCenter = cornerPos.clone().add(newDir.clone().multiplyScalar((halfLength + SEGMENT_WIDTH/2) / 2));
  outgoingFloor.position.copy(outgoingCenter);
  outgoingFloor.position.y = -0.26;
  outgoingFloor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), newDir);
  outgoingFloor.receiveShadow = true;
  group.add(outgoingFloor);

  // CORNER FILL - large square at the corner
  const cornerFloorGeom = new THREE.BoxGeometry(SEGMENT_WIDTH + 2, 0.5, SEGMENT_WIDTH + 2);
  const cornerFloor = new THREE.Mesh(cornerFloorGeom, floorMaterial);
  cornerFloor.position.copy(cornerPos);
  cornerFloor.position.y = -0.27;
  cornerFloor.receiveShadow = true;
  group.add(cornerFloor);

  // Turn indicator
  const indicatorGeom = new THREE.BoxGeometry(3, 0.1, 3);
  const indicator = new THREE.Mesh(indicatorGeom, accentMaterial);
  indicator.position.copy(cornerPos);
  indicator.position.y = 0.05;
  group.add(indicator);

  // Arrow
  const arrowGeom = new THREE.ConeGeometry(0.5, 1.2, 4);
  const arrow = new THREE.Mesh(arrowGeom, accentMaterial);
  arrow.position.copy(cornerPos);
  arrow.position.y = 0.8;
  arrow.position.add(newDir.clone().multiplyScalar(1.5));
  // Point arrow in new direction
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), newDir);
  group.add(arrow);

  // WALLS
  // Outer wall - incoming section (opposite side from turn)
  const outerWallInGeom = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, halfLength + SEGMENT_WIDTH/2);
  const outerWallIn = new THREE.Mesh(outerWallInGeom, wallMaterial);
  const outerSide = isLeft ? 1 : -1;
  const outerWallInCenter = startPos.clone()
    .add(dir.clone().multiplyScalar((halfLength + SEGMENT_WIDTH/2) / 2))
    .add(right.clone().multiplyScalar(outerSide * (SEGMENT_WIDTH/2 + WALL_THICKNESS/2)));
  outerWallIn.position.copy(outerWallInCenter);
  outerWallIn.position.y = WALL_HEIGHT / 2;
  outerWallIn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  outerWallIn.castShadow = true;
  group.add(outerWallIn);

  // Outer wall - outgoing section
  const outerWallOutGeom = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, halfLength + SEGMENT_WIDTH/2);
  const outerWallOut = new THREE.Mesh(outerWallOutGeom, wallMaterial);
  const outerWallOutCenter = cornerPos.clone()
    .add(newDir.clone().multiplyScalar((halfLength + SEGMENT_WIDTH/2) / 2))
    .add(newRight.clone().multiplyScalar(-outerSide * (SEGMENT_WIDTH/2 + WALL_THICKNESS/2)));
  outerWallOut.position.copy(outerWallOutCenter);
  outerWallOut.position.y = WALL_HEIGHT / 2;
  outerWallOut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), newDir);
  outerWallOut.castShadow = true;
  group.add(outerWallOut);

  // Inner wall - incoming section (turn side, stops before corner)
  const innerWallInGeom = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, halfLength - SEGMENT_WIDTH/2);
  const innerWallIn = new THREE.Mesh(innerWallInGeom, wallMaterial);
  const innerSide = isLeft ? -1 : 1;
  const innerWallInCenter = startPos.clone()
    .add(dir.clone().multiplyScalar((halfLength - SEGMENT_WIDTH/2) / 2))
    .add(right.clone().multiplyScalar(innerSide * (SEGMENT_WIDTH/2 + WALL_THICKNESS/2)));
  innerWallIn.position.copy(innerWallInCenter);
  innerWallIn.position.y = WALL_HEIGHT / 2;
  innerWallIn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  innerWallIn.castShadow = true;
  group.add(innerWallIn);

  // Inner wall - outgoing section (starts after corner)
  const innerWallOutGeom = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, halfLength - SEGMENT_WIDTH/2);
  const innerWallOut = new THREE.Mesh(innerWallOutGeom, wallMaterial);
  const innerWallOutCenter = cornerPos.clone()
    .add(newDir.clone().multiplyScalar(SEGMENT_WIDTH/2 + (halfLength - SEGMENT_WIDTH/2) / 2))
    .add(newRight.clone().multiplyScalar(outerSide * (SEGMENT_WIDTH/2 + WALL_THICKNESS/2)));
  innerWallOut.position.copy(innerWallOutCenter);
  innerWallOut.position.y = WALL_HEIGHT / 2;
  innerWallOut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), newDir);
  innerWallOut.castShadow = true;
  group.add(innerWallOut);

  // Inner corner block
  const cornerBlockGeom = new THREE.BoxGeometry(SEGMENT_WIDTH, WALL_HEIGHT, SEGMENT_WIDTH);
  const cornerBlock = new THREE.Mesh(cornerBlockGeom, wallMaterial);
  const cornerBlockPos = cornerPos.clone()
    .add(right.clone().multiplyScalar(innerSide * SEGMENT_WIDTH))
    .add(dir.clone().multiplyScalar(-SEGMENT_WIDTH/2));
  cornerBlock.position.copy(cornerBlockPos);
  cornerBlock.position.y = WALL_HEIGHT / 2;
  cornerBlock.castShadow = true;
  group.add(cornerBlock);
}

export function removePathSegment(segment: PathSegment): void {
  scene.remove(segment.mesh);
  segment.mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  });
}
