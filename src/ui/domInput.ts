import type { TickInput } from '../core/input';
import type { TurnDir } from '../core/track';

type TurnListener = (dir: TurnDir, nowMs: number) => void;

const held = { left: false, right: false };
let jumpPressed = false;
let slidePressed = false;
let pausePressed = false;
let turnListener: TurnListener | null = null;

let touchPanel: HTMLElement | null = null;

/** Show the arrow panel only while a run is on (and only on touch devices). */
export function setTouchControlsVisible(visible: boolean): void {
  if (!touchPanel) return;
  touchPanel.classList.toggle('hidden', !(visible && isTouchDevice()));
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

export function endFrame(): void {
  jumpPressed = false;
  slidePressed = false;
  pausePressed = false;
}

/** On-screen arrows for touch devices plus swipe gestures anywhere on the game. */
function initTouch(): void {
  const panel = document.getElementById('touch-controls');
  if (!panel) return;
  touchPanel = panel;

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
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); act(action, true); });
    const release = (e: PointerEvent) => { e.preventDefault(); act(action, false); };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Swipes on the canvas: left/right = turn press, up = jump, down = slide.
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  let start: { x: number; y: number; id: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; start = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x; const dy = e.clientY - start.y; start = null;
    const threshold = 28;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (Math.abs(dx) > Math.abs(dy)) turnListener?.(dx < 0 ? 'left' : 'right', performance.now());
    else if (dy < 0) jumpPressed = true; else slidePressed = true;
  });
  canvas.addEventListener('pointercancel', () => { start = null; });
}
