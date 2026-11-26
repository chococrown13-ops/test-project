using System.Collections;
using UnityEngine;

namespace Ssuksuk
{
    /// <summary>
    /// A spirit on the board: built from palette-tinted primitives, breathing while it stands,
    /// bobbing and leaning when it walks, squashing when hit. It also carries its ring (whose side),
    /// its star pips and, in a fight, its health and mana bars.
    /// </summary>
    public class SpiritView : MonoBehaviour
    {
        public SpiritDef Def { get; private set; }
        public int Star { get; private set; }
        public int Side { get; private set; }

        Transform body, head, ring, bars, accent;
        Transform hpFill, shieldFill, manaFill;
        Renderer ringR;
        Vector3 lastPos, lean;
        float phase, speedN, baseScale;
        float popT = 1f;
        bool selected;

        // Tunables (live-tunable from script eval).
        public float bobAmp = 0.06f, stepFreq = 2.5f, breathe = 0.025f, leanDeg = 9f;

        public static SpiritView Build(SpiritDef d, int star, int side, Transform parent)
        {
            var root = new GameObject(d.NameAt(star));
            root.transform.SetParent(parent, false);
            var v = root.AddComponent<SpiritView>();
            v.Def = d; v.Star = star; v.Side = side;
            v.phase = Random.value * 10f;
            v.Make();
            return v;
        }

        void Make()
        {
            baseScale = (Star == 1 ? 1.12f : Star == 2 ? 1.32f : 1.5f);
            // The ring on the floor says whose piece it is.
            ring = Mats.Prim(PrimitiveType.Cylinder, transform, new Vector3(0, 0.02f, 0), new Vector3(1.3f, 0.02f, 1.3f), Mats.Flat(Side == 0 ? Palette.Ally : Palette.Enemy)).transform;
            ringR = ring.GetComponent<Renderer>();
            body = new GameObject("body").transform;
            body.SetParent(transform, false);
            body.localScale = Vector3.one * baseScale;
            BuildShape();
            // Star pips float behind the head: one, two or three brass beads.
            for (int i = 0; i < Star; i++)
                Mats.Prim(PrimitiveType.Sphere, body, new Vector3((i - (Star - 1) / 2f) * 0.16f, 1.28f, -0.1f), Vector3.one * 0.11f, Mats.Glow(Palette.Accent, 1.4f));
            if (Star >= 2) // an evolved spirit wears a brass band; a three-star a taller crown of beads
            {
                accent = Mats.Prim(PrimitiveType.Cylinder, head, new Vector3(0, 0.27f, -0.06f), new Vector3(0.34f, 0.035f, 0.34f), Mats.Lit(Palette.Accent, 0.6f), new Vector3(-14f, 0, 0)).transform;
                if (Star >= 3)
                    for (int k = 0; k < 5; k++)
                    {
                        float a = k * Mathf.PI * 2f / 5f;
                        Mats.Prim(PrimitiveType.Sphere, head, new Vector3(Mathf.Cos(a) * 0.15f, 0.33f, Mathf.Sin(a) * 0.15f - 0.06f), Vector3.one * 0.07f, Mats.Glow(Palette.Accent, 1.6f));
                    }
            }
            lastPos = transform.position;
        }

        Material M => Mats.Lit(Def.Main, 0.25f);
        Material S => Mats.Lit(Def.Second, 0.25f);
        Material Dark => Mats.Lit(Palette.Shadow, 0.5f);

        /// <summary>Every spirit: an egg body, a head, two eyes; then what makes this one itself, exaggerated so its silhouette reads.</summary>
        void BuildShape()
        {
            var d = Def;
            float bodyH = 0.5f;
            var b = Mats.Prim(PrimitiveType.Sphere, body, new Vector3(0, 0.32f, 0), new Vector3(0.62f, bodyH, 0.56f), M).transform;
            Mats.Prim(PrimitiveType.Sphere, body, new Vector3(0, 0.28f, 0.16f), new Vector3(0.42f, 0.34f, 0.3f), S); // belly
            head = new GameObject("head").transform;
            head.SetParent(body, false);
            head.localPosition = new Vector3(0, 0.72f, 0.04f);
            head.localEulerAngles = new Vector3(-6f, 0, 0);
            Mats.Prim(PrimitiveType.Sphere, head, Vector3.zero, new Vector3(0.52f, 0.48f, 0.5f), d.Body == Body.Chick ? S : M);
            // Eyes, a touch apart, with a bright catch-light so they look alive.
            for (int s = -1; s <= 1; s += 2)
            {
                Mats.Prim(PrimitiveType.Sphere, head, new Vector3(0.11f * s, 0.04f, 0.22f), new Vector3(0.09f, 0.11f, 0.06f), Dark);
                Mats.Prim(PrimitiveType.Sphere, head, new Vector3(0.11f * s + 0.02f, 0.07f, 0.25f), Vector3.one * 0.03f, Mats.Glow(Palette.Paper, 1.2f));
            }
            // Little feet.
            for (int s = -1; s <= 1; s += 2)
                Mats.Prim(PrimitiveType.Sphere, body, new Vector3(0.16f * s, 0.06f, 0.08f), new Vector3(0.16f, 0.1f, 0.2f), Dark);

            switch (d.Body)
            {
                case Body.Hedgehog: // a fan of quills over the back
                    for (int i = 0; i < 9; i++)
                    {
                        float a = (i - 4) * 18f;
                        var q = Mats.Prim(PrimitiveType.Capsule, body, Vector3.zero, new Vector3(0.07f, 0.22f, 0.07f), Mats.Lit(Palette.LacquerDeep, 0.3f), new Vector3(-55f, a, 0));
                        q.transform.localPosition = Quaternion.Euler(0, a, 0) * new Vector3(0, 0.48f, -0.2f);
                    }
                    break;
                case Body.Flame: // a tall flame for hair, two tongues of it
                    Mats.Prim(PrimitiveType.Sphere, head, new Vector3(0, 0.32f, -0.04f), new Vector3(0.3f, 0.5f, 0.3f), Mats.Glow(d.Main, 1.8f), new Vector3(-12, 0, 0));
                    Mats.Prim(PrimitiveType.Sphere, head, new Vector3(0, 0.5f, -0.1f), new Vector3(0.16f, 0.32f, 0.16f), Mats.Glow(Palette.Accent, 2.2f), new Vector3(-20, 0, 0));
                    break;
                case Body.Drop: // a drop: the head draws up to a point
                    Mats.Prim(PrimitiveType.Sphere, head, new Vector3(0, 0.3f, -0.02f), new Vector3(0.3f, 0.36f, 0.3f), M);
                    Mats.Prim(PrimitiveType.Sphere, head, new Vector3(0, 0.5f, -0.04f), new Vector3(0.14f, 0.22f, 0.14f), S);
                    break;
                case Body.Sprout: // two seed-leaves on a stalk
                    Mats.Prim(PrimitiveType.Cylinder, head, new Vector3(0, 0.32f, 0), new Vector3(0.05f, 0.1f, 0.05f), Mats.Lit(Palette.MossDark));
                    Mats.Prim(PrimitiveType.Sphere, head, new Vector3(-0.16f, 0.44f, 0), new Vector3(0.32f, 0.06f, 0.18f), S, new Vector3(0, 0, 22));
                    Mats.Prim(PrimitiveType.Sphere, head, new Vector3(0.16f, 0.44f, 0), new Vector3(0.32f, 0.06f, 0.18f), S, new Vector3(0, 0, -22));
                    break;
                case Body.Chick: // a beak and stubby wings
                    Mats.Prim(PrimitiveType.Cube, head, new Vector3(0, -0.04f, 0.28f), new Vector3(0.1f, 0.1f, 0.1f), Mats.Lit(Palette.Accent), new Vector3(0, 45, 45));
                    for (int s = -1; s <= 1; s += 2)
                        Mats.Prim(PrimitiveType.Sphere, body, new Vector3(0.33f * s, 0.36f, -0.02f), new Vector3(0.12f, 0.26f, 0.3f), S, new Vector3(0, 0, -20 * s));
                    break;
                case Body.Owl: // ear tufts and a pale face disc
                    Mats.Prim(PrimitiveType.Sphere, head, new Vector3(0, 0, 0.14f), new Vector3(0.44f, 0.38f, 0.26f), S);
                    for (int s = -1; s <= 1; s += 2)
                        Mats.Prim(PrimitiveType.Cube, head, new Vector3(0.17f * s, 0.27f, -0.02f), new Vector3(0.09f, 0.2f, 0.06f), M, new Vector3(0, 0, -16 * s));
                    Mats.Prim(PrimitiveType.Cube, head, new Vector3(0, -0.06f, 0.29f), Vector3.one * 0.06f, Mats.Lit(Palette.Accent), new Vector3(0, 45, 45));
                    break;
                case Body.Spark: // a lightning crest
                    Mats.Prim(PrimitiveType.Cube, head, new Vector3(0.04f, 0.34f, 0), new Vector3(0.08f, 0.26f, 0.05f), Mats.Glow(d.Main, 2f), new Vector3(0, 0, -28));
                    Mats.Prim(PrimitiveType.Cube, head, new Vector3(-0.06f, 0.52f, 0), new Vector3(0.07f, 0.2f, 0.05f), Mats.Glow(d.Main, 2f), new Vector3(0, 0, 28));
                    break;
                case Body.Pebble: // a heavy rounded stone with a dark band
                    b.localScale = new Vector3(0.74f, 0.52f, 0.66f);
                    Mats.Prim(PrimitiveType.Cylinder, body, new Vector3(0, 0.34f, 0), new Vector3(0.7f, 0.04f, 0.62f), S);
                    break;
                case Body.Shadow: // tall pointed ears
                    for (int s = -1; s <= 1; s += 2)
                        Mats.Prim(PrimitiveType.Capsule, head, new Vector3(0.16f * s, 0.3f, -0.02f), new Vector3(0.1f, 0.2f, 0.06f), M, new Vector3(0, 0, -18 * s));
                    break;
                case Body.Fawn: // small antlers
                    for (int s = -1; s <= 1; s += 2)
                    {
                        Mats.Prim(PrimitiveType.Capsule, head, new Vector3(0.14f * s, 0.32f, -0.04f), new Vector3(0.05f, 0.14f, 0.05f), Mats.Lit(Palette.Lacquer), new Vector3(0, 0, -20 * s));
                        Mats.Prim(PrimitiveType.Capsule, head, new Vector3(0.22f * s, 0.42f, -0.04f), new Vector3(0.04f, 0.09f, 0.04f), Mats.Lit(Palette.Lacquer), new Vector3(0, 0, -55 * s));
                    }
                    break;
            }
        }

        // ---------------------------------------------------------------- bars

        public void ShowBars(bool on)
        {
            if (on && bars == null)
            {
                bars = new GameObject("bars").transform;
                bars.SetParent(transform, false);
                bars.localPosition = new Vector3(0, 1.55f * baseScale + 0.25f, 0);
                Mats.Prim(PrimitiveType.Cube, bars, new Vector3(0, 0, 0), new Vector3(0.92f, 0.13f, 0.02f), Mats.Flat(Palette.LacquerDeep));
                hpFill = Bar(new Vector3(0, 0.025f, -0.012f), 0.06f, Side == 0 ? Palette.Hp : Palette.Enemy);
                shieldFill = Bar(new Vector3(0, 0.025f, -0.014f), 0.06f, Palette.Shield);
                manaFill = Bar(new Vector3(0, -0.035f, -0.012f), 0.03f, Palette.Mana);
            }
            if (bars != null) bars.gameObject.SetActive(on);
        }

        Transform Bar(Vector3 at, float h, Color c)
        {
            var pivot = new GameObject("fill").transform;
            pivot.SetParent(bars, false);
            pivot.localPosition = at + new Vector3(-0.42f, 0, 0);
            Mats.Prim(PrimitiveType.Cube, pivot, new Vector3(0.42f, 0, 0), new Vector3(0.84f, h, 0.01f), Mats.Flat(c));
            return pivot;
        }

        float shownHp = 1f;
        public void SetBars(float hp01, float shield01, float mana01)
        {
            if (bars == null) return;
            // Health eases down rather than snapping.
            shownHp = hp01 >= shownHp ? hp01 : Mathf.Lerp(shownHp, hp01, 1f - Mathf.Exp(-Time.deltaTime * 10f));
            hpFill.localScale = new Vector3(Mathf.Max(0.001f, shownHp), 1, 1);
            shieldFill.localScale = new Vector3(Mathf.Max(0.001f, Mathf.Min(1f, shield01)), 1, 1);
            shieldFill.gameObject.SetActive(shield01 > 0.01f);
            manaFill.localScale = new Vector3(Mathf.Max(0.001f, mana01), 1, 1);
        }

        // ---------------------------------------------------------------- motion

        public void Select(bool on)
        {
            selected = on;
            ringR.sharedMaterial = Mats.Flat(on ? Palette.Accent : Side == 0 ? Palette.Ally : Palette.Enemy);
        }

        /// <summary>A squash-and-pop: when hit, bought, or merged.</summary>
        public void Pop(float amount = 0.25f) { popT = 0f; popAmt = amount; }
        float popAmt = 0.25f;

        public void Face(Vector3 worldDir)
        {
            worldDir.y = 0;
            if (worldDir.sqrMagnitude > 0.0001f) faceTo = Quaternion.LookRotation(worldDir);
        }
        Quaternion faceTo = Quaternion.identity;
        /// <summary>At rest every spirit turns its face toward the player's camera (in a fight they face their targets instead).</summary>
        public void FaceSide() => faceTo = Quaternion.LookRotation(Side == 0 ? new Vector3(0.15f, 0, -1f) : Vector3.back);

        void LateUpdate()
        {
            float dt = Mathf.Max(Time.deltaTime, 1e-4f);
            Vector3 v = (transform.position - lastPos) / dt;
            lastPos = transform.position;
            v.y = 0;
            float target = Mathf.Clamp01(v.magnitude / 2.2f);
            speedN = Mathf.MoveTowards(speedN, target, dt / 0.3f); // settle over 0.3 s, never freeze
            phase += dt * stepFreq * Mathf.Lerp(0.6f, 1f, speedN);

            // Lean into movement, damped.
            Vector3 localV = Quaternion.Inverse(transform.rotation) * v;
            Vector3 wantLean = new Vector3(Mathf.Clamp(localV.z * 3f, -leanDeg, leanDeg), 0, Mathf.Clamp(-localV.x * 3f, -leanDeg, leanDeg));
            lean = Vector3.Lerp(lean, wantLean, 1f - Mathf.Exp(-dt * 8f));

            float bob = Mathf.Abs(Mathf.Sin(phase * Mathf.PI)) * bobAmp * speedN;
            float br = Mathf.Sin(Time.time * 2f * Mathf.PI / 2.2f + phase) * breathe * (1f - speedN);
            float roll = Mathf.Sin(phase * Mathf.PI) * 3f * speedN;

            popT = Mathf.Min(1f, popT + dt / 0.22f);
            float pop = popT < 1f ? Mathf.Sin(popT * Mathf.PI) * popAmt : 0f;
            float sel = selected ? 0.12f + Mathf.Sin(Time.unscaledTime * 6f) * 0.03f : 0f;

            body.localPosition = new Vector3(0, bob + sel, 0);
            body.localScale = baseScale * new Vector3(1f + pop * 0.6f - br, 1f - pop * 0.5f + br * 2f, 1f + pop * 0.6f - br);
            body.localRotation = Quaternion.Euler(lean.x, 0, lean.z + roll);
            if (head != null) head.localRotation = Quaternion.Euler(-6f + Mathf.Sin(Time.time * 1.3f + phase) * 3f, Mathf.Sin(Time.time * 0.7f + phase) * 6f, 0);
            transform.rotation = Quaternion.Slerp(transform.rotation, faceTo, 1f - Mathf.Exp(-dt * 10f));
            if (bars != null && Camera.main != null) bars.rotation = Camera.main.transform.rotation;
        }

        public IEnumerator Die()
        {
            if (bars != null) bars.gameObject.SetActive(false);
            Vector3 s0 = body.localScale;
            yield return Ease.Tween(0.35f, t => { body.localScale = s0 * (1f - t); body.localPosition = new Vector3(0, t * 0.6f, 0); }, Ease.OutCubic, false);
            gameObject.SetActive(false);
        }
    }
}
