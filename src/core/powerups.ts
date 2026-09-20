export type PowerUpKind = 'magnet' | 'shield' | 'boost';

export interface PowerUp { id: number; kind: PowerUpKind; s: number; x: number; y: number; taken: boolean }

/** Durations in seconds; 0 means "until used" (shield). */
export const POWERUPS: Record<PowerUpKind, { duration: number }> = {
  magnet: { duration: 10 },
  shield: { duration: 0 },
  boost: { duration: 5 },
};

export const BOOST_SPEED_FACTOR = 1.6;
export const MAGNET_RADIUS = 8;
export const MAGNET_PULL_SPEED = 20;
export const POWERUP_KINDS: readonly PowerUpKind[] = ['magnet', 'shield', 'boost'];
