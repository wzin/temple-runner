import * as THREE from 'three';

const treeMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b4513,
  roughness: 0.9,
});

export function createFallenTree(): THREE.Group {
  const group = new THREE.Group();

  // Main log - lower and smaller so it doesn't obscure the view
  const logGeometry = new THREE.CylinderGeometry(0.25, 0.3, 4, 8);
  const log = new THREE.Mesh(logGeometry, treeMaterial);
  log.rotation.z = Math.PI / 2;
  log.position.y = 0.6;
  log.castShadow = true;
  group.add(log);

  // Small branch stubs
  const stubGeometry = new THREE.CylinderGeometry(0.06, 0.1, 0.3, 6);
  for (let i = 0; i < 2; i++) {
    const stub = new THREE.Mesh(stubGeometry, treeMaterial);
    stub.position.set(-1 + i * 2, 0.85, 0);
    stub.rotation.z = Math.PI / 4;
    stub.castShadow = true;
    group.add(stub);
  }

  return group;
}

export function getFallenTreeBoundingBox(mesh: THREE.Object3D): THREE.Box3 {
  const pos = new THREE.Vector3();
  mesh.getWorldPosition(pos);

  // Log is at y=0.6, radius ~0.3, width 4
  return new THREE.Box3(
    new THREE.Vector3(pos.x - 2, pos.y + 0.3, pos.z - 0.4),
    new THREE.Vector3(pos.x + 2, pos.y + 0.9, pos.z + 0.4)
  );
}
