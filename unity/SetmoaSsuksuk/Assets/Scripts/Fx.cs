using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Pool;

namespace Ssuksuk
{
    /// <summary>
    /// Effects, all pooled: one particle system that every burst is emitted from, floating numbers,
    /// and the little shots ranged spirits throw. Colours come from the palette or the spirit.
    /// </summary>
    public class Fx : MonoBehaviour
    {
        public static Fx I { get; private set; }
        ParticleSystem burst, motes;
        ObjectPool<TextMeshPro> numbers;
        ObjectPool<Transform> shots;
        readonly List<(TextMeshPro t, float age, Vector3 from)> live = new();
        readonly List<(Transform s, Vector3 a, Vector3 b, float age, float len)> flying = new();
        Material numberMat;

        void Awake() => I = this;

        // Built in Start, once every Awake has run, so the base materials exist.
        void Start()
        {
            burst = MakeSystem("burst", false);
            motes = MakeSystem("motes", true);
            numberMat = Fonts.Outlined(Fonts.Title, Palette.LacquerDeep, 0.22f);
            numbers = new ObjectPool<TextMeshPro>(() =>
            {
                var g = new GameObject("number");
                g.transform.SetParent(transform, false);
                var t = g.AddComponent<TextMeshPro>();
                t.font = Fonts.Title;
                t.fontSharedMaterial = numberMat;
                t.alignment = TextAlignmentOptions.Center;
                t.fontSize = 4.6f;
                t.rectTransform.sizeDelta = new Vector2(4, 1);
                return t;
            }, t => t.gameObject.SetActive(true), t => t.gameObject.SetActive(false), null, false, 32);
            shots = new ObjectPool<Transform>(() =>
            {
                var g = Mats.Prim(PrimitiveType.Sphere, transform, Vector3.zero, Vector3.one * 0.22f, Mats.Glow(Palette.Accent, 2f));
                return g.transform;
            }, s => s.gameObject.SetActive(true), s => s.gameObject.SetActive(false), null, false, 16);
        }

        ParticleSystem MakeSystem(string name, bool ambient)
        {
            var g = new GameObject(name);
            g.transform.SetParent(transform, false);
            var ps = g.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var r = g.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = Mats.Particle;
            var main = ps.main;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = ambient ? 40 : 600;
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.EaseInOut(0, 1, 1, 0));
            var emission = ps.emission;
            if (ambient)
            {
                // Motes of dust drifting through the sun over the board.
                main.loop = true;
                main.startLifetime = 8f;
                main.startSpeed = 0.12f;
                main.startSize = 0.07f;
                main.startColor = Palette.A(Palette.Sun, 0.55f);
                main.gravityModifier = -0.004f;
                emission.rateOverTime = 3f;
                var shape = ps.shape;
                shape.shapeType = ParticleSystemShapeType.Box;
                shape.scale = new Vector3(14, 3, 12);
                g.transform.localPosition = new Vector3(0, 2.2f, 0);
                ps.Play();
            }
            else
            {
                main.loop = false;
                emission.enabled = false;
                main.gravityModifier = 0.6f;
                var shape = ps.shape;
                shape.shapeType = ParticleSystemShapeType.Sphere;
                shape.radius = 0.15f;
            }
            return ps;
        }

        /// <summary>A burst of n particles at a point, in a colour, flying out at a speed.</summary>
        public static void Burst(Vector3 at, Color c, int n = 10, float speed = 2.5f, float size = 0.14f, float life = 0.55f, float up = 0f)
        {
            if (I == null || I.burst == null) return;
            var p = new ParticleSystem.EmitParams { applyShapeToPosition = true };
            for (int i = 0; i < n; i++)
            {
                var dir = Random.onUnitSphere;
                dir.y = Mathf.Abs(dir.y) + up;
                p.position = at;
                p.velocity = dir.normalized * speed * Random.Range(0.6f, 1.1f);
                p.startColor = Color.Lerp(c, Palette.Paper, Random.Range(0f, 0.25f));
                p.startSize = size * Random.Range(0.7f, 1.3f);
                p.startLifetime = life * Random.Range(0.8f, 1.2f);
                I.burst.Emit(p, 1);
            }
        }

        /// <summary>Confetti for the big moments: palette colours, thrown up in a cone.</summary>
        public static void Confetti(Vector3 at)
        {
            Color[] cs = { Palette.Accent, Palette.Ally, Palette.Hp, Palette.Enemy };
            for (int k = 0; k < 4; k++) Burst(at, cs[k], 12, 6f, 0.16f, 1.2f, 2.5f);
        }

        /// <summary>A number that rises and fades over the spot: damage, healing, gold.</summary>
        public static void Number(Vector3 at, string text, Color c, float scale = 1f)
        {
            if (I == null || I.burst == null) return;
            var t = I.numbers.Get();
            t.text = text;
            t.color = c;
            t.transform.position = at;
            t.transform.localScale = Vector3.one * scale;
            I.live.Add((t, 0f, at));
        }

        /// <summary>A shot from a to b over len seconds (just for the eye: damage is already done).</summary>
        public static void Shot(Vector3 a, Vector3 b, Color c, float len = 0.22f)
        {
            if (I == null || I.burst == null) return;
            var s = I.shots.Get();
            s.GetComponent<Renderer>().sharedMaterial = Mats.Glow(c, 1.8f);
            s.position = a;
            I.flying.Add((s, a, b, 0f, len));
        }

        void Update()
        {
            var cam = Camera.main;
            for (int i = live.Count - 1; i >= 0; i--)
            {
                var (t, age, from) = live[i];
                age += Time.deltaTime;
                const float len = 0.7f;
                if (age >= len) { numbers.Release(t); live.RemoveAt(i); continue; }
                float k = age / len;
                t.transform.position = from + Vector3.up * (0.9f * Ease.OutCubic(k));
                if (cam != null) t.transform.rotation = cam.transform.rotation;
                var c = t.color; c.a = 1f - k * k; t.color = c;
                float pop = k < 0.15f ? Ease.OutBack(k / 0.15f) : 1f;
                t.transform.localScale = Vector3.one * Mathf.Max(0.01f, pop);
                live[i] = (t, age, from);
            }
            for (int i = flying.Count - 1; i >= 0; i--)
            {
                var (s, a, b, age, len) = flying[i];
                age += Time.deltaTime;
                if (age >= len) { shots.Release(s); flying.RemoveAt(i); continue; }
                float k = age / len;
                s.position = Vector3.Lerp(a, b, k) + Vector3.up * Mathf.Sin(k * Mathf.PI) * 0.6f;
                flying[i] = (s, a, b, age, len);
            }
        }

        public int BurstCount => burst.particleCount;
        public int MoteCount => motes.particleCount;
        public int LiveNumbers => live.Count;
    }
}
