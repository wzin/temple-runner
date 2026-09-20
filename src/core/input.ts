import type { TurnDir } from './track';

export interface TickInput { drift: number; jump: boolean; slide: boolean }
export const NO_INPUT: TickInput = { drift: 0, jump: false, slide: false };

/** One-slot buffer so a turn pressed slightly early still counts when the window opens. */
export class TurnBuffer {
  private dir: TurnDir | null = null;
  private at = 0;
  private seen = false;
  constructor(private readonly ttlMs = 150) {}
  press(dir: TurnDir, nowMs: number): void { this.dir = dir; this.at = nowMs; this.seen = false; }
  /**
   * The press expires ttl after it was made, but never before the game has seen it
   * once: a frame hitch longer than the ttl must not swallow a turn.
   */
  peek(nowMs: number): TurnDir | null {
    if (this.dir && this.seen && nowMs - this.at > this.ttlMs) this.dir = null;
    this.seen = true;
    return this.dir;
  }
  consume(): void { this.dir = null; }
  clear(): void { this.dir = null; this.seen = false; }
}
