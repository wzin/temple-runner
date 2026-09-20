import { playSound } from '../audio';

let menuElement: HTMLElement | null = null;
let playButton: HTMLButtonElement | null = null;
let onPlayCallback: (() => void) | null = null;

export function initMainMenu(onPlay: () => void): void {
  menuElement = document.getElementById('main-menu');
  playButton = document.getElementById('play-btn') as HTMLButtonElement;
  onPlayCallback = onPlay;

  if (playButton) {
    playButton.addEventListener('click', handlePlay);
  }
}

function handlePlay(): void {
  playSound('click');
  if (onPlayCallback) {
    onPlayCallback();
  }
}

export function showMainMenu(): void {
  if (menuElement) {
    menuElement.classList.remove('hidden');
  }
}

export function hideMainMenu(): void {
  if (menuElement) {
    menuElement.classList.add('hidden');
  }
}
