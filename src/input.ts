export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  slide: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  pause: boolean;
}

export const input: InputState = {
  left: false,
  right: false,
  jump: false,
  slide: false,
  turnLeft: false,
  turnRight: false,
  pause: false,
};

const pressedThisFrame: Set<string> = new Set();

export function wasJustPressed(key: 'jump' | 'slide' | 'turnLeft' | 'turnRight' | 'pause'): boolean {
  return pressedThisFrame.has(key);
}

export function clearFrameInput(): void {
  pressedThisFrame.clear();
}

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyA':
        input.left = true;
        break;
      case 'KeyD':
        input.right = true;
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        if (!input.jump) {
          input.jump = true;
          pressedThisFrame.add('jump');
        }
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 'KeyS':
        if (!input.slide) {
          input.slide = true;
          pressedThisFrame.add('slide');
        }
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if (!input.turnLeft) {
          input.turnLeft = true;
          pressedThisFrame.add('turnLeft');
        }
        e.preventDefault();
        break;
      case 'ArrowRight':
        if (!input.turnRight) {
          input.turnRight = true;
          pressedThisFrame.add('turnRight');
        }
        e.preventDefault();
        break;
      case 'Escape':
        if (!input.pause) {
          input.pause = true;
          pressedThisFrame.add('pause');
        }
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyA':
        input.left = false;
        break;
      case 'KeyD':
        input.right = false;
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        input.jump = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        input.slide = false;
        break;
      case 'ArrowLeft':
        input.turnLeft = false;
        break;
      case 'ArrowRight':
        input.turnRight = false;
        break;
      case 'Escape':
        input.pause = false;
        break;
    }
  });
}
