/** Client for the leaderboard API (same origin, /api). Fails soft: the game never depends on it. */
export interface ScoreRow { id?: number; name: string; score: number; coins: number; distance: number; created_at?: string }
export interface SubmitResult { id: number; rank: number; top: ScoreRow[] }

const TIMEOUT_MS = 4000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchTop(limit = 10): Promise<ScoreRow[]> {
  return call<{ scores: ScoreRow[] }>(`/api/scores?limit=${limit}`).then((r) => r.scores);
}

export function submitScore(entry: { name: string; score: number; coins: number; distance: number }): Promise<SubmitResult> {
  return call<SubmitResult>('/api/scores', { method: 'POST', body: JSON.stringify(entry) });
}

export const NAME_PATTERN = /^[A-Za-z0-9 _.-]{1,12}$/;
