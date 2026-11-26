using System.Collections.Generic;
using UnityEngine;

namespace Ssuksuk
{
    /// <summary>
    /// Materials by colour. The base materials are project assets (made by the setup script) so the
    /// URP shaders they use are always in the build; everything else is a tinted copy, cached.
    /// </summary>
    public class Mats : MonoBehaviour
    {
        public Material lit, unlit, particle;
        static Mats inst;
        static readonly Dictionary<(Color, int), Material> cache = new();

        void Awake() { inst = this; cache.Clear(); }

        static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        static readonly int Smooth = Shader.PropertyToID("_Smoothness");
        static readonly int Emission = Shader.PropertyToID("_EmissionColor");

        /// <summary>A lit, matte, palette-coloured surface.</summary>
        public static Material Lit(Color c, float smooth = 0.2f)
        {
            var key = (c, 1000 + Mathf.RoundToInt(smooth * 100));
            if (cache.TryGetValue(key, out var m)) return m;
            m = new Material(inst.lit) { name = "Lit " + ColorUtility.ToHtmlStringRGB(c) };
            m.SetColor(BaseColor, c);
            m.SetFloat(Smooth, smooth);
            cache[key] = m;
            return m;
        }

        /// <summary>A lit surface that also glows (above the bloom threshold when strong).</summary>
        public static Material Glow(Color c, float strength)
        {
            var key = (c, 2000 + Mathf.RoundToInt(strength * 10));
            if (cache.TryGetValue(key, out var m)) return m;
            m = new Material(inst.lit) { name = "Glow " + ColorUtility.ToHtmlStringRGB(c) };
            m.SetColor(BaseColor, c);
            m.EnableKeyword("_EMISSION");
            m.SetColor(Emission, c * strength);
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            cache[key] = m;
            return m;
        }

        /// <summary>A flat colour: bars, rings, marks.</summary>
        public static Material Flat(Color c)
        {
            var key = (c, 3000);
            if (cache.TryGetValue(key, out var m)) return m;
            m = new Material(inst.unlit) { name = "Flat " + ColorUtility.ToHtmlStringRGB(c) };
            m.SetColor(BaseColor, c);
            cache[key] = m;
            return m;
        }

        public static Material Particle => inst.particle;

        /// <summary>A primitive with a palette material and no collider (colliders are added only where picking needs them).</summary>
        public static GameObject Prim(PrimitiveType t, Transform parent, Vector3 pos, Vector3 scale, Material m, Vector3 euler = default)
        {
            var g = GameObject.CreatePrimitive(t);
            Object.Destroy(g.GetComponent<Collider>());
            g.transform.SetParent(parent, false);
            g.transform.localPosition = pos;
            g.transform.localScale = scale;
            g.transform.localEulerAngles = euler;
            g.GetComponent<Renderer>().sharedMaterial = m;
            return g;
        }
    }
}
