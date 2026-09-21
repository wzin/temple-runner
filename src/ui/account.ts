/**
 * Player account and progress: a cookie session the API creates for every visitor (guests included), so rubies
 * and unlocked characters follow the browser; registering turns the guest into a username+password account.
 * Everything fails soft: with the API offline the game plays with the free character.
 */
import { SKINS } from '../core/economy';

export interface PlayerView { guest: boolean; username: string | null; coinsTotal: number; rubies: number; nextRubyIn: number; unlocked: string[]; bestScore: number; runs: number; skinCost: Record<string, number> }

const OFFLINE: PlayerView = { guest: true, username: null, coinsTotal: 0, rubies: 0, nextRubyIn: 1_000, unlocked: [SKINS[0].id], bestScore: 0, runs: 0, skinCost: {} };
let current: PlayerView = OFFLINE;
let online = false;
const listeners: ((p: PlayerView) => void)[] = [];

export function player(): PlayerView { return current; }
export function apiOnline(): boolean { return online; }
export function onPlayerChange(cb: (p: PlayerView) => void): void { listeners.push(cb); cb(current); }
function set(p: PlayerView): PlayerView { current = p; online = true; for (const l of listeners) l(p); return p; }

export class AccountError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function call(path: string, body?: unknown): Promise<PlayerView> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as PlayerView & { error?: string };
    if (!res.ok) throw new AccountError(data.error || `HTTP ${res.status}`, res.status);
    return set(data);
  } finally { clearTimeout(timer); }
}

export const refreshPlayer = (): Promise<PlayerView> => call('/api/me');
export const register = (username: string, password: string): Promise<PlayerView> => call('/api/register', { username, password });
export const login = (username: string, password: string): Promise<PlayerView> => call('/api/login', { username, password });
export const logout = (): Promise<PlayerView> => call('/api/logout', {});
export const unlockSkin = (skin: string): Promise<PlayerView> => call('/api/unlock', { skin });
/** Credit a finished run. Retried later from localStorage if it fails (a dropped connection must not eat rubies). */
export async function creditRun(coins: number, distance: number, rubies = 0): Promise<void> {
  const queue = readQueue(); queue.push({ coins, distance, rubies }); writeQueue(queue);
  await flushRuns();
}
const RUN_KEY = 'temple-runner.pending-runs';
function readQueue(): { coins: number; distance: number; rubies?: number }[] { try { return JSON.parse(localStorage.getItem(RUN_KEY) || '[]'); } catch { return []; } }
function writeQueue(q: { coins: number; distance: number; rubies?: number }[]): void { try { q.length ? localStorage.setItem(RUN_KEY, JSON.stringify(q.slice(-20))) : localStorage.removeItem(RUN_KEY); } catch { /* ignore */ } }
export async function flushRuns(): Promise<void> {
  const q = readQueue();
  while (q.length) {
    try { await call('/api/progress', q[0]); q.shift(); writeQueue(q); }
    catch (err) { if (err instanceof AccountError && err.status >= 400 && err.status < 500) { q.shift(); writeQueue(q); } else break; }
  }
}
export function isUnlocked(skin: string): boolean { return current.unlocked.includes(skin); }
