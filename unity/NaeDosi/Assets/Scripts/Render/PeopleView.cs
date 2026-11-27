using System;
using System.Collections.Generic;
using UnityEngine;
using static NaeDosi.Defs;
using Rand = UnityEngine.Random;

namespace NaeDosi.Render
{
    /// <summary>
    /// People on the pavements, walking a few blocks near where they live and shop; they wait at the kerb for the
    /// green man and for cars, and tell the traffic which zebras they are on (render/people.ts).
    /// </summary>
    public sealed class PeopleView
    {
        const int MAX = 900;
        const double WALK = 3.2, SW = 0.32, START = 1, HURRY = 2;
        sealed class Walker { public List<int> path; public int i; public double t; public int side; public double speed, look; public bool hurry; }
        readonly List<Walker> walkers = new List<Walker>();
        List<int> starts = new List<int>();
        string startsKey = "";
        readonly Instances mesh;
        static readonly string[] SHIRTS = { "#d9473b", "#2f6db3", "#f2f2f0", "#1b1c1e", "#e2a92b", "#3d9a62", "#8e9599", "#c2457e", "#5b4232", "#7cc6fe" };
        public bool visible;

        public PeopleView(Shader shader)
        {
            // Legs dark, body takes the shirt colour, head skin: colours baked as vertex colours, white body tinted per walker.
            var s = new MeshKit.Shape()
                .Box(new Vector3(0, 0.4f, 0), new Vector3(0.38f, 0.8f, 0.26f), new Color(0.16f, 0.18f, 0.24f))
                .Box(new Vector3(0, 1.15f, 0), new Vector3(0.46f, 0.7f, 0.3f), Color.white)
                .Box(new Vector3(0, 1.64f, 0), new Vector3(0.26f, 0.28f, 0.26f), new Color(0.86f, 0.7f, 0.58f));
            var m = s.ToMesh("walker");
            // Only the body takes the instance colour: the others are pre-divided so the tint leaves them (near enough) as they are.
            var mat = new Material(shader) { enableInstancing = true, name = "people" };
            mat.SetFloat("_Mode", 5); mat.SetFloat("_Smooth", 0.2f);
            mesh = new Instances(m, mat) { shadows = false };
            plain = m; real = RealWalker();
        }

        Mesh plain, real;
        public void SetReal(bool r) { mesh.mesh = r ? real : plain; }

        /// <summary>실사: two legs and shoes, a shirt with arms, hands, a neck, a rounder head with hair.</summary>
        static Mesh RealWalker()
        {
            var pants = new Color(0.14f, 0.16f, 0.22f); var skin = new Color(0.86f, 0.68f, 0.55f); var hair = new Color(0.08f, 0.06f, 0.05f); var shoe = new Color(0.1f, 0.09f, 0.09f);
            var s = new MeshKit.Shape()
                .Box(new Vector3(0.1f, 0.05f, 0), new Vector3(0.26f, 0.1f, 0.14f), shoe).Box(new Vector3(-0.1f, 0.05f, 0), new Vector3(0.26f, 0.1f, 0.14f), shoe)
                .Box(new Vector3(0.1f, 0.48f, 0), new Vector3(0.15f, 0.78f, 0.16f), pants).Box(new Vector3(-0.1f, 0.48f, 0), new Vector3(0.15f, 0.78f, 0.16f), pants)
                .Cylinder(0.19f, 0.16f, 0.86f, 1.46f, 8, Color.white, 1.25f, 1, 0.75f)
                .Box(new Vector3(0.3f, 1.17f, 0), new Vector3(0.12f, 0.56f, 0.13f), Color.white).Box(new Vector3(-0.3f, 1.17f, 0), new Vector3(0.12f, 0.56f, 0.13f), Color.white)
                .Box(new Vector3(0.3f, 0.84f, 0), new Vector3(0.1f, 0.12f, 0.1f), skin).Box(new Vector3(-0.3f, 0.84f, 0), new Vector3(0.1f, 0.12f, 0.1f), skin)
                .Cylinder(0.06f, 0.06f, 1.46f, 1.54f, 6, skin)
                .Blob(0.13f, new Vector3(0, 1.66f, 0), skin, new Vector3(0.9f, 1.1f, 0.95f), 1, 0.05f)
                .Blob(0.135f, new Vector3(0, 1.72f, -0.02f), hair, new Vector3(0.95f, 0.8f, 1f), 2, 0.1f);
            return s.ToMesh("walker-real");
        }

        static Color C(string hex) { ColorUtility.TryParseHtmlString(hex, out var c); return c.linear; }

        void FindStarts(World w)
        {
            string key = $"{w.ver.buildings}:{w.ver.roads}:{w.roundabouts.Count}";
            if (key == startsKey) return;
            startsKey = key;
            var ring = Roundabouts.ringMask(w);
            walkers.RemoveAll(wk => wk.path.Exists(c => c >= Graph.NN || w.road[c] == 0 || ring[c] != 0));
            var st = new List<int>();
            foreach (var b in w.buildings.Values)
            {
                var d = KINDS[b.kind];
                if (b.abandoned) continue;
                int weight = d.zone == Zone.C ? 4 : d.zone == Zone.R ? 2 : b.kind == "metro" || b.kind == "terminal" || b.kind == "ktx" || b.kind == "market" ? 6 : d.zone == Zone.I ? 0 : 1;
                if (weight == 0) continue;
                for (int y = b.y - 1; y <= b.y + WorldOps.bh(b); y++) for (int x = b.x - 1; x <= b.x + WorldOps.bw(b); x++)
                {
                    if (x < 0 || y < 0 || x >= N || y >= N) continue;
                    int i = y * N + x;
                    if (w.road[i] != 0 && w.road[i] != 3 && w.roadAlt[i] == 0 && w.ground[i] == 0 && ring[i] == 0) for (int k = 0; k < weight; k++) st.Add(i);
                }
            }
            starts = st;
        }

        Walker Spawn(World w)
        {
            if (starts.Count == 0) return null;
            int cur = starts[Rand.Range(0, starts.Count)];
            var ring = Roundabouts.ringMask(w);
            var path = new List<int> { cur };
            int len = 4 + Rand.Range(0, 10);
            int side = Rand.value < 0.5f ? 1 : -1;
            int prev = -1;
            for (int k = 0; k < len; k++)
            {
                var next = new List<int>();
                int dx = prev >= 0 ? cur % N - prev % N : 0, dy = prev >= 0 ? cur / N - prev / N : 0;
                int c0 = cur, p0 = prev;
                Graph.forEachNeighbour(w, cur, (n, _) =>
                {
                    if (n >= Graph.NN || n == p0 || w.ground[n] != 0 || w.roadAlt[n] != 0 || w.road[n] == 3 || ring[n] != 0) return;
                    if (p0 >= 0)
                    {
                        int ex = n % N - c0 % N, ez = n / N - c0 / N;
                        int turn = dx * ez - dy * ex;
                        if (turn != 0 && Math.Sign(turn) != side) return;
                    }
                    next.Add(n);
                });
                if (next.Count == 0) break;
                int ahead = next.Find(n => n % N - cur % N == dx && n / N - cur / N == dy && next.Contains(n));
                bool hasAhead = next.Exists(n => n % N - cur % N == dx && n / N - cur / N == dy);
                int nn = hasAhead && Rand.value < 0.75f ? ahead : next[Rand.Range(0, next.Count)];
                prev = cur; cur = nn; path.Add(nn);
            }
            var nd = Junctions.nodes(w);
            bool slant(int a, int b) => a % N != b % N && a / N != b / N;
            for (int j = 1; j < path.Count - 1; j++)
                if (Junctions.isJunction(nd, path[j]) && (slant(path[j - 1], path[j]) || slant(path[j], path[j + 1]))) { path.RemoveRange(j, path.Count - j); break; }
            while (path.Count > 0 && Junctions.isJunction(nd, path[path.Count - 1])) path.RemoveAt(path.Count - 1);
            while (path.Count > 0 && Junctions.isJunction(nd, path[0])) path.RemoveAt(0);
            if (path.Count < 2) return null;
            return new Walker { path = path, i = 0, t = Rand.value, side = side, speed = WALK * (0.8 + Rand.value * 0.4), look = Rand.value };
        }

        bool MustWait(World w, Walker wk, double clock, double L, List<V> cars)
        {
            int j = wk.i + 1;
            if (j >= wk.path.Count - 1 || wk.t > 0.9) return false;
            int pa = wk.path[j - 1], pc = wk.path[j], pb = wk.path[j + 1];
            if (pc >= Graph.NN || pc - pa != pb - pc) return false;
            int dx = Math.Sign(pb % N - pa % N), dy = Math.Sign(pb / N - pa / N);
            if ((dx == 0) == (dy == 0)) return false;
            int sx = pc % N - dy * wk.side, sy = pc / N + dx * wk.side;
            if (sx < 0 || sy < 0 || sx >= N || sy >= N || w.road[sy * N + sx] == 0) return false;
            int st = w.road[sy * N + sx] != 0 ? w.road[sy * N + sx] : 1;
            double left = (1 - wk.t) * L, kerb = Curves.HALF_WIDTH(st) + 2.9;
            if (left > kerb + 1.2 || left < kerb - 0.3) return false;
            if (Signals.signalCells(w)[pc] != 0)
            {
                int ax = Signals.axisOf(pa, pc);
                if (Signals.lightFor(ax, clock) != Signals.Green || Signals.greenAge(ax, clock) > START) return true;
            }
            if (cars == null) return false;
            int t = w.road[pc] != 0 ? w.road[pc] : 1;
            double cx = pc % N * CELL + CELL / 2.0 - dy * wk.side * (Curves.HALF_WIDTH(t) + 1.6), cz = pc / N * CELL + CELL / 2.0 + dx * wk.side * (Curves.HALF_WIDTH(t) + 1.6);
            double r2 = Math.Pow(Curves.HALF_WIDTH(st) + 2.5, 2);
            foreach (var s in cars) { double ex = s.x - cx, ez = s.z - cz; if (ex * ex + ez * ez < r2) return true; }
            return false;
        }

        public void Update(World w, TrafficState tr, double dt, double pace, float night, double camDist, List<V> cars)
        {
            tr.crossings.Clear();
            visible = camDist < 450;
            if (!visible) return;
            FindStarts(w);
            int want = (int)Math.Min(MAX, Math.Floor((w.stats.pop / 6 + starts.Count * 0.08) * (1 - night * 0.75) + 0.5));
            while (walkers.Count < want) { var p = Spawn(w); if (p == null) break; walkers.Add(p); }
            if (walkers.Count > want) walkers.RemoveRange(want, walkers.Count - want);
            var mats = new List<Matrix4x4>(); var cols = new List<Color>();
            var pt = new LanePath.P3(); var pv = new LanePath.P3();
            for (int k = 0; k < walkers.Count; k++)
            {
                var wk = walkers[k];
                V a = CityRoads.nodeCentre(wk.path[wk.i], w), b = CityRoads.nodeCentre(wk.path[wk.i + 1], w);
                double L = Math.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)); if (L == 0) L = 1;
                bool hold = MustWait(w, wk, tr.clock, L, cars);
                if (!hold) wk.t += dt * pace * wk.speed * (wk.hurry ? HURRY : 1) / L;
                if (wk.t >= 1)
                {
                    wk.t -= 1; wk.i++;
                    if (wk.i >= wk.path.Count - 1) { var fresh = Spawn(w); if (fresh != null) walkers[k] = fresh; else wk.i = 0; continue; }
                }
                double ddx = (b.x - a.x) / L, ddz = (b.z - a.z) / L;
                int cell = wk.path[wk.i];
                int t = Math.Max(w.road[cell] != 0 ? w.road[cell] : 1, w.road[wk.path[wk.i + 1]] != 0 ? w.road[wk.path[wk.i + 1]] : 1);
                double off = wk.side * (Curves.HALF_WIDTH(t) + Curves.KERB_W(t) * 0.5) + (wk.look - 0.5) * 0.5;
                wk.hurry = false;
                int jj = (int)Math.Floor(wk.i + wk.t + 0.5);
                if (jj > 0 && jj < wk.path.Count - 1)
                {
                    int pa = wk.path[jj - 1], pc = wk.path[jj], pb = wk.path[jj + 1];
                    int dx = Math.Sign(pb % N - pa % N), dy = Math.Sign(pb / N - pa / N);
                    if ((dx == 0) != (dy == 0) && pc - pa == pb - pc)
                    {
                        int sx = pc % N - dy * wk.side, sy = pc / N + dx * wk.side;
                        int sc = sy * N + sx;
                        if (sx >= 0 && sy >= 0 && sx < N && sy < N && w.road[sc] != 0)
                        {
                            int st = w.road[sc];
                            double zebra = Curves.HALF_WIDTH(t) + Curves.KERB_W(t) + 1.6;
                            double dist = Math.Abs(wk.i + wk.t - jj) * CELL;
                            double kk = Math.Max(0, Math.Min(1, (Curves.HALF_WIDTH(st) + 2.5 - dist) / 2));
                            off += Math.Sign(off) * (zebra - Math.Abs(off)) * kk;
                            wk.hurry = kk > 0 && !hold;
                            if (kk > 0 && !hold) tr.crossings[sc] = pc;
                        }
                    }
                }
                var path = wk.path;
                LanePath.laneAt(q => CityRoads.nodeCentre(path[q], w), path.Count - 1, wk.i + wk.t, off, Math.Abs(off) + 1.5, true, ref pt);
                double y = SW;
                if (!hold) y += Math.Abs(Math.Sin(wk.t * L / 0.7)) * 0.05;
                LanePath.laneAt(q => CityRoads.nodeCentre(path[q], w), path.Count - 1, Math.Max(0, wk.i + wk.t - 0.05), off, Math.Abs(off) + 1.5, true, ref pv);
                double hx = pt.x - pv.x, hz = pt.z - pv.z;
                if (hx * hx + hz * hz <= 1e-6) { hx = ddx; hz = ddz; }
                var fwd = new Vector3((float)hx, 0, (float)-hz);
                mats.Add(Matrix4x4.TRS(MeshKit.P(pt.x, y, pt.z), Quaternion.LookRotation(fwd, Vector3.up), Vector3.one * 1.4f));
                cols.Add(C(SHIRTS[(int)Math.Floor(wk.look * 997) % SHIRTS.Length]));
            }
            mesh.Set(mats, cols);
        }

        public void Draw() { if (visible) mesh.Draw(); }
    }
}
