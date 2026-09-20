import { describe, expect, it } from 'vitest';
import { TurnBuffer } from './input';

describe('TurnBuffer', () => {
  it('holds the last press for the ttl then expires', () => {
    const b = new TurnBuffer(150);
    b.press('left', 1000);
    expect(b.peek(1100)).toBe('left');
    expect(b.peek(1151)).toBeNull();
  });
  it('survives until the first tick that looks at it, even after a long frame hitch', () => {
    const b = new TurnBuffer(150);
    b.press('right', 0);
    expect(b.peek(900)).toBe('right');   // first look, 900 ms later
    expect(b.peek(901)).toBeNull();      // already seen and expired
  });
  it('a newer press replaces the older one and consume empties it', () => {
    const b = new TurnBuffer(150);
    b.press('left', 0); b.press('right', 10);
    expect(b.peek(20)).toBe('right');
    b.consume();
    expect(b.peek(20)).toBeNull();
  });
});
