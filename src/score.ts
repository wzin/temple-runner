import { gameState, updateScore as updateGameScore } from './gameState';

export function updateScore(delta: number): void {
  if (gameState.screen !== 'playing' || gameState.isFalling) return;

  updateGameScore(delta);
}

export function getScore(): number {
  return gameState.score;
}

export function getCoins(): number {
  return gameState.coins;
}

export function getHighScore(): number {
  return gameState.highScore;
}

export function getDistance(): number {
  return Math.floor(gameState.distance);
}
