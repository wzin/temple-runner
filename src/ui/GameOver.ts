import { gameState } from '../gameState';
import { playSound } from '../audio';

let gameOverElement: HTMLElement | null = null;
let finalScoreElement: HTMLElement | null = null;
let highScoreElement: HTMLElement | null = null;
let finalCoinsElement: HTMLElement | null = null;
let retryButton: HTMLButtonElement | null = null;
let menuButton: HTMLButtonElement | null = null;

let onRetryCallback: (() => void) | null = null;
let onMenuCallback: (() => void) | null = null;

export function initGameOver(onRetry: () => void, onMenu: () => void): void {
  gameOverElement = document.getElementById('game-over');
  finalScoreElement = document.getElementById('final-score');
  highScoreElement = document.getElementById('high-score');
  finalCoinsElement = document.getElementById('final-coins');
  retryButton = document.getElementById('retry-btn') as HTMLButtonElement;
  menuButton = document.getElementById('menu-btn') as HTMLButtonElement;

  onRetryCallback = onRetry;
  onMenuCallback = onMenu;

  if (retryButton) {
    retryButton.addEventListener('click', handleRetry);
  }
  if (menuButton) {
    menuButton.addEventListener('click', handleMenu);
  }
}

function handleRetry(): void {
  playSound('click');
  if (onRetryCallback) {
    onRetryCallback();
  }
}

function handleMenu(): void {
  playSound('click');
  if (onMenuCallback) {
    onMenuCallback();
  }
}

export function showGameOver(): void {
  if (gameOverElement) {
    gameOverElement.classList.remove('hidden');
  }

  if (finalScoreElement) {
    finalScoreElement.textContent = gameState.score.toString();
  }

  if (highScoreElement) {
    highScoreElement.textContent = gameState.highScore.toString();
  }

  if (finalCoinsElement) {
    finalCoinsElement.textContent = gameState.coins.toString();
  }
}

export function hideGameOver(): void {
  if (gameOverElement) {
    gameOverElement.classList.add('hidden');
  }
}
