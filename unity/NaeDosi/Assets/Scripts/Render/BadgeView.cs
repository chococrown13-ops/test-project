using System;
using System.Collections.Generic;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>
    /// Problem badges over the map: no power, no water, no road, empty houses, cars with nowhere to park,
    /// badly jammed roads and zoned land left waiting (updateIcons, updateJams, updateStalls in render/buildings.ts).
    /// </summary>
    public sealed class BadgeView
    {
        static readonly string[] KINDS_ = { "power", "water", "road", "gone", "park", "jam", "stall" };
        readonly Dictionary<string, Instances> byKind = new Dictionary<string, Instances>();
        readonly Dictionary<string, List<Matrix4x4>> pos = new Dictionary<string, List<Matrix4x4>>();
        HashSet<int> jamOn = new HashSet<int>();
        public bool hidden;

        public BadgeView(Shader badge)
        {
            var quad = new Mesh();
            quad.SetVertices(new List<Vector3> { new Vector3(-0.5f, -0.5f), new Vector3(0.5f, -0.5f), new Vector3(0.5f, 0.5f), new Vector3(-0.5f, 0.5f) });
            quad.SetUVs(0, new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) });
            quad.SetTriangles(new[] { 0, 2, 1, 0, 3, 2 }, 0);
            quad.bounds = new Bounds(Vector3.zero, Vector3.one * 2);
            foreach (var k in KINDS_)
            {
                var m = new Material(badge) { enableInstancing = true };
                m.SetTexture("_MainTex", Icon(k));
                byKind[k] = new Instances(quad, m) { shadows = false };
                pos[k] = new List<Matrix4x4>();
            }
        }

        static Matrix4x4 At(double x, double y, double z, double s) => Matrix4x4.TRS(MeshKit.P(x, y, z), Quaternion.identity, Vector3.one * (float)s);

        public void UpdateIcons(World w, bool showAll, bool parking)
        {
            foreach (var k in new[] { "power", "water", "road", "gone", "park" }) pos[k].Clear();
            var net = Network.network(w);
            int n = 0;
            void put(Building b, string k)
            {
                if (n >= 400) return;
                double k2 = k == "gone" ? 4.6 : 6.4;
                pos[k].Add(At((b.x + WorldOps.bw(b) / 2.0) * CELL, b.floors * 3 + 4 + k2, (b.y + WorldOps.bh(b) / 2.0) * CELL, k2));
                n++;
            }
            foreach (var b in w.buildings.Values)
            {
                var d = KINDS[b.kind];
                if (b.kind == "metro" || b.kind == "tower") continue;
                if (d.zone == 0) { if (!net.access.ContainsKey(b.id)) put(b, "road"); else if (showAll && d.power > 0 && !b.powered) put(b, "power"); continue; }
                if (b.abandoned) put(b, "gone");
                else if (b.outage > 3 || (showAll && b.outage > 0)) put(b, !b.powered ? "power" : "water");
                else if (w.parkPress[b.y * N + b.x] >= (parking ? 30 : 70)) put(b, "park");
            }
            foreach (var k in new[] { "power", "water", "road", "gone", "park" }) byKind[k].Set(pos[k], null);
        }

        public void UpdateJams(World w)
        {
            const double ON = 1.15, OFF = 0.75; const int GAP = 4;
            var next = new HashSet<int>();
            foreach (int c in jamOn) if (w.traffic[c] > OFF && (w.road[c] != 0 || w.roadAlt[c] != 0)) next.Add(c);
            var cand = new List<int>();
            for (int i = 0; i < N * N; i++) if (w.traffic[i] >= ON && (w.road[i] != 0 || w.roadAlt[i] != 0)) cand.Add(i);
            cand.Sort((a, b) => w.traffic[b].CompareTo(w.traffic[a]));
            bool near(int c) { foreach (int o in next) if (Math.Abs(o % N - c % N) <= GAP && Math.Abs(o / N - c / N) <= GAP) return true; return false; }
            foreach (int c in cand) { if (next.Count >= 40) break; if (!near(c)) next.Add(c); }
            jamOn = next;
            pos["jam"].Clear();
            foreach (int c in next) { bool alt = w.road[c] == 0 && w.roadAlt[c] != 0; pos["jam"].Add(At(c % N * CELL + CELL / 2.0, (alt ? 12 : 0) + 9, c / N * CELL + CELL / 2.0, 7)); }
            byKind["jam"].Set(pos["jam"], null);
        }

        public void UpdateStalls(World w)
        {
            var lots = Diagnose.freeLots(w);
            var why = new Dictionary<int, bool>();
            foreach (int z in new[] { Zone.R, Zone.C, Zone.I }) why[z] = Diagnose.growthBlock(w, z, lots) != null;
            const int B = 6;
            var seen = new Dictionary<int, (double x, double y, int n)>();
            var order = new List<int>();
            for (int i = 0; i < N * N; i++)
            {
                int z = w.zone[i];
                if (z == 0 || w.road[i] != 0 || w.bld[i] >= 0 || Pockets.isPocket(w, i) || !Pockets.onRoad(w, i)) continue;
                if (!why[z] && Diagnose.reachesEdge(w, i)) continue;
                int x = i % N, y = i / N, k = y / B * 1000 + x / B;
                if (seen.TryGetValue(k, out var e)) seen[k] = (e.x + x, e.y + y, e.n + 1); else { seen[k] = (x, y, 1); order.Add(k); }
            }
            pos["stall"].Clear();
            foreach (int k in order) { var e = seen[k]; if (e.n < 3 || pos["stall"].Count >= 60) continue; pos["stall"].Add(At((e.x / e.n + 0.5) * CELL, 7, (e.y / e.n + 0.5) * CELL, 6)); }
            byKind["stall"].Set(pos["stall"], null);
        }

        public void Draw() { if (hidden) return; foreach (var i in byKind.Values) i.Draw(); }

        // ---- the badge pictures: a 128px card-stock ring, a coloured disc and a white pictogram ----

        static Texture2D Icon(string k)
        {
            const int S = 128;
            var px = new Color32[S * S];
            Color32 paper = new Color32(0xfb, 0xf8, 0xee, 255);
            Color32 disc = Hex(k == "stall" ? "#e8a21f" : k == "jam" ? "#d8452f" : k == "gone" ? "#5b616b" : k == "water" ? "#2f7fc8" : k == "road" ? "#e0892f" : k == "park" ? "#2f5fa8" : "#f0644f");
            // Canvas y runs down; textures run up.
            void set(int x, int y, Color32 c) { if (x >= 0 && y >= 0 && x < S && y < S) px[(S - 1 - y) * S + x] = c; }
            void circle(double cx, double cy, double r, Color32 c) { for (int y = 0; y < S; y++) for (int x = 0; x < S; x++) { double d = Math.Sqrt((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy)); if (d <= r) set(x, y, c); else if (d <= r + 1) { var o = px[(S - 1 - y) * S + x]; set(x, y, Color32.Lerp(o, c, (float)(r + 1 - d))); } } }
            void rect(double x0, double y0, double w, double h, Color32 c) { for (int y = (int)y0; y < y0 + h; y++) for (int x = (int)x0; x < x0 + w; x++) set(x, y, c); }
            void poly(double[] p, Color32 c)
            {
                for (int y = 0; y < S; y++) for (int x = 0; x < S; x++)
                {
                    double X = x + 0.5, Y = y + 0.5; bool inside = false;
                    for (int i = 0, j = p.Length / 2 - 1; i < p.Length / 2; j = i++)
                    {
                        double xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
                        if ((yi > Y) != (yj > Y) && X < (xj - xi) * (Y - yi) / (yj - yi) + xi) inside = !inside;
                    }
                    if (inside) set(x, y, c);
                }
            }
            void line(double x0, double y0, double x1, double y1, double wd, Color32 c)
            {
                for (int y = 0; y < S; y++) for (int x = 0; x < S; x++)
                {
                    double X = x + 0.5 - x0, Y = y + 0.5 - y0, dx = x1 - x0, dy = y1 - y0, t = Math.Max(0, Math.Min(1, (X * dx + Y * dy) / (dx * dx + dy * dy)));
                    double ex = X - dx * t, ey = Y - dy * t;
                    if (ex * ex + ey * ey <= wd * wd / 4) set(x, y, c);
                }
            }
            // Soft shadow, ring, disc.
            for (int y = 0; y < S; y++) for (int x = 0; x < S; x++) { double d = Math.Sqrt((x - 64) * (x - 64) + (y - 65) * (y - 65)); if (d < 64) px[(S - 1 - y) * S + x] = new Color32(20, 24, 30, (byte)(Math.Max(0, 1 - Math.Max(0, d - 56) / 8) * 90)); }
            circle(64, 62, 58, paper);
            circle(64, 62, 52, disc);
            var white = paper;
            switch (k)
            {
                case "stall": rect(56, 26, 16, 46, white); circle(64, 90, 9, white); break;
                case "jam":
                    foreach (var (x, y, s2) in new[] { (48.0, 54.0, 0.85), (80.0, 80.0, 1.0) })
                    {
                        poly(new[] { x - 20 * s2, y + 6 * s2, x - 20 * s2, y - 4 * s2, x - 12 * s2, y - 6 * s2, x - 6 * s2, y - 16 * s2, x + 10 * s2, y - 16 * s2, x + 16 * s2, y - 6 * s2, x + 20 * s2, y - 4 * s2, x + 20 * s2, y + 6 * s2 }, white);
                        circle(x - 11 * s2, y + 7 * s2, 5 * s2, disc); circle(x + 11 * s2, y + 7 * s2, 5 * s2, disc);
                    }
                    break;
                case "park":
                    // A bold P.
                    rect(46, 34, 14, 62, white);
                    poly(new[] { 46.0, 34, 70, 34, 80, 38, 86, 46, 86, 58, 80, 66, 70, 70, 46, 70, 46, 58, 66, 58, 72, 54, 72, 50, 66, 46, 46, 46 }, white);
                    break;
                case "power": poly(new[] { 72.0, 24, 42, 68, 62, 68, 54, 100, 86, 52, 66, 52, 74, 24 }, white); break;
                case "water":
                {
                    var drop = new List<double>();
                    for (int i = 0; i <= 20; i++) { double t = i / 20.0; drop.Add(64 + 24 * t); drop.Add(26 + 46 * Math.Sqrt(t)); }
                    for (int i = 0; i <= 20; i++) { double a = Math.PI * i / 20; drop.Add(64 + 24 * Math.Cos(a)); drop.Add(72 + 24 * Math.Sin(a)); }
                    for (int i = 20; i >= 0; i--) { double t = i / 20.0; drop.Add(64 - 24 * t); drop.Add(26 + 46 * Math.Sqrt(t)); }
                    poly(drop.ToArray(), white);
                    line(44, 92, 86, 40, 7, disc);
                    break;
                }
                case "road":
                    poly(new[] { 52.0, 26, 76, 26, 94, 100, 34, 100 }, white);
                    rect(61, 32, 6, 12, disc); rect(60, 52, 8, 12, disc); rect(59, 74, 10, 16, disc);
                    line(30, 60, 98, 60, 8, disc);
                    break;
                default:
                    poly(new[] { 30.0, 60, 64, 30, 98, 60, 90, 60, 90, 96, 38, 96, 38, 60 }, white);
                    line(52, 62, 76, 62, 6, disc); line(76, 62, 76, 84, 6, disc); line(76, 84, 52, 84, 6, disc); line(52, 84, 52, 62, 6, disc);
                    line(52, 62, 76, 84, 6, disc); line(76, 62, 52, 84, 6, disc);
                    break;
            }
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, anisoLevel = 4 };
            tex.SetPixels32(px); tex.Apply(true);
            return tex;
        }

        static Color32 Hex(string h) { ColorUtility.TryParseHtmlString(h, out var c); return c; }
    }
}
