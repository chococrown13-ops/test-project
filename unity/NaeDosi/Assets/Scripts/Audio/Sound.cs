using UnityEngine;

namespace NaeDosi
{
    /// <summary>Sound effects (filled in with the port of audio/sfx.ts).</summary>
    public static partial class Sfx
    {
        public static bool On = PlayerPrefs.GetString("city.sfx", "on") != "off";
        public static float Volume = PlayerPrefs.GetFloat("city.volume", 0.6f);
        public static void Play(string name) { if (On) Synth.Play(name, Volume); }
    }

    /// <summary>Background music (filled in with the port of audio/bgm.ts).</summary>
    public static partial class Bgm
    {
        public static bool On;
        public static float Volume = PlayerPrefs.GetFloat("city.volume", 0.6f);
        public static void Start() { On = true; Synth.Music(true, Volume); }
        public static void Stop() { On = false; Synth.Music(false, Volume); }
        public static void SetVolume(float v) { Volume = Mathf.Clamp01(v); Sfx.Volume = Volume; Synth.Music(On, Volume); }
    }
}
