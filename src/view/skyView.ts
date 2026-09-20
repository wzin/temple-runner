import * as THREE from 'three';
import { Biome } from './biome';

/** Sky: equirectangular canvas with gradient, sun, clouds and mountains, used as the scene background. */

const W = 1024; const H = 512;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x); const y0 = Math.floor(y); const fx = x - x0; const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number) => ((v % period) + period) % period;
  const v = (i: number, j: number) => hash(wrap(i), j, seed);
  const a = v(x0, y0); const b = v(x0 + 1, y0); const c = v(x0, y0 + 1); const d = v(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, period: number, seed: number, oct = 4): number {
  let sum = 0; let amp = 0.5; let f = 1; let n = 0;
  for (let o = 0; o < oct; o++) { sum += noise(x * f, y * f, period * f, seed + o) * amp; n += amp; amp *= 0.5; f *= 2; }
  return sum / n;
}
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export function paintSky(b: Biome): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const zen = hex(b.sky.zenith); const hor = hex(b.sky.horizon); const sunC = hex(b.sky.sun.color); const mtn = hex(b.sky.mountains.color);
  // Fogged geometry converges to the fog colour, so the sky around and below the horizon must be that
  // colour too, otherwise distant corridors stay visible as flat silhouettes against a differently coloured sky.
  const fogC = [(b.fog.color >> 16) & 255, (b.fog.color >> 8) & 255, b.fog.color & 255];
  const sunU = (b.sky.sun.azimuth / (Math.PI * 2) + 0.5) % 1; const sunV = 0.5 - b.sky.sun.elevation / Math.PI;
  for (let y = 0; y < H; y++) {
    // Canvas row 0 is the top of the equirect background (flipY), i.e. the zenith.
    const v = y / H;                       // 0 = zenith, 0.5 = horizon, 1 = nadir
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let c: number[];
      if (v < 0.5) {
        const t = Math.pow(v / 0.5, 1.6);
        c = mix(zen, hor, t);
        // Blend into the fog colour over the last stretch above the horizon.
        const toFog = Math.max(0, (v - 0.36) / 0.14);
        c = mix(c, fogC, Math.min(1, toFog));
        // sun disc and halo (wrap in u)
        const du = Math.min(Math.abs(u - sunU), 1 - Math.abs(u - sunU)) * 2; const dv = (v - sunV) * 1.0;
        const d = Math.hypot(du, dv);
        const halo = Math.exp(-d * d / (b.sky.sun.size * 8)) * 0.9;
        c = mix(c, sunC, Math.min(1, halo + (d < b.sky.sun.size ? 1 : 0)));
        // clouds: a band between v 0.15 and 0.48
        const band = Math.max(0, 1 - Math.abs((v - 0.34) / 0.16));
        const cl = fbm(u * 10, v * 20, 10, 77) * 1.5 - (1 - b.sky.cloudCover);
        const cloud = Math.max(0, Math.min(1, cl * 2.5)) * band;
        c = mix(c, [235, 220, 225], cloud * 0.85);
      } else {
        c = fogC;   // below the horizon: whatever is there is fogged out
      }
      // mountains: layered ridges above the horizon, fading into the fog towards their base
      for (let l = 0; l < b.sky.mountains.layers; l++) {
        // Jagged ridge: coarse fbm for the massif, finer fbm for peaks; strength fades into the fog.
        const ridge = 0.5 - b.sky.mountains.height * (0.25 + 0.75 * fbm(u * 3 + l * 2, l, 3, 90 + l, 4)) * (1 - l * 0.3);
        if (v > ridge && v < 0.5) {
          const fade = Math.min(1, (0.5 - v) / (0.5 - ridge + 1e-6));   // 1 at the peak, 0 at the horizon
          c = mix(c, mtn.map((ch) => ch * (1 - l * 0.15)), 0.55 * Math.pow(fade, 0.5));
          break;
        }
      }
      const i = (y * W + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/**
 * The sky is the scene background sampled as an equirectangular map: camera-relative,
 * unaffected by fog, and with Three's own orientation (v = 1 at the zenith).
 */
export function initSky(scene: THREE.Scene, biome: Biome): void {
  scene.background = paintSky(biome);
  // Generated panorama (public/art/sky.jpg, horizon already blended into the fog colour) replaces the painted sky when it loads.
  new THREE.TextureLoader().load('/art/sky.webp', (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }, undefined, () => { /* keep the painted sky */ });
}

export function updateSky(_camera: THREE.Camera): void {
  // nothing to move: a background map follows the camera by construction
}

/** World-space direction towards the sun, for the directional light. */
export function sunDirection(b: Biome): THREE.Vector3 {
  const { azimuth, elevation } = b.sky.sun;
  return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)).normalize();
}
