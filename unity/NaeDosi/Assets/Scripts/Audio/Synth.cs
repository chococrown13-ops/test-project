using System;
using System.Collections.Generic;
using UnityEngine;

namespace NaeDosi
{
    /// <summary>
    /// The game's sounds, made in code like the web game's (audio/sfx.ts, audio/bgm.ts), no sound files:
    /// effects are rendered once into clips; the music is rendered a bar at a time just ahead of playback
    /// and scheduled on the audio clock (WebGL has no audio callbacks, so nothing runs on the audio thread).
    /// </summary>
    public sealed class Synth : MonoBehaviour
    {
        static int SR = 44100;
        static Synth inst;
        AudioSource fx;
        readonly AudioSource[] music = new AudioSource[3];
        int musicNext;
        readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        readonly Dictionary<string, double> last = new Dictionary<string, double>();
        static readonly Dictionary<string, double> GAP = new Dictionary<string, double> { ["road"] = 0.08, ["zone"] = 0.08, ["build"] = 0.08, ["demolish"] = 0.08, ["grow"] = 1.6, ["warn"] = 1.2, ["good"] = 1.2, ["undo"] = 0.1, ["error"] = 0.4, ["click"] = 0.05 };
        System.Random rng = new System.Random(1028);
        double R() => rng.NextDouble();
        bool musicOn; float volume = 0.6f; public static float night;
        double nextBar; int bar; const int MELODY_AT = 4;

        static Synth Get()
        {
            if (inst == null) { inst = new GameObject("Synth").AddComponent<Synth>(); DontDestroyOnLoad(inst.gameObject); }
            return inst;
        }

        void Awake()
        {
            fx = gameObject.AddComponent<AudioSource>(); fx.playOnAwake = false;
            for (int i = 0; i < music.Length; i++) { music[i] = gameObject.AddComponent<AudioSource>(); music[i].playOnAwake = false; }
            foreach (var k in GAP.Keys) clips[k] = MakeEffect(k);
        }

        public static void Play(string name, float vol)
        {
            var s = Get();
            if (!s.clips.TryGetValue(name, out var c) || c == null) return;
            double t = Time.realtimeSinceStartupAsDouble;
            if (s.last.TryGetValue(name, out var l) && l + GAP[name] > t) return;
            s.last[name] = t;
            s.fx.PlayOneShot(c, 0.55f * vol);
        }

        public static void Music(bool on, float vol)
        {
            var s = Get();
            s.volume = vol;
            foreach (var m in s.music) m.volume = vol * 0.85f;
            if (on && !s.musicOn) { s.musicOn = true; s.nextBar = AudioSettings.dspTime + 0.2; }
            if (!on && s.musicOn) { s.musicOn = false; foreach (var m in s.music) m.Stop(); }
        }

        public static void Night(float n) => night = n;

        void Update()
        {
            if (!musicOn) return;
            // Keep one bar queued ahead.
            if (ready != null && nextBar - AudioSettings.dspTime < 1.0)
            {
                var src = music[musicNext]; musicNext = (musicNext + 1) % music.Length;
                src.clip = ready; src.volume = volume * 0.85f;
                src.PlayScheduled(Math.Max(nextBar, AudioSettings.dspTime + 0.05));
                nextBar += BAR;
                bar++;
                ready = null;
            }
            if (ready == null && !rendering) StartCoroutine(RenderAhead());
        }

        // ------------------------------------------------------------ a little DSP

        static double Hz(double m) => 440 * Math.Pow(2, (m - 69) / 12);

        /// <summary>RBJ biquad (lowpass, highpass, bandpass).</summary>
        sealed class Biquad
        {
            double b0, b1, b2, a1, a2, x1, x2, y1, y2;
            public Biquad(string type, double f, double q = 0.7071)
            {
                double w = 2 * Math.PI * Math.Min(f, SR * 0.45) / SR, c = Math.Cos(w), s = Math.Sin(w), al = s / (2 * q), a0;
                if (type == "lowpass") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
                else if (type == "highpass") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
                else { b0 = al; b1 = 0; b2 = -al; }
                a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
                b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
            }
            public double Run(double x) { double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }
        }

        static double Osc(string type, double ph)
        {
            double p = ph - Math.Floor(ph);
            switch (type)
            {
                case "triangle": return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
                case "square": return p < 0.5 ? 1 : -1;
                default: return Math.Sin(2 * Math.PI * p);
            }
        }

        /// <summary>Web Audio's exponential ramp from 0.0001 to peak in 8 ms, then down to 0.0001 by len.</summary>
        static double Env(double t, double peak, double len)
        {
            if (t < 0 || t > len) return 0;
            if (t < 0.008) return 0.0001 * Math.Pow(peak / 0.0001, t / 0.008);
            return peak * Math.Pow(0.0001 / peak, (t - 0.008) / (len - 0.008));
        }

        AudioClip Clip(string name, float[] l, float[] r = null)
        {
            r ??= l;
            var data = new float[l.Length * 2];
            for (int i = 0; i < l.Length; i++) { data[i * 2] = Mathf.Clamp(l[i], -1, 1); data[i * 2 + 1] = Mathf.Clamp(r[i], -1, 1); }
            var c = AudioClip.Create(name, l.Length, 2, SR, false);
            c.SetData(data, 0);
            return c;
        }

        // ------------------------------------------------------------ effects

        AudioClip MakeEffect(string kind)
        {
            var buf = new float[(int)(SR * 0.9)];
            void tone(double t0, double f, double len, double peak, string type) { for (int i = (int)(t0 * SR); i < buf.Length && i < (t0 + len + 0.02) * SR; i++) { double t = i / (double)SR - t0; buf[i] += (float)(Osc(type, f * t) * Env(t, peak * 0.5, len)); } }
            void thump(double t0, double f, double len, double peak)
            {
                double ph = 0;
                for (int i = (int)(t0 * SR); i < buf.Length && i < (t0 + len + 0.02) * SR; i++)
                {
                    double t = i / (double)SR - t0, fr = t < len * 0.6 ? f * 1.8 * Math.Pow(1 / 1.8, t / (len * 0.6)) : f;
                    ph += fr / SR; buf[i] += (float)(Math.Sin(2 * Math.PI * ph) * Env(t, peak, len));
                }
            }
            void hiss(double t0, double f, double len, double peak) { var lp = new Biquad("lowpass", f); for (int i = (int)(t0 * SR); i < buf.Length && i < (t0 + len + 0.02) * SR; i++) { double t = i / (double)SR - t0; buf[i] += (float)(lp.Run(R() * 2 - 1) * Env(t, peak, len)); } }
            void sweep(double t0, double f0, double f1, double len, double peak)
            {
                for (int i = (int)(t0 * SR), k = 0; i < buf.Length && i < (t0 + len + 0.02) * SR; i++, k++)
                {
                    double t = i / (double)SR - t0, f = f0 * Math.Pow(f1 / f0, Math.Min(1, t / len));
                    var bp = sweepBq ??= new Biquad("bandpass", f, 1.4);
                    if (k % 64 == 0) sweepBq = new Biquad("bandpass", f, 1.4);
                    buf[i] += (float)(sweepBq.Run(R() * 2 - 1) * Env(t, peak, len) * 1.6);
                }
                sweepBq = null;
            }
            void knock(double t0, double f) { var lp = new Biquad("lowpass", 1800); for (int i = (int)(t0 * SR); i < buf.Length && i < (t0 + 0.12) * SR; i++) { double t = i / (double)SR - t0; buf[i] += (float)(lp.Run(Osc("triangle", f * t)) * Env(t, 0.6, 0.09)); } }
            void bell(double t0, double f, double peak) { foreach (var (m, a) in new[] { (1.0, 1.0), (2.76, 0.25) }) for (int i = (int)(t0 * SR); i < buf.Length && i < (t0 + 0.65) * SR; i++) { double t = i / (double)SR - t0; buf[i] += (float)(Math.Sin(2 * Math.PI * f * m * t) * Env(t, peak * a, 0.6)); } }
            switch (kind)
            {
                case "road": thump(0, 90, 0.18, 0.9); hiss(0, 900, 0.07, 0.25); break;
                case "zone": sweep(0, 600, 2400, 0.22, 0.35); break;
                case "build": knock(0, 330); knock(0.11, 440); break;
                case "demolish": hiss(0, 500, 0.32, 0.7); thump(0, 70, 0.3, 0.8); break;
                case "grow": { int k = 0; foreach (var f in new[] { 523, 659, 784 }) bell(k++ * 0.07, f, 0.18); break; }
                case "good": { int k = 0; foreach (var f in new[] { 659, 784, 988 }) bell(k++ * 0.09, f, 0.28); break; }
                case "warn": tone(0, 330, 0.16, 0.35, "triangle"); tone(0.18, 262, 0.22, 0.35, "triangle"); break;
                case "undo": sweep(0, 2400, 500, 0.18, 0.3); break;
                case "error": tone(0, 180, 0.14, 0.3, "square"); break;
                case "click": knock(0, 660); for (int i = 0; i < buf.Length; i++) buf[i] *= 0.35f; break;
            }
            return Clip(kind, buf);
        }
        Biquad sweepBq;

        // ------------------------------------------------------------ music

        const double BPM = 76, BEAT = 60 / BPM, BAR = BEAT * 4, TAIL = 3.0;
        static readonly int[][][] PROGRESSIONS =
        {
            new[] { new[] { 48, 55, 59, 62, 64 }, new[] { 45, 52, 55, 60, 64 }, new[] { 41, 48, 52, 57, 60 }, new[] { 43, 50, 55, 57, 62 } },
            new[] { new[] { 48, 55, 59, 62, 64 }, new[] { 40, 47, 55, 59, 62 }, new[] { 38, 45, 53, 57, 60 }, new[] { 43, 50, 55, 57, 62 } },
        };
        static readonly int[] SCALE = { 72, 74, 77, 79, 81, 84, 86, 89, 91 };
        float[] dry, wet;
        AudioClip ready; bool rendering;

        /// <summary>The next bar, a voice per frame, so the game never stalls for the music.</summary>
        System.Collections.IEnumerator RenderAhead()
        {
            rendering = true;
            var steps = BarSteps();
            while (steps.MoveNext()) yield return null;
            ready = steps.Current as AudioClip ?? lastClip;
            rendering = false;
        }
        AudioClip lastClip;

        AudioClip RenderBar() { var e = BarSteps(); while (e.MoveNext()) { } return lastClip; }

        /// <summary>One bar (plus its ringing tail) of the loop, as a clip; yields between voices.</summary>
        System.Collections.IEnumerator BarSteps()
        {
            SR = 22050;
            int n = (int)((BAR + TAIL) * SR);
            dry = new float[n]; wet = new float[n];
            var prog = PROGRESSIONS[bar / 8 % PROGRESSIONS.Length];
            var chord = prog[bar % 4];
            double day = 1 - night;
            for (int c = 1; c < chord.Length; c++) { Keys(chord, c, 0, BEAT * 2.2, 0.075 * (0.7 + 0.3 * day), c + 1); yield return null; }
            for (int c = 2; c < chord.Length; c++) { Keys(chord, c, BEAT * 2, BEAT * 1.8, 0.05 * (0.7 + 0.3 * day), c + 1); yield return null; }
            Bass(chord[0] - 12, 0, BEAT * 1.4, 0.2);
            Bass(chord[0] - 12 + (R() < 0.5 ? 7 : 12), BEAT * 1.5, BEAT * 0.9, 0.13);
            if (day > 0.35)
            {
                for (int k = 0; k < 8; k++) Hat(k * BEAT / 2 + (k % 2 != 0 ? BEAT * 0.06 : 0), (k % 2 != 0 ? 0.018 : 0.028) * day);
                Kick(0, 0.32 * day); Kick(BEAT * 2.5, 0.2 * day);
                Snare(BEAT, 0.05 * day); Snare(BEAT * 3, 0.05 * day);
            }
            if (bar >= MELODY_AT && (bar - MELODY_AT) % 8 < 6) Melody(chord);
            yield return null;
            // Room: a small Schroeder reverb on the send, then a soft low-pass on everything.
            var room = Reverb(wet);
            yield return null;
            var l = new float[n]; var r = new float[n];
            var lpL = new Biquad("lowpass", 7000); var lpR = new Biquad("lowpass", 7000);
            for (int i = 0; i < n; i++)
            {
                l[i] = (float)lpL.Run(dry[i] + room.l[i] * 0.32);
                r[i] = (float)lpR.Run(dry[i] + room.r[i] * 0.32);
            }
            lastClip = Clip("bar", l, r);
            SR = 44100;
            yield return lastClip;
        }

        void Add(int i, double v, double send) { if (i < 0 || i >= dry.Length) return; dry[i] += (float)v; wet[i] += (float)(v * send); }

        void Keys(int[] chord, int from, double t0, double dur, double vol, int to = 99)
        {
            for (int c = from; c < Math.Min(to, chord.Length); c++)
            {
                double f = Hz(chord[c]);
                var parts = new[] { (1.0, 1.0, "sine", (R() - 0.5) * 6), (2.0, 0.18, "triangle", (R() - 0.5) * 6), (3.01, 0.05, "sine", (R() - 0.5) * 6) };
                int start = (int)(t0 * SR), end = (int)Math.Min(dry.Length, (t0 + dur + 2.5) * SR);
                // Envelope: attack to vol in 40 ms, settle to 55%, release from dur (computed by running multipliers).
                double settle = Math.Exp(-1.0 / (0.4 * SR)), rel = Math.Exp(-1.0 / (0.5 * SR));
                foreach (var (mul, amp, type, det) in parts)
                {
                    double inc = f * mul * Math.Pow(2, det / 1200) / SR, ph = 0, dec = 0.45, tail = 1;
                    bool tri = type == "triangle";
                    for (int i = start; i < end; i++)
                    {
                        double t = (i - start) / (double)SR;
                        double env = t < 0.04 ? vol * t / 0.04 : vol * (0.55 + dec);
                        if (t >= 0.05) dec *= settle;
                        if (t > dur) { tail *= rel; env *= tail; }
                        double p = ph - Math.Floor(ph);
                        double o = tri ? (p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4) : Math.Sin(6.283185307179586 * p);
                        Add(i, amp * o * env, 0.7);
                        ph += inc;
                    }
                }
            }
        }

        void Bass(int m, double t0, double dur, double vol)
        {
            var lp = new Biquad("lowpass", 420); double f = Hz(m);
            int end = (int)Math.Min(dry.Length, (t0 + dur + 1) * SR);
            for (int i = (int)(t0 * SR); i < end; i++)
            {
                double t = i / (double)SR - t0;
                double env = t < 0.02 ? vol * t / 0.02 : t < dur * 0.7 ? vol : vol * Math.Exp(-(t - dur * 0.7) / 0.15);
                Add(i, lp.Run(Osc("triangle", f * t)) * env, 0.1);
                if (env < 1e-5 && t > dur) break;
            }
        }

        /// <summary>Karplus–Strong pluck with a slight bend up into the note, like a pressed 가야금 string.</summary>
        void Pluck(int m, double t0, double vol)
        {
            double f = Hz(m); int len = (int)(SR * 1.6);
            int period = Math.Max(2, (int)Math.Round(SR / f));
            var d = new float[len];
            for (int i = 0; i < period; i++) d[i] = (float)(R() * 2 - 1);
            for (int i = period; i < len; i++) d[i] = (d[i - period] + d[i - period + 1 < i ? i - period + 1 : i - period]) * 0.4985f;
            var lp = new Biquad("lowpass", 2600);
            double pos = 0; int start = (int)(t0 * SR);
            for (int i = start; i < dry.Length && pos < len - 1; i++)
            {
                double t = (i - start) / (double)SR;
                int a = (int)pos; double fr = pos - a;
                Add(i, lp.Run(d[a] * (1 - fr) + d[a + 1] * fr) * vol, 0.6);
                pos += t < 0.08 ? 0.985 + 0.015 * t / 0.08 : 1;
            }
        }

        void Melody(int[] chord)
        {
            var pcs = new HashSet<int>(); foreach (var m in chord) pcs.Add(m % 12);
            int i = (int)Math.Floor(R() * 4) + 1;
            var rhythms = new[] { new[] { 0, 1, 1.5, 2.5, 3 }, new[] { 0, 0.5, 1, 2, 3 }, new[] { 0, 1.5, 2, 3.5 }, new[] { 0, 2, 2.5, 3.0 } };
            var rhythm = rhythms[(int)Math.Floor(R() * 4)];
            int[] steps = { -2, -1, -1, 1, 1, 2 };
            foreach (var b in rhythm)
            {
                if (R() < 0.18) continue;
                i = Math.Max(0, Math.Min(SCALE.Length - 1, i + steps[(int)Math.Floor(R() * 6)]));
                if (!pcs.Contains(SCALE[i] % 12) && i + 1 < SCALE.Length && pcs.Contains(SCALE[i + 1] % 12) && R() < 0.5) i++;
                Pluck(SCALE[i] - (night > 0.5 ? 12 : 0), b * BEAT, 0.09 * (1 - night * 0.4));
            }
        }

        void Noise(double t0, double len, double vol, Biquad f, double send)
        {
            for (int i = (int)(t0 * SR); i < dry.Length && i < (t0 + len) * SR; i++)
            {
                double t = i / (double)SR - t0;
                Add(i, f.Run(R() * 2 - 1) * vol * Math.Pow(0.0001 / Math.Max(vol, 1e-6), t / len), send);
            }
        }
        void Hat(double t, double vol) => Noise(t, 0.06, vol, new Biquad("highpass", 7000), 0.15);
        void Snare(double t, double vol) => Noise(t, 0.22, vol, new Biquad("bandpass", 1800, 0.7), 0.4);
        void Kick(double t0, double vol)
        {
            double ph = 0;
            for (int i = (int)(t0 * SR); i < dry.Length && i < (t0 + 0.35) * SR; i++)
            {
                double t = i / (double)SR - t0, f = t < 0.18 ? 110 * Math.Pow(42 / 110.0, t / 0.18) : 42;
                ph += f / SR;
                Add(i, Math.Sin(2 * Math.PI * ph) * vol * Math.Pow(0.0001 / vol, Math.Min(1, t / 0.3)), 0);
            }
        }

        /// <summary>Four combs and two all-passes per side: a soft room.</summary>
        static (float[] l, float[] r) Reverb(float[] x)
        {
            float[] side(int[] combs, int[] aps)
            {
                var o = new float[x.Length];
                foreach (int d in combs)
                {
                    var buf = new float[d]; int p = 0; float lp = 0;
                    for (int i = 0; i < x.Length; i++) { float y = buf[p]; lp = y * 0.6f + lp * 0.4f; buf[p] = x[i] + lp * 0.84f; p = (p + 1) % d; o[i] += y * 0.25f; }
                }
                foreach (int d in aps)
                {
                    var buf = new float[d]; int p = 0;
                    for (int i = 0; i < o.Length; i++) { float b = buf[p], y = -o[i] + b; buf[p] = o[i] + b * 0.5f; p = (p + 1) % d; o[i] = y; }
                }
                return o;
            }
            return (side(new[] { 1557, 1617, 1491, 1422 }, new[] { 556, 441 }), side(new[] { 1580, 1640, 1514, 1445 }, new[] { 579, 464 }));
        }
    }
}
