// Tiny synthesized sound effects — no audio files to load.

let ctx: AudioContext | null = null;
let muted = false;

const MUTE_KEY = 'fruit-merge:muted';
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  /* storage unavailable: default to sound on */
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Must be called from a user gesture at least once (iOS unlocks audio then). */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  if (muted || !ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function sfxDrop(): void {
  tone(420, 0.08, 'sine', 0.12, 260);
}

/** Higher tiers sound deeper; combos climb in pitch. */
export function sfxMerge(tier: number, combo: number): void {
  const base = 880 / Math.pow(1.12, tier);
  const f = base * Math.pow(1.06, Math.min(combo, 8));
  tone(f, 0.12, 'triangle', 0.22, f * 1.6);
  tone(f * 1.5, 0.1, 'sine', 0.1, f * 2, 0.04);
}

export function sfxBigMerge(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, undefined, i * 0.08));
}

export function sfxGameOver(): void {
  [392, 330, 262].forEach((f, i) => tone(f, 0.35, 'sine', 0.2, f * 0.9, i * 0.18));
}
