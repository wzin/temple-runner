import { describe, expect, it } from 'vitest';
import { TurnBuffer } from './input';

describe('TurnBuffer', () => {
  it('holds the last press for the ttl then expires', () => {
    const b = new TurnBuffer(150);
    b.press('left', 1000);
    expect(b.peek(1100)).toBe('left');
    expect(b.peek(1151)).toBeNull();
  });
  it('a newer press replaces the older one and consume empties it', () => {
    const b = new TurnBuffer(150);
    b.press('left', 0); b.press('right', 10);
    expect(b.peek(20)).toBe('right');
    b.consume();
    expect(b.peek(20)).toBeNull();
  });
});
