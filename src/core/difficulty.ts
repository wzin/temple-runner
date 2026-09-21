/** Difficulty as a function of distance: linear ramp up to RAMP_DISTANCE, flat after. */
export interface Difficulty {
  speed: number;
  turnChance: number;
  obstacleChance: number;
  obstacleSpacing: number;
  /** Seconds of reaction time the turn window gives before the corner. */
  reactionTime: number;
}

export const RAMP_DISTANCE = 1500;
export const BASE_SPEED = 15;
export const MAX_SPEED = 24;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * OBSTACLE DENSITY, 0–100. The one number to tune how busy the track is: it scales the chance of laying something
 * in a free spot, the minimum spacing between obstacles and how soon an empty stretch forces one.
 * 50 is the default Wojtek settled on; 60 was the measured "one per straight" density, 40 is relaxed, 80 relentless.
 * Override at runtime with `?density=40` in the URL (see main.ts) — handy for tuning without a rebuild.
 */
export let OBSTACLE_DENSITY = 50;
export function setObstacleDensity(d: number): void { OBSTACLE_DENSITY = Math.max(1, Math.min(100, d)); }
/** Spacing multiplier: 1.0 at 50, 1.49 at 1, 0.5 at 100. */
export function densitySpacing(): number { return 1 + (50 - OBSTACLE_DENSITY) / 100; }
/** Chance multiplier: 1.0 at 50, ~0 at 1, 2 at 100 (clamped where used). */
export function densityChance(): number { return OBSTACLE_DENSITY / 50; }
/** Metres of emptiness before an obstacle is forced: 15 at 50, 30 at 25, 7.5 at 100, effectively never at 1. */
export function densityForceDistance(): number { return 15 * (50 / OBSTACLE_DENSITY); }

export function difficultyAt(s: number): Difficulty {
  const t = Math.max(0, Math.min(1, s / RAMP_DISTANCE));
  return {
    speed: lerp(BASE_SPEED, MAX_SPEED, t),
    turnChance: lerp(0.55, 0.7, t),   // frequent corners keep the visible stretch short (a cheap render-distance limiter)
    obstacleChance: Math.min(1, lerp(0.45, 0.7, t) * densityChance()),
    // Spacing is a reaction budget in seconds converted to metres, so chained obstacles stay doable at speed.
    obstacleSpacing: lerp(BASE_SPEED, MAX_SPEED, t) * lerp(0.9, 0.75, t) * densitySpacing(),
    reactionTime: 0.4,
  };
}
