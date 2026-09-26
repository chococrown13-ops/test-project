// Quiet synthesized sounds and haptics. Everything is optional: no audio
// context until the first tap, and nothing plays when muted.

import { getSettings } from './store.ts';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!getSettings().sound) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, slide?: number): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number, delay = 0): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const buzz = (p: number | number[]) => navigator.vibrate?.(p);

/** A wooden tap, like setting down a go stone. */
export function sfxPlace(): void {
  noise(0.05, 0.35, 2400);
  tone(640, 0.05, 0.05, 'triangle');
  buzz(6);
}

export function sfxNote(): void {
  noise(0.03, 0.15, 3200);
}

export function sfxWrong(): void {
  tone(180, 0.14, 0.08, 'sine', 0, 140);
  buzz([10, 40, 10]);
}

/** A row, column or box finished. */
export function sfxUnit(count: number): void {
  const notes = [784, 988, 1175];
  for (let i = 0; i < Math.min(count, 3); i++) tone(notes[i], 0.5, 0.05, 'sine', i * 0.07);
  buzz(12);
}

/** The seal hitting paper. */
export function sfxStamp(): void {
  noise(0.18, 0.9, 700);
  tone(110, 0.22, 0.25, 'sine', 0, 55);
  buzz(35);
}

export function sfxClear(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.7, 0.06, 'sine', 0.45 + i * 0.09));
}

export function unlockAudio(): void {
  audio();
}
