import type { TickInput } from '../core/input';
import type { TurnDir } from '../core/track';

type TurnListener = (dir: TurnDir, nowMs: number) => void;

const held = { left: false, right: false };
let jumpPressed = false;
let slidePressed = false;
let pausePressed = false;
let boostPressed = false;
let turnListener: TurnListener | null = null;

let touchPanel: HTMLElement | null = null;

/** Show the arrow panel only while a run is on (and only on touch devices). */
export function setTouchControlsVisible(visible: boolean): void {
  if (!touchPanel) return;
  touchPanel.classList.toggle('hidden', !(visible && isTouchDevice() && !isPadOff()));
}

const isTouchDevice = (): boolean => (typeof window !== 'undefined') && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

export function initDomInput(): void {
  initTouch();
  window.addEventListener('keydown', (e) => {
    if (e.repeat || (e.target instanceof HTMLInputElement)) return;
    // A/D and the arrows behave the same: a tap is a turn press, holding drifts sideways.
    switch (e.code) {
      case 'KeyA': case 'ArrowLeft': held.left = true; turnListener?.('left', performance.now()); e.preventDefault(); break;
      case 'KeyD': case 'ArrowRight': held.right = true; turnListener?.('right', performance.now()); e.preventDefault(); break;
      case 'ArrowUp': case 'KeyW': case 'Space': jumpPressed = true; e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': slidePressed = true; e.preventDefault(); break;
      case 'Escape': pausePressed = true; break;
      case 'KeyE': case 'Enter': case 'ShiftLeft': case 'ShiftRight': case 'KeyB': boostPressed = true; break;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') held.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') held.right = false;
  });
}

/** Turn presses go straight to the game so the buffer is stamped with the real press time. */
export function onTurn(listener: TurnListener): void {
  turnListener = listener;
}

export function pollInput(): TickInput {
  return { drift: (held.right ? 1 : 0) - (held.left ? 1 : 0), jump: jumpPressed, slide: slidePressed };
}

export function wasPausePressed(): boolean {
  return pausePressed;
}

export function wasBoostPressed(): boolean {
  return boostPressed;
}

/** The HUD energy meter (and the pad's centre) fire the boost on touch devices. */
export function pressBoostFromUi(): void { boostPressed = true; }

export function endFrame(): void {
  jumpPressed = false;
  slidePressed = false;
  pausePressed = false;
  boostPressed = false;
}

const PAD_KEY = 'temple-runner.pad';       // 'right' (default) | 'left' | 'off'
function padPref(): string { try { return localStorage.getItem(PAD_KEY) || 'right'; } catch { return 'right'; } }
function setPadPref(v: string): void { try { localStorage.setItem(PAD_KEY, v); } catch { /* ignore */ } applyPadPref(); }
function applyPadPref(): void {
  if (!touchPanel) return;
  const pref = padPref();
  touchPanel.classList.toggle('left', pref === 'left');
  touchPanel.classList.toggle('off', pref === 'off');
  const t = document.getElementById('pad-toggle'); if (t) t.textContent = pref === 'off' ? 'PAD: OFF (SWIPE)' : 'PAD: ON';
}
export function isPadOff(): boolean { return padPref() === 'off'; }

/**
 * Touch: swipe anywhere on the screen (left/right = turn press, up = jump, down = slide) recognised as soon as the
 * finger has moved 24 px, so it feels instant. Touches that start within 28 px of the screen edges are ignored:
 * that band belongs to the browser (back/forward gestures on iOS and Android, the tab switcher, the home bar).
 * Plus a one-thumb pad (four buttons in a diamond in one corner; side swappable; can be switched off).
 */
function initTouch(): void {
  const panel = document.getElementById('touch-controls');
  if (!panel) return;
  touchPanel = panel;
  applyPadPref();
  document.getElementById('pad-side')?.addEventListener('click', () => setPadPref(padPref() === 'left' ? 'right' : 'left'));
  document.getElementById('pad-toggle')?.addEventListener('click', () => setPadPref(padPref() === 'off' ? 'right' : 'off'));
  for (const id of ['energy-container', 'pad-boost']) {
    const el = document.getElementById(id);
    el?.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); boostPressed = true; });
  }

  const act = (action: string, down: boolean) => {
    switch (action) {
      case 'left': held.left = down; if (down) turnListener?.('left', performance.now()); break;
      case 'right': held.right = down; if (down) turnListener?.('right', performance.now()); break;
      case 'jump': if (down) jumpPressed = true; break;
      case 'slide': if (down) slidePressed = true; break;
    }
  };
  for (const btn of Array.from(panel.querySelectorAll<HTMLButtonElement>('.touch-btn'))) {
    const action = btn.dataset.action ?? '';
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); btn.setPointerCapture(e.pointerId); act(action, true); });
    const release = (e: PointerEvent) => { e.preventDefault(); act(action, false); };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const area = document.getElementById('game-container') ?? document.body;
  // Stop iOS/Android from turning touches into text selection, callouts, page scroll or pull-to-refresh.
  const block = (e: Event) => { if (!(e.target instanceof HTMLElement) || !e.target.closest('button, input, .ui-screen')) e.preventDefault(); };
  area.addEventListener('touchstart', block, { passive: false });
  area.addEventListener('touchmove', block, { passive: false });
  area.addEventListener('contextmenu', (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });

  const EDGE = 28; const SWIPE = 24;
  let start: { x: number; y: number; id: number; t: number } | null = null;
  const inEdge = (x: number, y: number) => x < EDGE || x > window.innerWidth - EDGE || y < EDGE * 1.5 || y > window.innerHeight - EDGE;
  const fire = (dx: number, dy: number) => {
    if (Math.abs(dx) > Math.abs(dy)) turnListener?.(dx < 0 ? 'left' : 'right', performance.now());
    else if (dy < 0) jumpPressed = true; else slidePressed = true;
  };
  area.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.target instanceof HTMLElement && e.target.closest('button, input, .ui-screen')) return;
    if (inEdge(e.clientX, e.clientY)) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() };
  });
  area.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x; const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
    start = null; fire(dx, dy);
  });
  area.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x; const dy = e.clientY - start.y; start = null;
    // A short flick that ended before the move threshold still counts if it clearly points somewhere.
    if (Math.abs(dx) >= 12 || Math.abs(dy) >= 12) fire(dx, dy);
  });
  area.addEventListener('pointercancel', () => { start = null; });
}
