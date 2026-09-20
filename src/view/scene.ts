import * as THREE from 'three';
import { activeBiome } from './biome';
import { sunDirection } from './skyView';

export let scene: THREE.Scene;
export let renderer: THREE.WebGLRenderer;

export function initScene(): void {
  scene = new THREE.Scene();
  const biome = activeBiome();
  scene.fog = new THREE.Fog(biome.fog.color, 40, 160);

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Cap the pixel ratio: 4x pixels on hi-dpi screens cost far more than they show. No shadow maps: the
  // directional light's shadow camera would only ever cover the start area, and the pass is expensive.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;

  // Ambient light
  const ambientLight = new THREE.AmbientLight(biome.light.ambient, biome.light.ambientIntensity);
  scene.add(ambientLight);

  // Main directional light
  const directionalLight = new THREE.DirectionalLight(biome.light.sun, biome.light.sunIntensity);
  directionalLight.position.copy(sunDirection(biome).multiplyScalar(40));
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

/** Scale the fog to the distance the game keeps generated ahead. */
export function updateFog(lookahead: number): void {
  const fog = scene.fog as THREE.Fog;
  const biome = activeBiome();
  fog.near = lookahead * biome.fog.near;
  fog.far = lookahead * biome.fog.far;
}

export function getRenderer(): THREE.WebGLRenderer {
  return renderer;
}
