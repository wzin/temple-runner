import { gameState } from '../gameState';
import { playSound } from '../audio';
import { NAME_PATTERN, ScoreRow, dequeueScore, fetchTop, flushQueue, queueScore, submitScore } from './leaderboard';
import { apiOnline, player } from './account';
import { decorateName } from './ScoresScreen';

/** Game-over screen with arcade-style name entry and the top-10 board. */

const NICK_KEY = 'temple-runner.nick';

let gameOverElement: HTMLElement | null = null;
let finalScoreElement: HTMLElement | null = null;
let highScoreElement: HTMLElement | null = null;
let finalCoinsElement: HTMLElement | null = null;
let retryButton: HTMLButtonElement | null = null;
let menuButton: HTMLButtonElement | null = null;
let nickInput: HTMLInputElement | null = null;
let submitButton: HTMLButtonElement | null = null;
let entryBox: HTMLElement | null = null;
let boardList: HTMLOListElement | null = null;
let boardStatus: HTMLElement | null = null;

let onRetryCallback: (() => void) | null = null;
let onMenuCallback: (() => void) | null = null;
let pending: { score: number; coins: number; distance: number } | null = null;
let submitted = false;

export function initGameOver(onRetry: () => void, onMenu: () => void): void {
  gameOverElement = document.getElementById('game-over');
  finalScoreElement = document.getElementById('final-score');
  highScoreElement = document.getElementById('high-score');
  finalCoinsElement = document.getElementById('final-coins');
  retryButton = document.getElementById('retry-btn') as HTMLButtonElement;
  menuButton = document.getElementById('menu-btn') as HTMLButtonElement;
  nickInput = document.getElementById('nick') as HTMLInputElement;
  submitButton = document.getElementById('submit-score') as HTMLButtonElement;
  entryBox = document.getElementById('score-entry');
  boardList = document.getElementById('leaderboard') as HTMLOListElement;
  boardStatus = document.getElementById('board-status');

  onRetryCallback = onRetry;
  onMenuCallback = onMenu;

  retryButton?.addEventListener('click', () => { playSound('click'); onRetryCallback?.(); });
  menuButton?.addEventListener('click', () => { playSound('click'); onMenuCallback?.(); });
  submitButton?.addEventListener('click', () => void submit());
  nickInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void submit(); }
    else e.stopPropagation(); // typing must not trigger game shortcuts
  });
  nickInput?.addEventListener('keyup', (e) => e.stopPropagation());
}

/** True while the player is typing a name; the game ignores restart keys then. */
export function isEnteringName(): boolean {
  return !!nickInput && document.activeElement === nickInput && !submitted;
}

export function showGameOver(result: { score: number; coins: number; distance: number }): void {
  pending = result;
  submitted = false;
  gameOverElement?.classList.remove('hidden');
  if (finalScoreElement) finalScoreElement.textContent = String(gameState.score);
  if (highScoreElement) highScoreElement.textContent = String(gameState.highScore);
  if (finalCoinsElement) finalCoinsElement.textContent = String(gameState.coins);

  entryBox?.classList.remove('hidden');
  if (boardList) boardList.innerHTML = '';
  if (boardStatus) boardStatus.textContent = '';
  if (nickInput) {
    nickInput.value = '';
    try { nickInput.placeholder = localStorage.getItem(NICK_KEY) || 'AAA'; } catch { nickInput.placeholder = 'AAA'; }
    nickInput.disabled = false;
    setTimeout(() => nickInput?.focus(), 50);
  }
  if (submitButton) submitButton.disabled = false;
  // A registered player needs no name entry: the run is saved under the account name straight away.
  const me = player();
  if (apiOnline() && !me.guest && me.username) {
    entryBox?.classList.add('hidden');
    if (nickInput) nickInput.value = me.username;
    void submit();
    return;
  }
  // Scores that failed to send earlier go first, then the board.
  void flushQueue().catch(() => 0).then(() => fetchTop(10)).then((rows) => { if (!submitted) renderBoard(rows, null); }).catch(() => { if (boardStatus) boardStatus.textContent = 'Leaderboard offline'; });
}

async function submit(): Promise<void> {
  if (!pending || submitted || !nickInput) return;
  // Empty input accepts the remembered name shown as the placeholder.
  const name = (nickInput.value.trim() || (nickInput.placeholder !== 'AAA' ? nickInput.placeholder : '')).trim();
  if (!NAME_PATTERN.test(name)) {
    if (boardStatus) boardStatus.textContent = 'Name: 1-12 letters, digits, space, _ . -';
    nickInput.focus();
    return;
  }
  submitted = true;
  nickInput.disabled = true;
  if (submitButton) submitButton.disabled = true;
  try { localStorage.setItem(NICK_KEY, name); } catch { /* ignore */ }
  if (boardStatus) boardStatus.textContent = 'Saving…';
  try {
    const entry = { name, ...pending };
    const res = await submitScore(entry);
    dequeueScore(entry);
    renderBoard(res.top, res.id);
    if (boardStatus) boardStatus.textContent = `You are #${res.rank}`;
    playSound('powerup');
  } catch (err) {
    // Never lose the run: keep it on this device and send it the next time the leaderboard opens.
    queueScore({ name, ...pending });
    if (boardStatus) boardStatus.textContent = `Could not save (${(err as Error).message}) — kept on this device, will retry automatically. Press Enter to try again now.`;
    submitted = false;
    nickInput.disabled = false;
    if (submitButton) submitButton.disabled = false;
  }
  entryBox?.classList.toggle('hidden', submitted);
  nickInput.blur();
}

function renderBoard(rows: ScoreRow[], highlightId: number | null): void {
  if (!boardList) return;
  boardList.innerHTML = '';
  rows.forEach((r) => {
    const li = document.createElement('li');
    if (highlightId !== null && r.id === highlightId) li.classList.add('me');
    const name = document.createElement('span'); name.className = 'lb-name'; name.textContent = r.name; decorateName(name, r);
    const score = document.createElement('span'); score.className = 'lb-score'; score.textContent = String(r.score);
    li.append(name, score);
    boardList!.appendChild(li);
  });
  if (rows.length === 0 && boardStatus && !boardStatus.textContent) boardStatus.textContent = 'No scores yet — be the first!';
}

export function hideGameOver(): void {
  gameOverElement?.classList.add('hidden');
}
