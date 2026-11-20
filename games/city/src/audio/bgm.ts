/**
 * Background music, made on the spot with the Web Audio API (no sound files):
 * a slow, warm city loop in the Korean 평조 pentatonic. Soft electric-piano
 * chords and a round bass hold the harmony, a plucked 가야금-like line
 * wanders over it, and brushed percussion keeps time. At night the drums
 * drop out and everything gets softer. It never repeats exactly: the
 * melody is drawn fresh each bar from the scale.
 */

const BPM = 76;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
/** Chords (MIDI notes) of the loop: Cmaj9, Am7, Fmaj9, G6sus, and a turn through Em7 and Dm9. */
const PROGRESSIONS: number[][][] = [
  [[48, 55, 59, 62, 64], [45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 55, 57, 62]],
  [[48, 55, 59, 62, 64], [40, 47, 55, 59, 62], [38, 45, 53, 57, 60], [43, 50, 55, 57, 62]],
];
/** 평조 on C (C D F G A), over two octaves, for the plucked line. */
const SCALE = [72, 74, 77, 79, 81, 84, 86, 89, 91];

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Bgm {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  private wet!: GainNode;
  private timer = 0;
  private next = 0;
  private bar = 0;
  private melodyAt = 4;
  private night = 0;
  private _on = false;
  private _volume = 0.6;
  private rand = Math.random;

  get on() { return this._on; }
  get volume() { return this._volume; }

  /** Start (needs a user gesture first, as browsers require for sound). */
  start() {
    if (!this.ctx || this.ctx instanceof OfflineAudioContext) this.build();
    void this.ctx!.resume();
    if (this._on) return;
    this._on = true;
    this.master.gain.cancelScheduledValues(this.ctx!.currentTime);
    this.master.gain.setTargetAtTime(this.level(), this.ctx!.currentTime, 0.8);
    this.next = this.ctx!.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop() {
    if (!this.ctx || !this._on) return;
    this._on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    window.clearInterval(this.timer);
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this._on) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.2);
  }

  /** 0 by day, 1 deep at night: quieter, no drums, a darker tone. */
  setNight(n: number) { this.night = n; }

  private level() { return this._volume * 0.85; }

  /** Render some of the music without playing it (for a preview file, and for checks). */
  async renderOffline(seconds: number, night = 0): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100);
    const prev = { ctx: this.ctx, bar: this.bar, night: this.night };
    this.build(ctx as unknown as AudioContext);
    this.night = night; this.bar = 0;
    this.master.gain.value = this.level();
    for (let t = 0.05; t < seconds; t += BAR) { this.playBar(t); this.bar++; }
    const out = await ctx.startRendering();
    this.ctx = prev.ctx; this.bar = prev.bar; this.night = prev.night;
    return out;
  }

  private build(given?: AudioContext) {
    const ctx = given ?? new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // A gentle low-pass keeps it soft on phone speakers.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 7000;
    this.master.connect(tone).connect(ctx.destination);
    // Room: a convolution reverb from a made-up decaying noise impulse.
    this.verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    this.verb.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.32;
    this.verb.connect(this.wet).connect(this.master);
  }

  /** Lay down every note that starts within the next fraction of a second. */
  private schedule() {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + 0.25) {
      this.playBar(this.next);
      this.next += BAR;
      this.bar++;
    }
  }

  private playBar(t: number) {
    const prog = PROGRESSIONS[Math.floor(this.bar / 8) % PROGRESSIONS.length];
    const chord = prog[this.bar % 4];
    const day = 1 - this.night;
    // Chords: an electric-piano swell on beat one, a softer restrike on beat three.
    this.keys(chord.slice(1), t, BEAT * 2.2, 0.075 * (0.7 + 0.3 * day));
    this.keys(chord.slice(2), t + BEAT * 2, BEAT * 1.8, 0.05 * (0.7 + 0.3 * day));
    // Bass: root on one, fifth (or root) on the "and" of two.
    this.bass(chord[0] - 12, t, BEAT * 1.4, 0.2);
    this.bass(chord[0] - 12 + (this.rand() < 0.5 ? 7 : 12), t + BEAT * 1.5, BEAT * 0.9, 0.13);
    // Brushed drums by day.
    if (day > 0.35) {
      for (let k = 0; k < 8; k++) this.hat(t + k * BEAT / 2 + (k % 2 ? BEAT * 0.06 : 0), (k % 2 ? 0.018 : 0.028) * day);
      this.kick(t, 0.32 * day); this.kick(t + BEAT * 2.5, 0.2 * day);
      this.snare(t + BEAT, 0.05 * day); this.snare(t + BEAT * 3, 0.05 * day);
    }
    // The plucked line: comes in after a few bars, plays in phrases, rests between them.
    if (this.bar >= this.melodyAt) {
      const phrase = (this.bar - this.melodyAt) % 8;
      if (phrase < 6) this.melody(t, chord);
    }
  }

  /** A short phrase over one bar: steps along the scale, leaning on chord tones. */
  private melody(t: number, chord: number[]) {
    const pcs = new Set(chord.map((m) => m % 12));
    let i = Math.floor(this.rand() * 4) + 1;
    const rhythm = [[0, 1, 1.5, 2.5, 3], [0, 0.5, 1, 2, 3], [0, 1.5, 2, 3.5], [0, 2, 2.5, 3]][Math.floor(this.rand() * 4)];
    for (const b of rhythm) {
      if (this.rand() < 0.18) continue;
      i = Math.max(0, Math.min(SCALE.length - 1, i + [-2, -1, -1, 1, 1, 2][Math.floor(this.rand() * 6)]));
      // Settle on a chord tone if the next one up or down is one.
      if (!pcs.has(SCALE[i] % 12) && i + 1 < SCALE.length && pcs.has(SCALE[i + 1] % 12) && this.rand() < 0.5) i++;
      this.pluck(SCALE[i] - (this.night > 0.5 ? 12 : 0), t + b * BEAT, 0.09 * (1 - this.night * 0.4));
    }
  }

  /* ------------------------------------------------------------ voices */

  private out(gain: number, wet = 0.5) {
    const ctx = this.ctx!, g = ctx.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s).connect(this.verb); }
    return g;
  }

  /** Electric piano: a sine and a soft upper partial, slow attack, long release. */
  private keys(notes: number[], t: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    for (const m of notes) {
      const g = this.out(0, 0.7);
      const env = g.gain;
      env.setValueAtTime(0, t);
      env.linearRampToValueAtTime(vol, t + 0.04);
      env.setTargetAtTime(vol * 0.55, t + 0.05, 0.4);
      env.setTargetAtTime(0, t + dur, 0.5);
      for (const [mul, amp, type] of [[1, 1, 'sine'], [2, 0.18, 'triangle'], [3.01, 0.05, 'sine']] as [number, number, OscillatorType][]) {
        const o = ctx.createOscillator(), a = ctx.createGain();
        o.type = type; o.frequency.value = hz(m) * mul; o.detune.value = (this.rand() - 0.5) * 6;
        a.gain.value = amp;
        o.connect(a).connect(g);
        o.start(t); o.stop(t + dur + 2.5);
      }
    }
  }

  private bass(m: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx!, g = this.out(0, 0.1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.setTargetAtTime(0, t + dur * 0.7, 0.15);
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = hz(m);
    f.type = 'lowpass'; f.frequency.value = 420;
    o.connect(f).connect(g);
    o.start(t); o.stop(t + dur + 1);
  }

  /** A plucked string (Karplus–Strong): a burst of noise ringing in a tuned, damped delay loop. */
  private pluck(m: number, t: number, vol: number) {
    const ctx = this.ctx!, g = this.out(vol, 0.6);
    const f = hz(m), dur = 1.6;
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(ctx.sampleRate / f));
    for (let i = 0; i < period; i++) d[i] = Math.random() * 2 - 1;
    for (let i = period; i < len; i++) d[i] = (d[i - period] + d[i - period + 1 < i ? i - period + 1 : i - period]) * 0.4985;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // A slight bend up into the note, the way a 가야금 string is pressed.
    src.playbackRate.setValueAtTime(0.985, t);
    src.playbackRate.linearRampToValueAtTime(1, t + 0.08);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 2600;
    src.connect(tone).connect(g);
    src.start(t);
  }

  private noise(dur: number) {
    const ctx = this.ctx!, len = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b;
    return s;
  }

  private hat(t: number, vol: number) {
    const ctx = this.ctx!, g = this.out(0, 0.15), f = ctx.createBiquadFilter(), s = this.noise(0.08);
    f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(f).connect(g); s.start(t);
  }

  private snare(t: number, vol: number) {
    const ctx = this.ctx!, g = this.out(0, 0.4), f = ctx.createBiquadFilter(), s = this.noise(0.25);
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(f).connect(g); s.start(t);
  }

  private kick(t: number, vol: number) {
    const ctx = this.ctx!, g = this.out(0, 0), o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); o.start(t); o.stop(t + 0.35);
  }
}
