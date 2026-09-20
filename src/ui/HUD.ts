import { gameState } from '../gameState';
import { playSound } from '../audio';

let hudElement: HTMLElement | null = null;
let scoreElement: HTMLElement | null = null;
let coinsElement: HTMLElement | null = null;
let proximityBar: HTMLElement | null = null;
let powerUpIndicator: HTMLElement | null = null;
let pauseButton: HTMLButtonElement | null = null;
let onPauseCallback: (() => void) | null = null;

export function initHUD(onPause: () => void): void {
  hudElement = document.getElementById('hud');
  scoreElement = document.getElementById('score');
  coinsElement = document.getElementById('coins');
  proximityBar = document.getElementById('proximity-bar');
  powerUpIndicator = document.getElementById('powerup-indicator');
  pauseButton = document.getElementById('pause-btn') as HTMLButtonElement;
  onPauseCallback = onPause;

  if (pauseButton) {
    pauseButton.addEventListener('click', handlePause);
  }
}

function handlePause(): void {
  playSound('click');
  if (onPauseCallback) {
    onPauseCallback();
  }
}

export function updateHUD(): void {
  if (scoreElement) {
    scoreElement.textContent = gameState.score.toString();
  }

  if (coinsElement) {
    coinsElement.textContent = gameState.coins.toString();
  }

  if (proximityBar) {
    proximityBar.style.width = `${gameState.proximityBar}%`;

    // Warning effect when bar is high
    if (gameState.proximityBar > 75) {
      proximityBar.parentElement?.classList.add('warning');
    } else {
      proximityBar.parentElement?.classList.remove('warning');
    }
  }

  if (powerUpIndicator) {
    if (gameState.activePowerUp) {
      powerUpIndicator.classList.add('active');
      const timeLeft = Math.ceil(gameState.powerUpTimer);
      const names: Record<string, string> = {
        magnet: 'MAGNET',
        shield: 'SHIELD',
        boost: 'BOOST',
      };
      powerUpIndicator.textContent = timeLeft > 0 ? `${names[gameState.activePowerUp]} (${timeLeft}s)` : names[gameState.activePowerUp];
    } else {
      powerUpIndicator.classList.remove('active');
    }
  }
}

export function showHUD(): void {
  if (hudElement) {
    hudElement.classList.remove('hidden');
  }
}

export function hideHUD(): void {
  if (hudElement) {
    hudElement.classList.add('hidden');
  }
}
