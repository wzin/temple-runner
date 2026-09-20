/**
 * Biome definitions: everything about the backdrop and palette that is not
 * gameplay. One biome for now; add more entries and switch `activeBiome()`.
 */
export interface Biome {
  name: string;
  sky: {
    zenith: string; horizon: string; ground: string;
    sun: { azimuth: number; elevation: number; color: string; size: number };
    cloudCover: number;    // 0..1
    mountains: { color: string; height: number; layers: number };
  };
  /** Fog distances as fractions of the current lookahead, so the far end of the generated track is always hidden. */
  fog: { color: number; near: number; far: number };
  light: { sun: number; sunIntensity: number; ambient: number; ambientIntensity: number };
  floorTint: number;
  wallTint: number;
  groundTint: number;
  cliffTint: number;
  tree: { trunk: number; canopy: number; canopyAlt: number; density: number };
}

export const BIOMES: Record<string, Biome> = {
  inca: {
    name: 'Inca highlands',
    sky: {
      zenith: '#1a2a5a', horizon: '#c99a8a', ground: '#7a6688',
      sun: { azimuth: -0.7, elevation: 0.32, color: '#fff1c0', size: 0.045 },
      cloudCover: 0.45,
      mountains: { color: '#4a3c62', height: 0.08, layers: 2 },
    },
    // near/far are fractions of the game's lookahead distance (see scene.ts updateFog).
    fog: { color: 0x8a7898, near: 0.1, far: 0.5 },
    light: { sun: 0xffe2b0, sunIntensity: 2.6, ambient: 0x9aa4c4, ambientIntensity: 0.9 },
    floorTint: 0xcfcac2,
    wallTint: 0xe0dcd8,
    groundTint: 0xb8c4a8,
    cliffTint: 0xb8b4bc,
    tree: { trunk: 0x5a3c26, canopy: 0x2f7a3e, canopyAlt: 0x4f9a3a, density: 4 },
  },
};

let current: Biome = BIOMES.inca;
export function activeBiome(): Biome { return current; }
export function setBiome(name: string): void { if (BIOMES[name]) current = BIOMES[name]; }
