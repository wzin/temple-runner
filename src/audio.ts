type SoundName = 'jump' | 'slide' | 'coin' | 'stumble' | 'gameOver' | 'click' | 'powerup' | 'land';

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
  land: { frequency: 90, duration: 0.08, type: 'triangle', volume: 0.25, attack: 0.005, decay: 0.06 },
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

// ---------------------------------------------------------------------------------------------------
// Background music: a procedural Andean groove — log drums, a deep skin drum, a seed shaker and a
// breathy pan-flute melody on a minor pentatonic scale. Everything is synthesised from oscillators
// and filtered noise, scheduled a beat ahead, so there is no audio file to download. `intensity`
// ducks the mix in menus and after a run.

const BPM = 96;
const BEAT = 60 / BPM;
const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];   // A minor pentatonic over two octaves
const MUSIC_KEY = 'temple-runner.music';

let musicGain: GainNode | null = null;
let musicOn = false;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextBeat = 0; let beatIndex = 0;
let intensity = 1;
let noiseBuffer: AudioBuffer | null = null;
let melodySeed = 7;
const mrnd = () => { melodySeed = (melodySeed * 1664525 + 1013904223) >>> 0; return melodySeed / 4294967296; };

export function musicEnabled(): boolean { try { return localStorage.getItem(MUSIC_KEY) !== 'off'; } catch { return true; } }
export function setMusicEnabled(on: boolean): void { try { localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off'); } catch { /* ignore */ } if (on) startMusic(); else stopMusic(); }
export function setMusicIntensity(v: number): void {
  intensity = v;
  const ctx = audioContext; if (!ctx || !musicGain) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(0.32 * v, ctx.currentTime, 0.6);
}

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuffer = buf);
}

function drum(ctx: AudioContext, t: number, f0: number, f1: number, dur: number, vol: number): void {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(musicGain!); o.start(t); o.stop(t + dur + 0.05);
  // Wooden click on the hit.
  const n = ctx.createBufferSource(); n.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * 8; bp.Q.value = 1.2;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  n.connect(bp).connect(ng).connect(musicGain!); n.start(t); n.stop(t + 0.08);
}
function shaker(ctx: AudioContext, t: number, vol: number): void {
  const n = ctx.createBufferSource(); n.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  n.connect(hp).connect(g).connect(musicGain!); n.start(t); n.stop(t + 0.15);
}
function flute(ctx: AudioContext, t: number, freq: number, dur: number, vol: number): void {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = freq * 0.006; vib.connect(vg).connect(o.frequency);
  const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2; const g2 = ctx.createGain(); g2.gain.value = 0.12;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.06); g.gain.setValueAtTime(vol, t + dur - 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  // Breath: a little filtered noise under the tone.
  const n = ctx.createBufferSource(); n.buffer = noise(ctx); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 2; bp.Q.value = 6;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.15, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); o2.connect(g2).connect(g); g.connect(musicGain!); n.connect(bp).connect(ng).connect(musicGain!);
  o.start(t); o2.start(t); vib.start(t); n.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); vib.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
}

let phrase: number[] = [];
function scheduleBeat(ctx: AudioContext, t: number, i: number): void {
  const step = i % 16;                 // 16 eighth notes = two bars of 4/4
  const bar = Math.floor(i / 16);
  // Drums: deep skin drum on 1 and the "and" of 3, log drums answering, shaker on every eighth.
  if (step === 0 || step === 10) drum(ctx, t, 90, 48, 0.5, 0.9);
  if (step === 4 || step === 12 || step === 14) drum(ctx, t, 220, 160, 0.18, 0.5);
  if (step === 6 && bar % 2 === 1) drum(ctx, t, 170, 120, 0.2, 0.45);
  shaker(ctx, t, step % 2 === 0 ? 0.22 : 0.12);
  // Melody: a new eight-note pentatonic phrase every four bars, played on the even eighths, resting now and then.
  if (step === 0 && bar % 4 === 0) { phrase = []; let n = 4; for (let k = 0; k < 8; k++) { n = Math.max(0, Math.min(SCALE.length - 1, n + (mrnd() < 0.5 ? -1 : 1) * (mrnd() < 0.7 ? 1 : 2))); phrase.push(mrnd() < 0.2 ? -1 : n); } }
  if (step % 2 === 0 && phrase.length && intensity > 0.3) { const n = phrase[step / 2]; if (n >= 0) flute(ctx, t, SCALE[n], step % 4 === 0 ? BEAT * 0.9 : BEAT * 0.45, 0.16); }
}

export function startMusic(): void {
  if (musicOn || !musicEnabled()) return;
  const ctx = ensureAudioContext(); if (!ctx || !masterGain) return;
  if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(masterGain); }
  musicOn = true;
  nextBeat = ctx.currentTime + 0.1; beatIndex = 0;
  setMusicIntensity(intensity);
  const tick = () => {
    if (!musicOn || !audioContext) return;
    while (nextBeat < audioContext.currentTime + 0.35) { scheduleBeat(audioContext, nextBeat, beatIndex++); nextBeat += BEAT / 2; }
  };
  tick();
  musicTimer = setInterval(tick, 120);
}

export function stopMusic(): void {
  musicOn = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (audioContext && musicGain) { musicGain.gain.cancelScheduledValues(audioContext.currentTime); musicGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.3); }
}
