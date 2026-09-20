import type { TickInput } from '../core/input';
import type { TurnDir } from '../core/track';

type TurnListener = (dir: TurnDir, nowMs: number) => void;

const held = { left: false, right: false };
let jumpPressed = false;
let slidePressed = false;
let pausePressed = false;
let turnListener: TurnListener | null = null;

export function initDomInput(): void {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyA': held.left = true; break;
      case 'KeyD': held.right = true; break;
      case 'ArrowUp': case 'KeyW': case 'Space': jumpPressed = true; e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': slidePressed = true; e.preventDefault(); break;
      case 'ArrowLeft': turnListener?.('left', performance.now()); e.preventDefault(); break;
      case 'ArrowRight': turnListener?.('right', performance.now()); e.preventDefault(); break;
      case 'Escape': pausePressed = true; break;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA') held.left = false;
    if (e.code === 'KeyD') held.right = false;
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
