/** UI-facing snapshot the HUD and menus read. main.ts fills it from the core Game each frame. */
export type GameScreen = 'menu' | 'playing' | 'paused' | 'countdown' | 'gameover';
import type { PowerUpKind } from './core/powerups';
export type PowerUpType = PowerUpKind;

export interface GameState {
  screen: GameScreen;
  score: number;
  coins: number;
  highScore: number;
  proximityBar: number;
  energy: number;
  activePowerUp: PowerUpType | null;
  activePowerUps: { kind: string; timer: number }[];
  powerUpTimer: number;
}

export const gameState: GameState = {
  screen: 'menu',
  score: 0,
  coins: 0,
  highScore: 0,
  proximityBar: 0,
  energy: 0,
  activePowerUp: null,
  activePowerUps: [],
  powerUpTimer: 0,
};
