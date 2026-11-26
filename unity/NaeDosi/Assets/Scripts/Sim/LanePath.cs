using System;
using System.Collections.Generic;

namespace NaeDosi
{
    /// <summary>
    /// Lanes and pavements along a path of node centres, turning corners the way people and cars do
    /// (render/lanepath.ts), and the way round a 회전교차로 (render/ringpath.ts).
    /// </summary>
    public static class LanePath
    {
        public struct P3 { public double x, z, y; }
        static double len(V a, V b) { double d = Math.Sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)); return d == 0 ? 1e-6 : d; }

        public static void laneAt(Func<int, V> pts, int last, double s, double off, double rMax, bool sharp, ref P3 o)
        {
            s = Math.Max(0, Math.Min(last, s));
            int i = Math.Min(last - 1, (int)Math.Floor(s)); double f = s - i;
            V p0 = pts(i), p1 = pts(i + 1);
            double L = len(p0, p1), dx = (p1.x - p0.x) / L, dz = (p1.z - p0.z) / L;
            double R(int k) { V a = pts(k - 1), b = pts(k), c = pts(k + 1); return Math.Min(rMax, Math.Min(0.45 * len(a, b), 0.45 * len(b, c))); }
            double fL = f * L;
            if (i + 1 < last) { double r = R(i + 1); if (L - fL < r) { corner(pts, i + 1, r, off, 0.5 * (1 - (L - fL) / r), sharp, ref o); return; } }
            if (i > 0) { double r = R(i); if (fL < r) { corner(pts, i, r, off, 0.5 + 0.5 * fL / r, sharp, ref o); return; } }
            o.x = p0.x + dx * fL - dz * off;
            o.z = p0.z + dz * fL + dx * off;
        }

        static void corner(Func<int, V> pts, int k, double R, double off, double u, bool sharp, ref P3 o)
        {
            V a = pts(k - 1), c = pts(k), b = pts(k + 1);
            double l1 = len(a, c), l2 = len(c, b);
            double d1x = (c.x - a.x) / l1, d1z = (c.z - a.z) / l1, d2x = (b.x - c.x) / l2, d2z = (b.z - c.z) / l2;
            double Ax = c.x - d1x * R - d1z * off, Az = c.z - d1z * R + d1x * off;
            double Bx = c.x + d2x * R - d2z * off, Bz = c.z + d2z * R + d2x * off;
            double cross = d1x * d2z - d1z * d2x;
            double Kx = (Ax + Bx) / 2, Kz = (Az + Bz) / 2;
            if (Math.Abs(cross) > 1e-3)
            {
                double t = ((Bx - Ax) * d2z - (Bz - Az) * d2x) / cross;
                if (t > 0 && t < 3 * R) { Kx = Ax + d1x * t; Kz = Az + d1z * t; }
            }
            if (sharp)
            {
                double la = Math.Sqrt((Kx - Ax) * (Kx - Ax) + (Kz - Az) * (Kz - Az)), lb = Math.Sqrt((Bx - Kx) * (Bx - Kx) + (Bz - Kz) * (Bz - Kz)), tot = la + lb;
                if (tot == 0) tot = 1;
                double d = u * tot;
                if (d < la) { double q = d / (la == 0 ? 1 : la); o.x = Ax + (Kx - Ax) * q; o.z = Az + (Kz - Az) * q; }
                else { double q = (d - la) / (lb == 0 ? 1 : lb); o.x = Kx + (Bx - Kx) * q; o.z = Kz + (Bz - Kz) * q; }
                return;
            }
            double v = 1 - u;
            o.x = v * v * Ax + 2 * v * u * Kx + u * u * Bx;
            o.z = v * v * Az + 2 * v * u * Kz + u * u * Bz;
        }

        /// <summary>Where a vehicle is while its path runs through a roundabout, or false when not on one.</summary>
        public static bool onRing(World w, IList<int> path, double s, double lane, out double rx, out double rz)
        {
            rx = rz = 0;
            if (w.roundabouts.Count == 0 || path.Count < 2) return false;
            int last = path.Count - 1;
            V raw(double u)
            {
                u = Math.Max(0, Math.Min(last, u));
                int i = Math.Min(last - 1, (int)Math.Floor(u)); double f = u - i;
                V a = CityRoads.nodeCentre(path[i], w), b = CityRoads.nodeCentre(path[i + 1], w);
                return new V(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f);
            }
            var p = raw(s);
            foreach (var rb in w.roundabouts)
            {
                var g = Roundabouts.ringOf(rb);
                double d(double u) { var q = raw(u); return Math.Sqrt((q.x - g.x) * (q.x - g.x) + (q.z - g.z) * (q.z - g.z)) - g.rc; }
                if (d(s) >= 0) continue;
                if (Math.Sqrt((p.x - g.x) * (p.x - g.x) + (p.z - g.z) * (p.z - g.z)) > g.rc) continue;
                double a0i = Math.Floor(s);
                while (a0i > 0 && d(a0i) < 0) a0i--;
                double b0i = Math.Ceiling(s);
                while (b0i < last && d(b0i) < 0) b0i++;
                if (d(a0i) < 0 || d(b0i) < 0)
                {
                    double ang0 = Math.Atan2(p.z - g.z, p.x - g.x), r0 = g.rc + lane;
                    rx = g.x + Math.Cos(ang0) * r0; rz = g.z + Math.Sin(ang0) * r0; return true;
                }
                double crossAt(double outer, double inner) { double lo = outer, hi = inner; for (int k = 0; k < 12; k++) { double m = (lo + hi) / 2; if (d(m) >= 0) lo = m; else hi = m; } return (lo + hi) / 2; }
                double sIn = crossAt(a0i, Math.Min(a0i + 1, s)), sOut = crossAt(b0i, Math.Max(b0i - 1, s));
                V pin = raw(sIn), pout = raw(sOut);
                double a0 = Math.Atan2(pin.z - g.z, pin.x - g.x), a1 = Math.Atan2(pout.z - g.z, pout.x - g.x);
                double sweep = a0 - a1;
                while (sweep < 0.15) sweep += Math.PI * 2;
                while (sweep > Math.PI * 2 + 0.15) sweep -= Math.PI * 2;
                double uu = Math.Max(0, Math.Min(1, (s - sIn) / Math.Max(1e-6, sOut - sIn)));
                double ang = a0 - uu * sweep, r = g.rc + lane;
                rx = g.x + Math.Cos(ang) * r; rz = g.z + Math.Sin(ang) * r;
                return true;
            }
            return false;
        }
    }
}
