import { playSound } from '../audio';
import { fetchTop, flushQueue } from './leaderboard';

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

export function showMainMenu(highScore = 0): void {
  if (menuElement) {
    menuElement.classList.remove('hidden');
  }
  const hs = document.getElementById('menu-highscore');
  if (hs) hs.textContent = highScore > 0 ? `Your best: ${highScore}` : '';
  void refreshMenuBoard();
}

/** Top five from the leaderboard API, as breadcrumbs of who has been here. */
async function refreshMenuBoard(): Promise<void> {
  const list = document.getElementById('menu-leaderboard');
  const status = document.getElementById('menu-board-status');
  if (!list) return;
  try {
    await flushQueue().catch(() => 0); // scores that could not be sent after an earlier run
    const rows = await fetchTop(5);
    list.innerHTML = '';
    for (const r of rows) {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.className = 'lb-name'; name.textContent = r.name;
      const score = document.createElement('span'); score.className = 'lb-score'; score.textContent = String(r.score);
      li.append(name, score);
      list.appendChild(li);
    }
    if (status) status.textContent = rows.length ? '' : 'No scores yet — be the first!';
  } catch {
    if (status) status.textContent = 'Leaderboard offline';
  }
}

export function hideMainMenu(): void {
  if (menuElement) {
    menuElement.classList.add('hidden');
  }
}
