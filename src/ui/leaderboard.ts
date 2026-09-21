/**
 * Client for the leaderboard API (same origin, /api). Fails soft: the game never depends on it.
 *
 * Network hiccups must never lose a score: a POST is retried with back-off, and if it still fails
 * the entry is kept in localStorage and flushed the next time a screen with a leaderboard opens.
 * ("Failed to fetch" is what Chromium reports when the connection itself drops — a deploy in
 * progress, a proxy restart, a phone changing networks — none of which the API can see.)
 */
export interface ScoreRow { id?: number; name: string; score: number; coins: number; distance: number; created_at?: string }
export interface SubmitResult { id: number; rank: number; top: ScoreRow[] }
export interface ScoreEntry { name: string; score: number; coins: number; distance: number }

const TIMEOUT_MS = 8000;
const QUEUE_KEY = 'temple-runner-pending-scores';
const QUEUE_MAX = 5;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new ApiError(body.error || `HTTP ${res.status}`, res.status);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** Retry transient failures: dropped connections, timeouts, 5xx from a restarting proxy, the 3 s cooldown. */
function transient(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500 || err.status === 429;
  return true; // TypeError "Failed to fetch", AbortError
}

async function call<T>(path: string, init?: RequestInit, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await once<T>(path, init);
    } catch (err) {
      last = err;
      if (!transient(err) || i === attempts - 1) break;
      await sleep(err instanceof ApiError && err.status === 429 ? 3200 : 700 * (i + 1));
    }
  }
  const e = last instanceof Error ? last : new Error(String(last));
  if (e.name === 'AbortError') throw new Error('timed out');
  if (e.message === 'Failed to fetch' || e.message === 'Load failed') throw new Error('no connection');
  throw e;
}

export function fetchTop(limit = 10): Promise<ScoreRow[]> {   // the API caps at 200
  return call<{ scores: ScoreRow[] }>(`/api/scores?limit=${limit}`).then((r) => r.scores);
}

export function submitScore(entry: ScoreEntry): Promise<SubmitResult> {
  return call<SubmitResult>('/api/scores', { method: 'POST', body: JSON.stringify(entry) });
}

export const NAME_PATTERN = /^[A-Za-z0-9 _.-]{1,12}$/;

// ---- offline queue ---------------------------------------------------------------------------

function readQueue(): ScoreEntry[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as ScoreEntry[]; } catch { return []; }
}
function writeQueue(q: ScoreEntry[]): void {
  try { q.length ? localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) : localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
}
const same = (a: ScoreEntry, b: ScoreEntry) => a.name === b.name && a.score === b.score && a.coins === b.coins && a.distance === b.distance;

/** Keep a score that could not be sent; it is retried by `flushQueue`. */
export function queueScore(entry: ScoreEntry): void {
  const q = readQueue().filter((e) => !same(e, entry));
  q.push(entry);
  writeQueue(q.slice(-QUEUE_MAX));
}

export function dequeueScore(entry: ScoreEntry): void {
  writeQueue(readQueue().filter((e) => !same(e, entry)));
}

export function pendingScores(): number { return readQueue().length; }

let flushing: Promise<number> | null = null;
/** Send every queued score (one at a time, honouring the server cooldown). Resolves with the number sent. */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const entry of readQueue()) {
      try {
        await submitScore(entry);
        dequeueScore(entry); sent++;
      } catch (err) {
        // A validation error can never succeed later: drop it. Anything else waits for the next try.
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) dequeueScore(entry);
        else break;
      }
    }
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}
