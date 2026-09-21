import { playSound } from '../audio';
import { ScoreRow, fetchPlayerRuns, fetchTop } from './leaderboard';

/** Full hall of fame: every score the API keeps (up to 200), with nick, score, coins and a short local date. */
let screen: HTMLElement | null = null;

export function initScoresScreen(): void {
  screen = document.getElementById('scores-screen');
  document.getElementById('scores-open')?.addEventListener('click', () => { playSound('click'); void open(); });
  document.getElementById('scores-close')?.addEventListener('click', () => { playSound('click'); if (viewingPlayer) { void open(); } else screen?.classList.add('hidden'); });
  // Registered names anywhere (menu top five, game-over board, the ladder) open that player's runs.
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    const name = t?.closest<HTMLElement>('[data-player]')?.dataset.player;
    if (name) { e.preventDefault(); playSound('click'); void openPlayer(name); }
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && screen && !screen.classList.contains('hidden')) screen.classList.add('hidden'); });
}

function when(iso?: string): string {
  if (!iso) return '';
  // SQLite's datetime('now') is UTC without a zone marker.
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let viewingPlayer: string | null = null;

/** Mark a name as clickable when the row belongs to a registered account. */
export function decorateName(el: HTMLElement, row: ScoreRow): void {
  if (row.registered) { el.dataset.player = row.name; el.classList.add('player-link'); el.title = `Runs by ${row.name}`; }
}

function fillTable(rows: ScoreRow[]): void {
  const body = document.getElementById('ladder-body'); if (!body) return;
  body.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    const cells = [String(i + 1), r.name, r.score.toLocaleString('en-US'), String(r.coins), when(r.created_at)];
    cells.forEach((v, k) => { const td = document.createElement('td'); td.textContent = v; if (k === 1) decorateName(td, r); tr.appendChild(td); });
    body.appendChild(tr);
  });
}

/** All runs of one registered player. */
export async function openPlayer(name: string): Promise<void> {
  if (!screen) return;
  viewingPlayer = name;
  screen.classList.remove('hidden');
  const title = document.getElementById('scores-title'); if (title) title.textContent = `${name.toUpperCase()}'S RUNS`;
  const back = document.getElementById('scores-close'); if (back) back.textContent = 'LADDER';
  const status = document.getElementById('ladder-status'); if (status) status.textContent = 'Loading…';
  try {
    const rows = await fetchPlayerRuns(name);
    fillTable(rows);
    if (status) status.textContent = rows.length ? `${rows.length} runs · best ${Math.max(...rows.map((r) => r.score)).toLocaleString('en-US')}` : 'No runs yet';
  } catch { if (status) status.textContent = 'Leaderboard offline'; }
}

async function open(): Promise<void> {
  if (!screen) return;
  viewingPlayer = null;
  const title = document.getElementById('scores-title'); if (title) title.textContent = 'HALL OF FAME';
  const back = document.getElementById('scores-close'); if (back) back.textContent = 'BACK';
  screen.classList.remove('hidden');
  const status = document.getElementById('ladder-status');
  if (status) status.textContent = 'Loading…';
  try {
    const rows = await fetchTop(200);
    fillTable(rows);
    if (status) status.textContent = rows.length ? `${rows.length} runs · click a ★ name for that player's runs` : 'No scores yet — be the first!';
  } catch {
    if (status) status.textContent = 'Leaderboard offline';
  }
}
