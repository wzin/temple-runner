import { playSound } from '../audio';
import { fetchTop } from './leaderboard';

/** Full hall of fame: every score the API keeps (up to 200), with nick, score, coins and a short local date. */
let screen: HTMLElement | null = null;

export function initScoresScreen(): void {
  screen = document.getElementById('scores-screen');
  document.getElementById('scores-open')?.addEventListener('click', () => { playSound('click'); void open(); });
  document.getElementById('scores-close')?.addEventListener('click', () => { playSound('click'); screen?.classList.add('hidden'); });
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

async function open(): Promise<void> {
  if (!screen) return;
  screen.classList.remove('hidden');
  const body = document.getElementById('ladder-body'); const status = document.getElementById('ladder-status');
  if (status) status.textContent = 'Loading…';
  try {
    const rows = await fetchTop(200);
    if (body) {
      body.innerHTML = '';
      rows.forEach((r, i) => {
        const tr = document.createElement('tr');
        for (const v of [String(i + 1), r.name, r.score.toLocaleString('en-US'), String(r.coins), when(r.created_at)]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
        body.appendChild(tr);
      });
    }
    if (status) status.textContent = rows.length ? `${rows.length} runs` : 'No scores yet — be the first!';
  } catch {
    if (status) status.textContent = 'Leaderboard offline';
  }
}
