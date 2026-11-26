using UnityEngine;

namespace Ssuksuk
{
    /// <summary>
    /// Every sound in the game, made in code: no audio files. Volumes go through one static gain
    /// layer (Music, Sfx) that the settings sliders set; an Audio Mixer can replace it later in the Editor.
    /// </summary>
    public class Sfx : MonoBehaviour
    {
        public static float Music = 0.6f, Effects = 0.8f;
        public static Sfx I { get; private set; }

        const int Rate = 44100;
        AudioSource bed, oneShots;
        AudioClip blip, click, hit, cast, sting, lose, merge, coin, bedClip;
        float bedBase = 0.35f;

        void Awake()
        {
            I = this;
            try { Music = PlayerPrefs.GetFloat("music", Music); Effects = PlayerPrefs.GetFloat("sfx", Effects); } catch { }
            oneShots = gameObject.AddComponent<AudioSource>();
            oneShots.playOnAwake = false;
            oneShots.spatialBlend = 0f;
            bed = gameObject.AddComponent<AudioSource>();
            bed.loop = true;
            bed.playOnAwake = false;
            bed.spatialBlend = 0f;

            blip = Make("blip", 0.09f, (t, n) => Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(880f, 1320f, t / 0.09f) * t) * Mathf.Exp(-t * 30f));
            click = Make("click", 0.02f, (t, n) => (n * 2f - 1f) * 0.6f);
            hit = Make("hit", 0.08f, (t, n) => ((n * 2f - 1f) * 0.5f + Mathf.Sin(2f * Mathf.PI * 140f * t)) * Mathf.Exp(-t * 45f));
            cast = Make("cast", 0.35f, (t, n) => Mathf.Sin(2f * Mathf.PI * Mathf.Lerp(420f, 980f, t / 0.35f) * t) * 0.5f * Mathf.Exp(-t * 6f));
            coin = Make("coin", 0.16f, (t, n) => (Mathf.Sin(2f * Mathf.PI * (t < 0.06f ? 988f : 1319f) * t)) * 0.6f * Mathf.Exp(-t * 14f));
            sting = Chord("sting", new[] { 523.25f, 659.25f, 783.99f, 1046.5f }, 0.12f);
            merge = Chord("merge", new[] { 659.25f, 783.99f, 987.77f }, 0.08f);
            lose = Chord("lose", new[] { 392f, 329.63f, 261.63f }, 0.18f);
            bedClip = Bed();
            bed.clip = bedClip;
            bed.volume = bedBase * Music;
            bed.Play();
        }

        void Update() => bed.volume = bedBase * Music;

        static float Fade(float t, float len)
        {
            const float f = 0.005f;
            return Mathf.Clamp01(t / f) * Mathf.Clamp01((len - t) / f);
        }

        AudioClip Make(string name, float len, System.Func<float, float, float> wave)
        {
            int n = Mathf.CeilToInt(len * Rate);
            var data = new float[n];
            var rng = new System.Random(name.GetHashCode());
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)Rate;
                data[i] = Mathf.Clamp(wave(t, (float)rng.NextDouble()), -1f, 1f) * 0.7f * Fade(t, len);
            }
            var c = AudioClip.Create(name, n, 1, Rate, false);
            c.SetData(data, 0);
            return c;
        }

        /// <summary>Notes one after another, each overlapping the next a little: a soft square-ish chime.</summary>
        AudioClip Chord(string name, float[] notes, float step)
        {
            float len = step * notes.Length + 0.35f;
            return Make(name, len, (t, n) =>
            {
                float s = 0f;
                for (int k = 0; k < notes.Length; k++)
                {
                    float u = t - k * step;
                    if (u < 0f) continue;
                    float w = Mathf.Sin(2f * Mathf.PI * notes[k] * u);
                    s += (w + 0.25f * Mathf.Sin(6f * Mathf.PI * notes[k] * u)) * Mathf.Exp(-u * 5f);
                }
                return s * 0.45f;
            });
        }

        /// <summary>A six-second loop of soft brown noise with a slow low swell under it: the yard's air.</summary>
        AudioClip Bed()
        {
            const float len = 6f;
            int n = (int)(len * Rate);
            var data = new float[n];
            var rng = new System.Random(7);
            float b = 0f;
            for (int i = 0; i < n; i++)
            {
                b = Mathf.Clamp(b + ((float)rng.NextDouble() * 2f - 1f) * 0.02f, -1f, 1f);
                b *= 0.998f;
                float t = i / (float)Rate;
                float swell = Mathf.Sin(2f * Mathf.PI * 110f * t) * 0.05f * (0.5f + 0.5f * Mathf.Sin(2f * Mathf.PI * t / len));
                data[i] = b * 0.6f + swell;
            }
            // Cross-fade the ends so the loop has no seam.
            int x = Rate / 4;
            for (int i = 0; i < x; i++) { float a = i / (float)x; data[i] = data[i] * a + data[n - x + i] * (1f - a); }
            var c = AudioClip.Create("bed", n - x, 1, Rate, false);
            var trimmed = new float[n - x];
            System.Array.Copy(data, trimmed, n - x);
            c.SetData(trimmed, 0);
            return c;
        }

        void Play(AudioClip c, float vol, float pitchJitter = 0f)
        {
            if (c == null) return;
            oneShots.pitch = 1f + Random.Range(-pitchJitter, pitchJitter);
            oneShots.PlayOneShot(c, vol * Effects);
        }

        public static void Blip() => I?.Play(I.blip, 0.6f, 0.08f);
        public static void Click() => I?.Play(I.click, 0.5f);
        public static void Hit() => I?.Play(I.hit, 0.35f, 0.15f);
        public static void Cast() => I?.Play(I.cast, 0.45f, 0.05f);
        public static void Coin() => I?.Play(I.coin, 0.5f, 0.04f);
        public static void Merge() => I?.Play(I.merge, 0.7f);
        public static void Sting() => I?.Play(I.sting, 0.8f);
        public static void Lose() => I?.Play(I.lose, 0.7f);

        public static void SetMusic(float v) { Music = v; try { PlayerPrefs.SetFloat("music", v); } catch { } }
        public static void SetEffects(float v) { Effects = v; try { PlayerPrefs.SetFloat("sfx", v); } catch { } }
        public bool BedPlaying => bed != null && bed.isPlaying;
        public float BedVolume => bed != null ? bed.volume : 0f;
    }
}
