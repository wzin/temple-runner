import { playSound } from '../audio';
import { SKINS, coinsToNextRuby, normalizeSkinId } from '../core/economy';
import { fetchTop, flushQueue } from './leaderboard';
import { AccountError, isUnlocked, login, logout, onPlayerChange, player, refreshPlayer, register, unlockSkin, apiOnline } from './account';
import { initSkinPreview, setPreviewLocked, showSkin, startPreview, stopPreview } from './skinPreview';
import { decorateName } from './ScoresScreen';

/**
 * Lobby: play button, character carousel (← → or swipe; the model idles and turns), rubies, account.
 * The chosen character is reported through `onSkin`; locked ones can be bought with rubies.
 */

let menuElement: HTMLElement | null = null;
let onPlayCallback: (() => void) | null = null;
let onSkinCallback: ((id: string) => void) | null = null;
let index = 0;
const SKIN_KEY = 'temple-runner.skin';

const el = (id: string) => document.getElementById(id);

export function initMainMenu(onPlay: () => void, onSkin: (id: string) => void, initialSkin: string): void {
  menuElement = el('main-menu');
  onPlayCallback = onPlay; onSkinCallback = onSkin;
  index = Math.max(0, SKINS.findIndex((s) => s.id === normalizeSkinId(initialSkin)));
  el('play-btn')?.addEventListener('click', () => { playSound('click'); onPlayCallback?.(); });

  // Carousel
  const canvas = el('skin-preview') as HTMLCanvasElement | null;
  if (canvas) {
    initSkinPreview(canvas);
    let sx = 0; let active = false;
    canvas.addEventListener('pointerdown', (e) => { sx = e.clientX; active = true; });
    canvas.addEventListener('pointerup', (e) => { if (!active) return; active = false; const dx = e.clientX - sx; if (Math.abs(dx) > 30) step(dx < 0 ? 1 : -1); });
  }
  el('skin-prev')?.addEventListener('click', () => step(-1));
  el('skin-next')?.addEventListener('click', () => step(1));
  el('skin-action')?.addEventListener('click', () => void skinAction());
  window.addEventListener('keydown', (e) => {
    if (!menuElement || menuElement.classList.contains('hidden') || e.target instanceof HTMLInputElement) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') step(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') step(1);
  });

  // Account
  el('account-open')?.addEventListener('click', () => openAccount('register'));
  el('account-login-link')?.addEventListener('click', () => openAccount('login'));
  el('account-logout')?.addEventListener('click', () => { void logout().then(() => renderSkin()).catch(() => undefined); });
  el('account-close')?.addEventListener('click', closeAccount);
  el('account-form')?.addEventListener('submit', (e) => { e.preventDefault(); void submitAccount(); });
  el('account-switch')?.addEventListener('click', () => openAccount(accountMode === 'login' ? 'register' : 'login'));

  onPlayerChange(() => { renderAccount(); renderSkin(); renderRubies(); });
  void refreshPlayer().catch(() => renderAccount());
  renderSkin();
}

function step(dir: number): void {
  index = (index + dir + SKINS.length) % SKINS.length;
  playSound('click');
  renderSkin();
}

/** Current carousel character; selecting is only allowed when it is unlocked. */
function renderSkin(): void {
  const def = SKINS[index];
  const locked = !isUnlocked(def.id);
  showSkin(def.id, locked); setPreviewLocked(locked);
  const name = el('skin-name'); if (name) name.textContent = def.name;
  el('skin-lock')?.classList.toggle('hidden', !locked);
  const lockCost = el('skin-lock-cost'); if (lockCost) lockCost.textContent = `${def.cost} ◆`;
  const blurb = el('skin-blurb'); if (blurb) blurb.textContent = def.blurb;
  const trait = el('skin-trait'); if (trait) trait.textContent = def.trait;
  const dots = el('skin-dots'); if (dots) dots.innerHTML = SKINS.map((s, i) => `<span class="dot${i === index ? ' on' : ''}${isUnlocked(s.id) ? '' : ' locked'}"></span>`).join('');
  const action = el('skin-action') as HTMLButtonElement | null;
  if (!action) return;
  action.classList.remove('hidden');
  if (!locked) {
    const chosen = currentSkin() === def.id;
    action.textContent = chosen ? 'SELECTED' : 'SELECT'; action.disabled = chosen; action.dataset.kind = 'select';
  } else {
    const p = player();
    const can = apiOnline() && p.rubies >= def.cost;
    action.textContent = can ? `UNLOCK FOR ${def.cost} ◆` : `LOCKED · ${def.cost} ◆ (you have ${p.rubies})`;
    action.disabled = !can; action.dataset.kind = 'buy';
  }
}

async function skinAction(): Promise<void> {
  const def = SKINS[index];
  const action = el('skin-action') as HTMLButtonElement | null;
  if (isUnlocked(def.id)) { chooseSkin(def.id); return; }
  if (!action || action.disabled) return;
  action.disabled = true; action.textContent = 'UNLOCKING…';
  try { await unlockSkin(def.id); playSound('powerup'); chooseSkin(def.id); }
  catch (err) { action.textContent = `Could not unlock: ${(err as Error).message}`; }
  renderSkin();
}

function chooseSkin(id: string): void {
  try { localStorage.setItem(SKIN_KEY, id); } catch { /* ignore */ }
  onSkinCallback?.(id);
  playSound('click');
  renderSkin();
}
export function currentSkin(): string { try { return normalizeSkinId(localStorage.getItem(SKIN_KEY)); } catch { return SKINS[0].id; } }

// ---- rubies (visible on every screen) -------------------------------------------------------------
function renderRubies(): void {
  const p = player();
  const box = el('rubies'); if (!box) return;
  box.classList.toggle('hidden', !apiOnline());
  const n = el('ruby-count'); if (n) n.textContent = String(p.rubies);
  const next = el('ruby-next'); if (next) next.textContent = `${coinsToNextRuby(p.coinsTotal).toLocaleString('en-US')} coins to next`;
}

// ---- account ------------------------------------------------------------------------------------------
let accountMode: 'register' | 'login' = 'register';
function renderAccount(): void {
  const p = player();
  const guest = el('account-guest'); const user = el('account-user');
  if (!guest || !user) return;
  if (!apiOnline()) { guest.classList.add('hidden'); user.classList.add('hidden'); return; }
  guest.classList.toggle('hidden', !p.guest); user.classList.toggle('hidden', p.guest);
  const name = el('account-name'); if (name) name.textContent = p.username ?? '';
  const stats = el('account-stats'); if (stats) stats.textContent = `${p.runs} runs · ${p.coinsTotal.toLocaleString('en-US')} coins · best ${p.bestScore.toLocaleString('en-US')}`;
  document.body.classList.toggle('logged-in', !p.guest);
}
function openAccount(mode: 'register' | 'login'): void {
  accountMode = mode;
  const modal = el('account-modal'); if (!modal) return;
  modal.classList.remove('hidden');
  const title = el('account-title'); if (title) title.textContent = mode === 'register' ? 'CREATE YOUR ACCOUNT' : 'LOG IN';
  const submit = el('account-submit'); if (submit) submit.textContent = mode === 'register' ? 'CREATE' : 'LOG IN';
  const sw = el('account-switch'); if (sw) sw.textContent = mode === 'register' ? 'I already have an account' : 'I need an account';
  const note = el('account-note'); if (note) note.textContent = mode === 'register' ? 'Just a name and a password — your rubies and characters move to the account.' : '';
  const err = el('account-error'); if (err) err.textContent = '';
  (el('account-username') as HTMLInputElement | null)?.focus();
}
function closeAccount(): void { el('account-modal')?.classList.add('hidden'); }
async function submitAccount(): Promise<void> {
  const u = (el('account-username') as HTMLInputElement).value.trim();
  const pw = (el('account-password') as HTMLInputElement).value;
  const err = el('account-error'); const submit = el('account-submit') as HTMLButtonElement | null;
  if (submit) submit.disabled = true;
  try {
    await (accountMode === 'register' ? register(u, pw) : login(u, pw));
    playSound('powerup'); closeAccount(); renderSkin();
  } catch (e) {
    if (err) err.textContent = e instanceof AccountError ? e.message : 'No connection';
  } finally { if (submit) submit.disabled = false; }
}

export function showMainMenu(highScore = 0): void {
  menuElement?.classList.remove('hidden');
  const hs = el('menu-highscore');
  if (hs) hs.textContent = highScore > 0 ? `Your best: ${highScore}` : '';
  void refreshPlayer().catch(() => undefined);
  renderSkin(); startPreview();
  void refreshMenuBoard();
}

/** Top five from the leaderboard API, as breadcrumbs of who has been here. */
async function refreshMenuBoard(): Promise<void> {
  const list = el('menu-leaderboard'); const status = el('menu-board-status');
  if (!list) return;
  try {
    await flushQueue().catch(() => 0); // scores that could not be sent after an earlier run
    const rows = await fetchTop(5);
    list.innerHTML = '';
    for (const r of rows) {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.className = 'lb-name'; name.textContent = r.name; decorateName(name, r);
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
  menuElement?.classList.add('hidden');
  stopPreview();
}
