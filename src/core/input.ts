import type { TurnDir } from './track';

export interface TickInput { drift: number; jump: boolean; slide: boolean }
export const NO_INPUT: TickInput = { drift: 0, jump: false, slide: false };

/** One-slot buffer so a turn pressed slightly early still counts when the window opens. */
export class TurnBuffer {
  private dir: TurnDir | null = null;
  private at = 0;
  constructor(private readonly ttlMs = 150) {}
  press(dir: TurnDir, nowMs: number): void { this.dir = dir; this.at = nowMs; }
  peek(nowMs: number): TurnDir | null {
    if (this.dir && nowMs - this.at > this.ttlMs) this.dir = null;
    return this.dir;
  }
  consume(): void { this.dir = null; }
  clear(): void { this.dir = null; }
}
