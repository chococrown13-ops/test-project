using System;
using System.Collections.Generic;

namespace NaeDosi
{
    /// <summary>A point or direction on the ground plane, metres: x east, z south.</summary>
    public struct V
    {
        public double x, z;
        public V(double x, double z) { this.x = x; this.z = z; }
    }

    /// <summary>
    /// Road centrelines made only of straight lines and circular arcs (port of games/shared/roads/geom.ts).
    /// An arc offset by any distance is another arc with the same centre, so kerbs stay parallel.
    /// </summary>
    public sealed class Seg
    {
        public bool IsLine;
        public V a, b;            // line
        public V c; public double r, a0, sweep; // arc
        public static Seg Line(V a, V b) => new Seg { IsLine = true, a = a, b = b };
        public static Seg Arc(V c, double r, double a0, double sweep) => new Seg { IsLine = false, c = c, r = r, a0 = a0, sweep = sweep };
    }

    public static class Geom
    {
        public static V v(double x, double z) => new V(x, z);
        public static V add(V a, V b) => new V(a.x + b.x, a.z + b.z);
        public static V sub(V a, V b) => new V(a.x - b.x, a.z - b.z);
        public static V mul(V a, double k) => new V(a.x * k, a.z * k);
        public static double len(V a) => Hypot(a.x, a.z);
        public static double dist(V a, V b) => Hypot(a.x - b.x, a.z - b.z);
        public static V norm(V a) { double l = len(a); if (l == 0) l = 1; return new V(a.x / l, a.z / l); }
        public static double dot(V a, V b) => a.x * b.x + a.z * b.z;
        public static double cross(V a, V b) => a.x * b.z - a.z * b.x;
        public static V left(V d) => new V(d.z, -d.x);
        public static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);

        public static double segLength(Seg s) => s.IsLine ? dist(s.a, s.b) : Math.Abs(s.sweep) * s.r;

        public struct PD { public V p, d; public double t; }

        public static PD segAt(Seg s, double t)
        {
            if (s.IsLine)
            {
                double L = dist(s.a, s.b); if (L == 0) L = 1;
                V d = norm(sub(s.b, s.a));
                return new PD { p = add(s.a, mul(d, Math.Max(0, Math.Min(L, t)))), d = d };
            }
            double ang = s.a0 + Math.Sign(s.sweep) * (t / s.r);
            V p = v(s.c.x + Math.Cos(ang) * s.r, s.c.z + Math.Sin(ang) * s.r);
            double sg = Math.Sign(s.sweep); if (sg == 0) sg = 1;
            return new PD { p = p, d = v(-Math.Sin(ang) * sg, Math.Cos(ang) * sg) };
        }

        public static double pathLength(List<Seg> p) { double a = 0; foreach (var s in p) a += segLength(s); return a; }

        public static PD pathAt(List<Seg> p, double t)
        {
            double rest = Math.Max(0, t);
            for (int i = 0; i < p.Count; i++)
            {
                double L = segLength(p[i]);
                if (rest <= L || i == p.Count - 1) return segAt(p[i], Math.Min(rest, L));
                rest -= L;
            }
            return new PD { p = v(0, 0), d = v(1, 0) };
        }

        public static List<PD> samplePath(List<Seg> p, double t0, double t1, double step = 2, bool lines = false)
        {
            var o = new List<PD>();
            double b0 = 0;
            foreach (var s in p)
            {
                double L = segLength(s);
                double a = Math.Max(t0, b0), b = Math.Min(t1, b0 + L);
                if (b > a || (b == a && o.Count == 0 && a == t0))
                {
                    int n = s.IsLine ? (lines ? Math.Max(1, (int)Math.Ceiling((b - a) / step)) : 1)
                        : Math.Max(1, (int)Math.Ceiling(Math.Max((b - a) / step, Math.Abs(s.sweep) * ((b - a) / L) / (Math.PI / 30))));
                    for (int k = (o.Count > 0 && o[o.Count - 1].t >= a - 1e-6) ? 1 : 0; k <= n; k++)
                    {
                        double t = a + ((b - a) * k) / n;
                        var q = segAt(s, t - b0);
                        o.Add(new PD { t = t, p = q.p, d = q.d });
                    }
                }
                b0 += L;
            }
            return o;
        }
        public static List<PD> samplePath(List<Seg> p) => samplePath(p, 0, pathLength(p));

        public static V offsetPoint(PD q, double o) => add(q.p, mul(left(q.d), o));

        public static List<Seg> fillet(V A, V C, V B)
        {
            V d1 = norm(sub(C, A)), d2 = norm(sub(B, C));
            double turn = Math.Atan2(cross(d1, d2), dot(d1, d2));
            double l1 = dist(A, C), l2 = dist(C, B);
            if (Math.Abs(turn) < 1e-3 || l1 < 1e-3 || l2 < 1e-3) return new List<Seg> { Seg.Line(A, B) };
            double L = Math.Min(l1, l2);
            double r = L / Math.Tan(Math.Abs(turn) / 2);
            V T1 = sub(C, mul(d1, L)), T2 = add(C, mul(d2, L));
            V ins = turn > 0 ? mul(left(d1), -1) : left(d1);
            V c = add(T1, mul(ins, r));
            double a0 = Math.Atan2(T1.z - c.z, T1.x - c.x);
            double a1 = Math.Atan2(T2.z - c.z, T2.x - c.x);
            double sweep = a1 - a0;
            while (sweep > Math.PI) sweep -= Math.PI * 2;
            while (sweep < -Math.PI) sweep += Math.PI * 2;
            var o = new List<Seg>();
            if (dist(A, T1) > 1e-3) o.Add(Seg.Line(A, T1));
            o.Add(Seg.Arc(c, r, a0, sweep));
            if (dist(T2, B) > 1e-3) o.Add(Seg.Line(T2, B));
            return o;
        }

        public static double minRadius(List<Seg> p) { double m = double.PositiveInfinity; foreach (var s in p) if (!s.IsLine) m = Math.Min(m, s.r); return m; }

        public static (List<Seg>, List<Seg>) splitPath(List<Seg> p, double t)
        {
            var a = new List<Seg>(); var b = new List<Seg>();
            double b0 = 0;
            foreach (var s in p)
            {
                double L = segLength(s);
                if (b0 + L <= t + 1e-9) a.Add(s);
                else if (b0 >= t - 1e-9) b.Add(s);
                else
                {
                    double k = t - b0;
                    if (s.IsLine) { var m = segAt(s, k).p; a.Add(Seg.Line(s.a, m)); b.Add(Seg.Line(m, s.b)); }
                    else
                    {
                        double sg = Math.Sign(s.sweep), da = (k / s.r) * sg;
                        a.Add(Seg.Arc(s.c, s.r, s.a0, da));
                        b.Add(Seg.Arc(s.c, s.r, s.a0 + da, s.sweep - da));
                    }
                }
                b0 += L;
            }
            return (a, b);
        }

        public static List<Seg> reversePath(List<Seg> p)
        {
            var o = new List<Seg>();
            for (int i = p.Count - 1; i >= 0; i--)
            {
                var s = p[i];
                o.Add(s.IsLine ? Seg.Line(s.b, s.a) : Seg.Arc(s.c, s.r, s.a0 + s.sweep, -s.sweep));
            }
            return o;
        }

        public static bool segCross(V p1, V p2, V q1, V q2, out double s, out double u, out V p)
        {
            V r = sub(p2, p1), q = sub(q2, q1);
            double den = cross(r, q);
            s = u = 0; p = default;
            if (Math.Abs(den) < 1e-12) return false;
            V w = sub(q1, p1);
            s = cross(w, q) / den; u = cross(w, r) / den;
            if (s < 0 || s > 1 || u < 0 || u > 1) return false;
            p = add(p1, mul(r, s));
            return true;
        }

        public struct Crossing { public double ta, tb; public V p; }

        public static List<Crossing> pathCrossings(List<Seg> a, List<Seg> b)
        {
            var sa = samplePath(a, 0, pathLength(a), 1); var sb = samplePath(b, 0, pathLength(b), 1);
            var o = new List<Crossing>();
            for (int i = 1; i < sa.Count; i++) for (int j = 1; j < sb.Count; j++)
                {
                    if (!segCross(sa[i - 1].p, sa[i].p, sb[j - 1].p, sb[j].p, out var cs, out var cu, out var cp)) continue;
                    double ta = sa[i - 1].t + (sa[i].t - sa[i - 1].t) * cs, tb = sb[j - 1].t + (sb[j].t - sb[j - 1].t) * cu;
                    bool dup = false; foreach (var x in o) if (Math.Abs(x.ta - ta) < 0.5) { dup = true; break; }
                    if (!dup) o.Add(new Crossing { ta = ta, tb = tb, p = cp });
                }
            return o;
        }

        public struct Near { public double t, d; public V p; }

        public static Near nearestOnPath(List<Seg> p, V q)
        {
            var s = samplePath(p, 0, pathLength(p), 1);
            var best = new Near { t = 0, d = double.PositiveInfinity, p = s[0].p };
            for (int i = 1; i < s.Count; i++)
            {
                V a = s[i - 1].p, b = s[i].p, ab = sub(b, a);
                double dd = dot(ab, ab); if (dd == 0) dd = 1;
                double k = Math.Max(0, Math.Min(1, dot(sub(q, a), ab) / dd));
                V m = add(a, mul(ab, k)); double d = dist(m, q);
                if (d < best.d) best = new Near { t = s[i - 1].t + (s[i].t - s[i - 1].t) * k, d = d, p = m };
            }
            return best;
        }
    }
}
