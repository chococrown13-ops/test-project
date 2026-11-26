using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.Geom;

namespace NaeDosi
{
    /// <summary>Everything the road layer draws, as triangles and spots (port of the geometry half of render/roads.ts).</summary>
    public sealed class RoadLayerData
    {
        /// <summary>Ground roads, then flyover roads: asphalt and pavements share one material, paint another.</summary>
        public List<Tris> road = new List<Tris>(), paint = new List<Tris>();
        /// <summary>Bridges, flyover concrete, tunnel mouths, roundabout islands.</summary>
        public Tris extra = new Tris();
        public List<(double x, double z, bool cherry, double s)> trees = new List<(double, double, bool, double)>();
        public List<(double x, double z, double ang)> lamps = new List<(double, double, double)>();

        public const double Y = 0.12, SW = 0.32;
        static readonly Rgb ASPHALT_STREET = Rgb.FromInt(0x5a5d61), ASPHALT_AVENUE = Rgb.FromInt(0x4b4e53), ASPHALT_HIGHWAY = Rgb.FromInt(0x45484d);
        static readonly Rgb WALK = Rgb.FromInt(0xbdb7ab), WHITE = Rgb.FromInt(0xeeeeea), YELLOW = Rgb.FromInt(0xf2c53d), CONCRETE = Rgb.FromInt(0xb4b1a9), PIER = Rgb.FromInt(0x9d9a92), MOUTH = Rgb.FromInt(0x15171b);
        static readonly Rgb GRASS = Rgb.FromInt(0x7fae55), LEAF = Rgb.FromInt(0x4f8a3c), TRUNK = Rgb.FromInt(0x6b5440);

        static RoadMeshOptions Opts() => new RoadMeshOptions
        {
            cAsphalt = ASPHALT_STREET, cAvenue = ASPHALT_AVENUE, cHighway = ASPHALT_HIGHWAY, cPavement = WALK, cYellow = YELLOW, cWhite = WHITE, zebra = 2.2,
        };

        public static RoadLayerData Build(World w, HashSet<int> busCells)
        {
            var o = new RoadLayerData();
            int cellAt(double x, double z) { int cx = (int)Math.Floor(x / CELL), cz = (int)Math.Floor(z / CELL); return cx < 0 || cz < 0 || cx >= N || cz >= N ? -1 : cz * N + cx; }
            bool water(double x, double z) { int i = cellAt(x, z); return i >= 0 && w.ground[i] == Ground.Water; }
            var rampFeet = new HashSet<int>();
            for (int i = 0; i < N * N; i++) if (w.roadAlt[i] != 0) { int e = Graph.rampExit(w, i); if (e >= 0) rampFeet.Add(e); }
            var net = CityRoads.buildCityNetwork(w);
            var geo = RoadGeom.buildGeometry(net);
            var opts = Opts();
            opts.asphalt = Y; opts.kerb = SW; opts.paint = Y + 0.02;
            opts.capAt = p => p.x > 0 && !rampFeet.Contains(cellAt(p.x, p.z));
            opts.busAt = (x, z) => { int i = cellAt(x, z); return i >= 0 && busCells != null && busCells.Contains(i) && !water(x, z); };
            opts.plain = e => e.tag == CityRoads.RING;
            opts.tree = (x, z, ccx, ccz) =>
            {
                int i = cellAt(ccx, ccz);
                if (i < 0 || w.trees[i] == 0 || water(x, z)) return;
                double k = Math.Sin(x * 3.1 + z * 7.7) * 9187.13;
                o.trees.Add((x, z, Attractions.isCherry(i), 0.85 + (k - Math.Floor(k)) * 0.3));
            };
            opts.lamp = (x, z, ang) => { if (o.lamps.Count >= N * N || water(x, z)) return; o.lamps.Add((x, z, ang)); };
            var ground = RoadMesh.build(net, opts, geo);
            bridges(o.extra, w, net, geo);
            foreach (var rb in w.roundabouts) island(o.extra, rb);
            var (fnet, fh) = CityRoads.buildElevatedNetwork(w);
            var fgeo = RoadGeom.buildGeometry(fnet);
            var fo = Opts();
            fo.heightAt = fh; fo.asphalt = 0.12; fo.kerb = 0.32; fo.paint = 0.14; fo.capAt = _ => false; fo.cPavement = CONCRETE;
            var fly = RoadMesh.build(fnet, fo, fgeo);
            decks(o.extra, w, fnet, fgeo, fh);
            for (int y = 0; y < N; y++) for (int x = 0; x < N; x++) if (w.roadAlt[y * N + x] != 0) altCell(o.extra, w, x, y);
            o.road.Add(ground.asphalt); o.road.Add(ground.pave); o.paint.Add(ground.paint);
            o.road.Add(fly.asphalt); o.road.Add(fly.pave); o.paint.Add(fly.paint);
            return o;
        }

        static double[] P3(V q, double y) => new[] { q.x, y, q.z };

        static void altCell(Tris b, World w, int x, int y)
        {
            int i = y * N + x;
            double mx = x * CELL + CELL / 2.0, mz = y * CELL + CELL / 2.0;
            var nb = Graph.altNeighbours(w, i).Select(n => (dx: (n % N) - x, dy: (n / N) - y)).ToList();
            int level = w.altLevel[i];
            const double DW = 9.5;
            if (level == Level.Elevated) return;
            if (nb.Count > 1) return;
            var ramp = nb.Count == 1 ? nb[0] : (dx: 1, dy: 0);
            bool tunnel = level == Level.Tunnel;
            double ax = mx - ramp.dx * 5, az = mz - ramp.dy * 5, bx = mx + ramp.dx * 5, bz = mz + ramp.dy * 5;
            b.strip(ax, az, 0.15, bx, bz, 0.15, DW, Rgb.FromInt(0x3f4246));
            foreach (int s in new[] { 1, -1 })
            {
                double ox2 = -ramp.dy * (DW / 2 + 0.3) * s, oz2 = ramp.dx * (DW / 2 + 0.3) * s;
                b.slab(ax + ox2, az + oz2, 1.1, bx + ox2, bz + oz2, 1.1, 0.6, 1.1, CONCRETE);
            }
            double px = mx + ramp.dx * 4.3, pz = mz + ramp.dy * 4.3, ox = -ramp.dy, oz = ramp.dx;
            double frameH = tunnel ? 7 : 5.6, half = DW / 2 + 1.4;
            b.slab(px - ox * half, pz - oz * half, frameH, px + ox * half, pz + oz * half, frameH, 1.4, frameH, tunnel ? Rgb.FromInt(0x8f8b82) : CONCRETE);
            double mh = frameH - 1.4, mi = DW / 2 - 0.1;
            b.slab(px - ramp.dx * 0.1 - ox * mi, pz - ramp.dy * 0.1 - oz * mi, mh, px - ramp.dx * 0.1 + ox * mi, pz - ramp.dy * 0.1 + oz * mi, mh, 1.6, mh, MOUTH);
        }

        static void decks(Tris b, World w, RoadNetwork net, RoadGeometry geo, Func<double, double, double> h)
        {
            const double T = 1.3;
            foreach (var r in geo.ribbons)
            {
                var e = net.edges[r.edge]; var K = net.types[r.kind];
                var P = samplePath(e.path, r.t0, r.t1, 1.5, true);
                double edge = K.half + K.kerb;
                double[] at(int k, double off, double dy) { var q = offsetPoint(P[k], off); return new[] { q.x, h(q.x, q.z) + dy, q.z }; }
                double nextPier = r.t0 + 4;
                for (int k = 0; k < P.Count - 1; k++)
                {
                    b.tri3(at(k, -edge, -T), at(k + 1, -edge, -T), at(k + 1, edge, -T), CONCRETE, new double[] { 0, -1, 0 }, 0.7);
                    b.tri3(at(k, -edge, -T), at(k + 1, edge, -T), at(k, edge, -T), CONCRETE, new double[] { 0, -1, 0 }, 0.7);
                    foreach (int sd in new[] { 1, -1 })
                    {
                        V n = left(P[k].d); var hint = new[] { n.x * sd, 0, n.z * sd };
                        var a = at(k, sd * edge, 0.32); var bb = at(k + 1, sd * edge, 0.32); var c = at(k + 1, sd * edge, -T); var d = at(k, sd * edge, -T);
                        b.tri3(a, bb, c, CONCRETE, hint, 0.85); b.tri3(a, c, d, CONCRETE, hint, 0.85);
                        var pa = at(k, sd * (edge - 0.35), 1.27); var pb = at(k + 1, sd * (edge - 0.35), 1.27); var pc = at(k + 1, sd * edge, 1.27); var pd = at(k, sd * edge, 1.27);
                        b.tri3(pa, pb, pc, CONCRETE, new double[] { 0, 1, 0 }); b.tri3(pa, pc, pd, CONCRETE, new double[] { 0, 1, 0 });
                        foreach (var (off, outS) in new[] { (edge, sd), (edge - 0.35, -sd) })
                        {
                            var ta = at(k, sd * off, 1.27); var tb = at(k + 1, sd * off, 1.27); var tc = at(k + 1, sd * off, 0.32); var td = at(k, sd * off, 0.32);
                            var hh = new[] { n.x * outS, 0, n.z * outS };
                            b.tri3(ta, tb, tc, CONCRETE, hh, 0.85); b.tri3(ta, tc, td, CONCRETE, hh, 0.85);
                        }
                    }
                    double y = h(P[k].p.x, P[k].p.z);
                    if (P[k].t >= nextPier && y > ELEVATED_Y - 0.5)
                    {
                        nextPier = P[k].t + 20;
                        int cx = (int)Math.Floor(P[k].p.x / CELL), cz = (int)Math.Floor(P[k].p.z / CELL);
                        double baseY = cx >= 0 && cz >= 0 && cx < N && cz < N && w.ground[cz * N + cx] == Ground.Water ? -4.5 : 0;
                        double x = P[k].p.x, z = P[k].p.z; V n = left(P[k].d);
                        b.box(x - 0.9, baseY, z - 0.9, x + 0.9, y - T, z + 0.9, PIER);
                        double half = edge - 0.6;
                        b.slab(x - n.x * half, z - n.z * half, y - T, x + n.x * half, z + n.z * half, y - T, 1.8, 0.8, PIER);
                    }
                }
            }
            foreach (var j in geo.junctions)
            {
                var ring = j.ring;
                if (ring.Count < 3) continue;
                foreach (var t in Earcut.Triangulate(ring))
                    b.tri3(new[] { ring[t[0]].x, h(ring[t[0]].x, ring[t[0]].z) - T, ring[t[0]].z }, new[] { ring[t[1]].x, h(ring[t[1]].x, ring[t[1]].z) - T, ring[t[1]].z }, new[] { ring[t[2]].x, h(ring[t[2]].x, ring[t[2]].z) - T, ring[t[2]].z }, CONCRETE, new double[] { 0, -1, 0 }, 0.7);
            }
        }

        static void bridges(Tris b, World w, RoadNetwork net, RoadGeometry geo)
        {
            int cellOfPt(double x, double z) { int cx = (int)Math.Floor(x / CELL), cz = (int)Math.Floor(z / CELL); return cx < 0 || cz < 0 || cx >= N || cz >= N ? -1 : cz * N + cx; }
            var deck = Rgb.FromInt(0x9c9a92); var rail = Rgb.FromInt(0xd6d4ce);
            foreach (var r in geo.ribbons)
            {
                var e = net.edges[r.edge]; var T = net.types[r.kind];
                var P = samplePath(e.path, r.t0, r.t1, 1.2);
                double edge = T.half + T.kerb;
                double[] at(int k, double off, double y) { var q = offsetPoint(P[k], off); return new[] { q.x, y, q.z }; }
                void band(int k, double o0, double o1, double y, Rgb hx)
                {
                    var a = at(k, o0, y); var bb = at(k, o1, y); var cc = at(k + 1, o1, y); var d = at(k + 1, o0, y);
                    b.tri3(a, bb, cc, hx, new double[] { 0, 1, 0 }); b.tri3(a, cc, d, hx, new double[] { 0, 1, 0 });
                }
                void wall(int k, double off, double y0, double y1, Rgb hx, int outS)
                {
                    var a = at(k, off, y0); var bb = at(k + 1, off, y0); var cc = at(k + 1, off, y1); var d = at(k, off, y1);
                    V n = left(P[k].d); var hint = new[] { n.x * outS, 0, n.z * outS };
                    b.tri3(a, bb, cc, hx, hint, 0.82); b.tri3(a, cc, d, hx, hint, 0.82);
                }
                double nextPier = 0;
                for (int k = 0; k < P.Count - 1; k++)
                {
                    double mx = (P[k].p.x + P[k + 1].p.x) / 2, mz = (P[k].p.z + P[k + 1].p.z) / 2;
                    int i = cellOfPt(mx, mz);
                    if (i < 0 || w.ground[i] != Ground.Water) continue;
                    band(k, -edge - 0.4, edge + 0.4, Y - 0.04, deck);
                    foreach (int sd in new[] { 1, -1 })
                    {
                        wall(k, sd * (edge + 0.4), -1.6, Y - 0.04, deck, sd);
                        band(k, sd * (edge + 0.05), sd * (edge + 0.4), 1.0, rail);
                        wall(k, sd * (edge + 0.05), SW, 1.0, rail, -sd);
                    }
                    if (P[k].t > nextPier) { nextPier = P[k].t + 14; b.box(P[k].p.x - 1, -6, P[k].p.z - 1, P[k].p.x + 1, -1.6, P[k].p.z + 1, Rgb.FromInt(0x8c8a84)); }
                }
            }
        }

        static void island(Tris b, Roundabout rb)
        {
            var g = Roundabouts.ringOf(rb); const int seg = 40;
            double[] at(double r, int k, double y) => new[] { g.x + Math.Cos((k / (double)seg) * Math.PI * 2) * r, y, g.z + Math.Sin((k / (double)seg) * Math.PI * 2) * r };
            double r0 = g.island, r1 = g.island - 1.5, KH = SW + 0.04, GH = SW + 0.25;
            for (int k = 0; k < seg; k++)
            {
                double am = ((k + 0.5) / seg) * Math.PI * 2;
                var hint = new[] { Math.Cos(am), 0, Math.Sin(am) };
                b.tri3(at(r0, k, Y), at(r0, k + 1, Y), at(r0, k + 1, KH), WALK, hint, 0.85);
                b.tri3(at(r0, k, Y), at(r0, k + 1, KH), at(r0, k, KH), WALK, hint, 0.85);
                b.tri3(at(r0, k, KH), at(r0, k + 1, KH), at(r1, k + 1, KH), WALK, new double[] { 0, 1, 0 });
                b.tri3(at(r0, k, KH), at(r1, k + 1, KH), at(r1, k, KH), WALK, new double[] { 0, 1, 0 });
                b.tri3(at(r1, k, KH), at(r1, k + 1, KH), new[] { g.x, GH + 0.6, g.z }, GRASS, new double[] { 0, 1, 0 });
            }
            b.box(g.x - 0.35, GH, g.z - 0.35, g.x + 0.35, GH + 3, g.z + 0.35, TRUNK);
            foreach (var (y0, r, hh) in new[] { (GH + 2, 3.2, 3.0), (GH + 3.8, 2.4, 2.6), (GH + 5.3, 1.5, 2.2) })
            {
                const int n = 8;
                for (int k = 0; k < n; k++)
                {
                    double a0 = (k / (double)n) * Math.PI * 2, a1 = ((k + 1) / (double)n) * Math.PI * 2;
                    double[] p0 = { g.x + Math.Cos(a0) * r, y0, g.z + Math.Sin(a0) * r }, p1 = { g.x + Math.Cos(a1) * r, y0, g.z + Math.Sin(a1) * r };
                    double am = (a0 + a1) / 2;
                    b.tri3(p0, p1, new[] { g.x, y0 + hh, g.z }, LEAF, new[] { Math.Cos(am), 0.6, Math.Sin(am) }, 0.9 + 0.1 * Math.Cos(am));
                    b.tri3(p0, p1, new[] { g.x, y0, g.z }, LEAF, new double[] { 0, -1, 0 }, 0.6);
                }
            }
        }
    }
}
