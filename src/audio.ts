type SoundName = 'jump' | 'slide' | 'coin' | 'stumble' | 'gameOver' | 'click' | 'powerup';

interface Sound {
  frequency: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  attack?: number;
  decay?: number;
}

const SOUNDS: Record<SoundName, Sound | Sound[]> = {
  jump: { frequency: 300, duration: 0.15, type: 'square', volume: 0.2, attack: 0.01, decay: 0.1 },
  slide: { frequency: 150, duration: 0.2, type: 'sawtooth', volume: 0.15 },
  coin: [
    { frequency: 800, duration: 0.1, type: 'sine', volume: 0.2 },
    { frequency: 1000, duration: 0.1, type: 'sine', volume: 0.15 },
  ],
  stumble: { frequency: 100, duration: 0.3, type: 'sawtooth', volume: 0.3 },
  gameOver: [
    { frequency: 400, duration: 0.2, type: 'square', volume: 0.3 },
    { frequency: 300, duration: 0.2, type: 'square', volume: 0.25 },
    { frequency: 200, duration: 0.4, type: 'square', volume: 0.2 },
  ],
  click: { frequency: 600, duration: 0.05, type: 'square', volume: 0.15 },
  powerup: [
    { frequency: 400, duration: 0.1, type: 'sine', volume: 0.2 },
    { frequency: 600, duration: 0.1, type: 'sine', volume: 0.2 },
    { frequency: 800, duration: 0.15, type: 'sine', volume: 0.25 },
  ],
};

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

export function initAudio(): void {
  // Audio context is created on first user interaction
}

function ensureAudioContext(): AudioContext | null {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGain = audioContext.createGain();
      masterGain.connect(audioContext.destination);
      masterGain.gain.value = 0.5;
    } catch {
      console.warn('Web Audio API not supported');
      return null;
    }
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  return audioContext;
}

export function playSound(name: SoundName): void {
  if (muted) return;

  const ctx = ensureAudioContext();
  if (!ctx || !masterGain) return;

  const soundDef = SOUNDS[name];
  const sounds = Array.isArray(soundDef) ? soundDef : [soundDef];

  let delay = 0;
  for (const sound of sounds) {
    playSingleSound(ctx, sound, delay);
    delay += sound.duration;
  }
}

function playSingleSound(ctx: AudioContext, sound: Sound, delay: number): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = sound.type;
  oscillator.frequency.setValueAtTime(sound.frequency, ctx.currentTime + delay);

  const attack = sound.attack || 0.01;

  gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
  gainNode.gain.linearRampToValueAtTime(sound.volume, ctx.currentTime + delay + attack);
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + sound.duration);

  oscillator.connect(gainNode);
  gainNode.connect(masterGain!);

  oscillator.start(ctx.currentTime + delay);
  oscillator.stop(ctx.currentTime + delay + sound.duration + 0.01);
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

export function setVolume(value: number): void {
  if (masterGain) {
    masterGain.gain.value = Math.max(0, Math.min(1, value));
  }
}
