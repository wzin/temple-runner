import { musicEnabled, setMusicEnabled } from '../audio';
import { playSound } from '../audio';

let pauseElement: HTMLElement | null = null;
let resumeButton: HTMLButtonElement | null = null;
let restartButton: HTMLButtonElement | null = null;
let quitButton: HTMLButtonElement | null = null;

let onResumeCallback: (() => void) | null = null;
let onRestartCallback: (() => void) | null = null;
let onQuitCallback: (() => void) | null = null;

export function initPauseMenu(
  onResume: () => void,
  onRestart: () => void,
  onQuit: () => void
): void {
  pauseElement = document.getElementById('pause-menu');
  resumeButton = document.getElementById('resume-btn') as HTMLButtonElement;
  const music = document.getElementById('music-toggle');
  const renderMusic = () => { if (music) music.textContent = musicEnabled() ? 'MUSIC: ON' : 'MUSIC: OFF'; };
  music?.addEventListener('click', () => { setMusicEnabled(!musicEnabled()); renderMusic(); });
  renderMusic();
  restartButton = document.getElementById('restart-btn') as HTMLButtonElement;
  quitButton = document.getElementById('quit-btn') as HTMLButtonElement;

  onResumeCallback = onResume;
  onRestartCallback = onRestart;
  onQuitCallback = onQuit;

  if (resumeButton) {
    resumeButton.addEventListener('click', handleResume);
  }
  if (restartButton) {
    restartButton.addEventListener('click', handleRestart);
  }
  if (quitButton) {
    quitButton.addEventListener('click', handleQuit);
  }
}

function handleResume(): void {
  playSound('click');
  if (onResumeCallback) {
    onResumeCallback();
  }
}

function handleRestart(): void {
  playSound('click');
  if (onRestartCallback) {
    onRestartCallback();
  }
}

function handleQuit(): void {
  playSound('click');
  if (onQuitCallback) {
    onQuitCallback();
  }
}

export function showPauseMenu(): void {
  if (pauseElement) {
    pauseElement.classList.remove('hidden');
  }
}

export function hidePauseMenu(): void {
  if (pauseElement) {
    pauseElement.classList.add('hidden');
  }
}
