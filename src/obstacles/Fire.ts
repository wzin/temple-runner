import * as THREE from 'three';

const fireMaterial = new THREE.MeshStandardMaterial({
  color: 0xff4500,
  emissive: 0xff2200,
  emissiveIntensity: 0.8,
  transparent: true,
  opacity: 0.9,
});

const emberMaterial = new THREE.MeshStandardMaterial({
  color: 0xffaa00,
  emissive: 0xff6600,
  emissiveIntensity: 1,
});

export function createFire(): THREE.Group {
  const group = new THREE.Group();

  // Fire base (spread across path)
  const baseGeometry = new THREE.BoxGeometry(4, 0.3, 2);
  const base = new THREE.Mesh(baseGeometry, emberMaterial);
  base.position.y = 0.15;
  group.add(base);

  // Fire flames (multiple cones)
  const flameGeometry = new THREE.ConeGeometry(0.4, 1.2, 6);

  for (let i = 0; i < 5; i++) {
    const flame = new THREE.Mesh(flameGeometry, fireMaterial);
    flame.position.set(-1.5 + i * 0.75, 0.9, (Math.random() - 0.5) * 0.5);
    flame.rotation.z = (Math.random() - 0.5) * 0.3;
    flame.scale.y = 0.8 + Math.random() * 0.4;
    group.add(flame);
  }

  // Animate flames
  group.userData.animate = (time: number) => {
    group.children.forEach((child, i) => {
      if (i > 0) {
        child.scale.y = 0.8 + Math.sin(time * 10 + i) * 0.2;
        child.rotation.z = Math.sin(time * 8 + i * 0.5) * 0.2;
      }
    });
  };

  return group;
}

export function getFireBoundingBox(mesh: THREE.Object3D): THREE.Box3 {
  const pos = new THREE.Vector3();
  mesh.getWorldPosition(pos);

  // Fire is low - player must jump over it
  return new THREE.Box3(
    new THREE.Vector3(pos.x - 2, pos.y, pos.z - 1),
    new THREE.Vector3(pos.x + 2, pos.y + 0.8, pos.z + 1)
  );
}
