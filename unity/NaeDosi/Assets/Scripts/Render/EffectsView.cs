using System;
using System.Collections.Generic;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>
    /// Flames and smoke on burning buildings, flakes drifting down in a 한파 (render/hazards.ts), and the
    /// 불꽃축제 fireworks over the water at night (render/fireworks.ts).
    /// </summary>
    public sealed class EffectsView
    {
        const int MAX_FIRES = 24, FLAMES = 6, PUFFS = 14, FLAKES = 2600;
        const float SNOW_BOX = 520, SNOW_H = 260;
        readonly Instances flames, smoke, flakes, sparks;
        readonly Vector3[] flakePos = new Vector3[FLAKES];
        readonly float[] flakeV = new float[FLAKES];
        float t;
        public Func<double, double, float> heightAt = (x, z) => 0;
        static readonly string[] PALETTE = { "#ffd166", "#ef476f", "#06d6a0", "#7cc6fe", "#ffffff", "#ff9f1c", "#c77dff" };
        const int MAX_SPARKS = 2400, PER = 80; const float LIFE = 2.4f;
        readonly Vector3[] sp = new Vector3[MAX_SPARKS], sv = new Vector3[MAX_SPARKS]; readonly Color[] sc = new Color[MAX_SPARKS]; readonly float[] age = new float[MAX_SPARKS];
        int cursor; float clock, next;

        public EffectsView(Shader ghost, Shader shader)
        {
            Material G(Color c, int queue) { var m = new Material(ghost) { enableInstancing = true }; m.SetColor("_Color", c); m.renderQueue = queue; return m; }
            flames = new Instances(new MeshKit.Shape().Cylinder(0, 1, 0, 1, 6, Color.white).ToMesh("flame"), G(new Color(1, 1, 1, 0.9f), 3010)) { shadows = false };
            var smokeMat = new Material(shader) { enableInstancing = true }; smokeMat.SetFloat("_Mode", 1);
            smoke = new Instances(new MeshKit.Shape().Ico(1, Vector3.zero, MeshKit.Lin("#5d5f63"), Vector3.one).ToMesh("puff"), smokeMat) { shadows = false };
            flakes = new Instances(new MeshKit.Shape().Ico(0.45f, Vector3.zero, Color.white, Vector3.one).ToMesh("flake"), G(new Color(1, 1, 1, 0.85f), 3020)) { shadows = false };
            sparks = new Instances(new MeshKit.Shape().Ico(1.1f, Vector3.zero, Color.white, Vector3.one).ToMesh("spark"), G(new Color(1, 1, 1, 1), 3030)) { shadows = false };
            var r = new System.Random(7);
            for (int k = 0; k < FLAKES; k++) { flakePos[k] = new Vector3((float)(r.NextDouble() - 0.5) * SNOW_BOX, (float)r.NextDouble() * SNOW_H, (float)(r.NextDouble() - 0.5) * SNOW_BOX); flakeV[k] = 6 + (float)r.NextDouble() * 6; }
            for (int i = 0; i < MAX_SPARKS; i++) age[i] = LIFE;
        }

        static Color C(string hex) { ColorUtility.TryParseHtmlString(hex, out var c); return c.linear; }

        public void Update(World w, float dt, double tx, double tz, float night)
        {
            t += dt;
            // Fires.
            var fm = new List<Matrix4x4>(); var fc = new List<Color>(); var smm = new List<Matrix4x4>();
            int n = 0;
            foreach (var b in w.buildings.Values)
            {
                if (b.burn == 0 || n >= MAX_FIRES) continue;
                n++;
                double W = WorldOps.bw(b) * CELL, H = WorldOps.bh(b) * CELL, cx = b.x * CELL + W / 2, cz = b.y * CELL + H / 2;
                double top = heightAt(cx, cz) + Math.Max(3, b.floors * 3) + 0.5;
                double seed = b.id * 1.37;
                for (int k = 0; k < FLAMES; k++)
                {
                    double ang = seed + k * 2.39, r = k % 3 * 0.22 * Math.Min(W, H);
                    double fl = 0.75 + 0.35 * Math.Sin(t * (9 + k) + seed * k);
                    float h = (float)((3 + k % 2 * 2.5) * fl), rad = 1.3f + k % 3 * 0.4f;
                    fm.Add(Matrix4x4.TRS(MeshKit.P(cx + Math.Cos(ang) * r, top - 1.2, cz + Math.Sin(ang) * r), Quaternion.Euler(0, (t * 2 + k) * Mathf.Rad2Deg, 0), new Vector3(rad, h, rad)));
                    fc.Add(C(k % 2 != 0 ? "#ffd23a" : "#ff6a1f") * 1.6f);
                }
                for (int k = 0; k < PUFFS; k++)
                {
                    double life = (t * 0.35 + (double)k / PUFFS + seed) % 1;
                    float s = (float)(1.4 + life * 4.5);
                    smm.Add(Matrix4x4.TRS(MeshKit.P(cx + Math.Sin(seed + k * 1.7) * 2 + life * 7, top + 2 + life * 26, cz + Math.Cos(seed + k * 2.1) * 2 + life * 3), Quaternion.Euler(k * 30, k * 50, 0), new Vector3(s, s * 0.85f, s)));
                }
            }
            flames.Set(fm, fc); smoke.Set(smm, null);
            // Snow round wherever the camera looks.
            var fl2 = new List<Matrix4x4>();
            if (Hazards.snowingNow(w))
            {
                for (int k = 0; k < FLAKES; k++)
                {
                    var p = flakePos[k];
                    p.y -= flakeV[k] * dt; p.x += Mathf.Sin(t * 0.8f + k) * dt * 1.5f;
                    if (p.y < 0) p.y += SNOW_H;
                    flakePos[k] = p;
                    fl2.Add(Matrix4x4.Translate(MeshKit.P(tx + p.x, p.y, tz + p.z)));
                }
            }
            flakes.Set(fl2, null);
            // Fireworks.
            var f = w.festival;
            bool on = f != null && f.kind == "fireworks" && night > 0.5f;
            clock += dt;
            if (on && clock >= next)
            {
                next = clock + 0.35f + UnityEngine.Random.value * 0.6f;
                var c = C(PALETTE[UnityEngine.Random.Range(0, PALETTE.Length)]);
                var o = MeshKit.P(f.x + (UnityEngine.Random.value - 0.5) * 160, 90 + UnityEngine.Random.value * 70, f.z + (UnityEngine.Random.value - 0.5) * 160);
                float speed = 18 + UnityEngine.Random.value * 14;
                for (int k = 0; k < PER; k++)
                {
                    int i = cursor; cursor = (cursor + 1) % MAX_SPARKS;
                    sp[i] = o; sv[i] = UnityEngine.Random.onUnitSphere * speed; sc[i] = c * 1.4f; age[i] = 0;
                }
            }
            var spm = new List<Matrix4x4>(); var spc = new List<Color>();
            for (int i = 0; i < MAX_SPARKS; i++)
            {
                if (age[i] >= LIFE) continue;
                age[i] += dt;
                sv[i].y -= 9 * dt; sv[i] *= 1 - 0.9f * dt; sp[i] += sv[i] * dt;
                float fade = Mathf.Pow(Mathf.Max(0, 1 - age[i] / LIFE), 1.5f);
                spm.Add(Matrix4x4.TRS(sp[i], Quaternion.identity, Vector3.one * (0.3f + fade)));
                spc.Add(sc[i]);
            }
            sparks.Set(spm, spc);
        }

        public void Draw() { flames.Draw(); smoke.Draw(); flakes.Draw(); sparks.Draw(); }
    }
}
