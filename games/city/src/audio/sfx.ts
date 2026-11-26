/**
 * Sound effects, made on the spot with the Web Audio API like the music (no
 * sound files): a soft thud for a road, a brush stroke for a zone, two wooden
 * knocks for a building, a crunch for the bulldozer, a rising chime when a
 * new building is finished, two low notes for a warning. Short and quiet, so
 * they sit under the music; each kind waits a moment before it plays again.
 */

export type Sfx = 'road' | 'zone' | 'build' | 'demolish' | 'grow' | 'warn' | 'good' | 'undo' | 'error';

const GAP: Record<Sfx, number> = { road: 0.08, zone: 0.08, build: 0.08, demolish: 0.08, grow: 1.6, warn: 1.2, good: 1.2, undo: 0.1, error: 0.4 };

export class Effects {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private last: Partial<Record<Sfx, number>> = {};
  on = true;
  volume = 0.6;

  /** Browsers only allow sound after a tap or a key: call this from one. */
  wake() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return; }
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
      const n = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    void this.ctx.resume();
  }

  play(kind: Sfx) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if ((this.last[kind] ?? -9) + GAP[kind] > t) return;
    this.last[kind] = t;
    this.out.gain.value = 0.55 * this.volume;
    switch (kind) {
      case 'road': this.thump(t, 90, 0.18, 0.9); this.hiss(t, 900, 0.07, 0.25); break;
      case 'zone': this.sweep(t, 600, 2400, 0.22, 0.35); break;
      case 'build': this.knock(t, 330); this.knock(t + 0.11, 440); break;
      case 'demolish': this.hiss(t, 500, 0.32, 0.7); this.thump(t, 70, 0.3, 0.8); break;
      case 'grow': [523, 659, 784].forEach((f, k) => this.bell(t + k * 0.07, f, 0.18)); break;
      case 'good': [659, 784, 988].forEach((f, k) => this.bell(t + k * 0.09, f, 0.28)); break;
      case 'warn': this.tone(t, 330, 0.16, 0.35, 'triangle'); this.tone(t + 0.18, 262, 0.22, 0.35, 'triangle'); break;
      case 'undo': this.sweep(t, 2400, 500, 0.18, 0.3); break;
      case 'error': this.tone(t, 180, 0.14, 0.3, 'square'); break;
    }
  }

  private env(t: number, peak: number, len: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(this.out);
    return g;
  }

  private tone(t: number, f: number, len: number, peak: number, type: OscillatorType) {
    const o = this.ctx!.createOscillator();
    o.type = type; o.frequency.value = f;
    o.connect(this.env(t, peak * 0.5, len));
    o.start(t); o.stop(t + len + 0.02);
  }

  /** A low drum: a sine that drops in pitch. */
  private thump(t: number, f: number, len: number, peak: number) {
    const o = this.ctx!.createOscillator();
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + len * 0.6);
    o.connect(this.env(t, peak, len));
    o.start(t); o.stop(t + len + 0.02);
  }

  /** A burst of filtered noise. */
  private hiss(t: number, f: number, len: number, peak: number) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'lowpass'; bp.frequency.value = f;
    s.connect(bp); bp.connect(this.env(t, peak, len));
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }

  /** Noise through a moving band: a brush stroke, a whoosh. */
  private sweep(t: number, f0: number, f1: number, len: number, peak: number) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + len);
    s.connect(bp); bp.connect(this.env(t, peak, len));
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }

  /** A wooden knock: a short, bright, quickly damped tone. */
  private knock(t: number, f: number) {
    const o = this.ctx!.createOscillator();
    o.type = 'triangle'; o.frequency.value = f;
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    o.connect(lp); lp.connect(this.env(t, 0.6, 0.09));
    o.start(t); o.stop(t + 0.12);
  }

  /** A soft bell: a sine with a quiet overtone, ringing out. */
  private bell(t: number, f: number, peak: number) {
    for (const [m, a] of [[1, 1], [2.76, 0.25]] as const) {
      const o = this.ctx!.createOscillator();
      o.frequency.value = f * m;
      o.connect(this.env(t, peak * a, 0.6));
      o.start(t); o.stop(t + 0.65);
    }
  }
}

export const sfx = new Effects();
