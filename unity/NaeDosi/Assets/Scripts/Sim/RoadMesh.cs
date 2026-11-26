using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Geom;

namespace NaeDosi
{
    /// <summary>Triangles with a colour each (positions in the web game's metres: x east, y up, z south).</summary>
    public sealed class Tris
    {
        public readonly List<float> pos = new List<float>();
        public readonly List<float> col = new List<float>();
        readonly Func<double, double, double> h;
        public Tris(Func<double, double, double> h = null) { this.h = h ?? ((x, z) => 0); }
        public int Count => pos.Count / 9;

        /// <summary>A flat triangle on the (possibly raised) ground, turned to face up.</summary>
        public void tri(V a, V b, V c, double y, Rgb k)
        {
            double cr = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
            V p = cr > 0 ? c : b, q = cr > 0 ? b : c;
            foreach (var s in new[] { a, p, q }) { pos.Add((float)s.x); pos.Add((float)(h(s.x, s.z) + y)); pos.Add((float)s.z); col.Add(k.r); col.Add(k.g); col.Add(k.b); }
        }
        public void quad(V a, V b, V c, V d, double y, Rgb k) { tri(a, b, c, y, k); tri(a, c, d, y, k); }

        /// <summary>Any triangle in 3-D; flipped if needed so its normal faces `hint`; shaded by `shade`.</summary>
        public void tri3(double[] a, double[] b, double[] c, Rgb k, double[] hint, double shade = 1)
        {
            double ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { var t = b; b = c; c = t; }
            foreach (var s in new[] { a, b, c })
            {
                pos.Add((float)s[0]); pos.Add((float)s[1]); pos.Add((float)s[2]);
                col.Add((float)(k.r * shade)); col.Add((float)(k.g * shade)); col.Add((float)(k.b * shade));
            }
        }

        public void quad3(double[] a, double[] b, double[] c, double[] d, Rgb k, double[] hint, double shade = 1) { tri3(a, b, c, k, hint, shade); tri3(a, c, d, k, hint, shade); }

        /// <summary>Axis-aligned box: top in full colour, sides a little darker (as the web game's Builder.box).</summary>
        public void box(double x0, double y0, double z0, double x1, double y1, double z1, Rgb k)
        {
            quad3(new[] { x0, y1, z0 }, new[] { x0, y1, z1 }, new[] { x1, y1, z1 }, new[] { x1, y1, z0 }, k, new double[] { 0, 1, 0 });
            quad3(new[] { x0, y0, z1 }, new[] { x1, y0, z1 }, new[] { x1, y1, z1 }, new[] { x0, y1, z1 }, k, new double[] { 0, 0, 1 }, 0.85);
            quad3(new[] { x1, y0, z0 }, new[] { x0, y0, z0 }, new[] { x0, y1, z0 }, new[] { x1, y1, z0 }, k, new double[] { 0, 0, -1 }, 0.85);
            quad3(new[] { x1, y0, z1 }, new[] { x1, y0, z0 }, new[] { x1, y1, z0 }, new[] { x1, y1, z1 }, k, new double[] { 1, 0, 0 }, 0.85);
            quad3(new[] { x0, y0, z0 }, new[] { x0, y0, z1 }, new[] { x0, y1, z1 }, new[] { x0, y1, z0 }, k, new double[] { -1, 0, 0 }, 0.85);
        }

        public void strip(double ax, double az, double ya, double bx, double bz, double yb, double wd, Rgb k)
        {
            double len = Hypot(bx - ax, bz - az); if (len == 0) len = 1;
            double px = (-(bz - az) / len) * wd / 2, pz = ((bx - ax) / len) * wd / 2;
            double[] a1 = { ax + px, ya, az + pz }, a2 = { ax - px, ya, az - pz }, b1 = { bx + px, yb, bz + pz }, b2 = { bx - px, yb, bz - pz };
            tri3(a1, b1, b2, k, new double[] { 0, 1, 0 });
            tri3(a1, b2, a2, k, new double[] { 0, 1, 0 });
        }

        public void slab(double ax, double az, double ya, double bx, double bz, double yb, double wd, double thick, Rgb k, Rgb? top = null)
        {
            strip(ax, az, ya, bx, bz, yb, wd, top ?? k);
            double len = Hypot(bx - ax, bz - az); if (len == 0) len = 1;
            double dx = (bx - ax) / len, dz = (bz - az) / len, px = -dz * wd / 2, pz = dx * wd / 2;
            foreach (int s in new[] { 1, -1 })
            {
                double[] a = { ax + px * s, ya, az + pz * s }, b = { bx + px * s, yb, bz + pz * s }, c = { bx + px * s, yb - thick, bz + pz * s }, d = { ax + px * s, ya - thick, az + pz * s };
                var hint = new[] { px * s, 0, pz * s };
                tri3(a, b, c, k, hint, 0.82); tri3(a, c, d, k, hint, 0.82);
            }
            void end(double x, double z, double y, int s)
            {
                double[] a = { x + px, y, z + pz }, b = { x - px, y, z - pz }, c = { x - px, y - thick, z - pz }, d = { x + px, y - thick, z + pz };
                var hint = new[] { dx * s, 0, dz * s };
                tri3(a, b, c, k, hint, 0.7); tri3(a, c, d, k, hint, 0.7);
            }
            end(ax, az, ya, -1); end(bx, bz, yb, 1);
        }
    }

    public struct Rgb
    {
        public float r, g, b;
        public Rgb(float r, float g, float b) { this.r = r; this.g = g; this.b = b; }
        /// <summary>From '#rrggbb' in sRGB to linear, as three.js turns a hex colour into its working colour.</summary>
        public static Rgb Hex(string s) => FromInt(Convert.ToInt32(s.TrimStart('#'), 16));
        public static Rgb FromInt(int v) => new Rgb(Lin(((v >> 16) & 255) / 255f), Lin(((v >> 8) & 255) / 255f), Lin((v & 255) / 255f));
        /// <summary>sRGB components (0-1) to linear.</summary>
        public static Rgb Srgb(double r, double g, double b) => new Rgb(Lin((float)r), Lin((float)g), Lin((float)b));
        public static float Lin(float c) => c <= 0.04045f ? c / 12.92f : (float)Math.Pow((c + 0.055) / 1.055, 2.4);
        public Rgb Mul(double k) => new Rgb((float)(r * k), (float)(g * k), (float)(b * k));
    }

    public sealed class RoadMeshOptions
    {
        public Func<double, double, double> heightAt;
        public double asphalt = 0.06, kerb = 0.2, paint = -1;
        public double zebra = 4;
        public Func<double, double, bool> busAt;
        public Func<V, bool> capAt;
        public Func<REdge, bool> plain;
        public Action<double, double, double, double> tree;
        public Action<double, double, double> lamp;
        public Rgb cAsphalt = Rgb.Hex("#8d8a84"), cAvenue = Rgb.Hex("#6c6d71"), cHighway = Rgb.Hex("#6c6d71"), cPavement = Rgb.Hex("#d9d1c1"), cYellow = Rgb.Hex("#e9bf3a"), cWhite = Rgb.Hex("#f3f1ea");
    }

    public sealed class RoadMeshes { public Tris asphalt, pave, paint; }

    /// <summary>Asphalt, raised pavements and painted markings for a road network (port of games/shared/roads/mesh.ts).</summary>
    public static class RoadMesh
    {
        static readonly Dictionary<int, (int x, int z)> ONEWAY_DIR = new Dictionary<int, (int, int)> { [1] = (1, 0), [2] = (0, 1), [3] = (-1, 0), [4] = (0, -1) };

        public static RoadMeshes build(RoadNetwork net, RoadMeshOptions opts, RoadGeometry geo)
        {
            var h = opts.heightAt ?? ((x, z) => 0);
            var asphalt = new Tris(h); var pave = new Tris(h); var paint = new Tris(h);
            Rgb A(string k) => k == "street" ? opts.cAsphalt : k == "avenue" ? opts.cAvenue : opts.cHighway;
            Rgb P = opts.cPavement, Y = opts.cYellow, W = opts.cWhite;
            double ASPH = opts.asphalt, KERB_H = opts.kerb, PAINT = opts.paint >= 0 ? opts.paint : ASPH + 0.03;
            double ZD = opts.zebra;
            bool hilly = opts.heightAt != null;
            var TYPES = net.types;
            Rgb RED = Rgb.Hex("#8f4a40"), BLUE = Rgb.Hex("#3a6fd8");

            foreach (var r in geo.ribbons)
            {
                var e = net.edges[r.edge]; var T = TYPES[r.kind];
                var s = samplePath(e.path, r.t0, r.t1, 2, hilly);
                for (int i = 1; i < s.Count; i++)
                {
                    var q0 = s[i - 1]; var q1 = s[i];
                    asphalt.quad(offsetPoint(q0, T.half), offsetPoint(q1, T.half), offsetPoint(q1, -T.half), offsetPoint(q0, -T.half), ASPH, A(r.kind));
                    foreach (int sg in new[] { 1, -1 })
                        pave.quad(offsetPoint(q0, sg * T.half), offsetPoint(q1, sg * T.half), offsetPoint(q1, sg * (T.half + T.kerb)), offsetPoint(q0, sg * (T.half + T.kerb)), KERB_H, P);
                }
                if (opts.tree != null && r.t1 - r.t0 > 7)
                    for (double t = r.t0 + 3.5; t < r.t1 - 3; t += 9)
                    {
                        var q = pathAt(e.path, t);
                        foreach (int side in new[] { 1, -1 }) { var p = offsetPoint(q, side * (T.half + T.kerb / 2)); opts.tree(p.x, p.z, q.p.x, q.p.z); }
                    }
                if (opts.lamp != null && r.t1 - r.t0 > 8)
                {
                    int side = 1;
                    for (double t = r.t0 + 6; t < r.t1 - 2; t += 20, side = -side)
                    {
                        var q = pathAt(e.path, t); var p = offsetPoint(q, side * (T.half + T.kerb / 2));
                        opts.lamp(p.x, p.z, Math.Atan2(-side * q.d.z, side * q.d.x));
                    }
                }
            }
            foreach (var j in geo.junctions)
            {
                if (j.ring.Count < 3) continue;
                var tris = Earcut.Triangulate(j.ring);
                var at = net.at(j.node);
                Rgb k = at.Any(e => e.kind == "highway") ? A("highway") : at.Any(e => e.kind == "avenue") ? A("avenue") : A("street");
                foreach (var t in tris) asphalt.tri(j.ring[t[0]], j.ring[t[1]], j.ring[t[2]], ASPH, k);
                V node = net.nodes[j.node].p;
                double kw = at.Min(e => TYPES[e.kind].kerb);
                foreach (var curve in j.kerb)
                {
                    var o = new List<V>();
                    for (int i = 0; i < curve.Count; i++)
                    {
                        V p = curve[i], a = curve[Math.Max(0, i - 1)], b = curve[Math.Min(curve.Count - 1, i + 1)];
                        V t = norm(sub(b, a));
                        V n = v(t.z, -t.x);
                        if ((p.x - node.x) * n.x + (p.z - node.z) * n.z < 0) n = mul(n, -1);
                        o.Add(add(p, mul(n, kw)));
                    }
                    for (int i = 1; i < curve.Count; i++) pave.quad(curve[i - 1], curve[i], o[i], o[i - 1], KERB_H, P);
                }
            }
            foreach (var n in net.nodes.Values)
            {
                var es = net.at(n.id);
                if (es.Count != 1 || (opts.capAt != null && !opts.capAt(n.p))) continue;
                var e = es[0]; var T = TYPES[e.kind];
                V o = net.leave(e, n.id), back = v(-o.x, -o.z), side = v(o.z, -o.x);
                const int seg = 10; var k = A(e.kind);
                V dir(double a) => v(side.x * Math.Cos(a) + back.x * Math.Sin(a), side.z * Math.Cos(a) + back.z * Math.Sin(a));
                for (int i = 0; i < seg; i++)
                {
                    V d0 = dir((i / (double)seg) * Math.PI), d1 = dir(((i + 1) / (double)seg) * Math.PI);
                    asphalt.tri(n.p, add(n.p, mul(d0, T.half)), add(n.p, mul(d1, T.half)), ASPH, k);
                    pave.quad(add(n.p, mul(d0, T.half)), add(n.p, mul(d1, T.half)), add(n.p, mul(d1, T.half + T.kerb)), add(n.p, mul(d0, T.half + T.kerb)), KERB_H, P);
                }
            }

            int deg(int nn) => net.at(nn).Count;
            foreach (var r in geo.ribbons)
            {
                var e = net.edges[r.edge]; var T = TYPES[r.kind];
                bool plain = opts.plain != null && opts.plain(e);
                bool ja = !plain && deg(e.a) >= 3, jb = !plain && deg(e.b) >= 3;
                double t0 = r.t0 + (ja ? ZD + 2 : 0), t1 = r.t1 - (jb ? ZD + 2 : 0);
                if (t1 - t0 < 1) continue;
                void line(double o0, double o1, Rgb k, double a, double b)
                {
                    var s = samplePath(e.path, a, b, 2, hilly);
                    for (int i = 1; i < s.Count; i++) paint.quad(offsetPoint(s[i - 1], o0), offsetPoint(s[i], o0), offsetPoint(s[i], o1), offsetPoint(s[i - 1], o1), PAINT, k);
                }
                void lineAll(double o0, double o1, Rgb k) => line(o0, o1, k, t0, t1);
                if (plain)
                {
                    if (r.kind == "avenue") for (double a = t0 + 2; a < t1 - 1; a += 8) line(-0.075, 0.075, W, a, Math.Min(a + 3, t1));
                    continue;
                }
                (int x, int z)? ow = null;
                if (e.tag != null && e.tag.StartsWith("ow:") && int.TryParse(e.tag.Substring(3), out int code) && ONEWAY_DIR.TryGetValue(code, out var od)) ow = od;
                if (ow != null)
                {
                    var mid = pathAt(e.path, (t0 + t1) / 2);
                    int fwd = mid.d.x * ow.Value.x + mid.d.z * ow.Value.z >= 0 ? 1 : -1;
                    for (double a = t0 + 2; a < t1 - 1; a += 8) line(-0.075, 0.075, W, a, Math.Min(a + 3, t1));
                    if (r.kind == "avenue") foreach (int sg in new[] { 1, -1 }) for (double a = t0 + 2; a < t1 - 1; a += 8) line(sg * T.half * 0.5 - 0.075, sg * T.half * 0.5 + 0.075, W, a, Math.Min(a + 3, t1));
                    var lanesAt = r.kind == "avenue" ? new[] { -T.half * 0.75, -T.half * 0.25, T.half * 0.25, T.half * 0.75 } : new[] { -T.half * 0.5, T.half * 0.5 };
                    for (double a = t0 + 6; a < t1 - 4; a += 22)
                    {
                        var q = pathAt(e.path, a);
                        foreach (double o in lanesAt)
                        {
                            V along(double kk) => mul(q.d, kk * fwd);
                            V c = offsetPoint(q, o);
                            V tail = add(c, along(-1.6)), neck = add(c, along(0.6)), tip = add(c, along(1.8));
                            V side(V p, double kk) => offsetPoint(new PD { p = p, d = q.d }, kk);
                            paint.quad(side(tail, -0.12), side(tail, 0.12), side(neck, 0.12), side(neck, -0.12), PAINT, W);
                            paint.quad(side(neck, -0.5), side(neck, 0.5), tip, tip, PAINT, W);
                        }
                    }
                    foreach (var (atA, jj) in new[] { (true, ja), (false, jb) })
                    {
                        if (!jj) continue;
                        double tEdge = atA ? r.t0 : r.t1; int dir = atA ? 1 : -1;
                        double zs = tEdge + dir * 0.5, ze = tEdge + dir * (ZD + 0.5);
                        for (double o = -T.half + 0.4; o < T.half - 0.4; o += 0.9) line(o, o + 0.45, W, Math.Min(zs, ze), Math.Max(zs, ze));
                        if ((atA && fwd < 0) || (!atA && fwd > 0))
                        {
                            var q = pathAt(e.path, tEdge + dir * (ZD + 1.5));
                            V a0 = offsetPoint(q, -T.half + 0.2), a1 = offsetPoint(q, T.half - 0.2), along = mul(q.d, 0.4);
                            paint.quad(a0, a1, add(a1, along), add(a0, along), PAINT, W);
                        }
                    }
                    continue;
                }
                if (r.kind == "avenue" || r.kind == "highway")
                {
                    lineAll(0.15, 0.3, Y); lineAll(-0.3, -0.15, Y);
                    double lw = T.half / Math.Max(1, T.lanes);
                    bool bus = false;
                    if (opts.busAt != null)
                    {
                        var s = samplePath(e.path, t0, t1, 2, hilly);
                        for (int i = 1; i < s.Count; i++)
                        {
                            V m = s[i - 1].p, nn = s[i].p;
                            if (!opts.busAt((m.x + nn.x) / 2, (m.z + nn.z) / 2)) continue;
                            bus = true;
                            foreach (int sg in new[] { 1, -1 })
                            {
                                paint.quad(offsetPoint(s[i - 1], sg * 0.35), offsetPoint(s[i], sg * 0.35), offsetPoint(s[i], sg * (lw - 0.1)), offsetPoint(s[i - 1], sg * (lw - 0.1)), PAINT - 0.005, RED);
                                paint.quad(offsetPoint(s[i - 1], sg * (lw - 0.1)), offsetPoint(s[i], sg * (lw - 0.1)), offsetPoint(s[i], sg * (lw + 0.06)), offsetPoint(s[i - 1], sg * (lw + 0.06)), PAINT, BLUE);
                            }
                        }
                    }
                    for (int kk = bus ? 2 : 1; kk < T.lanes; kk++) for (double a = t0 + 2; a < t1 - 1; a += 8) foreach (int sg in new[] { 1, -1 }) line(sg * kk * lw - 0.075, sg * kk * lw + 0.075, W, a, Math.Min(a + 3, t1));
                }
                else lineAll(-0.075, 0.075, Y);
                foreach (var (atA, jj) in new[] { (true, ja), (false, jb) })
                {
                    if (!jj || r.kind == "highway") continue;
                    double tEdge = atA ? r.t0 : r.t1; int dir = atA ? 1 : -1;
                    double zs = tEdge + dir * 0.5, ze = tEdge + dir * (ZD + 0.5);
                    for (double o = -T.half + 0.4; o < T.half - 0.4; o += 0.9) line(o, o + 0.45, W, Math.Min(zs, ze), Math.Max(zs, ze));
                    double st = tEdge + dir * (ZD + 1.5);
                    var q = pathAt(e.path, st);
                    int sideIn = atA ? 1 : -1;
                    V a0 = offsetPoint(q, sideIn * 0.3), a1 = offsetPoint(q, sideIn * T.half);
                    V along = mul(q.d, 0.4);
                    paint.quad(a0, a1, add(a1, along), add(a0, along), PAINT, W);
                }
            }
            return new RoadMeshes { asphalt = asphalt, pave = pave, paint = paint };
        }
    }
}
