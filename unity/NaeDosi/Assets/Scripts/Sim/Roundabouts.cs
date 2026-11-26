using System;
using System.Collections.Generic;
using static NaeDosi.Defs;
using static NaeDosi.Geom;

namespace NaeDosi
{
    /// <summary>
    /// 회전교차로 and the rule that makes them matter: roads may not meet at a shallow angle, except on a
    /// roundabout, where every road joins the ring instead (port of sim/roundabout.ts).
    /// </summary>
    public static class Roundabouts
    {
        const int NN = N * N;
        public static double RING_R(int t) => t == Road.Avenue ? 17 : 13;
        public static double ROUNDABOUT_COST(int t) => t == Road.Avenue ? 1100 : 500;
        public const double MIN_MEET_DEG = 30;

        public struct Ring { public double x, z, rc, half, kerb, outer, island; }

        public static Ring ringOf(int cell, int t)
        {
            double x = (cell % N) * CELL + CELL / 2.0, z = (cell / N) * CELL + CELL / 2.0;
            double rc = RING_R(t), half = Curves.HALF_WIDTH(t), kerb = Curves.KERB_W(t);
            return new Ring { x = x, z = z, rc = rc, half = half, kerb = kerb, outer = rc + half + kerb, island = rc - half };
        }
        public static Ring ringOf(Roundabout rb) => ringOf(rb.cell, rb.t);

        public static Roundabout roundaboutAt(World w, double x, double z, double pad = 0)
        {
            foreach (var rb in w.roundabouts)
            {
                var g = ringOf(rb);
                if (Hypot(x - g.x, z - g.z) <= g.outer + pad) return rb;
            }
            return null;
        }

        public static List<int> roundaboutCells(int cell, int t)
        {
            var g = ringOf(cell, t); var o = new List<int>();
            int r = (int)Math.Ceiling(g.outer / CELL) + 1, cx = cell % N, cy = cell / N;
            for (int y = cy - r; y <= cy + r; y++) for (int x = cx - r; x <= cx + r; x++)
                {
                    if (x < 0 || y < 0 || x >= N || y >= N) continue;
                    double nx = Math.Max(x * CELL, Math.Min((x + 1) * CELL, g.x)), nz = Math.Max(y * CELL, Math.Min((y + 1) * CELL, g.z));
                    if (Hypot(nx - g.x, nz - g.z) < g.outer) o.Add(y * N + x);
                }
            return o;
        }

        static string maskKey; static byte[] maskCache;
        public static byte[] ringMask(World w)
        {
            var sb = new System.Text.StringBuilder(); sb.Append(w.ver.roads).Append(':');
            foreach (var r in w.roundabouts) sb.Append(r.cell).Append(',');
            string key = sb.ToString();
            if (maskCache != null && maskKey == key) return maskCache;
            var m = new byte[NN];
            foreach (var rb in w.roundabouts) foreach (int i in roundaboutCells(rb.cell, rb.t)) m[i] = 1;
            maskKey = key; maskCache = m;
            return m;
        }

        public static int roundaboutType(World w, int cell)
        {
            int t = w.road[cell] == Road.Avenue ? Road.Avenue : Road.Street;
            Graph.forEachNeighbour(w, cell, (n, _) => { if (n < NN && w.road[n] == Road.Avenue) t = Road.Avenue; });
            return t;
        }

        public static string roundaboutProblem(World w, int cell)
        {
            if (cell < 0 || cell >= NN) return "지도 밖이에요.";
            if (w.road[cell] == Road.Highway) return "고속도로에는 회전교차로를 둘 수 없어요.";
            if (w.road[cell] == 0) return "회전교차로는 도로 위에 놓아 주세요. 교차로 한가운데가 좋아요.";
            if (w.ground[cell] != Ground.Land) return "다리 위에는 놓을 수 없어요.";
            if (w.roundabouts.Exists(r => r.cell == cell)) return "이미 회전교차로가 있어요.";
            int t = roundaboutType(w, cell); var g = ringOf(cell, t);
            foreach (var o in w.roundabouts)
            {
                var h = ringOf(o);
                if (Hypot(g.x - h.x, g.z - h.z) < g.outer + h.outer + 4) return "다른 회전교차로와 너무 가까워요.";
            }
            var stops = new HashSet<int>();
            foreach (var l in w.lines) if (l.kind == "bus") foreach (int s in l.stops) stops.Add(s);
            foreach (int i in roundaboutCells(cell, t))
            {
                if (stops.Contains(i) && w.road[i] != 0) return "버스 정류장이 걸려요. 정류장을 옮긴 뒤 놓아 주세요.";
                if (w.ground[i] == Ground.Water) return "물에 걸려요.";
                if (w.ground[i] == Ground.Mountain) return "산에 걸려요.";
                if (w.roadAlt[i] != 0) return "고가도로나 지하도로와 겹쳐요.";
                int id = w.bld[i];
                if (id >= 0 && KINDS[w.buildings[id].kind].zone == 0) return "시설물과 겹쳐요.";
            }
            double cost = ROUNDABOUT_COST(t);
            if (cost > w.money) return $"예산이 부족해요. ({Won(cost)}만 원 필요)";
            return null;
        }

        public static string placeRoundabout(World w, int cell)
        {
            var why = roundaboutProblem(w, cell);
            if (why != null) return why;
            int t = roundaboutType(w, cell);
            w.money -= ROUNDABOUT_COST(t);
            foreach (int i in roundaboutCells(cell, t))
            {
                if (w.road[i] != 0) continue;
                int id = w.bld[i];
                if (id >= 0 && KINDS[w.buildings[id].kind].zone != 0) Tools.demolish(w, id);
                w.zone[i] = Zone.None;
            }
            w.roundabouts.Add(new Roundabout { cell = cell, t = t });
            w.ver.roads++;
            w.ver.zones++;
            return null;
        }

        public static void pruneRoundabouts(World w)
        {
            var keep = w.roundabouts.FindAll(r => w.road[r.cell] != 0);
            if (keep.Count != w.roundabouts.Count) w.roundabouts = keep;
        }

        // ------------------------------------------------ shallow meetings

        static V centre(int i) => v((i % N) * CELL + CELL / 2.0, (i / N) * CELL + CELL / 2.0);
        static V unit(V a) { double l = Hypot(a.x, a.z); if (l == 0) l = 1; return v(a.x / l, a.z / l); }
        static V neg(V a) => v(-a.x, -a.z);
        static double deg(V a, V b) => (Math.Acos(Math.Max(-1, Math.Min(1, a.x * b.x + a.z * b.z))) * 180) / Math.PI;

        sealed class Meet { public V p; public List<V> fresh, old; }

        static double? narrowest(List<Meet> meets, World w)
        {
            double? worst = null;
            foreach (var m in meets)
            {
                if (m.fresh.Count == 0 || m.old.Count == 0 || roundaboutAt(w, m.p.x, m.p.z, CELL) != null) continue;
                foreach (var a in m.fresh) foreach (var b in m.old)
                    {
                        double d = deg(a, b);
                        if (d < MIN_MEET_DEG && (worst == null || d < worst)) worst = d;
                    }
            }
            return worst;
        }

        static string message(double d) => $"도로가 너무 비스듬히 만나요 ({Math.Round(d)}°). {MIN_MEET_DEG}° 이상으로 만나게 하거나, 회전교차로를 먼저 놓고 그 위로 지나가게 하세요.";

        static List<V> curveArms(List<Seg> p, double t)
        {
            double L = pathLength(p); V d = pathAt(p, t).d;
            if (t < 2) return new List<V> { d };
            if (t > L - 2) return new List<V> { neg(d) };
            return new List<V> { d, neg(d) };
        }

        public static string curveMeetProblem(World w, List<Seg> path, List<int> cells)
        {
            double L = pathLength(path);
            var meets = new List<Meet>();
            var chain = Curves.curveInfo(w).chain;
            foreach (var c in w.curves)
            {
                var q = Curves.curvePath(c).path; double Lq = pathLength(q);
                var seen = new List<double>();
                foreach (var x in pathCrossings(path, q)) { meets.Add(new Meet { p = x.p, fresh = curveArms(path, x.ta), old = curveArms(q, x.tb) }); seen.Add(x.ta); }
                double reach = Curves.HALF_WIDTH(c.t) + 2;
                foreach (double t in new[] { 0, L })
                {
                    if (seen.Exists(s => Math.Abs(s - t) < 6)) continue;
                    V e = pathAt(path, t).p; var n = nearestOnPath(q, e);
                    if (n.d < reach) meets.Add(new Meet { p = n.p, fresh = curveArms(path, t), old = curveArms(q, n.t) });
                }
                foreach (double t in new[] { 0, Lq })
                {
                    V e = pathAt(q, t).p; var n = nearestOnPath(path, e);
                    if (n.d < reach && !seen.Exists(s => Math.Abs(s - n.t) < 6)) meets.Add(new Meet { p = n.p, fresh = curveArms(path, n.t), old = curveArms(q, t) });
                }
            }
            for (int k = 0; k < cells.Count; k++)
            {
                int i = cells[k];
                if (w.road[i] == 0 || chain[i] != 0) continue;
                var old = new List<V>();
                V o = centre(i);
                Graph.forEachNeighbour(w, i, (n, _) => { if (n < NN && w.road[n] != 0) { V p = centre(n); old.Add(unit(v(p.x - o.x, p.z - o.z))); } });
                double t = k == 0 ? 0 : k == cells.Count - 1 ? L : nearestOnPath(path, o).t;
                meets.Add(new Meet { p = o, fresh = curveArms(path, t), old = old });
            }
            var d = narrowest(meets, w);
            return d == null ? null : message(d.Value);
        }

        public static string gridMeetProblem(World w, List<int> cells)
        {
            if (w.curves.Count == 0) return null;
            var chain = Curves.curveInfo(w).chain;
            var meets = new List<Meet>();
            for (int k = 0; k < cells.Count; k++)
            {
                int i = cells[k];
                if (chain[i] == 0) continue;
                V o = centre(i); var fresh = new List<V>();
                foreach (int kk in new[] { k - 1, k + 1 })
                {
                    if (kk < 0 || kk >= cells.Count) continue;
                    V p = centre(cells[kk]); fresh.Add(unit(v(p.x - o.x, p.z - o.z)));
                }
                foreach (var c in w.curves)
                {
                    if (!c.cells.Contains(i)) continue;
                    var q = Curves.curvePath(c).path; var n = nearestOnPath(q, o);
                    meets.Add(new Meet { p = n.p, fresh = fresh, old = curveArms(q, n.t) });
                }
            }
            var d = narrowest(meets, w);
            return d == null ? null : message(d.Value);
        }
    }
}
