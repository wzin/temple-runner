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

export function difficultyAt(s: number): Difficulty {
  const t = Math.max(0, Math.min(1, s / RAMP_DISTANCE));
  return {
    speed: lerp(BASE_SPEED, MAX_SPEED, t),
    turnChance: lerp(0.35, 0.5, t),   // frequent corners keep the visible stretch short (a cheap render-distance limiter)
    obstacleChance: lerp(0.45, 0.7, t),
    // Spacing is a reaction budget in seconds converted to metres, so chained obstacles stay doable at speed.
    obstacleSpacing: lerp(BASE_SPEED, MAX_SPEED, t) * lerp(1.7, 1.05, t),
    reactionTime: 0.4,
  };
}
