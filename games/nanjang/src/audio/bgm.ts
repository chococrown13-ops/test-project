/**
 * Background music made on the spot with Web Audio (no files): a bright
 * 자진모리-style loop in a 12-beat feel. A 장구 keeps the pattern (덩, 덕,
 * 쿵, 기덕), a 가야금-like pluck plays a phrase drawn fresh from the scale
 * each bar, a low drone and bass hold the key, and a breathy 대금-like flute
 * joins in fights. Calmer while shopping, fuller while fighting.
 */

const BPM = 92;
/** One beat is split in three (a 12/8 feel): the step length in seconds. */
const STEP = 60 / BPM / 3;
/** E minor pentatonic (E G A B D), the 계면조-like scale the lines are drawn from. */
const SCALE = [64, 67, 69, 71, 74, 76, 79, 81, 83, 86];
/** Bass roots by bar: E, E, C, D (round and round). */
const ROOTS = [40, 40, 36, 38];
/** The drum pattern over 12 steps: d = 덩 (both heads), k = 덕 (rim), q = 쿵 (low), g = 기 (soft rim). */
const DRUM = 'd..k.gq..k.g';

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Bgm {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private wet!: GainNode;
  private verb!: ConvolverNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private next = 0;
  private step = 0;
  private bar = 0;
  private phrase: (number | null)[] = [];
  private flute: (number | null)[] = [];
  private _on = false;
  private _volume = 0.55;
  /** 0 while shopping, 1 in a fight (eased). */
  private heat = 0;
  private heatGoal = 0;

  get on() { return this._on; }
  get volume() { return this._volume; }

  start() {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
    if (this._on) return;
    this._on = true;
    this.master.gain.cancelScheduledValues(this.ctx!.currentTime);
    this.master.gain.setTargetAtTime(this._volume * 0.8, this.ctx!.currentTime, 0.6);
    this.next = this.ctx!.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 30);
  }

  stop() {
    if (!this.ctx || !this._on) return;
    this._on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    window.clearInterval(this.timer);
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this._on) this.master.gain.setTargetAtTime(this._volume * 0.8, this.ctx.currentTime, 0.1);
  }

  /** Fights play fuller: drums on every step, the flute, a denser line. */
  setFight(on: boolean) { this.heatGoal = on ? 1 : 0; }

  private build() {
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    // A small room: a decaying noise burst as the impulse.
    const len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.28;
    this.verb.connect(this.wet).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  private out(node: AudioNode, send = 0.3) {
    node.connect(this.master);
    const s = this.ctx!.createGain(); s.gain.value = send;
    node.connect(s).connect(this.verb);
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + 0.15) {
      this.heat += (this.heatGoal - this.heat) * 0.08;
      const i = this.step % 12;
      if (i === 0) this.newBar();
      this.drum(DRUM[i], this.next);
      // Bass on the strong beats, a drone underneath.
      const root = ROOTS[this.bar % 4];
      if (i === 0 || i === 6 || (this.heat > 0.5 && i === 9)) this.bass(root, this.next, i === 0 ? 0.9 : 0.6);
      if (i === 0) this.drone(root + 12, this.next, STEP * 12);
      const n = this.phrase[i];
      if (n != null) this.pluck(n, this.next, i % 3 === 0 ? 0.55 : 0.38);
      const f = this.flute[i];
      if (f != null && this.heat > 0.35) this.blow(f, this.next, STEP * 3.2);
      this.next += STEP;
      this.step++;
    }
  }

  /** A new phrase each bar: mostly stepwise through the scale, more notes when the fight is on. */
  private newBar() {
    this.bar++;
    const dense = 0.35 + this.heat * 0.35;
    let at = 2 + Math.floor(Math.random() * 4);
    this.phrase = Array(12).fill(null).map((_, i) => {
      if (i % 3 !== 0 && Math.random() > dense * 0.6) return null;
      if (i % 3 === 0 && Math.random() > dense + 0.3) return null;
      at = Math.max(0, Math.min(SCALE.length - 1, at + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      return SCALE[at];
    });
    // The flute holds a long note or two, an octave down from the pluck.
    const f = SCALE[Math.floor(Math.random() * 5)];
    this.flute = Array(12).fill(null);
    this.flute[0] = f;
    if (Math.random() < 0.6) this.flute[6] = SCALE[Math.floor(Math.random() * 5)];
  }

  private drum(k: string, t: number) {
    const ctx = this.ctx!;
    const soft = 0.45 + this.heat * 0.55;
    if (k === '.' && this.heat < 0.6) return;
    if (k === '.') { this.rim(t, 0.12 * this.heat); return; }
    if (k === 'd' || k === 'q') {
      // The low head: a falling sine thump.
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(k === 'd' ? 120 : 95, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7 * soft, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); this.out(g, 0.15);
      o.start(t); o.stop(t + 0.4);
    }
    if (k === 'd' || k === 'k') this.rim(t, 0.42 * soft);
    if (k === 'g') this.rim(t, 0.2 * soft);
  }

  /** The thin 채편 head: a short bright noise crack. */
  private rim(t: number, v: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(bp).connect(g); this.out(g, 0.2);
    src.start(t, Math.random() * 0.5, 0.09);
  }

  private bass(m: number, t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = hz(m);
    lp.type = 'lowpass'; lp.frequency.value = 500;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 2.8);
    o.connect(lp).connect(g); this.out(g, 0.05);
    o.start(t); o.stop(t + STEP * 3);
  }

  private drone(m: number, t: number, len: number) {
    const ctx = this.ctx!;
    for (const d of [0, 7]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz(m + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(g); this.out(g, 0.5);
      o.start(t); o.stop(t + len + 0.05);
    }
  }

  /** A 가야금-like pluck: a bright attack that dulls quickly, with a little bend at the start (농현). */
  private pluck(m: number, t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'triangle';
    o.frequency.setValueAtTime(hz(m + 0.3), t); o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.06);
    o2.frequency.value = hz(m);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3800, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    const mix = ctx.createGain(); mix.gain.value = 0.35;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(mix).connect(lp); o2.connect(lp); lp.connect(g); this.out(g, 0.35);
    o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
  }

  /** A breathy flute: a sine with slow vibrato and a puff of noise. */
  private blow(m: number, t: number, len: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = hz(m);
    vib.frequency.value = 5.2; vg.gain.value = hz(m) * 0.008;
    vib.connect(vg).connect(o.frequency);
    const v = 0.09 * this.heat;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.12); g.gain.setValueAtTime(v, t + len * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(g); this.out(g, 0.55);
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hz(m) * 2; bp.Q.value = 3;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(v * 0.5, t + 0.06); ng.gain.linearRampToValueAtTime(0.0001, t + 0.3);
    n.connect(bp).connect(ng); this.out(ng, 0.4);
    o.start(t); vib.start(t); n.start(t, Math.random() * 0.5, 0.35);
    o.stop(t + len + 0.05); vib.stop(t + len + 0.05);
  }
}
