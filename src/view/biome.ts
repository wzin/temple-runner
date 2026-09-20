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
  fog: { color: number; near: number; far: number };
  light: { sun: number; sunIntensity: number; ambient: number; ambientIntensity: number };
  floorTint: number;
  wallTint: number;
  groundTint: number;
  tree: { trunk: number; canopy: number; canopyAlt: number; density: number };
}

export const BIOMES: Record<string, Biome> = {
  inca: {
    name: 'Inca highlands',
    sky: {
      zenith: '#1a2a5a', horizon: '#e8a86a', ground: '#2a1a2e',
      sun: { azimuth: -0.7, elevation: 0.32, color: '#fff1c0', size: 0.045 },
      cloudCover: 0.45,
      mountains: { color: '#2b2140', height: 0.12, layers: 3 },
    },
    fog: { color: 0x6a5a7a, near: 70, far: 220 },
    light: { sun: 0xffe2b0, sunIntensity: 1.6, ambient: 0x8090b0, ambientIntensity: 0.7 },
    floorTint: 0xc4ccd8,
    wallTint: 0xb0a8b0,
    groundTint: 0x9aa890,
    tree: { trunk: 0x5a3c26, canopy: 0x2f7a3e, canopyAlt: 0x4f9a3a, density: 6 },
  },
};

let current: Biome = BIOMES.inca;
export function activeBiome(): Biome { return current; }
export function setBiome(name: string): void { if (BIOMES[name]) current = BIOMES[name]; }
