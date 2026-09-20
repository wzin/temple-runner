import * as THREE from 'three';
import { activeBiome } from './biome';
import { pbrMaterial, textures } from './textures';

/** Large ground plane that follows the camera, so trees and the track stand on land, not in the void. */

export const GROUND_Y = -14; // the track sits on an embankment; the land is far below
const SIZE = 600;
const TILE = 6; // metres per texture repeat (seen from 14 m up, coarser reads better)
let plane: THREE.Mesh;

export function initGround(scene: THREE.Scene): void {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE);
  geo.rotateX(-Math.PI / 2);
  const maps = textures().ground;
  for (const t of [maps.map, maps.normalMap, maps.roughnessMap]) t.repeat.set(SIZE / TILE, SIZE / TILE);
  plane = new THREE.Mesh(geo, pbrMaterial(maps, { color: activeBiome().groundTint }));
  plane.position.y = GROUND_Y;
  plane.receiveShadow = true;
  plane.frustumCulled = false;
  scene.add(plane);
}

/** Snap to the texture grid so the pattern does not swim as the camera moves. */
export function updateGround(camera: THREE.Camera): void {
  plane.position.x = Math.round(camera.position.x / TILE) * TILE;
  plane.position.z = Math.round(camera.position.z / TILE) * TILE;
}
