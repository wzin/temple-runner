import type { TickInput } from './input';

export type PlayerState = 'running' | 'jumping' | 'sliding' | 'falling' | 'dead';

export interface PlayerConfig {
  speed: number; lateralSpeed: number; jumpVelocity: number; gravity: number;
  slideDuration: number; stumbleDuration: number; stumbleSlow: number; fallDuration: number;
  halfWidth: number; height: number; slideHeight: number; maxX: number;
}

// jumpVelocity 11.5 / gravity 30 → 0.77 s airtime, 2.2 m apex.
export const DEFAULT_PLAYER: PlayerConfig = {
  speed: 15, lateralSpeed: 8, jumpVelocity: 11.5, gravity: 30,
  slideDuration: 0.7, stumbleDuration: 0.5, stumbleSlow: 0.6, fallDuration: 1.5,
  halfWidth: 0.4, height: 1.8, slideHeight: 0.9, maxX: 2.2,
};

export class Player {
  readonly cfg: PlayerConfig;
  s = 0; prevS = 0; x = 0; y = 0; vy = 0;
  state: PlayerState = 'running';
  stumbleTimer = 0; slideTimer = 0; fallTimer = 0;

  constructor(cfg: Partial<PlayerConfig> = {}) { this.cfg = { ...DEFAULT_PLAYER, ...cfg }; }

  /** True once the run is ending; a method so TypeScript does not narrow `state` across mutations. */
  get down(): boolean { return this.state === 'falling' || this.state === 'dead'; }
  get height(): number { return this.state === 'sliding' ? this.cfg.slideHeight : this.cfg.height; }
  get lateral(): [number, number] { return [this.x - this.cfg.halfWidth, this.x + this.cfg.halfWidth]; }
  get vertical(): [number, number] { return [this.y, this.y + this.height]; }
  get speed(): number {
    if (this.state === 'falling' || this.state === 'dead') return 0;
    return this.stumbleTimer > 0 ? this.cfg.speed * this.cfg.stumbleSlow : this.cfg.speed;
  }

  tick(dt: number, input: TickInput): void {
    this.prevS = this.s;
    if (this.state === 'dead') return;
    if (this.state === 'falling') {
      this.fallTimer -= dt; this.vy -= this.cfg.gravity * dt; this.y += this.vy * dt;
      if (this.fallTimer <= 0) this.state = 'dead';
      return;
    }
    if (input.jump) this.jump();
    if (input.slide) this.slide();

    this.s += this.speed * dt;
    this.x = Math.max(-this.cfg.maxX, Math.min(this.cfg.maxX, this.x + input.drift * this.cfg.lateralSpeed * dt));

    if (this.state === 'jumping') {
      this.vy -= this.cfg.gravity * dt; this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.state = 'running'; }
    }
    if (this.state === 'sliding') { this.slideTimer -= dt; if (this.slideTimer <= 0) this.state = 'running'; }
    if (this.stumbleTimer > 0) this.stumbleTimer -= dt;
  }

  jump(): boolean {
    if (this.state !== 'running') return false;
    this.state = 'jumping'; this.vy = this.cfg.jumpVelocity; return true;
  }
  slide(): boolean {
    if (this.state !== 'running') return false;
    this.state = 'sliding'; this.slideTimer = this.cfg.slideDuration; return true;
  }
  stumble(): void { if (this.state !== 'falling' && this.state !== 'dead') this.stumbleTimer = this.cfg.stumbleDuration; }
  fall(): void {
    if (this.state === 'falling' || this.state === 'dead') return;
    this.state = 'falling'; this.fallTimer = this.cfg.fallDuration; this.vy = Math.min(this.vy, 0);
  }
  reset(): void { this.s = 0; this.prevS = 0; this.x = 0; this.y = 0; this.vy = 0; this.state = 'running'; this.stumbleTimer = 0; this.slideTimer = 0; this.fallTimer = 0; }
}
