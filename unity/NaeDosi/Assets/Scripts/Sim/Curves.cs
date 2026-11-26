using System;
using System.Collections.Generic;
using static NaeDosi.Defs;
using static NaeDosi.Geom;

namespace NaeDosi
{
    /// <summary>
    /// Curved roads (port of sim/curves.ts): a curve runs from the centre of cell A toward a bend
    /// point C, then on to B, the corner rounded by the largest arc that fits. It is rasterised into a
    /// chain of road cells so the simulation runs on the grid unchanged.
    /// </summary>
    public static class Curves
    {
        const int NN = N * N;

        public static double HALF_WIDTH(int t) => t == Road.Street ? 3.5 : t == Road.Avenue ? 5 : 6.2;
        public static double KERB_W(int t) => t == Road.Highway ? 0.8 : 1.5;
        public static readonly double AVENUE_SPILL = HALF_WIDTH(Road.Avenue) + KERB_W(Road.Avenue) - 5;
        public static double MIN_RADIUS(int t) => t == Road.Avenue ? 18 : t == Road.Highway ? 30 : 12;

        static readonly Dictionary<string, (List<Seg> path, double len)> pathCache = new Dictionary<string, (List<Seg>, double)>();

        static string Key(double ax, double az, double cx, double cz, double bx, double bz) => $"{ax},{az},{cx},{cz},{bx},{bz}";

        public static (List<Seg> path, double len) curvePath(double ax, double az, double cx, double cz, double bx, double bz)
        {
            string key = Key(ax, az, cx, cz, bx, bz);
            if (!pathCache.TryGetValue(key, out var hit))
            {
                var path = fillet(v(ax, az), v(cx, cz), v(bx, bz));
                hit = (path, pathLength(path));
                if (pathCache.Count > 512) pathCache.Clear();
                pathCache[key] = hit;
            }
            return hit;
        }
        public static (List<Seg> path, double len) curvePath(Curve c) => curvePath(c.ax, c.az, c.cx, c.cz, c.bx, c.bz);

        public static V bez(Curve c, double u) { var (p, L) = curvePath(c); return pathAt(p, Math.Max(0, Math.Min(1, u)) * L).p; }
        public static V bezTan(Curve c, double u) { var (p, L) = curvePath(c); return pathAt(p, Math.Max(0, Math.Min(1, u)) * L).d; }
        public static double bezLength(Curve c) => curvePath(c).len;

        static int cellAt(double x, double z)
        {
            int cx = (int)Math.Floor(x / CELL), cz = (int)Math.Floor(z / CELL);
            return cx < 0 || cz < 0 || cx >= N || cz >= N ? -1 : cz * N + cx;
        }

        public static List<int> curveCells(Curve c)
        {
            double L = bezLength(c);
            int steps = Math.Max(2, (int)Math.Ceiling(L / 0.5));
            var o = new List<int>();
            for (int k = 0; k <= steps; k++)
            {
                var p = bez(c, k / (double)steps);
                int i = cellAt(p.x, p.z);
                if (i < 0) continue;
                if (o.Count == 0 || o[o.Count - 1] != i) o.Add(i);
            }
            for (int k = 1; k < o.Count - 1; k++)
            {
                int a = o[k - 1], m = o[k], b = o[k + 1];
                int dx = (b % N) - (a % N), dy = (b / N) - (a / N);
                if (Math.Abs(dx) != 1 || Math.Abs(dy) != 1) continue;
                double mx = (m % N) * CELL + CELL / 2.0, mz = (m / N) * CELL + CELL / 2.0;
                if (distTo(c, mx, mz).d < CELL * 0.3) continue;
                o.RemoveAt(k);
            }
            return o;
        }

        public struct Dist { public double d, u, x, z; public V tan; }

        public static Dist distTo(Curve c, double x, double z)
        {
            double best = double.PositiveInfinity, bu = 0;
            for (int k = 0; k <= 24; k++)
            {
                var p = bez(c, k / 24.0);
                double d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
                if (d < best) { best = d; bu = k / 24.0; }
            }
            double lo = Math.Max(0, bu - 1 / 24.0), hi = Math.Min(1, bu + 1 / 24.0);
            for (int it = 0; it < 12; it++)
            {
                double u1 = lo + (hi - lo) / 3, u2 = hi - (hi - lo) / 3;
                V p1 = bez(c, u1), p2 = bez(c, u2);
                if ((p1.x - x) * (p1.x - x) + (p1.z - z) * (p1.z - z) < (p2.x - x) * (p2.x - x) + (p2.z - z) * (p2.z - z)) hi = u2; else lo = u1;
            }
            double u = (lo + hi) / 2; V q = bez(c, u);
            return new Dist { d = Hypot(q.x - x, q.z - z), u = u, x = q.x, z = q.z, tan = bezTan(c, u) };
        }

        public sealed class CurveInfo
        {
            public byte[] owned, cover, chain;
            public float[] px, pz;
            public HashSet<long> links;
        }

        static long lk(int a, int b) => a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;

        public static bool curveLinkOk(World w, int a, int b)
        {
            if (w.curves.Count == 0) return true;
            var ci = curveInfo(w);
            if (ci.owned[a] == 0 && ci.owned[b] == 0) return true;
            return ci.links.Contains(lk(a, b));
        }

        static World cacheW; static int cacheVer = -1, cacheN = -1; static CurveInfo cache;

        public static CurveInfo curveInfo(World w)
        {
            if (cache != null && cacheW == w && cacheVer == w.ver.roads && cacheN == w.curves.Count + w.roundabouts.Count * 1000) return cache;
            var owned = new byte[NN]; var cover = new byte[NN];
            var px = new float[NN]; var pz = new float[NN];
            var links = new HashSet<long>();
            var chainAll = new byte[NN];
            foreach (var c in w.curves)
            {
                foreach (int i in c.cells) chainAll[i] = 1;
                foreach (int i in c.own)
                {
                    owned[i] = 1;
                    var p = distTo(c, (i % N) * CELL + CELL / 2.0, (i / N) * CELL + CELL / 2.0);
                    px[i] = (float)p.x; pz[i] = (float)p.z;
                }
                foreach (int i in coverCells(c)) if (w.road[i] == 0) cover[i] = 1;
                for (int k = 1; k < c.cells.Count; k++) links.Add(lk(c.cells[k - 1], c.cells[k]));
            }
            foreach (var rb in w.roundabouts) foreach (int i in Roundabouts.roundaboutCells(rb.cell, rb.t)) if (w.road[i] == 0) cover[i] = 1;
            double cosMeet = Math.Cos((Roundabouts.MIN_MEET_DEG * Math.PI) / 180);
            bool parallel(int j, V d)
            {
                int x = j % N, y = j / N, n = 0, along = 0;
                foreach (var (dx, dy) in Orth)
                {
                    int nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
                    int k = ny * N + nx;
                    if (w.road[k] == 0 || owned[k] != 0) continue;
                    n++;
                    if (Math.Abs(dx * d.x + dy * d.z) > cosMeet) along++;
                }
                return n > 1 || (n > 0 && along == n);
            }
            foreach (var c in w.curves)
            {
                var chain = new HashSet<int>(c.cells);
                var path = curvePath(c).path;
                var best = new Dictionary<int, (int i, double d)>();
                var order = new List<int>();
                foreach (int i in c.own)
                {
                    int x = i % N, y = i / N;
                    foreach (var (dx, dy) in Orth)
                    {
                        int nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
                        int j = ny * N + nx;
                        if (w.road[j] == 0 || chain.Contains(j) || owned[j] != 0) continue;
                        double d = Hypot(nx * CELL + CELL / 2.0 - px[i], ny * CELL + CELL / 2.0 - pz[i]);
                        if (!best.TryGetValue(j, out var b)) { best[j] = (i, d); order.Add(j); }
                        else if (d < b.d) best[j] = (i, d);
                    }
                }
                foreach (int j in order)
                {
                    int i = best[j].i;
                    var q = nearestOnPath(path, v(px[i], pz[i]));
                    if (!parallel(j, pathAt(path, q.t).d)) links.Add(lk(i, j));
                }
            }
            cacheW = w; cacheVer = w.ver.roads; cacheN = w.curves.Count + w.roundabouts.Count * 1000;
            cache = new CurveInfo { owned = owned, cover = cover, px = px, pz = pz, links = links, chain = chainAll };
            return cache;
        }

        public static readonly (int dx, int dy)[] Orth = { (1, 0), (-1, 0), (0, 1), (0, -1) };

        public static List<int> coverCells(Curve c)
        {
            double reach = HALF_WIDTH(c.t) + KERB_W(c.t) + 1.2;
            int x0 = Math.Max(0, (int)Math.Floor((Math.Min(c.ax, Math.Min(c.bx, c.cx)) - reach) / CELL)), x1 = Math.Min(N - 1, (int)Math.Floor((Math.Max(c.ax, Math.Max(c.bx, c.cx)) + reach) / CELL));
            int z0 = Math.Max(0, (int)Math.Floor((Math.Min(c.az, Math.Min(c.bz, c.cz)) - reach) / CELL)), z1 = Math.Min(N - 1, (int)Math.Floor((Math.Max(c.az, Math.Max(c.bz, c.cz)) + reach) / CELL));
            var o = new List<int>();
            for (int y = z0; y <= z1; y++) for (int x = x0; x <= x1; x++)
                    if (distTo(c, x * CELL + CELL / 2.0, y * CELL + CELL / 2.0).d < reach) o.Add(y * N + x);
            return o;
        }

        public sealed class NearCurve { public Curve c; public double d, x, z; public V tan; }

        public static NearCurve nearestCurve(World w, double x, double z, double max)
        {
            NearCurve best = null;
            foreach (var c in w.curves)
            {
                if (x < Math.Min(c.ax, Math.Min(c.bx, c.cx)) - max || x > Math.Max(c.ax, Math.Max(c.bx, c.cx)) + max) continue;
                if (z < Math.Min(c.az, Math.Min(c.bz, c.cz)) - max || z > Math.Max(c.az, Math.Max(c.bz, c.cz)) + max) continue;
                var p = distTo(c, x, z);
                if (p.d < max && (best == null || p.d < best.d)) best = new NearCurve { c = c, d = p.d, x = p.x, z = p.z, tan = p.tan };
            }
            return best;
        }

        public static string curveProblem(World w, Curve c, List<int> cells)
        {
            if (cells.Count < 3) return "세 칸 이상 떨어진 두 점을 이어 주세요.";
            double L = bezLength(c), chord = Hypot(c.bx - c.ax, c.bz - c.az);
            if (L > chord * 1.9) return "너무 심하게 휘었어요. 굽힘을 줄여 주세요.";
            V d1 = v(c.cx - c.ax, c.cz - c.az), d2 = v(c.bx - c.cx, c.bz - c.cz);
            double turn = Math.Abs(Math.Atan2(d1.x * d2.z - d1.z * d2.x, d1.x * d2.x + d1.z * d2.z));
            if (turn > (150 * Math.PI) / 180) return "한 번에 너무 많이 돌아요. 곡선 두 개로 나눠 주세요.";
            double r = minRadius(curvePath(c).path), need = MIN_RADIUS(c.t);
            if (r < need) return $"커브가 너무 급해요 (반지름 {Math.Round(r)}m, {need}m 이상 필요). 꺾는 점을 더 멀리 두세요.";
            foreach (int i in coverCells(c))
            {
                if (cells.Contains(i)) continue;
                int id = w.bld[i];
                if (id >= 0 && KINDS[w.buildings[id].kind].zone == 0) return "곡선 도로가 시설물과 겹쳐요.";
                if (w.ground[i] == Ground.Mountain && w.road[i] == 0) return "곡선 도로가 산에 걸려요.";
            }
            return Roundabouts.curveMeetProblem(w, curvePath(c).path, cells);
        }

        public static void pruneCurves(World w)
        {
            var keep = w.curves.FindAll(c => c.cells.TrueForAll(i => w.road[i] != 0));
            if (keep.Count != w.curves.Count) w.curves = keep;
        }

        public static V? endDirection(World w, int cell)
        {
            foreach (var c in w.curves)
            {
                if (c.cells[c.cells.Count - 1] == cell) return bezTan(c, 1);
                if (c.cells[0] == cell) { var t = bezTan(c, 0); return v(-t.x, -t.z); }
            }
            if (w.road[cell] == 0) return null;
            int x = cell % N, y = cell / N;
            var nb = new List<(int, int)>();
            foreach (var (dx, dy) in Orth)
            {
                int nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[ny * N + nx] != 0) nb.Add((dx, dy));
            }
            foreach (var (dx, dy, bit) in Graph.DIAG) if ((w.diag[cell] & bit) != 0) nb.Add((dx, dy));
            if (nb.Count != 1) return null;
            double l = Hypot(nb[0].Item1, nb[0].Item2);
            return v(-nb[0].Item1 / l, -nb[0].Item2 / l);
        }

        /// <summary>Where the bend handle lands: on the line straight ahead of a road end, where two such lines meet, or the middle for a straight road.</summary>
        public static (double x, double z, string snap) snapControl(World w, int a, int b, double x, double z)
        {
            V P(int i) => v((i % N) * CELL + CELL / 2.0, (i / N) * CELL + CELL / 2.0);
            V A = P(a), B = P(b);
            V? da = endDirection(w, a), db = endDirection(w, b);
            (double x, double z, double off)? ray(V o, V? d)
            {
                if (d == null) return null;
                double t = (x - o.x) * d.Value.x + (z - o.z) * d.Value.z;
                if (t <= 0) return null;
                double ppx = o.x + d.Value.x * t, ppz = o.z + d.Value.z * t;
                return (ppx, ppz, Hypot(x - ppx, z - ppz));
            }
            if (da != null && db != null)
            {
                V A2 = da.Value, B2 = db.Value;
                double den = A2.x * B2.z - A2.z * B2.x;
                if (Math.Abs(den) > 0.05)
                {
                    double t = ((B.x - A.x) * B2.z - (B.z - A.z) * B2.x) / den;
                    double s = ((B.x - A.x) * A2.z - (B.z - A.z) * A2.x) / den;
                    double ix = A.x + A2.x * t, iz = A.z + A2.z * t;
                    if (t > 0 && s > 0 && Hypot(ix - x, iz - z) < 14) return (ix, iz, "tangent");
                }
            }
            var ra = ray(A, da); var rb = ray(B, db);
            (double x, double z, double off)? bst = null;
            foreach (var r in new[] { ra, rb }) if (r != null && r.Value.off < 6 && (bst == null || r.Value.off < bst.Value.off)) bst = r;
            if (bst != null) return (bst.Value.x, bst.Value.z, "tangent");
            double mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
            double Lc = Hypot(B.x - A.x, B.z - A.z); if (Lc == 0) Lc = 1;
            double off = Math.Abs(((x - A.x) * (B.z - A.z) - (z - A.z) * (B.x - A.x)) / Lc);
            if (off < 4) return (mx, mz, "straight");
            return (x, z, "");
        }
    }
}
