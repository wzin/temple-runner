import { describe, expect, it } from 'vitest';
import { BASE_SPEED, MAX_SPEED, RAMP_DISTANCE, difficultyAt } from './difficulty';

describe('difficultyAt', () => {
  it('ramps linearly then holds', () => {
    expect(difficultyAt(0).speed).toBe(BASE_SPEED);
    expect(difficultyAt(RAMP_DISTANCE / 2).speed).toBeCloseTo((BASE_SPEED + MAX_SPEED) / 2, 5);
    expect(difficultyAt(RAMP_DISTANCE).speed).toBe(MAX_SPEED);
    expect(difficultyAt(RAMP_DISTANCE * 3).speed).toBe(MAX_SPEED);
    expect(difficultyAt(-10).speed).toBe(BASE_SPEED);
  });
  it('makes the track denser with distance', () => {
    const a = difficultyAt(0); const b = difficultyAt(RAMP_DISTANCE);
    expect(b.turnChance).toBeGreaterThan(a.turnChance);
    expect(b.obstacleChance).toBeGreaterThan(a.obstacleChance);
    expect(b.obstacleSpacing / b.speed).toBeLessThan(a.obstacleSpacing / a.speed); // less reaction time, but never below 0.7 s
    expect(b.obstacleSpacing / b.speed).toBeGreaterThanOrEqual(0.7);
    expect(b.reactionTime).toBe(a.reactionTime);
  });
});
