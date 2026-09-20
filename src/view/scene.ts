import * as THREE from 'three';

export let scene: THREE.Scene;
export let renderer: THREE.WebGLRenderer;

export function initScene(): void {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  scene.fog = new THREE.Fog(0x1a1a2e, 50, 150);

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Ambient light
  const ambientLight = new THREE.AmbientLight(0x6a6a90, 0.9);
  scene.add(ambientLight);

  // Main directional light
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 100;
  directionalLight.shadow.camera.left = -30;
  directionalLight.shadow.camera.right = 30;
  directionalLight.shadow.camera.top = 30;
  directionalLight.shadow.camera.bottom = -30;
  scene.add(directionalLight);

  // Accent light for atmosphere
  const accentLight = new THREE.DirectionalLight(0xe94560, 0.3);
  accentLight.position.set(-5, 10, -10);
  scene.add(accentLight);

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export function getRenderer(): THREE.WebGLRenderer {
  return renderer;
}
