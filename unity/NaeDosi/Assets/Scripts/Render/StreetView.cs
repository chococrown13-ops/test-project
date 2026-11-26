using System;
using System.Collections.Generic;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>
    /// Traffic lights at signalled junctions (render/signals.ts) and what stands on a 고속도로: toll plazas and
    /// 나들목 sign gantries (render/highway.ts).
    /// </summary>
    public sealed class StreetView
    {
        readonly Instances poles, heads, lamps;
        readonly Material litMat;
        readonly List<int> axes = new List<int>();
        readonly List<Matrix4x4> lampMats = new List<Matrix4x4>();
        string key = "", hwyKey = "";
        GameObject hwy;
        readonly Transform parent;
        readonly Material hwyMat;
        public bool visible = true;
        static readonly Color[] LIT = { C("#3be37a"), C("#ffc233"), C("#ff3b2f") };
        static readonly Color DIM = C("#2a2c30");
        static Color C(string hex) { ColorUtility.TryParseHtmlString(hex, out var c); return c.linear; }

        public StreetView(Transform parent, Shader shader, Shader ghost)
        {
            this.parent = parent;
            Material M(int mode, float smooth, float metal) { var m = new Material(shader) { enableInstancing = true }; m.SetFloat("_Mode", mode); m.SetFloat("_Smooth", smooth); m.SetFloat("_Metal", metal); return m; }
            poles = new Instances(new MeshKit.Shape().Cylinder(0.1f, 0.13f, 0, 4.4f, 6, MeshKit.Lin("#8a8f96")).ToMesh("sigpole"), M(1, 0.4f, 0.4f));
            heads = new Instances(new MeshKit.Shape().Box(new Vector3(0, 4.55f, 0), new Vector3(0.5f, 1.35f, 0.5f), MeshKit.Lin("#1f2226")).ToMesh("sighead"), M(1, 0.3f, 0));
            litMat = new Material(ghost) { enableInstancing = true }; litMat.SetColor("_Color", Color.white); litMat.renderQueue = 2000;
            lamps = new Instances(new MeshKit.Shape().Ico(0.17f, Vector3.zero, Color.white, Vector3.one).ToMesh("lamp"), litMat) { shadows = false };
            hwyMat = M(1, 0.4f, 0.15f);
        }

        void Rebuild(World w)
        {
            var at = Signals.signalCells(w);
            var pm = new List<Matrix4x4>();
            axes.Clear(); lampMats.Clear();
            for (int c = 0; c < Graph.NN && pm.Count < 3996; c++)
            {
                if (at[c] == 0) continue;
                int t = w.road[c] == Road.Avenue ? Road.Avenue : Road.Street;
                double h = Curves.HALF_WIDTH(t) + Curves.KERB_W(t) * 0.5;
                double cx = (c % N) * CELL + CELL / 2.0, cz = (c / N) * CELL + CELL / 2.0;
                int x = c % N, y = c / N;
                if (w.diag[c] != 0)
                {
                    bool skip = false;
                    foreach (int m in new[] { c - 1, c + 1, c - N, c + N }) if (m >= 0 && m < Graph.NN && at[m] != 0 && w.diag[m] == 0) skip = true;
                    if (skip) continue;
                }
                foreach (var (sx, sz, axis) in new[] { (1, 1, 0), (-1, -1, 0), (1, -1, 1), (-1, 1, 1) })
                {
                    int nx = x + sx, ny = y + sz;
                    if (nx < 0 || ny < 0 || nx >= N || ny >= N || w.road[ny * N + nx] != 0) continue;
                    int ex = y * N + nx, ez = ny * N + x;
                    if (at[ex] != 0 || at[ez] != 0 || (w.road[ex] != 0 && w.diag[ex] != 0) || (w.road[ez] != 0 && w.diag[ez] != 0)) continue;
                    pm.Add(Matrix4x4.Translate(MeshKit.P(cx + sx * h, 0, cz + sz * h)));
                    for (int k = 0; k < 3; k++)
                    {
                        double ox = axis == 0 ? -sx * 0.26 : 0, oz = axis == 1 ? -sz * 0.26 : 0;
                        lampMats.Add(Matrix4x4.Translate(MeshKit.P(cx + sx * h + ox, 4.1 + k * 0.42, cz + sz * h + oz)));
                    }
                    axes.Add(axis);
                }
            }
            poles.Set(pm, null); heads.Set(pm, null);
        }

        void Highway(World w)
        {
            if (hwy != null) UnityEngine.Object.Destroy(hwy);
            hwy = null;
            var t = new Tris();
            double half = Curves.HALF_WIDTH(Road.Highway);
            void box(double sx, double sy, double sz, double x, double y, double z, string color, double rot, double cx, double cz)
            {
                // Corners turned about the cell centre, as three.js rotates (x' = x cos + z sin, z' = -x sin + z cos).
                double co = Math.Cos(rot), si = Math.Sin(rot);
                double[] P(double lx, double ly, double lz) { double X = x + lx, Z = z + lz; return new[] { cx + X * co + Z * si, y + ly, cz - X * si + Z * co }; }
                var k = Rgb.Hex(color);
                double hx = sx / 2, hz = sz / 2;
                var b0 = P(-hx, 0, -hz); var b1 = P(hx, 0, -hz); var b2 = P(hx, 0, hz); var b3 = P(-hx, 0, hz);
                var t0 = P(-hx, sy, -hz); var t1 = P(hx, sy, -hz); var t2 = P(hx, sy, hz); var t3 = P(-hx, sy, hz);
                var cc = P(0, sy / 2, 0);
                void q(double[] a, double[] b2_, double[] c, double[] d) { t.quad3(a, b2_, c, d, k, new[] { (a[0] + c[0]) / 2 - cc[0], (a[1] + c[1]) / 2 - cc[1], (a[2] + c[2]) / 2 - cc[2] }); }
                q(t3, t2, t1, t0); q(b0, b1, t1, t0); q(b2, b3, t3, t2); q(b1, b2, t2, t1); q(b3, b0, t0, t3);
            }
            for (int i = 0; i < N * N; i++)
            {
                int f = w.hwy[i];
                if (f == 0 || w.road[i] != Road.Highway) continue;
                int x = i % N, y = i / N; double cx = x * CELL + CELL / 2.0, cz = y * CELL + CELL / 2.0;
                bool ew = (x > 0 && w.road[i - 1] == Road.Highway) || (x < N - 1 && w.road[i + 1] == Road.Highway);
                double rot = ew ? Math.PI / 2 : 0;
                if ((f & 2) != 0)
                {
                    for (int k = -2; k <= 2; k++)
                    {
                        double lx = k * (half / 2.5);
                        box(0.9, 0.25, 4.2, lx, 0, 0, "#d8d3c6", rot, cx, cz);
                        box(0.8, 2.3, 1.6, lx, 0.25, 0, "#f2efe6", rot, cx, cz);
                        box(0.82, 0.5, 1.62, lx, 2.55, 0, "#2f6db3", rot, cx, cz);
                    }
                    box(half * 2 + 2, 0.5, 5.4, 0, 4.4, 0, "#e8e4da", rot, cx, cz);
                    box(half * 2 + 2.1, 0.7, 0.2, 0, 3.8, 2.65, "#2f6db3", rot, cx, cz);
                    box(half * 2 + 2.1, 0.7, 0.2, 0, 3.8, -2.65, "#2f6db3", rot, cx, cz);
                    foreach (int sx in new[] { -1, 1 }) box(0.5, 4.4, 0.5, sx * (half + 0.6), 0, 0, "#9aa0a6", rot, cx, cz);
                }
                if ((f & 1) != 0)
                {
                    foreach (int sx in new[] { -1, 1 }) box(0.3, 6.2, 0.3, sx * (half + 0.6), 0, 0, "#9aa0a6", rot, cx, cz);
                    box(half * 2 + 1.5, 0.25, 0.25, 0, 6.1, 0, "#9aa0a6", rot, cx, cz);
                    box(half * 1.1, 1.6, 0.2, half * 0.35, 5.0, 0.15, "#1f7a46", rot, cx, cz);
                    box(half * 0.9, 0.22, 0.21, half * 0.35, 5.6, 0.16, "#f2f2f0", rot, cx, cz);
                    box(half * 0.6, 0.22, 0.21, half * 0.35, 5.15, 0.16, "#f2f2f0", rot, cx, cz);
                }
            }
            if (t.Count == 0) return;
            hwy = new GameObject("Highway");
            hwy.transform.SetParent(parent, false);
            hwy.AddComponent<MeshFilter>().sharedMesh = MeshKit.FromTris("highway", t);
            hwy.AddComponent<MeshRenderer>().sharedMaterial = hwyMat;
        }

        public void Update(World w, double clock, double camDist)
        {
            visible = camDist < 900;
            string k = $"{w.ver.roads}:{w.roundabouts.Count}";
            if (k != key) { key = k; Rebuild(w); }
            if (hwyKey != $"{w.ver.roads}") { hwyKey = $"{w.ver.roads}"; Highway(w); }
            if (!visible) return;
            int g0 = Signals.lightFor(0, clock), g1 = Signals.lightFor(1, clock);
            var cols = new List<Color>(lampMats.Count);
            for (int i = 0; i < axes.Count; i++)
            {
                int on = axes[i] == 0 ? g0 : g1;
                cols.Add(on == Signals.Green ? LIT[0] : DIM); cols.Add(on == Signals.Amber ? LIT[1] : DIM); cols.Add(on == Signals.Red ? LIT[2] : DIM);
            }
            lamps.Set(lampMats, cols);
        }

        public void Draw() { if (!visible) return; poles.Draw(); heads.Draw(); lamps.Draw(); }
    }
}
